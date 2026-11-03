// Offline end-to-end for the Reddit adapter: real background.js + content
// scripts on mock posts and comments, with no API key. The mock elements
// render through shadow DOM with named slots only, like Reddit's, so a bar put
// inside them would never show. Profiles (about.json and the profile page)
// are served by a stand-in for fetch, which also counts the lookups.
window.__shim.reset();

const DAY = 86400;
const now = Date.now() / 1000;
const sfw = (days = 900, bio = '') => ({ created_utc: now - days * DAY, total_karma: 4200, subreddit: { over_18: false, public_description: bio } });
const PROFILES = {
  spicy_bot: { about: { created_utc: now - 400 * DAY, total_karma: 5100, subreddit: { over_18: true, public_description: '💕 new here, say hi' } }, sidebar: '<a href="https://onlyfans.com/spicy" rel="noopener nofollow ugc" target="_blank">OnlyFans</a>' },
  new_nsfw: { about: { created_utc: now - 3 * DAY, total_karma: 12, subreddit: { over_18: true, public_description: '' } } },
  bio_bot: { about: sfw(200, 'Check my 𝐎𝐧𝐥𝐲𝐅𝐚𝐧𝐬 👇 free trial today') },
  wrapped: { about: sfw(300), sidebar: '<a href="https://out.reddit.com/t2_abc?url=https%3A%2F%2Ffansly.com%2Fwrapped&amp;token=x">Fansly</a>' },
  hidden_new: { about: sfw(10), main: '<p>u/hidden_new likes to keep their posts hidden</p>' },
  linktree_sfw: { about: sfw(700, 'Sourdough every weekend'), sidebar: '<a href="https://linktr.ee/baker">Linktree</a>' },
  news_reader: { about: sfw(), main: '<shreddit-feed><shreddit-post post-title="OnlyFans raises its fees"><a href="https://onlyfans.com/blog/fees">article</a></shreddit-post></shreddit-feed>' },
  plain_user: { about: sfw() },
  gone_user: null,
};

const profilePage = (p) => `<!doctype html><html><head><title>Reddit</title></head><body><shreddit-app><main>${p.main || ''}</main>
  <aside><h2>About</h2>${p.sidebar || ''}<a href="https://www.reddit.com/settings/profile">Edit profile</a><a href="https://www.redditinc.com/policies/user-agreement">User Agreement</a></aside></shreddit-app></body></html>`;

const lookups = {};
const nativeFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const m = url.pathname.match(/^\/user\/([^/]+)\/(about\.json)?$/);
  if (!m) return nativeFetch(input, init);
  const name = decodeURIComponent(m[1]);
  const kind = m[2] ? 'about' : 'page';
  lookups[name] ??= { about: 0, page: 0 };
  lookups[name][kind] += 1;
  const p = PROFILES[name];
  if (!p) return new Response('{"message": "Not Found", "error": 404}', { status: 404 });
  if (kind === 'about') return new Response(JSON.stringify({ kind: 't2', data: { name, ...p.about } }), { headers: { 'content-type': 'application/json' } });
  return new Response(profilePage(p), { headers: { 'content-type': 'text/html' } });
};

customElements.define(
  'shreddit-post',
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML =
        '<div class="credit">r/test · 3h</div><slot name="title"></slot><slot name="text-body"></slot><div class="actions">▲ 12 ▼ · 3 comments</div>';
    }
  },
);
customElements.define('shreddit-ad-post', class extends customElements.get('shreddit-post') {});
customElements.define(
  'shreddit-comment',
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML =
        '<slot name="commentMeta"></slot><slot name="comment"></slot><slot name="actionRow"></slot><div class="replies"><slot name="children"></slot></div>';
    }
  },
);

const POSTS = [
  { id: 'muted', author: 'coin_carl', title: 'Three crypto lessons from this cycle', want: 'collapsed', why: 'muted "crypto"' },
  { id: 'spicy', author: 'spicy_bot', title: 'Just moved to a new city, any coffee recommendations?', want: 'collapsed', why: 'profile links to OnlyFans', label: 'Profile links to OnlyFans' },
  { id: 'newnsfw', author: 'new_nsfw', title: "What's a hobby that changed your life?", want: 'collapsed', why: 'new NSFW account', label: 'New NSFW account, 3 days old' },
  { id: 'bio', author: 'bio_bot', title: 'Is it weird to eat cereal for dinner every night?', want: 'collapsed', why: 'fancy-font OnlyFans in bio', label: 'Bio mentions OnlyFans' },
  { id: 'wrapped', author: 'wrapped', title: 'My cat refuses to sleep anywhere but the laundry basket', want: 'collapsed', why: 'Fansly behind a Reddit redirect', label: 'Profile links to Fansly' },
  { id: 'hidden', author: 'hidden_new', title: 'What is the best budget mechanical keyboard right now?', want: 'collapsed', why: 'new account hiding its posts', label: 'New account with hidden posts, 10 days old' },
  { id: 'tree', author: 'linktree_sfw', title: 'Finally nailed an open crumb on my sourdough', want: 'shown', why: 'Linktree on a profile that is not NSFW' },
  { id: 'news', author: 'news_reader', title: 'Anyone else moving their savings to a high-interest account?', want: 'shown', why: 'OnlyFans link only inside a post on the profile' },
  { id: 'plain', author: 'plain_user', title: 'Shipped dark mode today, took three days because of our CSS variables', want: 'shown', why: 'nothing to hide' },
  { id: 'gone', author: 'gone_user', title: 'Which hiking trails near the city are worth the drive?', want: 'shown', why: 'deleted account (404)' },
  { id: 'friend', author: 'friendly', title: 'My first crypto hackathon was a blast', want: 'shown', why: 'muted, but u/friendly is on the allowlist' },
];
const postHtml = (p) => `<article data-post-id="t3_${p.id}"><shreddit-post id="t3_${p.id}" author="${p.author}" post-title="${p.title}"
  permalink="/r/test/comments/${p.id}/slug/" subreddit-prefixed-name="r/test" post-type="text">
  <a slot="title" href="/r/test/comments/${p.id}/slug/">${p.title}</a>
  <div slot="text-body"><div class="md"><p>${p.body || ''}</p></div></div></shreddit-post></article><hr>`;

// Replies are children of their parent comment, in a named slot.
const comment = (id, author, text, replies = '', slot = '', extra = '') => `<shreddit-comment${slot ? ` slot="${slot}"` : ''}${extra} thingid="t1_${id}" author="${author}" permalink="/r/test/comments/main/comment/${id}/" data-c="${id}">
  <div slot="commentMeta"><a href="/user/${author}/">${author}</a> · 2h</div>
  <div slot="comment" id="t1_${id}-comment-rtjson-content"><p>${text}</p></div>
  <div slot="actionRow">Reply · Share</div>${replies}</shreddit-comment>`;

document.getElementById('page').innerHTML = `
  <shreddit-post id="t3_main" author="coin_carl" post-title="The post you opened mentions crypto" permalink="/r/test/comments/main/slug/">
    <h1 slot="title">The post you opened mentions crypto</h1></shreddit-post>
  <shreddit-feed>
    ${POSTS.map(postHtml).join('')}
    <shreddit-ad-post id="t3_ad" author="acme_ads" post-title="Acme Cloud now supports Postgres 18">
      <a slot="title" href="https://acme.example/">Acme Cloud now supports Postgres 18</a></shreddit-ad-post>
  </shreddit-feed>
  <section id="comments">
    ${comment('cmuted', 'coin_carl', 'honestly crypto is the only thing that kept me sane this year', comment('creply', 'plain_user', 'glad it worked out for you, that sounds rough', '', 'children'))}
    ${comment('cspicy', 'spicy_bot', 'this is so wholesome, love it')}
    ${comment('cfolded', 'plain_user', 'what did everyone think of the finale?', comment('clate', 'coin_carl', 'the finale was fine but crypto twitter ruined it for me', '', 'children'), '', ' collapsed')}
  </section>`;

const report = document.getElementById('report');
const log = (line) => (report.textContent += `\n${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (id) => document.getElementById(`t3_${id}`);
const c = (id) => document.querySelector(`[data-c="${id}"]`);
const body = (id) => c(id).querySelector(':scope > [slot="comment"]:not(.deslop-bar)');
const state = (el) => el.dataset.deslop || 'shown';
const visible = (el) => Boolean(el?.getClientRects().length);
const barBefore = (el) => (el.previousElementSibling?.classList.contains('deslop-bar') ? el.previousElementSibling : null);

async function waitUntil(done, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until && !done()) await sleep(100);
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

// Counts changes to data-deslop while `during` runs, plus a settling period.
async function changesDuring(el, during) {
  let n = 0;
  const observer = new MutationObserver((records) => (n += records.length));
  observer.observe(el, { attributes: true, attributeFilter: ['data-deslop'] });
  await during();
  for (let i = 0; i < 4; i++) {
    document.body.appendChild(document.createElement('div')).remove();
    await sleep(300);
  }
  observer.disconnect();
  return n;
}

let pass = 0;
let total = 0;
const check = (ok, line) => {
  total++;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} ${line}`);
};

const SETTINGS = { hideMode: 'collapse', hidePromoted: true, mutedWords: ['crypto'], allowlist: ['u/friendly'], keepHistory: true };
await import('../src/background.js');
chrome.runtime.openOptionsPage = () => {}; // there's no key, which would open settings
await window.__shim.fireInstalled('install');
await chrome.storage.sync.set({ settings: SETTINGS });

await loadScript('../src/content/common.js');
await loadScript('../src/content/reddit.js');
log('Content scripts injected.\n\nPosts');

const settled = () => POSTS.every((p) => state(host(p.id)) === p.want) && state(host('ad')) === 'collapsed';
await waitUntil(settled);
await sleep(2000); // anything that would hide late, has
for (const p of POSTS) check(state(host(p.id)) === p.want, `${p.id.padEnd(8)} ${state(host(p.id)).padEnd(9)} (${p.why})`);
check(state(host('ad')) === 'collapsed', `ad       ${state(host('ad'))} (promoted)`);
check(state(host('main')) === 'shown', `main     ${state(host('main'))} (the post you opened isn't filtered)`);

log('\nBars sit outside the shadow DOM');
for (const p of POSTS.filter((p) => p.want === 'collapsed')) {
  const bar = barBefore(host(p.id));
  check(visible(bar) && !visible(host(p.id)), `${p.id.padEnd(8)} bar shows, post hidden (${bar?.textContent.replace(/Show$/, '').trim()})`);
  if (p.label) check(bar?.textContent.includes(p.label), `${p.id.padEnd(8)} says "${p.label}"`);
}

const spicyBar = barBefore(host('spicy'));
const [b, h] = [spicyBar.getBoundingClientRect(), host('spicy').closest('article').getBoundingClientRect()];
check(Math.abs(b.left - h.left) < 1 && Math.abs(b.right - h.right) < 1, `spicy    bar spans the post's full width (${Math.round(b.left)}–${Math.round(b.right)} vs ${Math.round(h.left)}–${Math.round(h.right)})`);
let n = await changesDuring(host('spicy'), async () => spicyBar.querySelector('button')?.click());
check(state(host('spicy')) === 'revealed' && visible(host('spicy')) && n === 1, `spicy    "Show" reveals the post (${n} change, ${state(host('spicy'))})`);
const [rb, rh] = [barBefore(host('spicy')).getBoundingClientRect(), host('spicy').getBoundingClientRect()];
check(Math.abs(rb.left - rh.left) < 1 && Math.abs(rb.right - rh.right) < 1 && Math.abs(rb.bottom - rh.top) < 1, `spicy    revealed post and its bar line up as one card (gap ${Math.round(rh.top - rb.bottom)}px)`);
const again = barBefore(host('spicy'))?.querySelector('button');
check(again?.textContent === 'Hide again', `spicy    revealed post offers "Hide again" (${again?.textContent})`);
n = await changesDuring(host('spicy'), async () => again?.click());
check(state(host('spicy')) === 'collapsed' && !visible(host('spicy')) && n === 1, `spicy    "Hide again" hides it (${n} change, ${state(host('spicy'))})`);

log('\nComments');
check(state(body('cmuted')) === 'collapsed' && !visible(body('cmuted')), `cmuted   text ${state(body('cmuted'))} (muted "crypto")`);
const cbar = barBefore(body('cmuted'));
check(visible(cbar) && cbar.slot === 'comment', `cmuted   bar shows in the comment's slot (${cbar?.slot})`);
check(cbar?.textContent.startsWith('Deslop hid a comment'), `cmuted   bar says "${cbar?.textContent.replace(/Show$/, '')}"`);
check(visible(c('cmuted').querySelector('[slot="commentMeta"]')), 'cmuted   author line still shows');
check(visible(body('creply')) && state(body('creply')) === 'shown', 'creply   reply to a hidden comment still shows');
check(state(body('cspicy')) === 'shown', `cspicy   ${state(body('cspicy'))} (commenters' profiles aren't checked by default)`);
check(state(body('clate')) === 'shown', `clate    ${state(body('clate'))} while its thread is collapsed`);
c('cfolded').removeAttribute('collapsed');
await waitUntil(() => state(body('clate')) === 'collapsed', 5000);
check(state(body('clate')) === 'collapsed' && visible(barBefore(body('clate'))), `clate    ${state(body('clate'))} once the thread is expanded (muted "crypto")`);

log('\nCheck commenters too');
await chrome.storage.sync.set({ settings: { ...SETTINGS, reddit: { checkCommenters: true } } });
await waitUntil(() => state(body('cspicy')) === 'collapsed', 8000);
check(state(body('cspicy')) === 'collapsed', `cspicy   ${state(body('cspicy'))} (profile links to OnlyFans)`);

log('\nRemove mode');
await chrome.storage.sync.set({ settings: { ...SETTINGS, hideMode: 'remove', reddit: { checkCommenters: true } } });
await waitUntil(() => state(host('muted')) === 'hidden' && state(c('cmuted')) === 'hidden', 8000);
check(state(host('muted')) === 'hidden' && !barBefore(host('muted')), `muted    ${state(host('muted'))}, no bar`);
check(state(host('spicy')) === 'hidden', `spicy    ${state(host('spicy'))}`);
check(state(c('cmuted')) === 'hidden' && !visible(c('cmuted')) && !visible(body('creply')), 'cmuted   comment removed with its replies');

log('\nOff switches');
await chrome.storage.sync.set({ settings: { ...SETTINGS, reddit: { adultLinks: false, newAccounts: false } } });
await waitUntil(() => state(host('spicy')) === 'shown' && state(host('newnsfw')) === 'shown' && state(host('muted')) === 'collapsed', 8000);
check(state(host('spicy')) === 'shown' && state(host('newnsfw')) === 'shown', 'spicy, newnsfw shown with both profile checks off');
check(state(host('muted')) === 'collapsed', `muted    still ${state(host('muted'))}`);

log('\nLookups');
const names = Object.keys(lookups).sort();
check(!lookups.coin_carl, 'coin_carl never looked up (already hidden by a muted word)');
check(!lookups.friendly, 'friendly never looked up (allowlisted)');
check(!lookups.acme_ads, 'acme_ads never looked up (promoted)');
check(names.every((k) => lookups[k].about <= 1 && lookups[k].page <= 1), `each profile fetched once (${names.map((k) => `${k} ${lookups[k].about}+${lookups[k].page}`).join(', ')})`);
check(lookups.gone_user?.about === 1 && !lookups.gone_user.page, 'gone_user: about.json 404, profile page skipped');

const recent = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result.recent;
const spicy = recent.find((r) => r.handle === 'u/spicy_bot' && r.url.includes('/spicy/'));
check(spicy?.reasonId === 'porn_bot' && spicy.reasons[0]?.label === 'Profile links to OnlyFans', `recent list: ${spicy?.reasonId} · ${spicy?.reasons[0]?.label}`);
check(recent.filter((r) => r.url.includes('/spicy/')).length === 1, 'spicy counted as hidden once');
const { stats } = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result;
const today = stats.days?.[new Date().toLocaleDateString('en-CA')]?.hidden?.reddit || {};
check(today.porn_bot >= 6 && today.muted >= 1 && today.promoted >= 1, `with history on, today's Reddit posts are counted by reason (${JSON.stringify(today)})`);
await chrome.runtime.sendMessage({ type: 'history:clear' });
const cleared = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result.stats;
check(!Object.keys(cleared.days || {}).length && cleared.hiddenTotal === stats.hiddenTotal, 'turning history off deletes the daily counts, not the totals');

report.textContent = `${pass}/${total} checks passed\n` + report.textContent;
window.e2e = { passed: pass, total, report: report.textContent };
