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
      { platform: 'x', key: 't1', author: 'Growth Guru', handle: '@growthguru', snippet: 'I found a Claude prompt that writes a month of content in 10 minutes. The prompt is in the replies 👇', reasonId: 'engagement_bait', reasons: [{ id: 'engagement_bait', label: 'Engagement bait', value: 0.99 }], at: now - 60e3 },
      { platform: 'x', key: 't2', author: 'Daily Goals', handle: '@dailygoals', snippet: 'What a finish in the derby last night. Three points and top of the table!', reasonId: 'manual', manual: true, reasons: [{ id: 'manual', label: 'Hidden by you', value: 1 }], at: now - 90e3 },
      { platform: 'linkedin', key: 'l3', author: 'Mark T.', snippet: "In today's fast-paced digital landscape, leadership isn't about having all the answers — it's about asking the right questions. 🚀 Embrace uncertainty", reasonId: 'ai_generated', reasons: [{ id: 'ai_generated', label: 'AI-generated writing', value: 1 }], at: now - 120e3 },
      { platform: 'x', key: 't4', author: 'AI Daily Brief', handle: '@aidailybrief', snippet: 'AI news you missed this week 🧵 1. OpenAI released a new reasoning model 2. Google updated Gemini', reasonId: 'news_rehash', reasons: [{ id: 'news_rehash', label: 'Recycled news', value: 0.93 }], fixed: 'shown', at: now - 300e3 },
      { platform: 'x', key: 't5', author: 'Some Account', handle: '@someaccount', snippet: 'gm frens, huge alpha dropping tonight', reasonId: 'country', reasons: [{ id: 'country', label: 'Based in 🇨🇦 Canada', value: 1 }], at: now - 400e3 },
      { platform: 'linkedin', key: 'l6', author: 'Chad W.', snippet: 'Yesterday I fired my best salesperson. He hit 200% of quota. He was loved by clients.', reasonId: 'hollow_inspiration', reasons: [{ id: 'hollow_inspiration', label: 'Broetry & humblebrags', value: 0.95 }], at: now - 600e3 },
    ],
  };

  demo.learning = {
    enabled: true,
    hidden: 9,
    kept: 5,
    examples: 11,
    suggestions: [
      { type: 'enable', id: 'politics', label: 'Politics', n: 3 },
      { type: 'allow', key: 'x:@rustlang', account: '@rustlang', label: '@rustlang', n: 2 },
    ],
    rules: [
      { id: 'learned_a', label: 'Sports', text: 'Sports: games, teams, athletes, scores, transfers and betting', topic: 'sports', status: 'active', hides: 3, keeps: 1, hits: 27, examples: { hide: 3, keep: 1 } },
      { id: 'learned_b', label: 'Posts about my old company', text: 'Posts about my old company', status: 'active', hides: 1, keeps: 0, hits: 4, examples: { hide: 1, keep: 0 } },
      { id: 'learned_c', label: 'Crypto & web3', text: 'Crypto, NFTs, web3 and blockchain', topic: 'crypto', status: 'learning', hides: 1, keeps: 0, hits: 0, examples: { hide: 1, keep: 0 } },
    ],
    adjusted: [
      { id: 'engagement_bait', label: 'Engagement bait', base: 0.8, learned: 0.87, hidden: 0, kept: 3 },
      { id: 'clickbait', label: 'Clickbait hooks', base: 0.8, learned: 0.7, hidden: 2, kept: 0 },
    ],
    authors: [{ key: 'x:@growthguru', label: '@growthguru' }],
  };

  async function demoResponse(msg) {
    if (msg.type === 'stats:get') {
      const { apiKey } = await area('local').get('apiKey');
      return { ok: true, result: { ...demo, lastError: null, hasKey: Boolean(apiKey), cached: { posts: 1843, accounts: 322 }, learning: { corrections: 14, filters: 2 } } };
    }
    if (msg.type === 'learning:get') return { ok: true, result: demo.learning };
    if (msg.type === 'learning:export') return { ok: true, result: { format: 'deslop-feedback', exported: new Date().toISOString().slice(0, 10), feedback: [] } };
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
