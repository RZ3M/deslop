// Offline tests for the pure logic in src/lib (no API calls).
import { matchPlace, isBlockedPlace, COUNTRIES, REGIONS } from '../src/lib/countries.js';
import {
  verdictFrom,
  buildQuestions,
  questionsFor,
  missingQuestions,
  mergeAnswers,
  customRuleId,
  buildState,
  hasEnoughText,
  wordCount,
  findMutedWord,
  focusActive,
  fancyFonts,
  fancyFontScore,
  localSignals,
  learnedRuleId,
  analysisQuestions,
} from '../src/lib/classify.js';
import { QUESTIONS, CATEGORIES, focusQuestion, withExamples, LEARNING } from '../src/lib/questions.js';
import { fitThreshold, learnFrom, attribute, explain, topicReason, describeReason, scrub, exportBundle, summarize } from '../src/lib/learn.js';
import { createLimiter } from '../src/lib/jev.js';

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
  }
};
const eq = (a, b, msg = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

// ── Places ──────────────────────────────────────────────────────────────────
const code = (raw) => {
  const p = matchPlace(raw);
  return p ? (p.kind === 'country' ? p.code : `region:${p.id}`) : null;
};

await test('X country names', () => {
  eq(code('United States'), 'US');
  eq(code('Canada'), 'CA');
  eq(code('United Kingdom'), 'GB');
  eq(code('Türkiye'), 'TR');
  eq(code('Turkey'), 'TR');
  eq(code('Korea'), 'KR');
  eq(code('Hong Kong'), 'HK');
});

await test('X region names', () => {
  eq(code('South Asia'), 'region:south-asia');
  eq(code('Europe'), 'region:europe');
  eq(code('East Asia & Pacific'), 'region:east-asia-pacific');
  eq(code('Africa'), 'region:africa');
  eq(code('West Asia'), 'region:middle-east');
});

await test('LinkedIn places', () => {
  eq(code('Toronto, Ontario, Canada'), 'CA');
  eq(code('Vancouver, British Columbia, Canada'), 'CA');
  eq(code('London, England, United Kingdom'), 'GB');
  eq(code('Greater Toronto Area, Canada'), 'CA');
  eq(code('Austin, Texas'), 'US');
  eq(code('New York, New York, United States'), 'US');
  eq(code('Lagos State, Nigeria'), 'NG');
  eq(code('São Paulo, São Paulo, Brazil'), 'BR');
  eq(code('Ho Chi Minh City, Vietnam'), 'VN');
  eq(code('Dubai, United Arab Emirates'), 'AE');
});

await test('unresolvable places fall through to the model', () => {
  eq(code('San Francisco Bay Area'), null);
  eq(code('Atlanta, Georgia'), null);
  eq(code(''), null);
  eq(code(null), null);
});

await test('Georgia alone is the country', () => {
  eq(code('Georgia'), 'GE');
  eq(code('Tbilisi, Georgia, Georgia'), null);
});

await test('blocking countries and regions', () => {
  const canada = matchPlace('Canada');
  const northAmerica = matchPlace('North America');
  const germany = matchPlace('Germany');
  eq(isBlockedPlace(canada, ['CA'], false), true);
  eq(isBlockedPlace(germany, ['CA'], false), false);
  eq(isBlockedPlace(northAmerica, ['CA'], false), false, 'region-only accounts kept by default');
  eq(isBlockedPlace(northAmerica, ['CA'], true), true, 'region-only accounts hidden when opted in');
  eq(isBlockedPlace(germany, ['region:europe'], false), true, 'blocked region covers its countries');
  eq(isBlockedPlace(matchPlace('Europe'), ['region:europe'], false), true);
  eq(isBlockedPlace(matchPlace('Egypt'), ['region:middle-east'], false), true);
  eq(isBlockedPlace(null, ['CA'], true), false);
  eq(isBlockedPlace(canada, [], true), false);
});

await test('country data is consistent', () => {
  const codes = new Set();
  for (const c of COUNTRIES) {
    if (codes.has(c.code)) throw new Error(`duplicate ${c.code}`);
    codes.add(c.code);
    if (!/^[A-Z]{2}$/.test(c.code)) throw new Error(`bad code ${c.code}`);
    if (!c.flag) throw new Error(`no flag ${c.code}`);
  }
  const subs = new Set(COUNTRIES.map((c) => c.sub));
  for (const r of REGIONS) for (const s of r.subs) if (!subs.has(s)) throw new Error(`region ${r.id} has unknown sub ${s}`);
  if (COUNTRIES.length < 190) throw new Error(`only ${COUNTRIES.length} countries`);
});

// ── Verdicts ────────────────────────────────────────────────────────────────
const answers = (o) => ({
  withholds_payoff: { type: 'noul', noul: o.bait ?? 0 },
  engagement_farming: { type: 'noul', noul: o.farm ?? 0 },
  ai_style: { type: 'score', score: o.ai ?? 0, legend: { 0: 'a', 1: 'b', 2: 'c', 3: 'd' } },
  news_rehash: { type: 'noul', noul: o.news ?? 0 },
  clickbait_hook: { type: 'noul', noul: o.click ?? 0 },
  hollow_inspiration: { type: 'noul', noul: o.bro ?? 0 },
  rage_bait: { type: 'noul', noul: o.rage ?? 0 },
  personal_branding: { type: 'noul', noul: o.brand ?? 0 },
  hate_speech: { type: 'noul', noul: o.hate ?? 0 },
  hostility: { type: 'noul', noul: o.hostile ?? 0 },
  politics: { type: 'noul', noul: o.politics ?? 0 },
  ...(o.extra || {}),
});
const base = { strictness: 'balanced', categories: {}, customRules: [] };

await test('clean post is kept', () => {
  eq(verdictFrom(answers({}), base).hide, false);
});

await test('engagement bait takes the max of both questions', () => {
  const v = verdictFrom(answers({ farm: 0.85 }), base);
  eq(v.hide, true);
  eq(v.reasons[0].id, 'engagement_bait');
});

await test('AI score maps to a 0..1 fraction', () => {
  eq(verdictFrom(answers({ ai: 1.9 }), base).hide, false);
  eq(verdictFrom(answers({ ai: 2.1 }), base).hide, true);
  eq(verdictFrom(answers({ ai: 2.1 }), { ...base, strictness: 'relaxed' }).hide, false);
});

await test('disabled categories never hide', () => {
  eq(verdictFrom(answers({ news: 0.99 }), { ...base, categories: { news_rehash: false } }).hide, false);
});

await test('rage bait is off by default', () => {
  eq(verdictFrom(answers({ rage: 0.99 }), base).hide, false);
  eq(verdictFrom(answers({ rage: 0.99 }), { ...base, categories: { rage_bait: true } }).hide, true);
});

await test('strictness changes thresholds', () => {
  eq(verdictFrom(answers({ click: 0.7 }), base).hide, false);
  eq(verdictFrom(answers({ click: 0.7 }), { ...base, strictness: 'strict' }).hide, true);
});

await test('custom rules become questions and reasons', () => {
  const rules = ['Crypto shilling'];
  const id = customRuleId('Crypto shilling');
  const q = buildQuestions(rules);
  eq(q[id].type, 'noul');
  eq(q[id].instructions.rule, 'Crypto shilling');
  const v = verdictFrom(answers({ extra: { [id]: { type: 'noul', noul: 0.9 } } }), { ...base, customRules: rules });
  eq(v.reasons.map((r) => r.label), ['Crypto shilling']);
});

await test('custom rule answers survive removing another rule', () => {
  const keep = customRuleId('Politics');
  const v = verdictFrom(answers({ extra: { [keep]: { type: 'noul', noul: 0.9 } } }), { ...base, customRules: ['Politics'] });
  eq(v.hide, true, 'rule keyed by text, not position');
  if (customRuleId('a') === customRuleId('b')) throw new Error('rule ids collide');
});

await test('hate speech and hostility are on by default; other new filters are off', () => {
  eq(verdictFrom(answers({ hate: 0.95 }), base).reasons[0]?.id, 'hate_speech');
  eq(verdictFrom(answers({ hostile: 0.9 }), base).reasons[0]?.id, 'hostile');
  eq(verdictFrom(answers({ politics: 0.99 }), base).hide, false);
  eq(verdictFrom(answers({ politics: 0.99 }), { ...base, categories: { politics: true } }).hide, true);
  eq(verdictFrom(answers({ hate: 0.99 }), { ...base, categories: { hate_speech: false } }).hide, false);
});

await test('fancy fonts with emojis are flagged in code at every strictness', () => {
  const obvious = { text: "🚀 𝗕𝗜𝗚 𝗡𝗘𝗪𝗦 🚀\n\nI'm 𝘁𝗵𝗿𝗶𝗹𝗹𝗲𝗱 to share that I've joined Acme ✅" };
  if (fancyFontScore(obvious) < 0.9) throw new Error(`score ${fancyFontScore(obvious)}`);
  for (const strictness of ['relaxed', 'balanced', 'strict']) {
    eq(verdictFrom({}, { ...base, strictness }, 'linkedin', localSignals(obvious)).reasons[0]?.id, 'fancy_fonts', strictness);
  }
  eq(verdictFrom({}, { ...base, categories: { fancy_fonts: false } }, 'linkedin', localSignals(obvious)).hide, false, 'can be turned off');
  eq(fancyFontScore({ text: '𝐖𝐞\'𝐫𝐞 𝐡𝐢𝐫𝐢𝐧𝐠! 🎉' }) >= 0.9, true, 'one bold phrase + an emoji');
});

await test('fancy fonts without emojis are left to the LinkedInfluencer question', () => {
  const believable = { text: "𝐢 𝐣𝐮𝐬𝐭 𝐬𝐩𝐞𝐧𝐭 2 𝐰𝐞𝐞𝐤𝐬 𝐨𝐧 𝐚 𝐫𝐞𝐚𝐥𝐢𝐭𝐲 𝐬𝐡𝐨𝐰.\nthere's a lot to unpack.\n\n𝒔𝒐𝒎𝒆𝒉𝒐𝒘, 𝒕𝒉𝒆 𝒑𝒆𝒐𝒑𝒍𝒆 𝒄𝒐𝒎𝒑𝒆𝒕𝒊𝒏𝒈 𝒘𝒆𝒓𝒆 𝒂𝒘𝒂𝒌𝒆 𝒖𝒏𝒕𝒊𝒍 4𝒂𝒎." };
  eq(fancyFonts(believable.text).styles, 2, 'bold + bold italic');
  eq(verdictFrom({}, { ...base, strictness: 'strict' }, 'linkedin', localSignals(believable)).hide, false);
  eq(verdictFrom(answers({ brand: 0.9 }), base, 'linkedin', localSignals(believable)).reasons[0]?.id, 'linkedinfluencer');
  const s = buildState({ platform: 'linkedin', text: believable.text });
  eq(s.post.text.startsWith("i just spent 2 weeks on a reality show.\nthere's a lot to unpack."), true, 'Jev reads plain letters');
  eq(typeof s.post.formatting, 'string', 'and is told about the fancy fonts');
});

await test('stray maths symbols and © ™ are not fancy-font slop', () => {
  eq(fancyFontScore({ text: 'Let 𝑓(𝑥) = 𝑥² + 1 and solve for ℝ 😅' }), 0);
  eq(fancyFonts('Acme© and Widget™ are back').emojis, 0);
  eq(fancyFontScore({ text: 'Plain post with emojis 🚀🚀🚀' }), 0);
  eq(buildState({ platform: 'x', text: 'plain text here' }).post.formatting, undefined);
});

await test('muted words match fancy-font text', () => {
  eq(findMutedWord({ text: '𝐁𝐢𝐭𝐜𝐨𝐢𝐧 is back' }, ['bitcoin']), 'bitcoin');
  eq(findMutedWord({ text: 'ꜱᴍᴀʟʟ ᴄᴀᴘꜱ crypto' }, ['crypto']), 'crypto');
});

await test('LinkedInfluencer is on by default', () => {
  eq(Object.keys(questionsFor(base)).includes('personal_branding'), true);
  eq(verdictFrom(answers({ brand: 0.85 }), base).reasons[0]?.id, 'linkedinfluencer');
  eq(verdictFrom(answers({ brand: 0.85 }), { ...base, categories: { linkedinfluencer: false } }).hide, false);
});

await test('only enabled categories are asked', () => {
  const ids = Object.keys(questionsFor(base));
  for (const id of ['withholds_payoff', 'engagement_farming', 'ai_style', 'hate_speech', 'hostility']) {
    if (!ids.includes(id)) throw new Error(`missing ${id}`);
  }
  for (const id of ['rage_bait', 'profanity', 'politics', 'self_promotion']) {
    if (ids.includes(id)) throw new Error(`asked disabled ${id}`);
  }
  eq(Object.keys(questionsFor({ ...base, categories: { politics: true } })).includes('politics'), true);
  const none = Object.fromEntries(CATEGORIES.map((c) => [c.id, false]));
  eq(Object.keys(questionsFor({ ...base, categories: none })), []);
  eq(Object.keys(questionsFor({ ...base, categories: none, customRules: ['x'] })), [customRuleId('x')]);
});

await test('every category question exists and every question works in any language', () => {
  for (const c of CATEGORIES) for (const q of c.questions) if (!QUESTIONS[q]) throw new Error(`${c.id} → ${q}`);
  for (const [id, q] of Object.entries(buildQuestions(['x']))) {
    if (!/any language/.test(q.instructions.language || '')) throw new Error(`${id} has no language note`);
  }
});

await test('cached answers are reused per question', () => {
  const questions = questionsFor(base);
  eq(Object.keys(missingQuestions(undefined, questions)).length, Object.keys(questions).length, 'nothing cached');
  const entry = mergeAnswers(undefined, questions, { ai_style: { type: 'score', score: 1 }, hate_speech: { type: 'noul', noul: 0.1 } });
  const missing = Object.keys(missingQuestions(entry, questions));
  eq(missing.includes('ai_style') || missing.includes('hate_speech'), false, 'answered questions are not re-asked');
  eq(missing.includes('withholds_payoff'), true, 'unanswered questions are asked');
  const reworded = { ...questions, ai_style: { ...questions.ai_style, instructions: { question: 'changed' } } };
  eq(Object.keys(missingQuestions(entry, reworded)).includes('ai_style'), true, 'reworded questions are re-asked');
  eq(Object.keys(missingQuestions(entry, { politics: QUESTIONS.politics })), ['politics'], 'newly enabled category');
});

await test('state includes only relevant fields', () => {
  const s = buildState({
    platform: 'x',
    key: 't1',
    author: { name: 'A', handle: '@a' },
    text: ' hi there friend ',
    quoted: { author: '@b', text: 'quoted' },
    media: 'image',
    promoted: true,
    url: 'https://x.com/a/status/1',
  });
  eq(s, {
    platform: 'X (Twitter)',
    post: { author: { name: 'A', handle: '@a' }, text: 'hi there friend', quoted_post: { author: '@b', text: 'quoted' }, media: 'image' },
  });
});

await test('very short posts skip the model', () => {
  eq(hasEnoughText({ text: 'lol' }), false);
  eq(hasEnoughText({ text: '👇👇👇' }), false);
  eq(hasEnoughText({ text: 'Wait for it…' }), true);
});

await test('word counts work in languages without spaces', () => {
  eq(hasEnoughText({ text: 'プロンプトはリプ欄に置いておきます👇' }), true);
  eq(hasEnoughText({ text: '这个提示词在评论区' }), true);
  eq(hasEnoughText({ text: 'ฉันชอบกินข้าวมาก' }), true);
  eq(hasEnoughText({ text: 'Это меняет всё.' }), true);
  if (wordCount('지금 바로 확인하세요') < 3) throw new Error('Korean');
});

await test('short reactions to a quoted post are still checked', () => {
  eq(hasEnoughText({ text: 'lmao', quoted: { text: 'something awful the quoted account said' } }), true);
});

await test('muted words in any language', () => {
  const m = (text, words) => findMutedWord({ text }, words) || null;
  eq(m('my category theory notes', ['cat']), null, 'whole words only');
  eq(m('Bitcoin to the moon', ['bitcoin']), 'bitcoin');
  eq(m('Feliz año nuevo', ['ano']), null, 'accents matter');
  eq(m('Feliz Año nuevo', ['año']), 'año');
  eq(m('我喜欢加密货币投资', ['加密货币']), '加密货币', 'Chinese has no spaces');
  eq(m('今日は仮想通貨の話', ['仮想通貨']), '仮想通貨');
  eq(m('비트코인은 오늘 올랐다', ['비트코인']), '비트코인', 'Korean particles');
  eq(m('ราคาบิทคอยน์วันนี้', ['บิทคอยน์']), 'บิทคอยน์', 'Thai has no spaces');
  eq(m('कनाडा की टीम', ['कनाडा']), 'कनाडा');
  eq(m('कनाडाई टीम जीती', ['कनाडा']), 'कनाडा', 'Devanagari forms (Canadian)');
  eq(m('Buy ＢＴＣ now', ['btc']), 'btc', 'full-width letters');
  eq(m('عملة البيتكوين اليوم', ['البيتكوين']), 'البيتكوين');
  eq(findMutedWord({ text: 'lol', quoted: { text: 'crypto giveaway' } }, ['crypto']), 'crypto', 'quoted posts too');
});

await test('muted words catch word forms', () => {
  const m = (text, words) => findMutedWord({ text }, words) || null;
  eq(m('Canadians abroad', ['canadian']), 'canadian', 'plural');
  eq(m('CANADIANS abroad', ['Canadian']), 'Canadian', 'any case');
  eq(m('#CanadaVsMexico tonight', ['canada']), null, 'too far from the word');
  eq(m('Cryptocurrency is back', ['crypto']), null, 'more than 3 extra letters');
  eq(m('Cryptocurrency is back', ['crypto*']), 'crypto*', 'wildcard');
  eq(m('Aim higher', ['ai']), null, 'short words are whole words only');
  eq(m('Bitcoiners are loud', ['"bitcoin"']), null, 'quoted means exact');
  eq(m('Bitcoin is loud', ['"bitcoin"']), '"bitcoin"');
  eq(m('Elecciones en México', ['elección']), null, 'different letters stay different');
  eq(m('Los indios', ['indio']), 'indio', 'Spanish plural');
});

await test('focus mode hides off-topic posts on the chosen platforms', () => {
  const focus = { enabled: true, interests: ['AI and LLMs', 'Startups'], strength: 'balanced', onX: true, onLinkedIn: false };
  const s = { ...base, focus };
  eq(Object.keys(questionsFor(s, 'x')).includes('focus'), true);
  eq(Object.keys(questionsFor(s, 'linkedin')).includes('focus'), false, 'off on LinkedIn');
  eq(focusActive({ ...s, focus: { ...focus, interests: [] } }, 'x'), false, 'needs interests');
  eq(focusActive({ ...s, focus: { ...focus, enabled: false } }, 'x'), false);
  const onTopic = answers({ extra: { focus: { type: 'noul', noul: 0.9 } } });
  const offTopic = answers({ extra: { focus: { type: 'noul', noul: 0.1 } } });
  eq(verdictFrom(onTopic, s, 'x').hide, false);
  eq(verdictFrom(offTopic, s, 'x').reasons[0]?.id, 'off_topic');
  eq(verdictFrom(offTopic, s, 'linkedin').hide, false);
  const borderline = answers({ extra: { focus: { type: 'noul', noul: 0.3 } } });
  eq(verdictFrom(borderline, s, 'x').hide, false, 'balanced keeps 70% off-topic');
  eq(verdictFrom(borderline, { ...s, focus: { ...focus, strength: 'strong' } }, 'x').hide, true, 'strong hides it');
  if (questionsFor(s, 'x').focus.instructions.interests.join() !== 'AI and LLMs,Startups') throw new Error('interests');
  if (!/any language/.test(focusQuestion(['x']).instructions.language)) throw new Error('focus language note');
});

await test('changing interests re-asks only the focus question', () => {
  const s = { ...base, focus: { enabled: true, interests: ['AI'], strength: 'balanced' } };
  const qs = questionsFor(s, 'x');
  const all = Object.fromEntries(Object.keys(qs).map((id) => [id, { type: 'noul', noul: 0 }]));
  const entry = mergeAnswers(undefined, qs, all);
  eq(Object.keys(missingQuestions(entry, qs)), []);
  const changed = questionsFor({ ...s, focus: { ...s.focus, interests: ['AI', 'Robotics'] } }, 'x');
  eq(Object.keys(missingQuestions(entry, changed)), ['focus']);
});

await test('limiter caps concurrency', async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      }),
    ),
  );
  eq(peak, 2);
});

// ── Learning from you ───────────────────────────────────────────────────────
const learnBase = { ...base, learning: { enabled: true, autoRules: true } };
let fbSeq = 0;
const hid = (reason, { s = {}, q = {}, text = `hidden post ${++fbSeq}`, by = 'auto', author } = {}) => ({
  id: `x:h${++fbSeq}`, platform: 'x', key: `h${fbSeq}`, action: 'hide', at: fbSeq,
  post: { text, author: author || { handle: `@a${fbSeq}` } }, q, s, reason, by,
});
const kept = (fired, { s = {}, q = {}, text = `kept post ${++fbSeq}`, author } = {}) => ({
  id: `x:k${++fbSeq}`, platform: 'x', key: `k${fbSeq}`, action: 'show', at: fbSeq,
  post: { text, author: author || { handle: `@b${fbSeq}` } }, q, s, fired,
});
const cat = (id) => ({ kind: 'category', id, label: CATEGORIES.find((c) => c.id === id)?.label || id });
const sportsRule = () => ({ ...topicReason('sports') });

await test('a threshold moves just past a post you corrected, within bounds', () => {
  eq(fitThreshold(0.8, [{ v: 0.85, hide: false }]), 0.86, 'unhid at 85%');
  eq(fitThreshold(0.8, [{ v: 0.7, hide: true }]), 0.7, 'hid yourself at 70%');
  eq(fitThreshold(0.8, [{ v: 0.99, hide: false }]), 0.8, 'out of reach: left to examples');
  eq(fitThreshold(0.8, [{ v: 0.5, hide: true }]), 0.8, 'more than maxShift away');
  eq(fitThreshold(0.8, []), 0.8);
  eq(fitThreshold(0.8, [{ v: 0.84, hide: false }, { v: 0.86, hide: true }]), 0.85, 'splits your hides and keeps');
  eq(fitThreshold(0.8, [{ v: 0.85, hide: false }, { v: 0.85, hide: true }]), 0.8, 'conflicting feedback stays put');
});

await test('feedback tunes the filters involved', () => {
  const store = {
    feedback: [
      kept([{ id: 'engagement_bait', label: 'Engagement bait', value: 0.85 }], { s: { engagement_bait: 0.85, clickbait: 0.2 }, q: { withholds_payoff: 0.85, engagement_farming: 0.1 } }),
      hid(cat('clickbait'), { s: { clickbait: 0.7 }, q: { clickbait_hook: 0.7 } }),
    ],
  };
  const m = learnFrom(store, learnBase);
  eq(m.thresholds, { engagement_bait: 0.86, clickbait: 0.7 });
  eq(m.corrections.engagement_bait, { hidden: 0, kept: 1 });
  eq(verdictFrom(answers({ bait: 0.85 }), learnBase, 'x', {}, m).hide, false, 'learned threshold applies');
  eq(verdictFrom(answers({ bait: 0.87 }), learnBase, 'x', {}, m).hide, true);
  eq(verdictFrom(answers({ click: 0.72 }), learnBase, 'x', {}, m).reasons[0]?.id, 'clickbait');
  const strict = learnFrom(store, { ...learnBase, strictness: 'strict' }).thresholds;
  eq([strict.engagement_bait, strict.clickbait], [undefined, undefined], 'refitted around Strict (65%): 85% is out of reach, 70% already hidden');
});

await test('your posts become examples in the questions that judged them', () => {
  const store = {
    feedback: [
      kept([{ id: 'engagement_bait', label: 'Engagement bait', value: 0.9 }], { text: 'KEPT', q: { withholds_payoff: 0.9, engagement_farming: 0.2 } }),
      hid(cat('engagement_bait'), { text: 'HID', q: { withholds_payoff: 0.3, engagement_farming: 0.6 } }),
      ...Array.from({ length: 5 }, (_, i) => hid(cat('clickbait'), { text: `CLICK ${i}` })),
    ],
  };
  const m = learnFrom(store, learnBase);
  eq(m.examples.withholds_payoff, { hide: [], keep: ['KEPT'] }, 'only the question that fired');
  eq(m.examples.engagement_farming, { hide: ['HID'], keep: [] }, 'the strongest question');
  eq(m.examples.clickbait_hook.hide, ['CLICK 0', 'CLICK 1', 'CLICK 2'], `newest ${LEARNING.examplesPerSide} only`);
  const q = questionsFor(learnBase, 'x', m);
  eq(q.withholds_payoff.criteria.false.examples.at(-1), 'KEPT');
  eq(q.engagement_farming.criteria.true.examples.at(-1), 'HID');
  if (!/this user/.test(q.withholds_payoff.instructions.user_examples)) throw new Error('no note about user examples');
  eq(q.ai_style, QUESTIONS.ai_style, 'questions without feedback are untouched');
});

await test('examples work for every kind of question', () => {
  const ex = { hide: ['H'], keep: ['K'] };
  const prof = withExamples(QUESTIONS.profanity, ex);
  eq([prof.criteria.true.what, prof.criteria.true.examples, prof.criteria.false.examples], [QUESTIONS.profanity.criteria.true, ['H'], ['K']], 'string criteria');
  const ai = withExamples(QUESTIONS.ai_style, ex);
  eq(ai.criteria.map((c) => c.examples || null), [null, ['K'], ['H'], null], 'score levels');
  const focus = withExamples(focusQuestion(['AI']), ex, { invert: true });
  eq([focus.criteria.true.examples, focus.criteria.false.examples], [['K'], ['H']], 'focus: kept posts are on-topic');
  if (withExamples(QUESTIONS.politics, { hide: [], keep: [] }) !== QUESTIONS.politics) throw new Error('no examples, same question');
});

await test('new examples re-ask only the question they change', () => {
  const qs = questionsFor(learnBase, 'x');
  const entry = mergeAnswers(undefined, qs, Object.fromEntries(Object.keys(qs).map((id) => [id, { type: 'noul', noul: 0 }])));
  const m = learnFrom({ feedback: [hid(cat('clickbait'), { q: { clickbait_hook: 0.7 } })] }, learnBase);
  eq(Object.keys(missingQuestions(entry, questionsFor(learnBase, 'x', m))), ['clickbait_hook']);
});

await test('topics you keep hiding become filters', () => {
  const one = learnFrom({ feedback: [hid(sportsRule())] }, learnBase);
  eq([one.rules[0].label, one.rules[0].status], ['Sports', 'learning'], 'one hide: learning');
  eq(Object.keys(questionsFor(learnBase, 'x', one)).includes(one.rules[0].id), false, 'not asked yet');
  const two = learnFrom({ feedback: [hid(sportsRule()), hid(sportsRule())] }, learnBase);
  eq(two.rules[0].status, 'active', 'two hides: on');
  const id = two.rules[0].id;
  eq(questionsFor(learnBase, 'x', two)[id].instructions.rule, topicReason('sports').text);
  eq(verdictFrom({ [id]: { type: 'noul', noul: 0.9 } }, learnBase, 'x', {}, two).reasons.map((r) => r.label), ['Sports']);
  eq(learnFrom({ feedback: [hid(sportsRule(), { by: 'user' })] }, learnBase).rules[0].status, 'active', 'you picked it: on at once');
  eq(learnFrom({ feedback: [hid(sportsRule()), hid(sportsRule())] }, { ...learnBase, learning: { autoRules: false } }).rules[0].status, 'suggested');
  eq(learnFrom({ feedback: [hid(sportsRule())], rules: { [id]: { on: true } } }, learnBase).rules[0].status, 'active', 'you turned it on');
  eq(learnFrom({ feedback: [hid(sportsRule()), hid(sportsRule())], rules: { [id]: { off: true } } }, learnBase).rules[0].status, 'off');
  eq(learnFrom({ feedback: [hid(sportsRule())], rules: { [id]: { deleted: true } } }, learnBase).rules, [], 'deleted');
});

await test('a learned filter pauses when you keep unhiding what it hides', () => {
  const id = learnedRuleId(topicReason('sports').text);
  const fired = [{ id, label: 'Sports', value: 0.9 }];
  const store = { feedback: [kept(fired), kept(fired), hid(sportsRule()), hid(sportsRule())] };
  eq(learnFrom(store, learnBase, { [id]: 3 }).rules[0].status, 'active', 'too few hits to judge');
  eq(learnFrom(store, learnBase, { [id]: 4 }).rules[0].status, 'paused', 'you unhid half of what it hid');
  eq(learnFrom(store, learnBase, { [id]: 10 }).rules[0].status, 'active', 'mostly right');
});

await test('learning off ignores your feedback', () => {
  const m = learnFrom({ feedback: [hid(cat('clickbait'), { s: { clickbait: 0.7 } }), hid(sportsRule(), { by: 'user' })], authors: { 'x:@a': { label: '@a' } } }, { ...learnBase, learning: { enabled: false } });
  eq([m.thresholds, m.rules, m.authors, m.examples], [{}, [], {}, {}]);
});

await test('why you hid a post', () => {
  const all = Object.fromEntries(Object.keys(QUESTIONS).map((id) => [id, { type: 'noul', noul: 0.05 }]));
  all.ai_style = { type: 'score', score: 0, legend: { 0: 'a', 1: 'b', 2: 'c', 3: 'd' } };
  const post = { platform: 'x', author: { handle: '@hal' } };
  const sports = { id: 'sports', p: 0.9 };
  const pick = (over, topic) => attribute({ signals: explain({ ...all, ...over }, {}, learnBase, 'x'), topic, post }, {}, learnBase);

  eq(pick({ clickbait_hook: { type: 'noul', noul: 0.7 } }, sports).reason.id, 'clickbait', 'a clear filter beats the topic');
  eq(pick({ clickbait_hook: { type: 'noul', noul: 0.55 } }, sports).reason.label, 'Sports', 'the topic beats a weak filter');
  eq(pick({ clickbait_hook: { type: 'noul', noul: 0.55 } }).reason.id, 'clickbait', 'a weak filter beats nothing');
  const none = pick({});
  eq(none.reason.kind, 'post', 'nothing explains it');
  eq(none.options.map((o) => o.kind), ['author', 'post'], 'still offers the author and just this post');
  const politics = pick({ politics: { type: 'noul', noul: 0.95 } });
  eq([politics.reason.id, politics.options[0].off], ['politics', true], 'a filter you have off');
  eq(describeReason(politics.reason, undefined, learnBase).startsWith('Looks like Politics'), true);
  eq(pick({}, { id: 'politics', p: 0.9 }).reason.id, 'politics', 'a topic with a category uses the category');
  const deleted = { rules: { [learnedRuleId(topicReason('sports').text)]: { deleted: true } } };
  eq(attribute({ signals: [], topic: sports, post }, deleted, learnBase).reason.kind, 'post', "a filter you deleted isn't learned again");
  const all2 = analysisQuestions(learnBase, 'x');
  eq(['politics', 'rage_bait', 'topic'].every((id) => all2[id]), true, 'analysis asks categories you have off and the topic');
});

await test('suggestions from your feedback', () => {
  const sam = { handle: '@sam' };
  const pat = { handle: '@pat' };
  const m = learnFrom(
    {
      feedback: [
        hid(cat('politics')),
        hid(cat('clickbait'), { author: sam }),
        hid({ kind: 'post', id: 'post' }, { author: sam }),
        kept([], { author: pat }),
        kept([], { author: pat }),
      ],
    },
    learnBase,
  );
  eq(m.suggestions.map((s) => `${s.type}:${s.id || s.label}:${s.n}`), ['enable:politics:1', 'block:@sam:2', 'allow:@pat:2']);
  eq(learnFrom({ feedback: [kept([], { author: pat }), kept([], { author: pat })] }, { ...learnBase, allowlist: ['pat'] }).suggestions, [], 'already allowed');
});

await test('shared feedback is anonymized', () => {
  eq(scrub('ask @bob at bob@example.com or +1 (555) 123-4567, see https://x.co/a and example.com/page'), 'ask @someone at <email> or <number>, see <link> and <link>');
  const custom = customRuleId('My secret rule');
  const store = {
    feedback: [
      hid(sportsRule(), { text: 'Derby day @rival https://t.co/x', author: { name: 'Sam Lee', handle: '@samlee' } }),
      hid({ kind: 'rule', id: custom, label: 'My secret rule', custom: true }, { s: { [custom]: 0.9, clickbait: 0.2 }, q: { [custom]: 0.9, clickbait_hook: 0.2 } }),
      kept([{ id: 'engagement_bait', label: 'Engagement bait', value: 0.85 }, { id: custom, label: 'My secret rule', value: 0.9 }], { s: { engagement_bait: 0.85 } }),
      hid({ kind: 'pending', id: 'pending', label: '…' }),
    ],
  };
  const settings = { ...learnBase, customRules: ['My secret rule'] };
  const bundle = exportBundle(store, settings, { model: learnFrom(store, settings), version: '9.9', now: 0 });
  const json = JSON.stringify(bundle);
  for (const secret of ['samlee', 'Sam Lee', 'rival', 't.co', 'My secret rule', custom]) if (json.includes(secret)) throw new Error(`leaked ${secret}`);
  eq(bundle.feedback.length, 3, 'unfinished analyses are left out');
  eq(bundle.feedback[0].reason, { kind: 'rule', topic: 'sports', by: 'auto' });
  eq(bundle.feedback[1].values, { clickbait_hook: 0.2 }, 'only shared questions');
  eq(bundle.feedback[2].fired, ['engagement_bait', 'custom']);
  eq(summarize(store, learnFrom(store, settings), settings).hidden, 3);
});

const out = document.getElementById('out');
const failed = results.filter((r) => !r.ok);
out.innerHTML =
  `<b class="${failed.length ? 'fail' : 'pass'}">${results.length - failed.length}/${results.length} passed</b>\n\n` +
  results.map((r) => (r.ok ? `<span class="pass">✓ ${r.name}</span>` : `<span class="fail">✗ ${r.name}: ${r.err}</span>`)).join('\n');
window.unitResults = { passed: results.length - failed.length, total: results.length, failed };
