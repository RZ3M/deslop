// Learning from the posts you hide and unhide yourself. Pure functions over the
// feedback log (no chrome.* APIs), shared by background.js, the tests and
// scripts/learn-from-feedback.mjs.
//
// background.js keeps the log (see feedback.js); learnFrom() turns it into a
// model that classify.js applies to every post:
//  - thresholds: a filter you correct gets its own threshold, fitted to the
//    posts you hid and kept (fitThreshold), within LEARNING.maxShift of your
//    strictness;
//  - examples: your newest hidden and kept posts become examples in the
//    questions Jev is asked (withExamples in questions.js);
//  - rules: posts you hide that no filter explains become new filters, by
//    topic or in your own words, and pause themselves if you keep unhiding
//    what they hide;
//  - authors: accounts you chose to hide everything from.
// Nothing is learned incrementally, so forgetting feedback undoes what it taught.
//
// A feedback entry (newest first in store.feedback):
//   { id: 'x:t123', platform, key, action: 'hide' | 'show', at,
//     post: { text, quoted, author, url, media },   // kept in this browser only
//     q: { questionId: 0..1 },   // Jev's answers when you gave the feedback
//     s: { signalId: 0..1 },     // category, rule and focus values then
//     topic: { id, p },          // hides: what the post is about
//     fired: [{ id, label, value }],                  // shows: why Deslop had hidden it
//     reason: { kind, id, label, text?, topic?, custom?, who? }, // hides: why you hid it
//     by: 'auto' | 'user' }      // who picked the reason
// reason.kind is category | rule | author | post | pending.
// The rest of the store: rules { [ruleId]: { on, off, deleted, label } } for
// your edits to learned filters, and authors { [authorKey]: { label, from } }.

import { CATEGORIES, THRESHOLDS, FOCUS_STRENGTH, LEARNING, TOPICS, answerValue } from './questions.js';
import { customRuleId, learnedRuleId, authorKey, isCategoryEnabled, focusActive, exampleText } from './classify.js';

const MAX_POINTS = 60; // per filter: only your newest feedback counts
const CATEGORY = new Map(CATEGORIES.map((c) => [c.id, c]));
const isRuleId = (id) => id.startsWith('custom_') || id.startsWith('learned_');

export const PENDING = { kind: 'pending', id: 'pending', label: 'Learning why…' };
export const JUST_THIS_POST = { kind: 'post', id: 'post', label: 'Just this post' };

export function emptyModel() {
  return { thresholds: {}, examples: {}, rules: [], authors: {}, suggestions: [], corrections: {} };
}

// `hits` counts the posts each filter has hidden (stats.hits), so a learned
// filter can tell how often you disagree with it.
export function learnFrom(store = {}, settings = {}, hits = {}) {
  const model = emptyModel();
  if (settings.learning?.enabled === false) return model;
  const feedback = store.feedback || [];

  // Filters learned from your hides.
  const rules = new Map();
  for (const e of feedback) {
    const r = e.action === 'hide' && e.reason?.kind === 'rule' && !e.reason.custom ? e.reason : null;
    if (!r || store.rules?.[r.id]?.deleted) continue;
    if (!rules.has(r.id)) {
      const edit = store.rules?.[r.id] || {};
      rules.set(r.id, {
        id: r.id,
        label: edit.label || r.label,
        text: r.text,
        topic: r.topic || null,
        hides: 0,
        keeps: 0,
        hits: hits[r.id] || 0,
        byUser: false,
        on: Boolean(edit.on),
        off: Boolean(edit.off),
      });
    }
    const rule = rules.get(r.id);
    rule.hides += 1;
    if (e.by === 'user') rule.byUser = true;
  }

  // What each correction teaches.
  const points = {};
  const examples = {};
  const corrections = {};
  const count = (id, side) => ((corrections[id] ||= { hidden: 0, kept: 0 })[side] += 1);
  const point = (id, v, hide) => {
    const list = (points[id] ||= []);
    if (typeof v === 'number' && list.length < MAX_POINTS) list.push({ v, hide });
  };
  const example = (qid, side, post) => {
    const text = exampleText(post);
    const list = (examples[qid] ||= { hide: [], keep: [] })[side];
    if (text && list.length < LEARNING.examplesPerSide && !list.includes(text)) list.push(text);
  };

  for (const e of feedback) {
    if (e.action === 'hide') {
      const r = e.reason || {};
      if (r.kind !== 'category' && r.kind !== 'rule') continue;
      if (r.kind === 'rule' && !r.custom && !rules.has(r.id)) continue; // a filter you deleted
      count(r.id, 'hidden');
      point(r.id, e.s?.[r.id], true);
      const qid = strongestQuestion(r.id, e.q);
      if (qid) example(qid, 'hide', e.post);
    } else if (e.action === 'show') {
      // You want this post shown, so no filter should have hidden it.
      for (const [id, v] of Object.entries(e.s || {})) point(id, v, false);
      for (const f of e.fired || []) {
        if (!isLearnable(f.id)) continue;
        if (rules.has(f.id)) rules.get(f.id).keeps += 1;
        count(f.id, 'kept');
        for (const qid of firedQuestions(f.id, e.q)) example(qid, 'keep', e.post);
      }
    }
  }

  for (const rule of rules.values()) {
    rule.status = ruleStatus(rule, settings);
    rule.active = rule.status === 'active';
    model.rules.push(rule);
  }
  for (const [id, pts] of Object.entries(points)) {
    const base = baseThreshold(id, settings);
    if (base === undefined) continue;
    const t = fitThreshold(base, pts);
    if (t !== base) model.thresholds[id] = t;
  }
  for (const [key, a] of Object.entries(store.authors || {})) model.authors[key] = a.label || key;
  model.examples = examples;
  model.corrections = corrections;
  model.suggestions = suggest(feedback, settings, model);
  return model;
}

function ruleStatus(rule, settings) {
  if (rule.off) return 'off';
  if (rule.on) return 'active';
  if (!rule.byUser && rule.hides < LEARNING.ruleMinHides) return 'learning';
  if (!rule.byUser && settings.learning?.autoRules === false) return 'suggested';
  if (rule.hits >= LEARNING.pauseMinHits && rule.keeps / rule.hits >= LEARNING.pauseKeepRate) return 'paused';
  return 'active';
}

// The threshold that misjudges the fewest of your posts, where moving away
// from the strictness threshold costs LEARNING.prior per 1.0. So one unhidden
// post at 0.85 lifts a 0.80 threshold to 0.86, but a post at 0.99 can't drag
// it out of range: examples have to teach that one.
export function fitThreshold(base, points, { maxShift = LEARNING.maxShift, prior = LEARNING.prior } = {}) {
  if (!points?.length) return base;
  const cost = (t) => {
    let c = prior * Math.abs(t - base);
    for (const p of points) if (p.hide ? p.v < t : p.v >= t) c += p.w ?? 1;
    return c;
  };
  const lo = Math.round(Math.max(0.5, base - maxShift) * 100);
  const hi = Math.round(Math.min(0.99, base + maxShift) * 100);
  let best = base;
  let bestCost = cost(base);
  for (let i = lo; i <= hi; i++) {
    const t = i / 100;
    const c = cost(t);
    if (c < bestCost - 1e-9 || (Math.abs(c - bestCost) < 1e-9 && Math.abs(t - base) < Math.abs(best - base))) {
      best = t;
      bestCost = c;
    }
  }
  return best;
}

// The threshold a filter has before any learning, at your strictness.
export function baseThreshold(id, settings = {}) {
  const t = THRESHOLDS[settings.strictness] || THRESHOLDS.balanced;
  if (CATEGORY.has(id)) return t[id] ?? t.default;
  if (isRuleId(id)) return t.custom;
  if (id === 'off_topic') return FOCUS_STRENGTH[settings.focus?.strength] ?? FOCUS_STRENGTH.balanced;
  return undefined;
}

// Muted words, countries, promoted posts and authors are your explicit choices;
// unhiding one of those posts doesn't teach a filter anything.
export function isLearnable(id = '') {
  return CATEGORY.has(id) || isRuleId(id) || id === 'off_topic';
}

// The question whose answer most made the post look like `id`.
function strongestQuestion(id, q = {}) {
  if (id === 'off_topic') return 'focus';
  if (isRuleId(id)) return id;
  const qs = CATEGORY.get(id)?.questions || [];
  if (!qs.length) return null;
  return qs.reduce((best, qid) => ((q[qid] ?? -1) > (q[best] ?? -1) ? qid : best));
}

// The questions that made Deslop hide a post for `id`.
function firedQuestions(id, q = {}) {
  if (id === 'off_topic') return ['focus'];
  if (isRuleId(id)) return [id];
  return (CATEGORY.get(id)?.questions || []).filter((qid) => (q[qid] ?? 0) >= LEARNING.plausible);
}

function suggest(feedback, settings, model) {
  const off = {};
  const hid = {};
  const kept = {};
  const allowed = new Set((settings.allowlist || []).map(normalizeAccount));
  for (const e of feedback) {
    const cat = e.action === 'hide' && e.reason?.kind === 'category' ? CATEGORY.get(e.reason.id) : null;
    if (cat && !isCategoryEnabled(settings, cat)) off[cat.id] = (off[cat.id] || 0) + 1;
    const key = authorKey(e.platform, e.post?.author);
    if (!key) continue;
    const tally = e.action === 'hide' ? hid : kept;
    (tally[key] ||= { n: 0, author: e.post.author }).n += 1;
  }
  const out = [];
  for (const [id, n] of Object.entries(off)) out.push({ type: 'enable', id, label: CATEGORY.get(id).label, n });
  for (const [key, t] of Object.entries(hid)) {
    if (t.n >= 2 && !model.authors[key]) out.push({ type: 'block', key, label: whoIs(t.author), n: t.n });
  }
  for (const [key, t] of Object.entries(kept)) {
    const account = t.author.handle || t.author.slug;
    if (t.n >= 2 && !allowed.has(normalizeAccount(account))) out.push({ type: 'allow', key, account, label: whoIs(t.author), n: t.n });
  }
  return out;
}

const normalizeAccount = (a = '') => a.toLowerCase().trim().replace(/^@/, '');
const whoIs = (author = {}) => author.handle || author.name || author.slug || 'this account';

// ── Why did you hide this post? ──────────────────────────────────────────────

// Every filter's value for a post you hid, most likely reason first. Includes
// categories you turned off, so Deslop can suggest turning them on.
export function explain(answers = {}, local = {}, settings = {}, platform, model = emptyModel()) {
  const out = [];
  for (const cat of CATEGORIES) {
    if (cat.questions.length && !cat.questions.some((id) => answers[id])) continue;
    out.push({ kind: 'category', id: cat.id, label: cat.label, value: cat.value(answers, local), off: !isCategoryEnabled(settings, cat) });
  }
  for (const rule of settings.customRules || []) {
    const id = customRuleId(rule);
    if (answers[id]) out.push({ kind: 'rule', id, label: rule, value: answerValue(answers[id]) ?? 0, custom: true });
  }
  for (const r of model.rules) {
    if (r.status !== 'off' && answers[r.id]) {
      out.push({ kind: 'rule', id: r.id, label: r.label, text: r.text, topic: r.topic, value: answerValue(answers[r.id]) ?? 0 });
    }
  }
  if (focusActive(settings, platform) && answers.focus) {
    out.push({ kind: 'category', id: 'off_topic', label: 'Outside your focus', value: 1 - (answerValue(answers.focus) ?? 1) });
  }
  return out.sort((a, b) => b.value - a.value);
}

// The values stored with a piece of feedback.
export function snapshot(answers = {}, local = {}, settings = {}, platform, model) {
  const q = {};
  for (const [id, a] of Object.entries(answers)) {
    const v = answerValue(a);
    if (typeof v === 'number') q[id] = round(v);
  }
  const s = {};
  for (const x of explain(answers, local, settings, platform, model)) s[x.id] = round(x.value);
  return { q, s };
}

// Picks why you most likely hid a post, and the reasons to offer you instead.
// A filter that clearly fits wins; otherwise the post's topic becomes a new
// filter; otherwise a weaker filter; otherwise it's just this post.
export function attribute({ signals = [], topic, post } = {}, store = {}, settings = {}) {
  const best = signals.find((s) => s.value >= LEARNING.plausible);
  const byTopic = topic ? topicReason(topic.id, store, settings) : null;
  let reason = JUST_THIS_POST;
  if (best && best.value >= LEARNING.confident) reason = best;
  else if (byTopic && topic.p >= LEARNING.topicMin) reason = byTopic;
  else if (best) reason = best;

  const options = signals.filter((s) => s.value >= LEARNING.offer).slice(0, 3);
  if (byTopic && topic.p >= LEARNING.topicOffer && !options.some((o) => o.id === byTopic.id)) options.push(byTopic);
  if (reason !== JUST_THIS_POST && !options.some((o) => o.id === reason.id)) options.unshift(reason);
  const author = authorReason(post);
  if (author) options.push(author);
  options.push(JUST_THIS_POST);
  return { reason: reasonOf(reason), options: options.map((o) => ({ ...reasonOf(o), ...(o.off ? { off: true } : {}) })) };
}

export function topicReason(topicId, store = {}, settings = {}) {
  const topic = TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;
  if (topic.category) {
    const cat = CATEGORY.get(topic.category);
    return { kind: 'category', id: cat.id, label: cat.label, off: !isCategoryEnabled(settings, cat) };
  }
  const id = learnedRuleId(topic.rule);
  if (store.rules?.[id]?.deleted) return null;
  return { kind: 'rule', id, label: topic.label, text: topic.rule, topic: topic.id };
}

// "Other…": a filter in your own words.
export function ruleFromText(text) {
  const rule = String(text || '').trim().slice(0, 200);
  return rule ? { kind: 'rule', id: learnedRuleId(rule), label: rule, text: rule } : null;
}

export function authorReason(post) {
  const id = authorKey(post?.platform, post?.author);
  if (!id) return null;
  const who = whoIs(post.author);
  return { kind: 'author', id, label: `Everything from ${who}`, who };
}

export function reasonOf({ kind, id, label, text, topic, custom, who }) {
  const r = { kind, id, label };
  if (text) r.text = text;
  if (topic) r.topic = topic;
  if (custom) r.custom = true;
  if (who) r.who = who;
  return r;
}

// What the bar under a post you hid says Deslop learned.
export function describeReason(reason, model = emptyModel(), settings = {}) {
  if (reason?.kind === 'pending') return reason.label;
  if (settings.learning?.enabled === false) return 'Only this post is hidden. Learning is off.';
  if (reason?.kind === 'category') {
    const cat = CATEGORY.get(reason.id);
    if (cat && !isCategoryEnabled(settings, cat)) return `Looks like ${reason.label}, a filter you have off. Pick it to turn it on.`;
    return `Deslop will hide more posts like this: ${reason.label}.`;
  }
  if (reason?.kind === 'rule') {
    if (reason.custom) return `Added as an example for your rule “${reason.label}”.`;
    const rule = model.rules.find((r) => r.id === reason.id);
    const label = rule?.label || reason.label;
    const left = LEARNING.ruleMinHides - (rule?.hides || 0);
    if (rule?.status === 'active') return `Deslop will hide more posts like this: ${label}.`;
    if (rule?.status === 'learning') return `New filter “${label}”: hide ${left} more like this to turn it on.`;
    if (rule?.status === 'suggested') return `Suggested filter “${label}”: turn it on in Deslop's settings.`;
    if (rule?.status === 'paused') return `Filter “${label}” is paused: you unhid many of the posts it hid.`;
    if (rule?.status === 'off') return `Filter “${label}” is turned off in Deslop's settings.`;
    return `Deslop will learn a filter for ${label}.`;
  }
  if (reason?.kind === 'author') return `Deslop will hide everything from ${reason.who || 'this account'}.`;
  return 'Only this post is hidden.';
}

// What the bar under a post you unhid says.
export function describeShow(fired = [], settings = {}) {
  if (settings.learning?.enabled === false) return 'This post stays visible. Learning is off.';
  const learnable = fired.filter((f) => isLearnable(f.id));
  if (!learnable.length) return 'This post stays visible.';
  return `Deslop will be less strict about ${learnable.slice(0, 2).map((f) => f.label).join(' and ')}.`;
}

// ── For the settings page ───────────────────────────────────────────────────

export function summarize(store = {}, model = emptyModel(), settings = {}) {
  const feedback = store.feedback || [];
  const adjusted = Object.entries(model.thresholds)
    .map(([id, learned]) => ({
      id,
      label: signalLabel(id, settings, model),
      base: baseThreshold(id, settings),
      learned,
      ...(model.corrections[id] || { hidden: 0, kept: 0 }),
    }))
    .filter((a) => a.label);
  const examples = (id) => ({ hide: model.examples[id]?.hide.length || 0, keep: model.examples[id]?.keep.length || 0 });
  return {
    enabled: settings.learning?.enabled !== false,
    hidden: feedback.filter((e) => e.action === 'hide').length,
    kept: feedback.filter((e) => e.action === 'show').length,
    adjusted,
    rules: model.rules.map(({ id, label, text, topic, status, hides, keeps, hits, byUser }) => ({
      id, label, text, topic, status, hides, keeps, hits, byUser, examples: examples(id),
    })),
    authors: Object.entries(model.authors).map(([key, label]) => ({ key, label })),
    suggestions: model.suggestions,
    examples: Object.values(model.examples).reduce((n, e) => n + e.hide.length + e.keep.length, 0),
  };
}

export function signalLabel(id, settings = {}, model = emptyModel()) {
  if (CATEGORY.has(id)) return CATEGORY.get(id).label;
  if (id === 'off_topic') return 'Outside your focus';
  const custom = (settings.customRules || []).find((r) => customRuleId(r) === id);
  if (custom) return custom;
  return model.rules.find((r) => r.id === id)?.label || null;
}

// What's kept from a post you gave feedback on (in this browser only).
export function keepPost(post = {}) {
  const clip = (t, n) => (t && t.length > n ? `${t.slice(0, n)}…` : t || '');
  const out = { text: clip(post.text, 600) };
  if (post.quoted?.text) out.quoted = { author: post.quoted.author, text: clip(post.quoted.text, 300) };
  const author = {};
  for (const k of ['name', 'handle', 'slug']) if (post.author?.[k]) author[k] = post.author[k];
  out.author = author;
  if (post.url) out.url = post.url;
  if (post.media) out.media = post.media;
  return out;
}

// ── Sharing with everyone ───────────────────────────────────────────────────
// Feedback never leaves the browser on its own. Exported, it drops names,
// handles and post links, keeps only signals that mean the same for everyone,
// and scrubs links, @mentions, emails and long numbers from post text.

export function scrub(text = '') {
  return String(text || '')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '<link>')
    .replace(/\b[\w-]+(?:\.[\w-]+)+\/\S*/g, '<link>')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
    .replace(/(^|[^\w@<])@\w{1,30}/g, '$1@someone')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '<number>');
}

export function exportBundle(store = {}, settings = {}, { hits = {}, version = '', model = emptyModel(), now = Date.now() } = {}) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const shared = (id) => CATEGORY.has(id) || id === 'off_topic';
  const pick = (obj, keep) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keep(k)));
  const topicOf = new Map(model.rules.map((r) => [r.id, r.topic]));
  const signalId = (id) => {
    if (id.startsWith('custom_')) return 'custom';
    if (id.startsWith('learned_')) return topicOf.get(id) ? `topic:${topicOf.get(id)}` : 'learned';
    return id;
  };
  const reason = (r, by) => {
    if (!r || r.kind === 'pending') return null;
    if (r.kind === 'category') return { kind: 'category', id: r.id, by };
    if (r.kind === 'rule' && r.custom) return { kind: 'rule', custom: true, by };
    if (r.kind === 'rule') return { kind: 'rule', ...(r.topic ? { topic: r.topic } : { text: scrub(r.text) }), by };
    return { kind: r.kind, by };
  };
  return {
    format: 'deslop-feedback',
    schema: 1,
    extension: version,
    exported: day(now),
    strictness: settings.strictness || 'balanced',
    categories: CATEGORIES.filter((c) => isCategoryEnabled(settings, c)).map((c) => c.id),
    hits: pick(hits, shared),
    rules: model.rules.map((r) => ({
      ...(r.topic ? { topic: r.topic } : { text: scrub(r.text) }),
      status: r.status,
      hides: r.hides,
      keeps: r.keeps,
      hits: r.hits,
    })),
    feedback: (store.feedback || [])
      .filter((e) => e.action === 'show' || reason(e.reason))
      .map((e) => {
        const out = { label: e.action === 'hide' ? 'hide' : 'keep', platform: e.platform, day: day(e.at), text: scrub(e.post?.text) };
        if (e.post?.quoted?.text) out.quoted = scrub(e.post.quoted.text);
        if (e.post?.media) out.media = e.post.media;
        if (e.action === 'hide') out.reason = reason(e.reason, e.by);
        else out.fired = (e.fired || []).map((f) => signalId(f.id));
        out.values = pick(e.q, (k) => !isRuleId(k));
        out.signals = pick(e.s, shared);
        return out;
      }),
  };
}

function round(v) {
  return Math.round(v * 100) / 100;
}
