// End-to-end for the LinkedIn adapter: real background.js + content scripts,
// a mock feed in LinkedIn's 2026 markup, and fixture profile pages served at
// /in/<slug>/ by scripts/serve.ps1.
window.__shim.reset();

const person = (slug, name) => `https://www.linkedin.com/in/${slug}/`;
const CARDS = [
  {
    id: 'priya', expect: 'hidden', why: 'country (profile says Canada)',
    header: `<a href="${person('priya-sharma')}"><img alt=""></a><a href="${person('priya-sharma')}">Priya Sharma<br> • 2nd</a><p>Senior Frontend Engineer</p><p>1d •</p>`,
    text: 'We moved our design system to CSS layers this quarter. Specificity bugs in the checkout flow dropped from about 30 a month to 2.',
  },
  {
    id: 'sam', expect: 'shown', why: 'Bay Area resolved by Jev as not Canada',
    header: `<a href="${person('sam-lee')}"><img alt=""></a><a href="${person('sam-lee')}">Sam Lee<br> • 1st</a><p>Staff Engineer at Contoso</p><p>3h •</p>`,
    text: 'Wrote up how we cut p99 latency on our ledger service by moving idempotency checks out of the hot path. Happy to answer questions.',
  },
  {
    id: 'mark', expect: 'hidden', why: 'AI slop',
    header: `<a href="${person('mark-t')}"><img alt=""></a><a href="${person('mark-t')}">Mark T.<br> • 3rd+</a><p>Helping founders scale | Keynote speaker</p><p>2d •</p>`,
    text: "In today's fast-paced digital landscape, leadership isn't about having all the answers — it's about asking the right questions.\n\n🚀 Embrace uncertainty\n💡 Foster a culture of curiosity\n🤝 Empower your team\n✅ Celebrate progress, not perfection\n\nWhat's one lesson that shaped your leadership journey? 👇\n\n#Leadership #Growth",
  },
  {
    id: 'northwind', expect: 'shown', why: 'company post',
    header: `<a href="https://www.linkedin.com/company/northwind-labs/"><img alt=""></a><a href="https://www.linkedin.com/company/northwind-labs/">Northwind Labs</a><p>13h •</p>`,
    text: 'We are hiring 2026 summer interns in Toronto for software, data and product roles. Applications close October 15.',
  },
  {
    id: 'dan', expect: 'shown', why: '"commented" header; author is Dan',
    header: `<a href="${person('omar-h')}" aria-label="View Omar H.’s profile"><img alt=""></a><a href="${person('omar-h')}">Omar H.</a> commented<a href="${person('dan-p')}"><img alt=""></a><a href="${person('dan-p')}">Dan P.<br> • 2nd</a><p>swe @ contoso</p><p>1d •</p>`,
    text: "After 3 years of competing at hackathons, I'm finally an MLH top 50! I remember seeing this list back when I first started and thinking it was out of reach.",
  },
  {
    id: 'promo', expect: 'hidden', why: 'promoted',
    header: `<a href="https://www.linkedin.com/company/acme/"><img alt=""></a><a href="https://www.linkedin.com/company/acme/">Acme Cloud</a><p>Promoted</p>`,
    text: 'Acme Cloud now supports Postgres 18 with async I/O on every plan. Migrate in one click.',
  },
];

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

const t0 = performance.now();
report.textContent = 'Loading background.js…';
await import('../src/background.js');
await window.__shim.fireInstalled('install');
await chrome.storage.sync.set({
  settings: { hideMode: 'remove', hidePromoted: true, countries: { blocked: ['CA'], includeRegions: false, onX: true, onLinkedIn: true } },
});

await loadScript('../src/content/common.js');
await loadScript('../src/content/linkedin.js');
log('Content scripts injected; waiting for verdicts and profile lookups…');

const state = (id) => feed.querySelector(`[data-card="${id}"]`).dataset.deslop || 'shown';
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  const done = CARDS.every((c) => (c.expect === 'hidden' ? state(c.id) === 'hidden' : state(c.id) !== 'pending'));
  // Profile lookups are spaced 2.5 s apart (priya, sam, dan); let them all finish.
  if (done && performance.now() - t0 > 7500) break;
  await new Promise((r) => setTimeout(r, 250));
}

let pass = 0;
for (const c of CARDS) {
  const ok = state(c.id) === c.expect;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} ${c.id.padEnd(9)} expected ${c.expect.padEnd(6)} got ${state(c.id).padEnd(7)} ${c.why}`);
}

await new Promise((r) => setTimeout(r, 1800)); // let the geo cache flush
const geo = (await chrome.storage.local.get('cache:geo'))['cache:geo'] || {};
const lookedUp = Object.keys(geo).map((k) => `${k.replace('linkedin:', '')}=${geo[k].v.raw ?? 'null'}`);
log(`\nProfile locations cached: ${lookedUp.join(', ')}`);
const authorOk = lookedUp.some((s) => s.startsWith('dan-p')) && !lookedUp.some((s) => s.startsWith('omar-h'));
log(`${authorOk ? '✓' : '✗'} "commented" card looked up the post author, not the commenter`);
const skipOk = !lookedUp.some((s) => s.startsWith('mark-t'));
log(`${skipOk ? '✓' : '✗'} no profile lookup for a post already hidden as slop`);
const parseOk = geo['linkedin:priya-sharma']?.v.raw === 'Toronto, Ontario, Canada' && geo['linkedin:sam-lee']?.v.raw === 'San Francisco Bay Area';
log(`${parseOk ? '✓' : '✗'} locations parsed from profile HTML`);

const total = CARDS.length + 3;
const passed = pass + (authorOk ? 1 : 0) + (parseOk ? 1 : 0) + (skipOk ? 1 : 0);
report.textContent = `${passed}/${total} checks passed in ${Math.round(performance.now() - t0)} ms\n` + report.textContent;
window.e2e = { passed, total, report: report.textContent };
