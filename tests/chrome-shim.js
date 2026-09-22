// Minimal chrome.* stand-in for running extension code in a normal tab.
//  - UI preview: http://localhost:8787/src/popup/popup.html?shim (canned demo data)
//  - End to end: tests/e2e-x.html imports the real background.js; messages are
//    then routed to its onMessage listener instead of the demo data.
(() => {
  const storageListeners = [];
  const messageListeners = [];
  const installedListeners = [];
  const areas = {};
  const area = (name) =>
    (areas[name] ||= {
      data: JSON.parse(localStorage.getItem(`shim:${name}`) || '{}'),
      async get(keys) {
        if (keys == null) return { ...this.data };
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        return Object.fromEntries(list.filter((k) => k in this.data).map((k) => [k, structuredClone(this.data[k])]));
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: this.data[k], newValue: v };
          this.data[k] = structuredClone(v);
        }
        this.persist();
        storageListeners.forEach((fn) => fn(changes, name));
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete this.data[k];
        this.persist();
      },
      persist() {
        localStorage.setItem(`shim:${name}`, JSON.stringify(this.data));
      },
    });

  const now = Date.now();
  const demo = {
    stats: { day: new Date().toISOString().slice(0, 10), hiddenToday: 23, hiddenTotal: 412, byReason: {}, spendToday: 0.0021, spendTotal: 0.0374, checksToday: 186 },
    recent: [
      { platform: 'x', author: 'Growth Guru', handle: '@growthguru', snippet: 'I found a Claude prompt that writes a month of content in 10 minutes. The prompt is in the replies 👇', reasonId: 'engagement_bait', reasons: [{ label: 'Engagement bait', value: 0.99 }], at: now - 60e3 },
      { platform: 'linkedin', author: 'Mark T.', snippet: "In today's fast-paced digital landscape, leadership isn't about having all the answers — it's about asking the right questions. 🚀 Embrace uncertainty", reasonId: 'ai_generated', reasons: [{ label: 'AI-generated writing', value: 1 }], at: now - 120e3 },
      { platform: 'x', author: 'AI Daily Brief', handle: '@aidailybrief', snippet: 'AI news you missed this week 🧵 1. OpenAI released a new reasoning model 2. Google updated Gemini', reasonId: 'news_rehash', reasons: [{ label: 'Recycled news', value: 0.93 }], at: now - 300e3 },
      { platform: 'x', author: 'Some Account', handle: '@someaccount', snippet: 'gm frens, huge alpha dropping tonight', reasonId: 'country', reasons: [{ label: 'Based in 🇳🇬 Nigeria', value: 1 }], at: now - 400e3 },
      { platform: 'linkedin', author: 'Chad W.', snippet: 'Yesterday I fired my best salesperson. He hit 200% of quota. He was loved by clients.', reasonId: 'hollow_inspiration', reasons: [{ label: 'Broetry & humblebrags', value: 0.95 }], at: now - 600e3 },
    ],
  };

  async function demoResponse(msg) {
    if (msg.type === 'stats:get') {
      const { apiKey } = await area('local').get('apiKey');
      return { ok: true, result: { ...demo, lastError: null, hasKey: Boolean(apiKey), cached: { posts: 1843, accounts: 322 } } };
    }
    if (msg.type === 'key:test') return { ok: true, result: { model: 'typesafe/jev-1.13-20260917', ms: 412, bait: 0.97 } };
    return { ok: true, result: {} };
  }

  function dispatch(msg) {
    if (!messageListeners.length) return demoResponse(structuredClone(msg));
    return new Promise((resolve) => {
      let answered = false;
      for (const fn of messageListeners) {
        const keepOpen = fn(structuredClone(msg), { id: 'shim' }, (res) => {
          answered = true;
          resolve(structuredClone(res));
        });
        if (keepOpen === true || answered) return;
      }
      resolve(undefined);
    });
  }

  window.chrome = {
    storage: {
      sync: area('sync'),
      local: area('local'),
      session: area('session'),
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      id: 'shim',
      lastError: undefined,
      getURL: (p) => `/${p}`,
      openOptionsPage: () => window.open('/src/options/options.html?shim'),
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onInstalled: { addListener: (fn) => installedListeners.push(fn) },
      onStartup: { addListener() {} },
      sendMessage(msg, callback) {
        const p = dispatch(msg);
        if (typeof callback === 'function') p.then(callback);
        else return p;
      },
    },
  };

  window.__shim = {
    fireInstalled: (reason = 'install') => Promise.all(installedListeners.map((fn) => fn({ reason }))),
    reset: () =>
      ['sync', 'local', 'session'].forEach((n) => {
        localStorage.removeItem(`shim:${n}`);
        area(n).data = {};
      }),
  };
})();
