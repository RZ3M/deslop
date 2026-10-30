// Offline end-to-end for the LinkedIn adapter: real background.js + content
// scripts on a mock feed, with no API key. Checks that hidden posts don't
// flicker when the page changes, that "Show" keeps a post revealed and "Hide again" collapses it.
window.__shim.reset();

const person = (slug) => `https://www.linkedin.com/in/${slug}/`;
// Real LinkedIn post text breaks lines with <br>, which innerText and
// textContent read differently; the cards do the same.
const CARDS = [
  {
    id: 'muted', slug: 'coin-carl', why: 'muted "crypto"',
    header: `<a href="${person('coin-carl')}"><img alt=""></a><a href="${person('coin-carl')}">Coin Carl<br> • 3rd+</a><p>Web3 founder</p><p>4h •</p>`,
    text: 'Three crypto lessons from this cycle:<br><br>1. Custody matters<br>2. Liquidity is a feature<br>3. Nobody knows anything',
  },
  {
    id: 'promo', slug: 'acme', why: 'promoted',
    header: `<a href="https://www.linkedin.com/company/acme/"><img alt=""></a><a href="https://www.linkedin.com/company/acme/">Acme Cloud</a><p>Promoted</p>`,
    text: 'Acme Cloud now supports Postgres 18.<br><br>Async I/O on every plan. Migrate in one click.',
  },
  {
    id: 'plain', slug: 'sam-lee', why: 'nothing to hide',
    header: `<a href="${person('sam-lee')}"><img alt=""></a><a href="${person('sam-lee')}">Sam Lee<br> • 1st</a><p>Staff Engineer at Contoso</p><p>3h •</p>`,
    text: 'Wrote up how we cut p99 latency on our ledger service.<br><br>Happy to answer questions.',
  },
];
const HIDDEN = CARDS.filter((c) => c.id !== 'plain');

const feed = document.getElementById('feed');
const report = document.getElementById('report');
const log = (line) => (report.textContent += `\n${line}`);

feed.innerHTML = CARDS.map(
  (c) => `<div role="listitem" componentkey="update-card-${c.id}" data-card="${c.id}">
    <h2 style="display:none">Feed post</h2>${c.header}
    <div data-testid="expandable-text-box">${c.text}</div>
  </div>`,
).join('');

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const card = (id) => feed.querySelector(`[data-card="${id}"]`);
const state = (id) => card(id).dataset.deslop || 'shown';

async function waitUntil(done, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until && !done()) await sleep(100);
}

// Counts every change to each card's data-deslop while `during` runs, plus
// a settling period; LinkedIn mutates the page all the time, so `poke` does too.
async function changesDuring(during = async () => {}) {
  const counts = Object.fromEntries(CARDS.map((c) => [c.id, 0]));
  const observer = new MutationObserver((records) => {
    for (const r of records) counts[r.target.dataset.card] += 1;
  });
  observer.observe(feed, { attributes: true, attributeFilter: ['data-deslop'], subtree: true });
  await during();
  for (let i = 0; i < 4; i++) {
    poke();
    await sleep(300);
  }
  observer.disconnect();
  return counts;
}

function poke() {
  document.body.appendChild(document.createElement('div')).remove();
}

let pass = 0;
let total = 0;
const check = (ok, line) => {
  total++;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} ${line}`);
};

await import('../src/background.js');
await window.__shim.fireInstalled('install');
await chrome.storage.sync.set({ settings: { hideMode: 'collapse', hidePromoted: true, mutedWords: ['crypto'] } });

await loadScript('../src/content/common.js');
await loadScript('../src/content/linkedin.js');
log('Content scripts injected.\n\nCollapse mode');

await waitUntil(() => HIDDEN.every((c) => state(c.id) === 'collapsed'));
for (const c of CARDS) check(state(c.id) === (c.id === 'plain' ? 'shown' : 'collapsed'), `${c.id.padEnd(6)} ${state(c.id).padEnd(9)} (${c.why})`);

let changes = await changesDuring();
for (const c of CARDS) check(changes[c.id] === 0, `${c.id.padEnd(6)} stays put while the page changes (${changes[c.id]} changes)`);

for (const c of HIDDEN) {
  changes = await changesDuring(async () => card(c.id).querySelector('.deslop-bar button')?.click());
  check(state(c.id) === 'revealed' && changes[c.id] === 1, `${c.id.padEnd(6)} stays revealed after "Show" (${changes[c.id]} changes, ended ${state(c.id)})`);
  const again = card(c.id).querySelector('.deslop-bar button');
  check(again?.textContent === 'Hide again', `${c.id.padEnd(6)} revealed post offers "Hide again" (${again?.textContent})`);
  changes = await changesDuring(async () => again?.click());
  check(state(c.id) === 'collapsed' && changes[c.id] === 1, `${c.id.padEnd(6)} collapses again after "Hide again" (${changes[c.id]} changes, ended ${state(c.id)})`);
}

log('\nRemove mode');
await chrome.storage.sync.set({ settings: { hideMode: 'remove', hidePromoted: true, mutedWords: ['crypto'] } });
await waitUntil(() => HIDDEN.every((c) => state(c.id) === 'hidden'));
for (const c of HIDDEN) check(state(c.id) === 'hidden', `${c.id.padEnd(6)} ${state(c.id)} (${c.why})`);

changes = await changesDuring();
for (const c of CARDS) check(changes[c.id] === 0, `${c.id.padEnd(6)} stays put while the page changes (${changes[c.id]} changes)`);

const recent = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result.recent;
for (const c of HIDDEN) {
  const n = recent.filter((r) => r.handle === c.slug).length;
  check(n === 1, `${c.id.padEnd(6)} counted as hidden once (${n})`);
}

report.textContent = `${pass}/${total} checks passed\n` + report.textContent;
window.e2e = { passed: pass, total, report: report.textContent };
