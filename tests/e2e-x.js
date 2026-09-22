// End-to-end: the real service worker code and content scripts, wired together
// by chrome-shim.js, against a mock X timeline and the live Jev API.
window.__shim.reset();

const TWEETS = [
  {
    id: '1001', name: 'Growth Guru', handle: 'growthguru', expect: 'hidden',
    text: 'I found a prompt that writes a month of content in 10 minutes.\n\nThe prompt is in the replies 👇',
  },
  {
    id: '1002', name: 'Rosa', handle: 'rosalind_ops', expect: 'shown',
    text: "spent all afternoon debugging why our DNS lookups were slow and it turned out glibc was trying IPv6 first and waiting 5 seconds for each timeout. 'options single-request' fixed it",
  },
  {
    id: '1003', name: 'AI Insider', handle: 'ai_insider', expect: 'hidden',
    text: "Here's the thing about AI agents:\n\nIt's not about replacing humans.\nIt's about amplifying them.\n\nThe companies that understand this will unlock unprecedented value.\n\nLet that sink in.",
  },
  {
    id: '1004', name: 'Priya', handle: 'priya_dev', expect: 'hidden', why: 'country',
    text: 'Shipped the new onboarding flow today. Cut the signup form from 9 fields to 4 and conversion went from 31% to 44% in the first week.',
  },
  {
    id: '1005', name: 'Northwind News', handle: 'northwindnews', expect: 'shown',
    text: 'Canadian inflation cooled to 1.9% in August from 2.4% in July, Statistics Canada said on Tuesday.',
  },
  {
    id: '1006', name: 'Moon Boy', handle: 'moonboy', expect: 'hidden', why: 'custom',
    text: '$PEPE2 is about to 100x. Dev is based, liquidity locked, contract address below. Not financial advice',
  },
  {
    id: '1007', name: 'Lena', handle: 'lena_pm', expect: 'shown',
    text: 'Hug your engineer',
    quoted: { name: 'burnt out dev', handle: 'burnt_out_dev', text: 'Two weeks into a new role at a big company and nobody knows anything. Specs, tickets, tests: all stale.' },
  },
  {
    id: '1008', name: 'Me', handle: 'me_myself', expect: 'shown', why: 'allowlisted',
    text: 'Comment GUIDE and I will DM you my free template 👇 (testing the allowlist)',
  },
];

const timeline = document.getElementById('timeline');
const report = document.getElementById('report');
const log = (line) => (report.textContent += `\n${line}`);

function tweetHtml(t) {
  const quote = t.quoted
    ? `<div role="link" tabindex="0"><div data-testid="User-Name"><a href="/${t.quoted.handle}"><span>${t.quoted.name}</span></a><a href="/${t.quoted.handle}"><span>@${t.quoted.handle}</span></a></div><div data-testid="tweetText"><span>${t.quoted.text}</span></div></div>`
    : '';
  return `<div data-testid="cellInnerDiv" data-id="${t.id}"><div><div><article data-testid="tweet">
    <div data-testid="User-Name"><a href="/${t.handle}"><span>${t.name}</span></a><a href="/${t.handle}"><span>@${t.handle}</span></a>
      <a href="/${t.handle}/status/${t.id}"><time datetime="2026-09-22T10:00:00.000Z">2h</time></a></div>
    <div data-testid="tweetText"><span>${t.text.replace(/</g, '&lt;')}</span></div>${quote}
  </article></div></div></div>`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

const t0 = performance.now();
report.textContent = 'Loading background.js…';
await import('../src/background.js');
await window.__shim.fireInstalled('install');

const { apiKey } = await chrome.storage.local.get('apiKey');
log(`API key imported from config.local.json: ${apiKey ? 'yes' : 'NO'}`);

await chrome.storage.sync.set({
  settings: {
    countries: { blocked: ['IN'], includeRegions: false, onX: true, onLinkedIn: true },
    customRules: ['Crypto, NFT or memecoin promotion'],
    allowlist: ['@me_myself'],
  },
});
const seeded = await chrome.runtime.sendMessage({ type: 'geo:put', platform: 'x', key: 'priya_dev', raw: 'India' });
log(`Seeded @priya_dev as "India": blocked=${seeded.result.blocked} label=${seeded.result.label}`);

timeline.innerHTML = TWEETS.map(tweetHtml).join('');
await loadScript('../src/content/common.js');
await loadScript('../src/content/x.js');
log('Content scripts injected; waiting for verdicts…');

const cell = (id) => timeline.querySelector(`[data-id="${id}"]`);
const state = (id) => cell(id).dataset.deslop || 'shown';
const deadline = Date.now() + 20000;
let sawPending = false;
while (Date.now() < deadline) {
  const states = TWEETS.map((t) => state(t.id));
  if (states.includes('pending')) sawPending = true;
  if (!states.includes('pending') && TWEETS.every((t) => t.expect === 'shown' || state(t.id) === 'hidden')) break;
  await new Promise((r) => setTimeout(r, 200));
}
const settleMs = Math.round(performance.now() - t0);

let pass = 0;
log(`\nBlurred while checking: ${sawPending ? 'yes' : 'no'}`);
for (const t of TWEETS) {
  const got = state(t.id) === 'hidden' ? 'hidden' : state(t.id);
  const ok = got === t.expect;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} @${t.handle.padEnd(12)} expected ${t.expect.padEnd(6)} got ${got}${t.why ? ` (${t.why})` : ''}`);
}

// Switching to "leave a placeholder" re-renders hidden posts as bars.
const current = (await chrome.storage.sync.get('settings')).settings;
await chrome.storage.sync.set({ settings: { ...current, hideMode: 'collapse' } });
await new Promise((r) => setTimeout(r, 1500));
const bars = [...timeline.querySelectorAll('.deslop-bar')].map((b) => b.firstChild.textContent);
const barsOk = bars.length === TWEETS.filter((t) => t.expect === 'hidden').length;
log(`\n${barsOk ? '✓' : '✗'} collapse mode shows ${bars.length} placeholder bars:`);
bars.forEach((b) => log(`   ${b}`));

const stats = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result;
log(`\nStats: hidden today ${stats.stats.hiddenToday}, checks ${stats.stats.checksToday}, spent $${stats.stats.spendToday.toFixed(6)}, cached posts ${stats.cached.posts}`);
log(`Recent: ${stats.recent.map((r) => `${r.handle}→${r.reasonId}`).join(', ')}`);

const total = TWEETS.length + 1;
const passed = pass + (barsOk ? 1 : 0);
report.textContent = `${passed}/${total} checks passed in ${settleMs} ms\n` + report.textContent;
window.e2e = { passed, total, report: report.textContent };
