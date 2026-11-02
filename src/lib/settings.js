// User settings live in chrome.storage.sync (small, follows the user across
// browsers). API keys live in chrome.storage.local and are never synced.

import { CATEGORIES } from './questions.js';
import { DEFAULT_MODEL, DEFAULT_SERVER_MODEL, resolveBackend } from './jev.js';

export const DEFAULT_SETTINGS = {
  enabled: true,
  platforms: { x: true, linkedin: true },
  strictness: 'balanced', // relaxed | balanced | strict
  hideMode: 'collapse', // collapse (leave a placeholder bar) | remove
  hideWhileChecking: true,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
  customRules: [],
  mutedWords: [],
  allowlist: [],
  hidePromoted: false,
  notInterestedOnX: false, // also pick ⋯ → "Not interested in this post" for hidden posts on X
  focus: {
    enabled: false,
    interests: [], // e.g. "AI and LLMs", "Startups and venture capital"
    strength: 'balanced', // light | balanced | strong
    onX: true,
    onLinkedIn: true,
  },
  countries: {
    blocked: [], // ISO codes ("CA") and region ids ("region:europe")
    includeRegions: false,
    onX: true,
    onLinkedIn: true,
  },
  provider: 'openrouter', // openrouter | server (self-hosted, System One API)
  model: DEFAULT_MODEL, // OpenRouter model
  server: { url: '', model: DEFAULT_SERVER_MODEL },
};

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return mergeDeep(structuredClone(DEFAULT_SETTINGS), settings || {});
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

export async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return apiKey || '';
}

export async function setApiKey(apiKey) {
  await chrome.storage.local.set({ apiKey: apiKey.trim() });
}

// Optional key for a self-hosted server, kept apart from the OpenRouter key so
// switching between them loses neither.
export async function getServerKey() {
  const { serverKey } = await chrome.storage.local.get('serverKey');
  return serverKey || '';
}

export async function setServerKey(serverKey) {
  await chrome.storage.local.set({ serverKey: serverKey.trim() });
}

// Where model requests go for these settings, or null if not set up yet.
export async function getBackend(settings) {
  const [apiKey, serverKey] = await Promise.all([getApiKey(), getServerKey()]);
  return resolveBackend(settings, { apiKey, serverKey });
}

function mergeDeep(base, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      mergeDeep(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}
