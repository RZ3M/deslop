import { askJev, createLimiter, DEFAULT_MODEL } from './lib/jev.js';
import {
  buildState,
  questionsFor,
  analysisQuestions,
  missingQuestions,
  mergeAnswers,
  questionHash,
  verdictFrom,
  hasEnoughText,
  findMutedWord,
  localSignals,
  customRuleId,
  isCategoryEnabled,
  authorKey,
  fnv1a,
} from './lib/classify.js';
import { locationQuestion, NO_COUNTRY, COUNTRY_CHOICE_MIN, NO_TOPIC, CATEGORIES } from './lib/questions.js';
import {
  learnFrom,
  explain,
  snapshot,
  attribute,
  topicReason,
  ruleFromText,
  authorReason,
  reasonOf,
  describeReason,
  describeShow,
  keepPost,
  summarize,
  exportBundle,
  PENDING,
  JUST_THIS_POST,
} from './lib/learn.js';
import {
  readStore,
  mutateStore,
  clearStore,
  feedbackId,
  findFeedback,
  putFeedback,
  removeFeedback,
  releaseAuthor,
  overridesOf,
} from './lib/feedback.js';
import { loadSettings, saveSettings, getApiKey, setApiKey } from './lib/settings.js';
import { PersistentCache } from './lib/cache.js';
import { matchPlace, isBlockedPlace, getCountry, placeLabel } from './lib/countries.js';

// Answers are cached per post and per question (see missingQuestions), so
// enabling a category later only asks that category's questions.
const answersCache = new PersistentCache('cache:answers:v2', { maxEntries: 6000, ttlMs: 14 * 24 * 3600e3 });
const geoCache = new PersistentCache('cache:geo', { maxEntries: 20000, ttlMs: 45 * 24 * 3600e3 });
const geoModelCache = new PersistentCache('cache:geoModel', { maxEntries: 5000, ttlMs: 45 * 24 * 3600e3 });

const limit = createLimiter(6);
const inflight = new Map();

let settingsPromise = null;
const getSettings = () => (settingsPromise ||= loadSettings());

// What Deslop learned from your feedback (learn.js), rebuilt whenever the
// feedback or your settings change.
let modelPromise = null;
const getModel = () =>
  (modelPromise ||= Promise.all([getSettings(), readStore(), readStats()]).then(([settings, store, stats]) =>
    learnFrom(store, settings, stats.hits),
  ));
const forgetModel = () => (modelPromise = null);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    settingsPromise = null;
    forgetModel();
  }
});

// ── Messages from content scripts, popup and options ─────────────────────────

const handlers = {
  'settings:get': async () => ({
    settings: await getSettings(),
    hasKey: Boolean(await getApiKey()),
    overrides: overridesOf(await readStore()),
  }),
  classify: ({ post }) => classify(post),
  'geo:get': ({ platform, key }) => geoGet(platform, key),
  'geo:put': ({ platform, key, raw }) => geoPut(platform, key, raw),
  hidden: ({ entry }) => recordHidden(entry),
  'stats:get': () => getStats(),
  'key:test': ({ apiKey }) => testKey(apiKey),
  'cache:clear': async () => {
    await Promise.all([answersCache.clear(), geoCache.clear(), geoModelCache.clear()]);
    return { ok: true };
  },
  'feedback:hide': ({ post }) => feedbackHide(post),
  'feedback:show': (msg) => feedbackShow(msg),
  'feedback:undo': ({ platform, key }) => feedbackUndo(platform, key),
  'feedback:reason': ({ platform, key, reason }) => feedbackReason(platform, key, reason),
  'learning:get': async () => summarize(await readStore(), await getModel(), await getSettings()),
  'learning:rule': ({ id, patch }) => editRule(id, patch),
  'learning:author': ({ key, label, block }) => editAuthor(key, label, block),
  'learning:export': () => exportFeedback(),
  'learning:reset': async () => {
    await clearStore();
    forgetModel();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

// ── Slop classification ─────────────────────────────────────────────────────

async function classify(post) {
  const settings = await getSettings();
  if (!settings.enabled || !settings.platforms[post.platform]) return { hide: false, skipped: 'disabled' };

  // Your own decision about this post beats everything else.
  const mine = findFeedback(await readStore(), feedbackId(post.platform, post.key));
  if (mine?.action === 'hide') return { hide: true, manual: true, reasons: [{ id: 'manual', label: 'Hidden by you', value: 1 }] };
  if (mine?.action === 'show') return { hide: false, skipped: 'kept' };

  if (isAllowlisted(post, settings.allowlist)) return { hide: false, skipped: 'allowlisted' };

  const model = await getModel();
  const author = authorKey(post.platform, post.author);
  if (author && model.authors[author]) return verdict([{ id: 'author', label: `You hide ${model.authors[author]}`, value: 1 }]);

  const muted = findMutedWord(post, settings.mutedWords);
  if (muted) return verdict([{ id: 'muted', label: `Muted word: ${muted}`, value: 1 }]);

  if (settings.hidePromoted && post.promoted) return verdict([{ id: 'promoted', label: 'Promoted', value: 1 }]);

  // Signals computed in code (fancy fonts) can hide a post without asking Jev.
  const local = localSignals(post);
  const quick = verdictFrom({}, settings, post.platform, local, model);
  if (quick.hide) return verdict(quick.reasons.map(({ id, label, value }) => ({ id, label, value })));

  if (!hasEnoughText(post)) return { hide: false, skipped: 'too-short' };

  const questions = questionsFor(settings, post.platform, model);
  if (!Object.keys(questions).length) return { hide: false, skipped: 'nothing-enabled' };

  const apiKey = await getApiKey();
  if (!apiKey) return { hide: false, skipped: 'no-key' };

  let entry;
  try {
    entry = await answersFor(post, questions, settings, apiKey);
  } catch (err) {
    await recordError(err);
    return { hide: false, skipped: 'error', error: err.message };
  }

  const v = verdictFrom(entry.answers, settings, post.platform, local, model);
  return verdict(v.reasons.map(({ id, label, value }) => ({ id, label, value })));
}

// Jev's answers to `questions` about a post: the cached ones, plus one
// request for any that are missing or were reworded.
async function answersFor(post, questions, settings, apiKey) {
  const cacheKey = `${post.platform}:${post.key}`;
  const entry = await answersCache.get(cacheKey);
  const missing = missingQuestions(entry, questions);
  if (!Object.keys(missing).length) return entry;

  const jobKey = `${cacheKey}:${Object.entries(missing).map(([id, q]) => `${id}=${questionHash(q)}`).sort().join(',')}`;
  if (!inflight.has(jobKey)) {
    const job = limit(() =>
      askJev({
        apiKey,
        model: settings.model || DEFAULT_MODEL,
        state: buildState(post),
        questions: missing,
      }),
    )
      .then(async (res) => {
        // Re-read: another job for the same post may have finished meanwhile.
        const merged = mergeAnswers(await answersCache.get(cacheKey), missing, res.answers);
        await answersCache.set(cacheKey, merged);
        await recordUsage(res.usage);
        return merged;
      })
      .finally(() => inflight.delete(jobKey));
    inflight.set(jobKey, job);
  }
  return inflight.get(jobKey);
}

function verdict(reasons) {
  return { hide: reasons.length > 0, reasons };
}

function isAllowlisted(post, allowlist = []) {
  if (!allowlist.length) return false;
  const ids = [post.author?.handle, post.author?.slug, post.author?.name]
    .filter(Boolean)
    .map((s) => s.toLowerCase().replace(/^@/, ''));
  return allowlist.some((a) => ids.includes(a.toLowerCase().trim().replace(/^@/, '')));
}

// ── Learning from you ───────────────────────────────────────────────────────
// Posts you hide or unhide yourself are stored as feedback (feedback.js) and
// learn.js turns them into thresholds, examples and new filters.

// You hid a post: it stays hidden, then Deslop asks Jev everything it could
// ask about it (including categories you have off and its topic) to work out why.
async function feedbackHide(post) {
  const id = feedbackId(post.platform, post.key);
  await mutateStore((s) => {
    // Hiding a post you had unhidden: Undo brings the unhide back.
    const earlier = findFeedback(s, id);
    putFeedback(s, {
      id, platform: post.platform, key: post.key, action: 'hide', at: Date.now(), post: keepPost(post), reason: PENDING, by: 'auto',
      ...(earlier?.action === 'show' ? { replaced: earlier } : {}),
    });
  });
  forgetModel();
  await addRecent({
    platform: post.platform,
    key: post.key,
    author: post.author?.name || post.author?.handle || '',
    handle: post.author?.handle || post.author?.slug || '',
    snippet: (post.text || '').slice(0, 160),
    url: post.url || '',
    reasonId: 'manual',
    manual: true,
    reasons: [{ id: 'manual', label: 'Hidden by you', value: 1 }],
  });

  const settings = await getSettings();
  if (settings.learning?.enabled === false) {
    await mutateStore((st) => {
      const e = findFeedback(st, id);
      if (e?.action === 'hide' && e.by !== 'user') e.reason = JUST_THIS_POST;
    });
    return { reason: JUST_THIS_POST, options: [], message: describeReason(JUST_THIS_POST, undefined, settings) };
  }
  const analysis = await analyze(post, settings, await getModel());
  const [store, model] = await Promise.all([readStore(), getModel()]);
  const signals = explain(analysis.answers, analysis.local, settings, post.platform, model);
  const picked = attribute({ signals, topic: analysis.topic, post }, store, settings);
  const { q, s } = snapshot(analysis.answers, analysis.local, settings, post.platform, model);

  const reason = await mutateStore((st) => {
    const e = findFeedback(st, id);
    if (!e || e.action !== 'hide') return null; // undone meanwhile
    Object.assign(e, { q, s, topic: analysis.topic });
    if (e.by !== 'user') e.reason = picked.reason;
    return e.reason;
  });
  forgetModel();
  if (!reason) return { gone: true };

  const reply = await reasonReply(reason, picked.options);
  if (analysis.error) reply.message = `Only this post is hidden: Deslop couldn't check why (${analysis.error.slice(0, 80)}).`;
  else if (!analysis.asked && reason.kind === 'post') reply.message = 'Only this post is hidden. Add an OpenRouter API key so Deslop can learn why.';
  return reply;
}

async function analyze(post, settings, model) {
  const local = localSignals(post);
  const cached = await answersCache.get(`${post.platform}:${post.key}`);
  let answers = cached?.answers || {};
  let error = null;
  const apiKey = await getApiKey();
  const asked = Boolean(apiKey) && hasEnoughText(post);
  if (asked) {
    try {
      const questions = analysisQuestions(settings, post.platform, model);
      const entry = await answersFor(post, questions, settings, apiKey);
      answers = Object.fromEntries(Object.keys(questions).filter((qid) => entry.answers[qid]).map((qid) => [qid, entry.answers[qid]]));
    } catch (err) {
      await recordError(err);
      error = err.message;
    }
  }
  const t = answers.topic;
  const topic =
    t?.type === 'choice' && t.choice && t.choice !== NO_TOPIC
      ? { id: t.choice, p: Math.round((t.probabilities?.[t.choice] ?? 0) * 100) / 100 }
      : null;
  return { answers, local, topic, error, asked };
}

// You picked why you hid a post (a chip under it, or "Other…" in your words).
async function feedbackReason(platform, key, choice) {
  const id = feedbackId(platform, key);
  let settings;
  const reason = await mutateStore(async (s) => {
    settings = await getSettings();
    const e = findFeedback(s, id);
    if (!e || e.action !== 'hide') return null;
    const next = chosenReason(choice, e, settings);
    if (!next) throw new Error('Unknown reason');
    const before = e.reason;
    e.reason = next;
    e.by = 'user';
    if (next.kind === 'author') s.authors[next.id] ||= { label: next.who, from: 'feedback', at: Date.now() };
    if (before?.kind === 'author') releaseAuthor(s, before.id);
    if (next.kind === 'rule' && !next.custom && s.rules[next.id]) {
      delete s.rules[next.id].deleted; // picking a filter you deleted brings it back
      delete s.rules[next.id].off;
    }
    return next;
  });
  forgetModel();
  if (!reason) return { gone: true };

  // Picking a category you have off is how you turn it on from the feed.
  const cat = reason.kind === 'category' && CATEGORIES.find((c) => c.id === reason.id);
  if (cat && !isCategoryEnabled(settings, cat)) {
    const next = structuredClone(settings);
    next.categories[cat.id] = true;
    await saveSettings(next);
    settingsPromise = null;
    forgetModel();
  }
  return reasonReply(reason);
}

// Only reasons Deslop could have offered, rebuilt from trusted data.
function chosenReason(choice, entry, settings) {
  if (choice?.kind === 'other') return ruleFromText(choice.text);
  if (choice?.kind === 'post') return JUST_THIS_POST;
  if (choice?.kind === 'author') return authorReason({ platform: entry.platform, author: entry.post?.author });
  if (choice?.kind === 'category') {
    if (choice.id === 'off_topic') return { kind: 'category', id: 'off_topic', label: 'Outside your focus' };
    const cat = CATEGORIES.find((c) => c.id === choice.id);
    return cat ? { kind: 'category', id: cat.id, label: cat.label } : null;
  }
  if (choice?.kind === 'rule' && choice.custom) {
    const rule = (settings.customRules || []).find((r) => customRuleId(r) === choice.id);
    return rule ? { kind: 'rule', id: choice.id, label: rule, custom: true } : null;
  }
  if (choice?.kind === 'rule' && choice.topic) {
    const r = topicReason(choice.topic, {}, settings);
    return r && reasonOf(r);
  }
  if (choice?.kind === 'rule') return ruleFromText(choice.text);
  return null;
}

async function reasonReply(reason, options) {
  const [settings, model] = await Promise.all([getSettings(), getModel()]);
  return { reason, options, message: describeReason(reason, model, settings) };
}

// You unhid a post Deslop hid: the filters that hid it learn from it. From the
// popup there's no post, so the snippet from "Recently hidden" stands in.
async function feedbackShow({ platform, key, post, fired = [] }) {
  const id = feedbackId(platform, key);
  const reasons = fired.map((r) => ({ id: String(r.id || ''), label: String(r.label || ''), value: Number(r.value) || 0 }));
  // Queued before any other await, so an Undo right after it lands after it.
  await mutateStore(async (st) => {
    const [settings, model] = await Promise.all([getSettings(), getModel()]);
    const { recent = [] } = await chrome.storage.local.get('recent');
    const seen = post || fromRecent(recent.find((r) => r.platform === platform && r.key === key));
    const answers = (await answersCache.get(id))?.answers || {};
    const { q, s } = snapshot(answers, seen ? localSignals(seen) : {}, settings, platform, model);
    putFeedback(st, { id, platform, key, action: 'show', at: Date.now(), post: keepPost(seen || {}), fired: reasons, q, s });
  });
  forgetModel();
  await updateRecent((list) => list.map((r) => (r.platform === platform && r.key === key ? { ...r, fixed: 'shown' } : r)));
  return { message: describeShow(reasons, await getSettings()) };
}

function fromRecent(r) {
  return r && { text: r.snippet || '', author: { name: r.author, handle: r.handle || undefined }, url: r.url };
}

// Forget your decision about a post, and anything it taught.
// Returns what's left for the post: your earlier unhide, or nothing.
async function feedbackUndo(platform, key) {
  const id = feedbackId(platform, key);
  const removed = await mutateStore((s) => {
    const e = removeFeedback(s, id);
    if (e?.replaced) putFeedback(s, e.replaced);
    if (e?.reason?.kind === 'author') releaseAuthor(s, e.reason.id);
    return e;
  });
  forgetModel();
  await updateRecent((list) =>
    removed?.action === 'hide'
      ? list.filter((r) => !(r.platform === platform && r.key === key && r.manual))
      : list.map((r) => (r.platform === platform && r.key === key ? { ...r, fixed: undefined } : r)),
  );
  return { now: removed?.replaced ? { a: 's' } : null };
}

async function editRule(id, patch = {}) {
  await mutateStore((s) => {
    const r = (s.rules[id] ||= {});
    if (patch.on) Object.assign(r, { on: true, off: false });
    if (patch.off) Object.assign(r, { off: true, on: false });
    if (patch.deleted) r.deleted = true;
    if (typeof patch.label === 'string' && patch.label.trim()) r.label = patch.label.trim().slice(0, 80);
  });
  forgetModel();
  return { ok: true };
}

async function editAuthor(key, label, block) {
  await mutateStore((s) => {
    if (block) s.authors[key] = { label: label || key, at: Date.now() };
    else delete s.authors[key];
  });
  forgetModel();
  return { ok: true };
}

async function exportFeedback() {
  const [store, settings, model, stats] = await Promise.all([readStore(), getSettings(), getModel(), readStats()]);
  return exportBundle(store, settings, { hits: stats.hits, model, version: chrome.runtime.getManifest?.().version || '' });
}

// ── Country filter ──────────────────────────────────────────────────────────

async function geoGet(platform, key) {
  const entry = await geoCache.get(`${platform}:${key}`);
  if (!entry) return { hit: false };
  return { hit: true, ...(await geoVerdict(entry.raw)) };
}

async function geoPut(platform, key, raw) {
  await geoCache.set(`${platform}:${key}`, { raw: raw || null });
  return geoVerdict(raw);
}

async function geoVerdict(raw) {
  const settings = await getSettings();
  const { blocked, includeRegions } = settings.countries;
  if (!raw) return { blocked: false, place: null, label: 'Unknown' };

  let place = matchPlace(raw);
  if (!place) place = await placeFromModel(raw, blocked);
  return { blocked: isBlockedPlace(place, blocked, includeRegions), place, label: place ? placeLabel(place) : raw };
}

// For places code can't resolve ("San Francisco Bay Area"), ask Jev which of
// the *blocked* countries it is in. That's all the filter needs to know.
async function placeFromModel(raw, blocked) {
  const codes = blocked.filter((b) => !b.startsWith('region:'));
  if (!codes.length) return null;
  const cacheKey = `${fnv1a(codes.slice().sort().join(','))}:${raw.toLowerCase()}`;
  const cached = await geoModelCache.get(cacheKey);
  if (cached !== undefined) return cached ? describeCode(cached) : null;

  const apiKey = await getApiKey();
  if (!apiKey) return null;
  const names = codes.map((c) => getCountry(c)?.name).filter(Boolean);
  try {
    const settings = await getSettings();
    const res = await limit(() =>
      askJev({
        apiKey,
        model: settings.model || DEFAULT_MODEL,
        state: { location: raw },
        questions: { country: locationQuestion(names) },
      }),
    );
    await recordUsage(res.usage);
    const a = res.answers.country;
    const pick = a?.choice && a.choice !== NO_COUNTRY && (a.probabilities?.[a.choice] ?? 0) >= COUNTRY_CHOICE_MIN ? a.choice : null;
    const code = pick ? codes.find((c) => getCountry(c)?.name === pick) : null;
    await geoModelCache.set(cacheKey, code || null);
    return code ? describeCode(code) : null;
  } catch (err) {
    await recordError(err);
    return null;
  }
}

function describeCode(code) {
  const c = getCountry(code);
  return c ? { kind: 'country', code: c.code, name: c.name, flag: c.flag } : null;
}

// ── Stats, spend and errors ─────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

async function readStats() {
  const { stats } = await chrome.storage.local.get('stats');
  const s = stats || { day: today(), hiddenToday: 0, hiddenTotal: 0, byReason: {}, spendToday: 0, spendTotal: 0, checksToday: 0 };
  if (s.day !== today()) Object.assign(s, { day: today(), hiddenToday: 0, byReason: {}, spendToday: 0, checksToday: 0 });
  s.hits ||= {}; // posts hidden per filter, all time (learned filters use it to spot mistakes)
  return s;
}

let statsQueue = Promise.resolve();
function updateStats(fn) {
  statsQueue = statsQueue.catch(() => {}).then(async () => {
    const s = await readStats();
    fn(s);
    await chrome.storage.local.set({ stats: s });
  });
  return statsQueue;
}

async function recordUsage(usage) {
  const cost = usage?.cost || 0;
  await updateStats((s) => {
    s.spendToday += cost;
    s.spendTotal += cost;
    s.checksToday += 1;
  });
  await chrome.storage.local.remove('lastError');
}

async function recordHidden(entry) {
  // A post seen again after a reload is hidden again, but counts once for its filter.
  const { recent = [] } = await chrome.storage.local.get('recent');
  const again = Boolean(entry.key) && recent.some((r) => r.platform === entry.platform && r.key === entry.key);
  await updateStats((s) => {
    s.hiddenToday += 1;
    s.hiddenTotal += 1;
    const id = entry.reasonId || 'other';
    s.byReason[id] = (s.byReason[id] || 0) + 1;
    const hit = entry.reasons?.[0]?.id;
    if (hit && !again) s.hits[hit] = (s.hits[hit] || 0) + 1;
  });
  await addRecent(entry);
  return { ok: true };
}

// "Recently hidden" in the popup: newest first, one entry per post.
let recentQueue = Promise.resolve();
function updateRecent(fn) {
  recentQueue = recentQueue.catch(() => {}).then(async () => {
    const { recent = [] } = await chrome.storage.local.get('recent');
    await chrome.storage.local.set({ recent: fn(recent).slice(0, 60) });
  });
  return recentQueue;
}

function addRecent(entry) {
  return updateRecent((list) => [
    { ...entry, at: Date.now() },
    ...list.filter((r) => !(entry.key && r.platform === entry.platform && r.key === entry.key)),
  ]);
}

async function recordError(err) {
  await chrome.storage.local.set({ lastError: { message: err.message, status: err.status ?? null, at: Date.now() } });
}

async function getStats() {
  const [stats, { recent = [], lastError = null }, store, model] = await Promise.all([
    readStats(),
    chrome.storage.local.get(['recent', 'lastError']),
    readStore(),
    getModel(),
  ]);
  return {
    stats,
    recent,
    lastError,
    hasKey: Boolean(await getApiKey()),
    cached: { posts: await answersCache.size(), accounts: await geoCache.size() },
    learning: { corrections: store.feedback.length, filters: model.rules.filter((r) => r.active).length },
  };
}

async function testKey(candidate) {
  const apiKey = candidate?.trim() || (await getApiKey());
  const settings = await getSettings();
  const started = Date.now();
  const res = await askJev({
    apiKey,
    model: settings.model || DEFAULT_MODEL,
    retries: 0,
    state: 'Comment "GUIDE" and I will DM you the free template 👇',
    questions: { bait: { type: 'noul', instructions: 'Does this post withhold content to farm comments?' } },
  });
  return { model: res.model, ms: Date.now() - started, bait: res.answers.bait?.noul };
}

// ── First run ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'update') await chrome.storage.local.remove('cache:answers'); // pre-0.2 cache format
  await importLocalKey();
  if (reason === 'install' && !(await getApiKey())) chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(importLocalKey);

// Developer convenience: scripts/import-env-key.ps1 writes a gitignored
// config.local.json next to the manifest. Import it once if no key is saved.
async function importLocalKey() {
  if (await getApiKey()) return;
  try {
    const res = await fetch(chrome.runtime.getURL('config.local.json'));
    if (!res.ok) return;
    const { openrouterApiKey } = await res.json();
    if (openrouterApiKey) await setApiKey(openrouterApiKey);
  } catch {
    // No local config; the user adds a key in the options page.
  }
}
