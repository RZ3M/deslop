// Offline end-to-end for learning from you: real background.js + content
// scripts on a mock X timeline, with Jev's API stubbed so every answer is
// known. Covers hiding and unhiding posts yourself, the reasons Deslop picks
// and offers, what it learns from them (thresholds, examples, new filters,
// authors), the popup's Unhide, and the anonymized export.
window.__shim.reset();

// ── A stand-in for Jev ──────────────────────────────────────────────────────
// Markers in a post's text decide the answers: BAIT85 → withholds_payoff 0.85,
// CLICK70 → clickbait_hook 0.70, POLITICS, SPORTS (topic), ACME (matches a rule
// about "my old company").
// Posts marked SLOW wait for release() before Jev answers.
const requests = [];
let release;
let held = new Promise((r) => (release = r));
const realFetch = window.fetch;
window.fetch = async (url, init) => {
  if (!String(url).includes('openrouter.ai/api/alpha/decisions')) return realFetch(url, init);
  const body = JSON.parse(init.body);
  const text = `${body.state.post?.text || ''} ${body.state.post?.quoted_post?.text || ''}`;
  requests.push({ text, questions: body.questions });
  if (/SLOW/.test(text)) await held;
  const answers = {};
  for (const [id, q] of Object.entries(body.questions)) answers[id] = stubAnswer(id, q, text);
  return new Response(JSON.stringify({ model: 'stub', answers, usage: { cost: 0 } }), { headers: { 'Content-Type': 'application/json' } });
};

function stubAnswer(id, q, text) {
  const marker = (name) => Number(text.match(new RegExp(`${name}(\\d\\d)`))?.[1] ?? NaN) / 100;
  const noul = (v) => ({ type: 'noul', noul: v });
  if (q.type === 'score') return { type: 'score', score: 0, legend: { 0: 'a', 1: 'b', 2: 'c', 3: 'd' } };
  if (q.type === 'choice') {
    const choice = /SPORTS/.test(text) ? 'sports' : 'none_of_these';
    return { type: 'choice', choice, probabilities: { [choice]: 0.9 } };
  }
  if (id === 'withholds_payoff') return noul(marker('BAIT') || 0.05);
  if (id === 'clickbait_hook') return noul(marker('CLICK') || 0.05);
  if (id === 'politics') return noul(/POLITICS/.test(text) ? 0.95 : 0.02);
  if (id.startsWith('learned_') || id.startsWith('custom_')) {
    const rule = q.instructions.rule || '';
    const fits = (/Sports/.test(rule) && /SPORTS/.test(text)) || (/old company/.test(rule) && /ACME/.test(text));
    return noul(fits ? 0.9 : 0.05);
  }
  return noul(0.03);
}

// ── The page ────────────────────────────────────────────────────────────────

const timeline = document.getElementById('timeline');
const report = document.getElementById('report');
const log = (line) => (report.textContent += `\n${line}`);

function tweetHtml([id, handle, text]) {
  return `<div data-testid="cellInnerDiv" data-id="${id}"><div><div><article data-testid="tweet">
    <div data-testid="User-Name"><a href="/${handle}"><span>${handle}</span></a><a href="/${handle}"><span>@${handle}</span></a>
      <a href="/${handle}/status/${id}"><time datetime="2026-10-29T10:00:00.000Z">2h</time></a></div>
    <button data-testid="caret" type="button" aria-label="More">⋯</button>
    <div data-testid="tweetText"><span>${text}</span></div>
  </article></div></div></div>`;
}
const add = (...tweets) => timeline.insertAdjacentHTML('beforeend', tweets.map(tweetHtml).join(''));

const cell = (id) => timeline.querySelector(`[data-id="${id}"]`);
const state = (id) => cell(id)?.dataset.deslop || 'shown';
const barText = (id) => cell(id)?.querySelector('.deslop-bar .deslop-msg')?.textContent || '';
const chips = (id) => [...(cell(id)?.querySelectorAll('.deslop-chip') || [])];
const chip = (id, text) => chips(id).find((c) => c.textContent.startsWith(text));
const barButton = (id, text) => [...(cell(id)?.querySelectorAll('.deslop-actions button') || [])].find((b) => b.textContent === text);
const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload }).then((r) => r.result);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(done, ms = 6000) {
  const until = Date.now() + ms;
  while (Date.now() < until && !done()) await sleep(50);
  return done();
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

let pass = 0;
let total = 0;
const check = (ok, line) => {
  total++;
  if (ok) pass++;
  log(`${ok ? '✓' : '✗'} ${line}`);
};

async function hideByHand(id) {
  cell(id).querySelector('.deslop-hide-btn').click();
  await waitUntil(() => barText(id) && !/Learning/.test(barText(id)));
}

// ── Run ─────────────────────────────────────────────────────────────────────

await import('../src/background.js');
await window.__shim.fireInstalled('install');
await chrome.storage.local.set({ apiKey: 'sk-test' });
await chrome.storage.sync.set({ settings: { hideMode: 'collapse' } });

add(
  ['3001', 'bait_ben', 'Comment GUIDE and I will DM you the template BAIT85'],
  ['3003', 'hook_hal', 'Nobody talks about this one weird trick CLICK70'],
  ['3005', 'sports_sam', 'What a goal in the derby last night SPORTS'],
  ['3006', 'sports_sue', 'Transfer window rumours are wild this year SPORTS'],
  ['3008', 'rant_ray', 'Another round of layoffs at ACME this week'],
  ['3009', 'undo_una', 'Just a perfectly ordinary post about my garden'],
  ['3010', 'bait_bea', 'Repost and follow and I will send it to you BAIT95'],
  ['3011', 'spam_sid', 'Buy my thing today, it is a very good thing'],
  ['3013', 'pol_pat', 'The election debate tonight was something else POLITICS'],
  ['3099', 'me_myself', 'My own post should never get a hide button from Deslop'],
);
await loadScript('../src/content/common.js');
await loadScript('../src/content/x.js');
await waitUntil(() => state('3001') === 'collapsed' && state('3010') === 'collapsed' && state('3003') === 'shown');

log('Hide button');
check(Boolean(cell('3003').querySelector('.deslop-hide-btn')), 'posts get a hide button');
check(!cell('3099').querySelector('.deslop-hide-btn'), 'your own posts do not');

log('\nUnhiding a post Deslop hid (engagement bait at 85%)');
barButton('3001', 'Show').click();
check(Boolean(barButton('3001', 'Unhide')), 'a revealed post offers "Unhide"');
barButton('3001', 'Unhide').click();
await waitUntil(() => /less strict/.test(barText('3001')));
check(state('3001') === 'kept', `post stays visible (${state('3001')})`);
check(/less strict about Engagement bait/.test(barText('3001')), `says what it learned: "${barText('3001')}"`);
let learning = await send('learning:get');
const bait = learning.adjusted.find((a) => a.id === 'engagement_bait');
check(bait?.learned > 0.85, `engagement bait now hides at ≥${bait?.learned} (was ${bait?.base})`);

add(['3002', 'bait_bo', 'Like and reply and I will DM you more BAIT84']);
await waitUntil(() => requests.some((r) => /BAIT84/.test(r.text)) && state('3002') !== 'pending');
await sleep(200);
check(state('3002') === 'shown', `a new post at 84% is no longer hidden (${state('3002')})`);
const askedWith = requests.find((r) => /BAIT84/.test(r.text))?.questions.withholds_payoff;
check(
  askedWith?.criteria.false.examples.some((e) => /BAIT85/.test(e)) && /this user/.test(askedWith.instructions.user_examples),
  'the unhidden post is now an example of what not to hide',
);

log('\nHiding a post Deslop missed (clickbait at 70%)');
await hideByHand('3003');
check(state('3003') === 'collapsed', `post collapses (${state('3003')})`);
check(/hide more posts like this: Clickbait hooks/.test(barText('3003')), `works out why: "${barText('3003')}"`);
check(chip('3003', 'Clickbait hooks')?.getAttribute('aria-pressed') === 'true', 'and marks that reason');
check(Boolean(chip('3003', 'Everything from @hook_hal')) && Boolean(chip('3003', 'Just this post')) && Boolean(chip('3003', 'Other…')), 'offers other reasons');
learning = await send('learning:get');
check(learning.adjusted.find((a) => a.id === 'clickbait')?.learned === 0.7, 'clickbait now hides at ≥70%');
add(['3004', 'hook_hank', 'You will not believe what this does CLICK71']);
check(await waitUntil(() => state('3004') === 'collapsed'), `a new post at 71% is hidden (${state('3004')})`);

log('\nHiding posts about a topic no filter covers');
await hideByHand('3005');
check(/New filter “Sports”: hide 1 more/.test(barText('3005')), `first one starts a filter: "${barText('3005')}"`);
await hideByHand('3006');
check(/hide more posts like this: Sports/.test(barText('3006')), `second one turns it on: "${barText('3006')}"`);
add(['3007', 'sports_stan', 'Who wins the cup final on Sunday SPORTS']);
check(await waitUntil(() => state('3007') === 'collapsed'), `a new sports post is hidden (${state('3007')})`);
check(/Sports/.test(barText('3007')), `by the learned filter: "${barText('3007')}"`);

log('\nYour own words');
await hideByHand('3008');
check(/Only this post/.test(barText('3008')), `nothing explains it: "${barText('3008')}"`);
chip('3008', 'Other…').click();
const field = cell('3008').querySelector('.deslop-other input');
check(Boolean(field), '"Other…" asks what to hide');
field.value = 'Posts about my old company';
cell('3008').querySelector('.deslop-other').requestSubmit();
await waitUntil(() => /old company/.test(barText('3008')));
check(/hide more posts like this: Posts about my old company/.test(barText('3008')), `a filter in your words: "${barText('3008')}"`);
add(['3014', 'news_nia', 'ACME announced a new CEO this morning']);
check(await waitUntil(() => state('3014') === 'collapsed'), `a new post about it is hidden (${state('3014')})`);

log('\nEverything from an author');
await hideByHand('3011');
chip('3011', 'Everything from @spam_sid').click();
await waitUntil(() => /everything from @spam_sid/.test(barText('3011')));
check(/everything from @spam_sid/.test(barText('3011')), `"${barText('3011')}"`);
add(['3012', 'spam_sid', 'Another very good thing for sale, buy it now']);
check(await waitUntil(() => state('3012') === 'collapsed'), `their next post is hidden (${state('3012')}: ${barText('3012')})`);

log('\nA category you have off');
await hideByHand('3013');
check(/Looks like Politics, a filter you have off/.test(barText('3013')), `"${barText('3013')}"`);
check(chip('3013', 'Politics (off)')?.getAttribute('aria-pressed') === 'true', 'offers to turn it on');
chip('3013', 'Politics (off)').click();
await sleep(600);
const { settings } = await chrome.storage.sync.get('settings');
check(settings.categories?.politics === true, 'picking it turns Politics on');
check(
  state('3013') === 'collapsed' && /hide more posts like this: Politics/.test(barText('3013')) && chips('3013').length > 0,
  `and the bar stays, with its reasons (${state('3013')}: ${barText('3013')})`,
);

log('\nUndo');
await hideByHand('3009');
barButton('3009', 'Undo').click();
await sleep(300);
check(state('3009') === 'shown', `post is back (${state('3009')})`);
let store = (await chrome.storage.local.get('learning:v1'))['learning:v1'];
check(!store.feedback.some((e) => e.key === 't3009'), 'and forgotten');

log('\nRaces');
add(['3015', 'slow_sal', 'A SLOW post nobody explains CLICK70']);
await waitUntil(() => requests.some((r) => /SLOW/.test(r.text)));
cell('3015').querySelector('.deslop-hide-btn').click();
release();
await waitUntil(() => !/Learning/.test(barText('3015')));
check(state('3015') === 'collapsed' && /Hidden by you/.test(barText('3015')), `hiding a post while it's being checked sticks (${state('3015')}: ${barText('3015')})`);
add(['3016', 'fast_fay', 'One more weird trick to try CLICK75'], ['3017', 'fast_fred', 'Yet another weird trick to try CLICK76']);
await waitUntil(() => state('3016') === 'collapsed' && state('3017') === 'collapsed');
barButton('3016', 'Show').click();
barButton('3017', 'Show').click();
barButton('3016', 'Unhide').click();
barButton('3017', 'Unhide').click();
barButton('3017', 'Undo').click();
await sleep(500);
store = (await chrome.storage.local.get('learning:v1'))['learning:v1'];
check(state('3016') === 'kept' && store.feedback.some((e) => e.key === 't3016' && e.action === 'show'), `two quick unhides: the first stays (${state('3016')})`);
check(state('3017') === 'collapsed' && !store.feedback.some((e) => e.key === 't3017'), `Undo right after Unhide wins (${state('3017')})`);

log('\nUnhide from the popup');
let recent = (await send('stats:get')).recent;
const item = recent.find((r) => r.key === 't3010');
check(Boolean(item) && item.reasons[0]?.id === 'engagement_bait', 'hidden posts are listed with their key and reason');
await send('feedback:show', { platform: 'x', key: 't3010', fired: item.reasons });
check(await waitUntil(() => state('3010') === 'shown'), `the post appears in the feed (${state('3010')})`);
recent = (await send('stats:get')).recent;
check(recent.find((r) => r.key === 't3010')?.fixed === 'shown', 'and is marked unhidden in the list');
await hideByHand('3010');
barButton('3010', 'Undo').click();
await sleep(400);
store = (await chrome.storage.local.get('learning:v1'))['learning:v1'];
check(state('3010') === 'shown' && store.feedback.find((e) => e.key === 't3010')?.action === 'show', `hiding it and undoing brings back the unhide (${state('3010')})`);

log('\nAfter a reload');
globalThis.__deslop.x.reset();
globalThis.__deslop.x.scan();
await sleep(400);
check(state('3003') === 'collapsed' && /Clickbait hooks/.test(barText('3003')), `posts you hid stay hidden (${state('3003')}: ${barText('3003')})`);
check(state('3001') === 'shown', `posts you unhid stay visible (${state('3001')})`);

log('\nSettings page summary and export');
learning = await send('learning:get');
const rules = Object.fromEntries(learning.rules.map((r) => [r.label, r.status]));
check(rules.Sports === 'active' && rules['Posts about my old company'] === 'active', `learned filters: ${JSON.stringify(rules)}`);
check(learning.authors.some((a) => a.key === 'x:@spam_sid'), 'hidden authors are listed');
const bundle = await send('learning:export');
const json = JSON.stringify(bundle);
check(bundle.format === 'deslop-feedback' && bundle.feedback.length >= 8, `export has ${bundle.feedback.length} examples`);
check(!/bait_ben|hook_hal|sports_sam|spam_sid|\/status\//.test(json), 'with no handles or post links');
check(bundle.feedback.some((f) => f.reason?.topic === 'sports') && bundle.feedback.some((f) => f.label === 'keep'), 'but with labels and reasons');

log('\nResetting learning');
await send('learning:reset');
learning = await send('learning:get');
check(learning.hidden === 0 && !learning.adjusted.length && !learning.rules.length, 'forgets everything');

report.textContent = `${pass}/${total} checks passed\n` + report.textContent;
window.e2e = { passed: pass, total, report: report.textContent };
