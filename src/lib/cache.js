// A size-capped, TTL'd map persisted to chrome.storage.local.
// Loaded lazily (the service worker can be restarted at any time) and flushed
// shortly after writes.

export class PersistentCache {
  constructor(storageKey, { maxEntries = 5000, ttlMs = 30 * 24 * 3600 * 1000 } = {}) {
    this.storageKey = storageKey;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = null;
    this.loading = null;
    this.flushTimer = null;
  }

  async load() {
    if (this.map) return;
    this.loading ||= chrome.storage.local.get(this.storageKey).then((stored) => {
      const now = Date.now();
      this.map = new Map();
      for (const [k, entry] of Object.entries(stored[this.storageKey] || {})) {
        if (now - entry.t < this.ttlMs) this.map.set(k, entry);
      }
    });
    await this.loading;
  }

  async get(key) {
    await this.load();
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.t > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry.v;
  }

  async set(key, value) {
    await this.load();
    this.map.delete(key);
    this.map.set(key, { v: value, t: Date.now() });
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
    this.scheduleFlush();
  }

  async clear() {
    this.map = new Map();
    await chrome.storage.local.remove(this.storageKey);
  }

  async size() {
    await this.load();
    return this.map.size;
  }

  scheduleFlush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 1500);
  }

  async flush() {
    if (!this.map) return;
    await chrome.storage.local.set({ [this.storageKey]: Object.fromEntries(this.map) });
  }
}
