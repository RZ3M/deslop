// User settings live in chrome.storage.sync (small, follows the user across
// browsers). The API key lives in chrome.storage.local and is never synced.

import { CATEGORIES } from './questions.js';
import { DEFAULT_MODEL } from './jev.js';

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
  model: DEFAULT_MODEL,
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
