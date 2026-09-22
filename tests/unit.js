// Offline tests for the pure logic in src/lib (no API calls).
import { matchPlace, isBlockedPlace, COUNTRIES, REGIONS } from '../src/lib/countries.js';
import { verdictFrom, buildQuestions, questionsHash, buildState, hasEnoughText } from '../src/lib/classify.js';
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
  eq(code('India'), 'IN');
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
  eq(code('Bengaluru, Karnataka, India'), 'IN');
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
  const india = matchPlace('India');
  const southAsia = matchPlace('South Asia');
  const germany = matchPlace('Germany');
  eq(isBlockedPlace(india, ['IN'], false), true);
  eq(isBlockedPlace(germany, ['IN'], false), false);
  eq(isBlockedPlace(southAsia, ['IN'], false), false, 'region-only accounts kept by default');
  eq(isBlockedPlace(southAsia, ['IN'], true), true, 'region-only accounts hidden when opted in');
  eq(isBlockedPlace(germany, ['region:europe'], false), true, 'blocked region covers its countries');
  eq(isBlockedPlace(matchPlace('Europe'), ['region:europe'], false), true);
  eq(isBlockedPlace(matchPlace('Egypt'), ['region:middle-east'], false), true);
  eq(isBlockedPlace(null, ['IN'], true), false);
  eq(isBlockedPlace(india, [], true), false);
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
  const q = buildQuestions(rules);
  eq(q.custom_0.type, 'noul');
  eq(q.custom_0.instructions.rule, 'Crypto shilling');
  const v = verdictFrom(answers({ extra: { custom_0: { type: 'noul', noul: 0.9 } } }), { ...base, customRules: rules });
  eq(v.reasons.map((r) => r.label), ['Crypto shilling']);
});

await test('question hash changes with custom rules', () => {
  if (questionsHash([]) === questionsHash(['x'])) throw new Error('hash unchanged');
  eq(questionsHash(['a']), questionsHash(['a']));
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
  eq(hasEnoughText({ text: 'Wait for it…' }), true);
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

const out = document.getElementById('out');
const failed = results.filter((r) => !r.ok);
out.innerHTML =
  `<b class="${failed.length ? 'fail' : 'pass'}">${results.length - failed.length}/${results.length} passed</b>\n\n` +
  results.map((r) => (r.ok ? `<span class="pass">✓ ${r.name}</span>` : `<span class="fail">✗ ${r.name}: ${r.err}</span>`)).join('\n');
window.unitResults = { passed: results.length - failed.length, total: results.length, failed };
