// Turns feedback people shared (Settings → Learning from you → Export, posted
// with the "Share your feedback" issue template) into improvements for
// everyone: suggested thresholds per category and strictness, candidate
// examples for the questions, learned filters popular enough to become
// categories, and regression cases for the harness.
//
//   node scripts/learn-from-feedback.mjs feedback/*.json
//   node scripts/learn-from-feedback.mjs feedback/*.json --out report.md --fixtures
//
// It only writes the report and, with --fixtures, tests/contributed.js. Read
// the report, then change src/lib/questions.js by hand: one person's taste
// isn't everyone's, so nothing reaches the base app without review.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CATEGORIES, THRESHOLDS, TOPICS } from '../src/lib/questions.js';
import { fitThreshold } from '../src/lib/learn.js';
import { fnv1a } from '../src/lib/classify.js';

// Moving a base threshold needs agreement: each person counts for at most
// PER_PERSON posts per category, moving by 0.05 costs one post, and nothing
// is suggested until MIN_PEOPLE people corrected that category.
const PER_PERSON = 5;
const GLOBAL_PRIOR = 20;
const GLOBAL_MAX_SHIFT = 0.1;
const MIN_PEOPLE = 3;
const CONTRIBUTED = new URL('../tests/contributed.js', import.meta.url);

const args = process.argv.slice(2);
const outPath = valueOf('--out');
const writeFixtures = args.includes('--fixtures');
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!files.length) {
  console.error('Usage: node scripts/learn-from-feedback.mjs <feedback.json>... [--out report.md] [--fixtures]');
  process.exit(2);
}

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

// Accepts the exported file, or an issue body with the JSON pasted into it.
function load(file) {
  const raw = readFileSync(file, 'utf8');
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const bundle = JSON.parse(json);
  if (bundle.format !== 'deslop-feedback' || bundle.schema !== 1) throw new Error(`${file}: not a Deslop feedback export (schema 1)`);
  return bundle;
}

const bundles = [];
for (const file of files) {
  try {
    bundles.push({ file, ...load(file) });
  } catch (err) {
    console.warn(`Skipping ${file}: ${err.message}`);
  }
}
if (!bundles.length) process.exit(1);

const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));
const pct = (v) => `${Math.round(v * 100)}%`;
const quote = (t, n = 160) => `“${(t.length > n ? `${t.slice(0, n)}…` : t).replace(/\s+/g, ' ')}”`;

// ── Thresholds ──────────────────────────────────────────────────────────────

function thresholdTable() {
  const rows = [];
  for (const strictness of Object.keys(THRESHOLDS)) {
    const people = bundles.filter((b) => b.strictness === strictness);
    if (!people.length) continue;
    for (const cat of CATEGORIES) {
      const points = [];
      let contributors = 0;
      let unhid = 0;
      let missed = 0;
      for (const b of people) {
        const mine = [];
        for (const f of b.feedback) {
          const v = f.signals?.[cat.id];
          if (typeof v !== 'number') continue;
          if (f.label === 'hide' && f.reason?.kind === 'category' && f.reason.id === cat.id) {
            mine.push({ v, hide: true });
            missed++;
          } else if (f.label === 'keep') {
            mine.push({ v, hide: false });
            if (f.fired?.includes(cat.id)) unhid++;
          }
        }
        if (!mine.some((p) => p.hide || p.v >= 0.5)) continue; // nothing this person corrected here
        contributors++;
        const w = Math.min(1, PER_PERSON / mine.length);
        points.push(...mine.map((p) => ({ ...p, w })));
      }
      if (!contributors) continue;
      const base = THRESHOLDS[strictness][cat.id] ?? THRESHOLDS[strictness].default;
      const fitted = fitThreshold(base, points, { prior: GLOBAL_PRIOR, maxShift: GLOBAL_MAX_SHIFT });
      const hits = people.reduce((n, b) => n + (b.hits?.[cat.id] || 0), 0);
      rows.push({ strictness, cat, base, fitted, contributors, unhid, missed, hits });
    }
  }
  return rows;
}

// ── Examples ────────────────────────────────────────────────────────────────

function examples() {
  const out = new Map();
  for (const b of bundles) {
    for (const f of b.feedback) {
      const ids = f.label === 'hide' ? (f.reason?.kind === 'category' ? [f.reason.id] : []) : (f.fired || []).filter((id) => CATEGORY.has(id));
      for (const id of ids) {
        if (!CATEGORY.has(id)) continue;
        const e = out.get(id) || out.set(id, { missed: [], wrong: [] }).get(id);
        (f.label === 'hide' ? e.missed : e.wrong).push({ text: f.text, value: f.signals?.[id], values: f.values });
      }
    }
  }
  return out;
}

// ── Learned filters and categories people turn on ──────────────────────────

function learnedFilters() {
  const topics = new Map();
  const texts = new Map();
  for (const b of bundles) {
    const seenTopics = new Set();
    const seenTexts = new Set();
    for (const r of b.rules || []) {
      if (r.topic) seenTopics.add(r.topic);
      else if (r.text) seenTexts.add(r.text.trim().toLowerCase());
    }
    for (const t of seenTopics) topics.set(t, (topics.get(t) || 0) + 1);
    for (const t of seenTexts) texts.set(t, (texts.get(t) || 0) + 1);
  }
  return { topics: [...topics].sort((a, b) => b[1] - a[1]), texts: [...texts].sort((a, b) => b[1] - a[1]) };
}

function offCategories() {
  const counts = new Map();
  for (const b of bundles) {
    const on = new Set(b.categories || []);
    const wanted = new Set(b.feedback.filter((f) => f.reason?.kind === 'category' && CATEGORY.has(f.reason.id) && !on.has(f.reason.id)).map((f) => f.reason.id));
    for (const id of wanted) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

async function updateFixtures() {
  const existing = existsSync(CONTRIBUTED) ? (await import(CONTRIBUTED.href)).CONTRIBUTED : [];
  const seen = new Set(existing.map((c) => fnv1a(c.post.text)));
  const added = [];
  for (const b of bundles) {
    for (const f of b.feedback) {
      let expect = null;
      if (f.label === 'hide' && f.reason?.kind === 'category' && CATEGORY.has(f.reason.id)) expect = f.reason.id;
      // A post someone unhid is a useful "keep" case only if a default filter hid it.
      if (f.label === 'keep' && f.fired?.some((id) => CATEGORY.get(id)?.defaultOn)) expect = 'keep';
      if (!expect || !f.text || seen.has(fnv1a(f.text))) continue;
      seen.add(fnv1a(f.text));
      const post = { platform: f.platform, text: f.text };
      if (f.quoted) post.quoted = { text: f.quoted };
      if (f.media) post.media = f.media;
      added.push({ expect, post });
    }
  }
  const all = [...existing, ...added];
  writeFileSync(
    CONTRIBUTED,
    `// Labelled posts from feedback people shared, added by
// scripts/learn-from-feedback.mjs --fixtures. Same format as fixtures.js. Each
// is one person's judgement, so review them before relying on them; run them
// with tests/harness.html?contributed.

export const CONTRIBUTED = ${JSON.stringify(all, null, 2)};
`,
  );
  return added.length;
}

// ── Report ──────────────────────────────────────────────────────────────────

const lines = [];
const total = bundles.reduce((n, b) => n + b.feedback.length, 0);
lines.push('# Deslop feedback report', '');
lines.push(`${bundles.length} export${bundles.length === 1 ? '' : 's'} · ${total} labelled posts · extension ${[...new Set(bundles.map((b) => b.extension || '?'))].join(', ')}`, '');

lines.push('## Thresholds', '');
lines.push(`Fitted to everyone's corrections, each person counting for at most ${PER_PERSON} posts per category. Only categories at least ${MIN_PEOPLE} people corrected get a suggestion.`, '');
lines.push('| Strictness | Category | People | Posts it hid | Unhidden | Missed | Now | Suggested |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of thresholdTable()) {
  const suggest = r.contributors < MIN_PEOPLE ? '—' : r.fitted === r.base ? 'keep' : `**${pct(r.fitted)}**`;
  lines.push(`| ${r.strictness} | ${r.cat.label} | ${r.contributors} | ${r.hits} | ${r.unhid} | ${r.missed} | ${pct(r.base)} | ${suggest} |`);
}
lines.push('', 'Apply suggestions in `THRESHOLDS` in `src/lib/questions.js`, then re-run the harness.', '');

lines.push('## Examples', '');
lines.push('Candidates for the `examples` in each question. *Hidden wrongly*: people unhid these. *Missed*: people hid these themselves. Repeats are shown once, with how many times they were sent.', '');
for (const [id, e] of examples()) {
  lines.push(`### ${CATEGORY.get(id).label} (\`${CATEGORY.get(id).questions.join('`, `') || 'code'}\`)`, '');
  for (const [label, list] of [['Hidden wrongly', e.wrong], ['Missed', e.missed]]) {
    if (!list.length) continue;
    lines.push(`${label}:`, '');
    const unique = new Map();
    for (const x of list) (unique.get(x.text) || unique.set(x.text, { ...x, n: 0 }).get(x.text)).n += 1;
    for (const x of [...unique.values()].sort((a, b) => b.n - a.n).slice(0, 8)) {
      lines.push(`- ${quote(x.text)}${typeof x.value === 'number' ? ` (${pct(x.value)})` : ''}${x.n > 1 ? ` ×${x.n}` : ''}`);
    }
    lines.push('');
  }
}

const { topics, texts } = learnedFilters();
lines.push('## Learned filters', '');
lines.push('Topics and rules people taught Deslop. Popular ones could become built-in categories in `CATEGORIES`.', '');
for (const [topic, n] of topics) lines.push(`- ${TOPICS.find((t) => t.id === topic)?.label || topic}: ${n} ${n === 1 ? 'person' : 'people'}`);
for (const [text, n] of texts.slice(0, 30)) lines.push(`- ${quote(text, 100)}: ${n} ${n === 1 ? 'person' : 'people'}`);
if (!topics.length && !texts.length) lines.push('None yet.');
lines.push('');

const off = offCategories();
lines.push('## Categories people turn on', '');
lines.push('People hid posts themselves that fit a category they had off. Many people here suggests turning it on by default (`defaultOn`).', '');
for (const [id, n] of off) lines.push(`- ${CATEGORY.get(id).label}: ${n} ${n === 1 ? 'person' : 'people'}`);
if (!off.length) lines.push('None yet.');
lines.push('');

if (writeFixtures) {
  const n = await updateFixtures();
  lines.push('## Fixtures', '', `Added ${n} labelled post${n === 1 ? '' : 's'} to \`tests/contributed.js\`. Run them with \`tests/harness.html?contributed\`.`, '');
}

const report = lines.join('\n');
if (outPath) {
  writeFileSync(outPath, report);
  console.log(`Wrote ${outPath}`);
} else {
  console.log(report);
}
