// The feedback log: posts you hid or unhid yourself, plus your edits to
// learned filters and the authors you hide everything from (see learn.js for
// the format). It holds post text, so it lives in chrome.storage.local and is
// never synced. background.js is the only writer.
//
// A small index of your decisions per post (OVERRIDES_KEY) lets content
// scripts show them instantly, and react when you change one in the popup.

export const STORE_KEY = 'learning:v1';
export const OVERRIDES_KEY = 'learning:overrides';
const MAX_FEEDBACK = 400;

let store = null;
let queue = Promise.resolve();

export async function readStore() {
  if (!store) {
    const { [STORE_KEY]: saved } = await chrome.storage.local.get(STORE_KEY);
    store = { feedback: [], rules: {}, authors: {}, ...saved };
  }
  return store;
}

// Runs `fn` on the store, then saves it. Changes are applied one at a time.
export function mutateStore(fn) {
  const run = queue.catch(() => {}).then(async () => {
    const s = await readStore();
    const result = await fn(s);
    s.feedback = s.feedback.slice(0, MAX_FEEDBACK);
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

// { 'x:t123': { a: 'h' | 's', r: reason label } }
export function overridesOf(s) {
  const out = {};
  for (const e of s.feedback) {
    out[e.id] = e.action === 'hide' ? { a: 'h', r: e.reason?.kind === 'pending' ? '' : e.reason?.label || '' } : { a: 's' };
  }
  return out;
}
