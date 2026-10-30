import { askJev, createLimiter, DEFAULT_MODEL } from './lib/jev.js';
import {
  buildState,
  questionsFor,
  missingQuestions,
  mergeAnswers,
  questionHash,
  verdictFrom,
  hasEnoughText,
  findMutedWord,
  localSignals,
  fnv1a,
} from './lib/classify.js';
import { locationQuestion, NO_COUNTRY, COUNTRY_CHOICE_MIN } from './lib/questions.js';
import { loadSettings, getApiKey, setApiKey } from './lib/settings.js';
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) settingsPromise = null;
});

// ── Messages from content scripts, popup and options ─────────────────────────

const handlers = {
  'settings:get': async () => ({ settings: await getSettings(), hasKey: Boolean(await getApiKey()) }),
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

  if (isAllowlisted(post, settings.allowlist)) return { hide: false, skipped: 'allowlisted' };

  const muted = findMutedWord(post, settings.mutedWords);
  if (muted) return verdict([{ id: 'muted', label: `Muted word: ${muted}`, value: 1 }]);

  if (settings.hidePromoted && post.promoted) return verdict([{ id: 'promoted', label: 'Promoted', value: 1 }]);

  // Signals computed in code (fancy fonts) can hide a post without asking Jev.
  const local = localSignals(post);
  const quick = verdictFrom({}, settings, post.platform, local);
  if (quick.hide) return verdict(quick.reasons.map(({ id, label, value }) => ({ id, label, value })));

  if (!hasEnoughText(post)) return { hide: false, skipped: 'too-short' };

  const questions = questionsFor(settings, post.platform);
  if (!Object.keys(questions).length) return { hide: false, skipped: 'nothing-enabled' };

  const apiKey = await getApiKey();
  if (!apiKey) return { hide: false, skipped: 'no-key' };

  const cacheKey = `${post.platform}:${post.key}`;
  let entry = await answersCache.get(cacheKey);
  const missing = missingQuestions(entry, questions);

  if (Object.keys(missing).length) {
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
    try {
      entry = await inflight.get(jobKey);
    } catch (err) {
      await recordError(err);
      return { hide: false, skipped: 'error', error: err.message };
    }
  }

  const v = verdictFrom(entry.answers, settings, post.platform, local);
  return verdict(v.reasons.map(({ id, label, value }) => ({ id, label, value })));
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
  await updateStats((s) => {
    s.hiddenToday += 1;
    s.hiddenTotal += 1;
    const id = entry.reasonId || 'other';
    s.byReason[id] = (s.byReason[id] || 0) + 1;
  });
  const { recent = [] } = await chrome.storage.local.get('recent');
  recent.unshift({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ recent: recent.slice(0, 60) });
  return { ok: true };
}

async function recordError(err) {
  await chrome.storage.local.set({ lastError: { message: err.message, status: err.status ?? null, at: Date.now() } });
}

async function getStats() {
  const [stats, { recent = [], lastError = null }] = await Promise.all([
    readStats(),
    chrome.storage.local.get(['recent', 'lastError']),
  ]);
  return {
    stats,
    recent,
    lastError,
    hasKey: Boolean(await getApiKey()),
    cached: { posts: await answersCache.size(), accounts: await geoCache.size() },
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
