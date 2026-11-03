// User settings live in chrome.storage.sync (small, follows the user across
// browsers). API keys live in chrome.storage.local and are never synced.

import { CATEGORIES, SITES } from './questions.js';
import { DEFAULT_MODEL, DEFAULT_SERVER_MODEL, resolveBackend } from './jev.js';

export const DEFAULT_SETTINGS = {
  enabled: true,
  platforms: { x: true, linkedin: true, reddit: true },
  strictness: 'balanced', // relaxed | balanced | strict, for every site…
  siteStrictness: { x: '', linkedin: '', reddit: '' }, // …unless a site has its own ('' = the default)
  hideMode: 'collapse', // collapse (leave a placeholder bar) | remove
  hideWhileChecking: true,
  // One switch per category for every site…
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
  // …and each site's overrides: true or false, or null to follow the switch.
  // Categories not listed use the site's built-in default (siteDefaults).
  siteOverrides: Object.fromEntries(SITES.map((s) => [s.id, {}])),
  customRules: [],
  customRuleSites: {}, // rule -> the sites it applies on, for rules not used everywhere
  mutedWords: [],
  allowlist: [],
  hidePromoted: false,
  keepHistory: false, // daily counts of hidden posts for the charts in Data; opt-in
  notInterestedOnX: false, // also pick ⋯ → "Not interested in this post" for hidden posts on X
  reddit: {
    comments: true, // filter comments as well as posts
    adultLinks: true, // hide authors whose profile links to OnlyFans and similar
    newAccounts: true, // hide brand-new accounts with an NSFW profile or hidden posts
    checkCommenters: false, // run those profile checks on commenters too (many more lookups)
  },
  focus: {
    enabled: false,
    interests: [], // e.g. "AI and LLMs", "Startups and venture capital"
    strength: 'balanced', // light | balanced | strong
    onX: true,
    onLinkedIn: true,
    onReddit: true,
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
  spendCap: { enabled: true, daily: 0.5 }, // USD per day, OpenRouter only
};

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return mergeDeep(structuredClone(DEFAULT_SETTINGS), migrateSettings(settings || {}));
}

// Pre-release builds of 0.3 kept a full set of switches per site
// (`filters`). Each category's all-sites switch becomes what most sites had,
// and sites that differ get an override. Settings from 0.2 need nothing: their
// categories are the all-sites switches.
export function migrateSettings(stored) {
  if (!stored.filters) return stored;
  const { filters, ...rest } = stored;
  const categories = {};
  const siteOverrides = Object.fromEntries(SITES.map((s) => [s.id, {}]));
  for (const cat of CATEGORIES) {
    const values = SITES.map((s) => filters[s.id]?.[cat.id] ?? cat.siteDefaults?.[s.id] ?? cat.defaultOn);
    const master = values.filter(Boolean).length * 2 > values.length;
    categories[cat.id] = master;
    SITES.forEach((s, i) => {
      if (values[i] !== master) siteOverrides[s.id][cat.id] = values[i];
      else if (cat.siteDefaults?.[s.id] !== undefined) siteOverrides[s.id][cat.id] = null;
    });
  }
  return { ...rest, categories, siteOverrides };
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
