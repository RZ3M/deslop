// Runs the browser test pages headlessly in Chrome and exits non-zero on any
// failure. No dependencies: a small static server (the same routes as
// scripts/serve.ps1) plus the Chrome DevTools Protocol over Node's WebSocket.
//
//   node tests/run.mjs           offline tests (unit + mock X timeline)
//   node tests/run.mjs --live    also the tests that call Jev; needs
//                                config.local.json or OPENROUTER_API_KEY
//
// Set CHROME_PATH if no Chrome, Chromium, Edge or Brave is found automatically.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LIVE = process.argv.includes('--live');
const TIMEOUT_MS = 120_000;

const PAGES = [
  { path: 'tests/unit.html', result: 'window.unitResults' },
  { path: 'tests/e2e-x-offline.html', result: 'window.e2e' },
  ...(LIVE
    ? [
        { path: 'tests/e2e-x.html', result: 'window.e2e' },
        { path: 'tests/e2e-linkedin.html', result: 'window.e2e' },
        {
          path: 'tests/harness.html',
          result: 'window.results && { passed: results.filter((r) => r.ok).length, total: results.length, failed: results.filter((r) => !r.ok) }',
        },
      ]
    : []),
];

// ── Static server ───────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'tests/harness.html';
    // The LinkedIn end-to-end test fetches /in/<slug>/ like the real site.
    const profile = rel.match(/^in\/([\w-]+)\/?$/);
    if (profile) rel = `tests/fixtures/profile-${profile[1]}.html`;
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    let body = readFileSync(file);
    // ?shim injects a fake chrome.* API so extension pages run in a normal tab.
    if (extname(file) === '.html' && url.search.includes('shim')) {
      body = body.toString('utf8').replace('<head>', '<head><script src="/tests/chrome-shim.js"></script>');
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ── Chrome over the DevTools Protocol ───────────────────────────────────────

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH');
  return found;
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'deslop-chrome-'));
  const proc = spawn(findChrome(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(process.env.CI ? ['--no-sandbox'] : []),
    'about:blank',
  ]);
  const wsUrl = await new Promise((ok, fail) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) ok(m[1]);
    });
    proc.on('exit', (code) => fail(new Error(`Chrome exited (${code}): ${err.slice(-500)}`)));
  });
  // Chrome keeps writing to its profile while it shuts down, so wait for it to
  // exit before deleting the profile. Cleanup never fails the run.
  const close = async () => {
    const exited = proc.exitCode !== null ? Promise.resolve() : new Promise((ok) => proc.once('exit', ok));
    proc.kill();
    await Promise.race([exited, new Promise((ok) => setTimeout(ok, 5000))]);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.warn(`Couldn't remove the temporary Chrome profile ${profile}: ${err.code || err.message}`);
    }
  };
  return { wsUrl, close };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.fail(new Error(msg.error.message));
    else p.ok(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      pending.set(++id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return new Promise((ok) => ws.addEventListener('open', () => ok({ send, close: () => ws.close() })));
}

async function runPage(client, origin, page) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async (expression) => {
    const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    return r.result.value;
  };
  await client.send('Page.navigate', { url: `${origin}/${page.path}` }, sessionId);
  const until = Date.now() + TIMEOUT_MS;
  let result;
  while (Date.now() < until) {
    result = await evaluate(`(() => { try { return ${page.result}; } catch { return undefined; } })()`).catch(() => undefined);
    if (result) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const report = await evaluate(`document.getElementById('report')?.textContent || document.getElementById('summary')?.textContent || ''`).catch(() => '');
  await client.send('Target.closeTarget', { targetId });
  return { result, report };
}

// ── Main ────────────────────────────────────────────────────────────────────

let wroteConfig = false;
const configPath = join(ROOT, 'config.local.json');
if (LIVE && !existsSync(configPath)) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('--live needs config.local.json or OPENROUTER_API_KEY');
    process.exit(2);
  }
  writeFileSync(configPath, JSON.stringify({ openrouterApiKey: process.env.OPENROUTER_API_KEY }));
  wroteConfig = true;
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = await launchChrome();
let failed = false;

try {
  const client = await cdp(chrome.wsUrl);
  for (const page of PAGES) {
    const { result, report } = await runPage(client, origin, page);
    const ok = result && result.passed === result.total;
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} ${page.path}: ${result ? `${result.passed}/${result.total}` : 'timed out'}`);
    if (!ok) {
      if (report) console.log(report.replace(/^/gm, '    '));
      for (const f of result?.failed || []) console.log(`    ${JSON.stringify(f)}`);
    }
  }
  client.close();
} finally {
  await chrome.close();
  server.close();
  if (wroteConfig) rmSync(configPath, { force: true });
}

process.exit(failed ? 1 : 0);
