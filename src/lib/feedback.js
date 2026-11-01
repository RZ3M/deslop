// The feedback log: posts you hid or unhid yourself, plus your edits to
// learned filters and the authors you hide everything from (see learn.js for
// the format). It holds post text, so it lives in chrome.storage.local and is
// never synced. background.js is the only writer.
//
// A small index of your decisions per post (OVERRIDES_KEY) lets content
// scripts show them instantly, and react when you change one in the popup.

export const STORE_KEY = 'learning:v1';
export const OVERRIDES_KEY = 'learning:overrides';
export const MAX_FEEDBACK = 400;
const KEEP_PER_RULE = 3; // hides kept per learned filter when old feedback is dropped

let loading = null;
let queue = Promise.resolve();

// Loaded once per service-worker life; every caller shares the same object.
export function readStore() {
  loading ||= chrome.storage.local.get(STORE_KEY).then(({ [STORE_KEY]: saved }) => ({ feedback: [], rules: {}, authors: {}, ...saved }));
  return loading;
}

// Runs `fn` on the store, then saves it. Changes are applied one at a time,
// in the order they were asked for.
export function mutateStore(fn) {
  const run = queue.catch(() => {}).then(async () => {
    const s = await readStore();
    const result = await fn(s);
    s.feedback = trimFeedback(s.feedback);
    await chrome.storage.local.set({ [STORE_KEY]: s, [OVERRIDES_KEY]: overridesOf(s) });
    return result;
  });
  queue = run;
  return run;
}

export async function clearStore() {
  await mutateStore((s) => {
    s.feedback = [];
    s.rules = {};
    s.authors = {};
  });
}

// Drops the oldest feedback past MAX_FEEDBACK, but keeps a few hides behind
// every learned filter, so filters don't vanish as your feedback ages.
export function trimFeedback(feedback, max = MAX_FEEDBACK) {
  if (feedback.length <= max) return feedback;
  const pinned = new Set();
  const perRule = {};
  for (const e of feedback) {
    const id = e.action === 'hide' && e.reason?.kind === 'rule' && !e.reason.custom ? e.reason.id : null;
    if (id && (perRule[id] = (perRule[id] || 0) + 1) <= KEEP_PER_RULE) pinned.add(e);
  }
  let room = max - pinned.size;
  return feedback.filter((e) => pinned.has(e) || room-- > 0);
}

export const feedbackId = (platform, key) => `${platform}:${key}`;

export function findFeedback(s, id) {
  return s.feedback.find((e) => e.id === id);
}

// Newest first; a post has at most one entry (your latest decision).
export function putFeedback(s, entry) {
  s.feedback = [entry, ...s.feedback.filter((e) => e.id !== entry.id)];
  return entry;
}

export function removeFeedback(s, id) {
  const entry = findFeedback(s, id);
  s.feedback = s.feedback.filter((e) => e.id !== id);
  return entry;
}

// An author you hid everything from by picking it as a reason stays hidden
// while any post you hid still gives that reason.
export function releaseAuthor(s, key) {
  if (!key || s.authors[key]?.from !== 'feedback') return;
  if (!s.feedback.some((e) => e.reason?.kind === 'author' && e.reason.id === key)) delete s.authors[key];
}

// { 'x:t123': { a: 'h' | 's', r: reason label } }
export function overridesOf(s) {
  const out = {};
  for (const e of s.feedback) {
    out[e.id] = e.action === 'hide' ? { a: 'h', r: e.reason?.kind === 'pending' ? '' : e.reason?.label || '' } : { a: 's' };
  }
  return out;
}
