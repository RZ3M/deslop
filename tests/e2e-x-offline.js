// Offline end-to-end: real background.js + content scripts on a mock X
// timeline, with no API key. Everything checked here is decided without Jev.
window.__shim.reset();

const FOR_YOU = (label) => [label, 'Follow @someone', 'Add/remove from Lists', 'Mute @someone', 'Block @someone', 'Report post'];
const TWEETS = [
  {
    id: '2001', handle: 'founders_ca', expect: 'hidden', why: 'muted "canadian" catches "Canadians"',
    text: 'Canadians founded a record number of fintech startups this quarter.',
    menu: FOR_YOU('Not interested in this post'), expectClick: 'Not interested in this post',
  },
  {
    id: '2002', handle: 'crypto_cn', expect: 'hidden', why: 'muted word inside Chinese text',
    text: '我最近很喜欢加密货币投资和区块链项目',
    menu: FOR_YOU('对这个帖子不感兴趣'), expectClick: '对这个帖子不感兴趣',
  },
  {
    id: '2003', handle: 'finapp_es', expect: 'hidden', why: 'Spanish "Anuncio" label',
    text: 'Prueba nuestra app de finanzas personales gratis durante 30 días.',
    adLabel: 'Anuncio', menu: ['No me interesa este anuncio', 'Denunciar anuncio'], expectClick: 'No me interesa este anuncio',
  },
  {
    id: '2004', handle: 'following_tab', expect: 'hidden', why: 'muted, but menu has no "Not interested" (Following tab)',
    text: 'Fellow Canadians: our hockey fan club meets on Sunday at the usual place.',
    menu: ['Follow @following_tab', 'Mute @following_tab', 'Block @following_tab'], expectClick: null,
  },
  {
    id: '2006', handle: 'big_news_kara', expect: 'hidden', why: 'fancy fonts + emojis, decided in code',
    text: "🚀 𝗕𝗜𝗚 𝗡𝗘𝗪𝗦 🚀 I'm 𝘁𝗵𝗿𝗶𝗹𝗹𝗲𝗱 to share that I've joined Acme! ✅",
    menu: FOR_YOU('Not interested in this post'), expectClick: 'Not interested in this post',
  },
  {
    id: '2005', handle: 'rosalind_ops', expect: 'shown', why: 'nothing to hide (no key, so Jev is never asked)',
    text: 'Shipped dark mode today. Took three days because of our CSS variables mess.',
    menu: FOR_YOU('Not interested in this post'), expectClick: null,
  },
];

const timeline = document.getElementById('timeline');
const layers = document.getElementById('layers');
const report = document.getElementById('report');
const log = (line) => (report.textContent += `\n${line}`);
const clicks = [];
const menusOpened = [];

function tweetHtml(t) {
  const ad = t.adLabel ? `<span>${t.adLabel}</span>` : '';
  return `<div data-testid="cellInnerDiv" data-id="${t.id}"><div><div><article data-testid="tweet">
    <div data-testid="User-Name"><a href="/${t.handle}"><span>${t.handle}</span></a><a href="/${t.handle}"><span>@${t.handle}</span></a>
      <a href="/${t.handle}/status/${t.id}"><time datetime="2026-10-29T10:00:00.000Z">2h</time></a>${ad}</div>
    <button data-testid="caret" type="button" aria-label="More">⋯</button>
    <div data-testid="tweetText"><span>${t.text}</span></div>
  </article></div></div></div>`;
}

// A stand-in for X's ⋯ dropdown: role=menu in #layers, closed by Escape.
function openMenu(t) {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  for (const label of t.menu) {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `<span>${label}</span>`;
    item.addEventListener('click', () => {
      clicks.push({ id: t.id, label });
      menu.remove();
    });
    menu.appendChild(item);
  }
  layers.appendChild(menu);
  menusOpened.push({ id: t.id, ghost: document.documentElement.classList.contains('deslop-ghost-menu'), opacity: getComputedStyle(menu).opacity });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') layers.querySelectorAll('[role="menu"]').forEach((m) => m.remove());
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

await import('../src/background.js');
await window.__shim.fireInstalled('update');
await chrome.storage.sync.set({
  settings: { mutedWords: ['canadian', '加密货币'], hidePromoted: true, notInterestedOnX: true },
});

timeline.innerHTML = TWEETS.map(tweetHtml).join('');
for (const t of TWEETS) timeline.querySelector(`[data-id="${t.id}"] [data-testid="caret"]`).addEventListener('click', () => openMenu(t));
await loadScript('../src/content/common.js');
await loadScript('../src/content/x.js');
log('Content scripts injected; waiting for verdicts and feedback…');

const state = (id) => timeline.querySelector(`[data-id="${id}"]`).dataset.deslop || 'shown';
const expectedMenus = TWEETS.filter((t) => t.expect === 'hidden').length;
const deadline = Date.now() + 15000;
while (Date.now() < deadline && (menusOpened.length < expectedMenus || layers.children.length)) {
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 600));

let pass = 0;
let total = 0;
const check = (ok, line) => {
  total++;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} ${line}`);
};

log('');
for (const t of TWEETS) {
  check(state(t.id) === t.expect, `@${t.handle.padEnd(14)} ${t.expect.padEnd(6)} got ${state(t.id).padEnd(6)} (${t.why})`);
}
for (const t of TWEETS) {
  const got = clicks.find((c) => c.id === t.id)?.label || null;
  check(got === t.expectClick, `@${t.handle.padEnd(14)} clicked ${JSON.stringify(got)}, expected ${JSON.stringify(t.expectClick)}`);
}
check(!menusOpened.some((m) => m.id === '2005'), 'never opens the menu on posts that stay visible');
check(menusOpened.length > 0 && menusOpened.every((m) => m.ghost && m.opacity === '0'), `menu was invisible every time it opened (${menusOpened.length} opens)`);
check(layers.children.length === 0, 'no menu left open');
check(!document.documentElement.classList.contains('deslop-ghost-menu'), 'menus are visible again afterwards');

const recent = (await chrome.runtime.sendMessage({ type: 'stats:get' })).result.recent;
log(`\nRecent: ${recent.map((r) => `${r.handle}→${r.reasons[0]?.label}`).join(', ')}`);

report.textContent = `${pass}/${total} checks passed\n` + report.textContent;
window.e2e = { passed: pass, total, report: report.textContent };
