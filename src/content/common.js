// Shared content-script engine. Platform adapters (x.js, linkedin.js) tell it
// how to find posts, extract them and look up author locations; the engine
// handles classification, the country filter and hiding.
(() => {
  if (globalThis.__deslop) return;
  const D = (globalThis.__deslop = {});

  const PENDING_MAX_MS = 4000; // never keep a post blurred longer than this
  const GEO_WAIT_MS = 1500; // wait this long for a location before revealing

  D.state = { settings: null, hasKey: false, overrides: {} }; // overrides: your own hide/unhide per post
  const OVERRIDES_KEY = 'learning:overrides'; // see src/lib/feedback.js

  // D.state.overrides is what storage says, plus decisions you made in this
  // tab that storage hasn't caught up with yet (null: removed). Those win until
  // storage agrees, so an unrelated write landing first can't undo them.
  let storedOverrides = {};
  const pendingOverrides = new Map();
  function syncOverrides() {
    for (const [id, v] of pendingOverrides) {
      if ((storedOverrides[id]?.a || null) === (v?.a || null)) pendingOverrides.delete(id);
    }
    const out = { ...storedOverrides };
    for (const [id, v] of pendingOverrides) {
      if (v) out[id] = v;
      else delete out[id];
    }
    return (D.state.overrides = out);
  }
  D.storeOverrides = (stored) => {
    storedOverrides = stored || {};
    return syncOverrides();
  };
  D.expectOverride = (id, value) => {
    pendingOverrides.set(id, value || null);
    return syncOverrides();
  };

  D.send = (type, payload = {}) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: 'No response' });
        });
      } catch (err) {
        // The extension was reloaded; this content script is orphaned.
        resolve({ ok: false, error: err.message });
      }
    });

  D.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  D.waitFor = async (find, timeoutMs = 1500, stepMs = 50) => {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const found = find();
      if (found || Date.now() > until) return found || null;
      await D.sleep(stepMs);
    }
  };

  // The "Ad" / "Promoted" label X and LinkedIn show, in the languages their
  // interfaces are offered in, so "Hide promoted posts" works whatever
  // language you use them in.
  const AD_LABELS = new Set(
    [
      'Ad', 'Ads', 'Promoted', 'Sponsored',
      'Anuncio', 'Promocionado', 'Patrocinado', 'Anúncio', 'Promovido',
      'Publicité', 'Sponsorisé', 'Annonce', 'Promu',
      'Werbung', 'Anzeige', 'Gesponsert',
      'Annuncio', 'Pubblicità', 'Sponsorizzato', 'Promosso',
      'Advertentie', 'Gesponsord', 'Gepromoot',
      'Reklama', 'Sponsorowane', 'Promowane', 'Sponzorováno', 'Sponzorované',
      'Annons', 'Sponsrad', 'Reklame', 'Annonse', 'Sponset', 'Sponsoreret', 'Mainos', 'Sponsoroitu',
      'Reklam', 'Sponsorlu', 'Tanıtılan',
      'Реклама', 'Спонсировано', 'Продвигается', 'Спонсорується',
      'Reclamă', 'Sponsorizat', 'Promovat', 'Hirdetés', 'Szponzorált',
      'Διαφήμιση', 'Χορηγούμενη', 'מודעה', 'ממומן', 'إعلان', 'ممول', 'مُموَّل', 'مروّج',
      'विज्ञापन', 'प्रायोजित', 'प्रचारित', 'বিজ্ঞাপন',
      'Iklan', 'Bersponsor', 'Dipromosikan', 'Ditaja', 'Quảng cáo', 'Được tài trợ',
      'โฆษณา', 'ได้รับการสนับสนุน', 'Na-promote',
      '広告', 'プロモーション', '광고', '프로모션', '广告', '廣告', '推广', '推廣', '已推广', '赞助', '贊助',
    ].map((l) => l.toLowerCase()),
  );
  D.isAdLabel = (text) => AD_LABELS.has((text || '').trim().toLowerCase());

  D.hash = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  };

  // innerText drops <img alt> emoji (X renders emoji as images) and is empty
  // for off-screen nodes, so walk the DOM instead.
  D.textOf = (el) => {
    if (!el) return '';
    let out = '';
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) out += c.nodeValue;
        else if (c.nodeName === 'IMG') out += c.getAttribute('alt') || '';
        else if (c.nodeName === 'BR') out += '\n';
        else if (c.nodeType === Node.ELEMENT_NODE) {
          // X wraps @mentions in inline <div>s, so only real paragraphs break lines.
          const block = /^(P|LI|BLOCKQUOTE)$/.test(c.nodeName);
          if (block && out && !out.endsWith('\n')) out += '\n';
          walk(c);
        }
      }
    };
    walk(el);
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };

  // A serial queue with spacing between tasks, for rate-limited lookups.
  D.createQueue = ({ spacingMs = 500, maxLength = 200 } = {}) => {
    const items = [];
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      while (items.length) {
        const { task, resolve } = items.shift();
        try {
          resolve(await task());
        } catch {
          resolve(undefined);
        }
        await D.sleep(spacingMs);
      }
      running = false;
    };
    return (task) =>
      new Promise((resolve) => {
        items.push({ task, resolve });
        while (items.length > maxLength) items.shift().resolve(undefined);
        run();
      });
  };

  D.loadSettings = async () => {
    const res = await D.send('settings:get');
    if (res.ok) {
      const { overrides, ...rest } = res.result;
      Object.assign(D.state, rest);
      D.storeOverrides(overrides);
    }
    return D.state;
  };

  D.createEngine = (adapter) => {
    const platform = adapter.platform;
    const tracked = new Map(); // post element -> post key currently rendered
    const posts = new WeakMap(); // post element -> extracted post
    const owners = new WeakMap(); // container -> post element
    const noButton = new WeakSet(); // posts that never get a hide button (your own)
    const decisions = new Map(); // post key -> decision (instant re-render after virtualization)
    const geoMemo = new Map(); // place key -> Promise<geo verdict>
    const reported = new Set();
    let scanScheduled = false;

    const settings = () => D.state.settings;
    const active = () => settings()?.enabled && settings()?.platforms?.[platform];
    const mine = (key) => D.state.overrides?.[`${platform}:${key}`];
    const setMine = (key, value) => D.expectOverride(`${platform}:${key}`, value);

    function scheduleScan() {
      if (scanScheduled) return;
      scanScheduled = true;
      setTimeout(() => {
        scanScheduled = false;
        scan();
      }, 120);
    }

    function scan() {
      for (const el of tracked.keys()) if (!el.isConnected) tracked.delete(el);
      if (!active()) return;
      for (const el of adapter.findPosts()) processPost(el);
    }

    async function processPost(el) {
      let post;
      try {
        post = adapter.extract(el);
      } catch {
        return;
      }
      if (!post) return;
      if (tracked.get(el) === post.key) return ensureButton(el);
      tracked.set(el, post.key);
      posts.set(el, post);

      const container = adapter.container(el);
      owners.set(container, el);
      clear(container);
      if (adapter.skip(post, el)) {
        noButton.add(el);
        return ensureButton(el);
      }
      noButton.delete(el);
      ensureButton(el);

      // Your own decision about this post comes first.
      const own = mine(post.key);
      if (own?.a === 'h') {
        const known = decisions.get(post.key);
        return render(el, container, post, known?.manual ? known : manualDecision(own.r));
      }
      if (own?.a === 's' || isAllowlisted(post)) return;

      const known = decisions.get(post.key);
      if (known) return render(el, container, post, known);

      const blur = settings().hideWhileChecking && D.state.hasKey;
      if (blur) {
        container.dataset.deslop = 'pending';
        setTimeout(() => {
          if (tracked.get(el) === post.key && container.dataset.deslop === 'pending') delete container.dataset.deslop;
        }, PENDING_MAX_MS);
      }

      // Slop check first. Location lookups are rate-limited (X) or may count as
      // a profile view (LinkedIn), so they only run for posts that survive it.
      const textRes = await D.send('classify', { post });
      if (tracked.get(el) !== post.key || mine(post.key)) return; // you hid or unhid it meanwhile

      let decision = { hide: false, reasons: [] };
      let geo = null;
      let quickGeo = null;
      if (textRes.ok && textRes.result.hide) {
        decision = textRes.result.manual
          ? manualDecision()
          : { hide: true, reasons: textRes.result.reasons };
      } else {
        geo = countryCheck(post);
        quickGeo = await Promise.race([geo, D.sleep(GEO_WAIT_MS).then(() => 'slow')]);
        if (tracked.get(el) !== post.key || mine(post.key)) return;
        if (quickGeo && quickGeo !== 'slow' && quickGeo.blocked) decision = countryDecision(quickGeo);
      }

      decisions.set(post.key, decision);
      render(el, container, post, decision);

      if (!decision.hide && quickGeo === 'slow') {
        geo.then((g) => {
          if (!g?.blocked || tracked.get(el) !== post.key || mine(post.key)) return;
          const late = countryDecision(g);
          decisions.set(post.key, late);
          render(el, container, post, late);
        });
      }
    }

    function countryDecision(g) {
      return { hide: true, reasons: [{ id: 'country', label: `Based in ${g.label}`, value: 1 }] };
    }

    function countryCheck(post) {
      const c = settings().countries;
      const enabledHere = platform === 'x' ? c.onX : c.onLinkedIn;
      if (!c.blocked.length || !enabledHere || !adapter.placeKey) return Promise.resolve(null);
      const key = adapter.placeKey(post);
      if (!key) return Promise.resolve(null);
      if (!geoMemo.has(key)) {
        geoMemo.set(
          key,
          (async () => {
            const cached = await D.send('geo:get', { platform, key });
            if (cached.ok && cached.result.hit) return cached.result;
            const raw = await adapter.lookupPlace(post);
            if (raw === undefined) {
              geoMemo.delete(key); // lookup failed or was deferred; try again later
              return null;
            }
            const put = await D.send('geo:put', { platform, key, raw });
            return put.ok ? put.result : null;
          })(),
        );
      }
      return geoMemo.get(key);
    }

    function render(el, container, post, decision) {
      clear(container);
      if (!decision.hide || hiddenElsewhere(el)) return;
      // Ad blockers can hide a post a moment after it appears.
      setTimeout(() => {
        if (tracked.get(el) !== post.key || !container.dataset.deslop || !hiddenElsewhere(el)) return;
        clear(container);
        tracked.delete(el); // look again if the post comes back
      }, 1000);
      const ctx = { el, container, post, decision };
      if (decision.revealed) return reveal(ctx);

      if (!reported.has(post.key)) {
        reported.add(post.key);
        const top = decision.reasons[0];
        // Posts you hid yourself are recorded when you hide them.
        if (!decision.manual) {
          D.send('hidden', {
            entry: {
              platform,
              key: post.key,
              author: post.author?.name || post.author?.handle || '',
              handle: post.author?.handle || post.author?.slug || '',
              snippet: (post.text || '').slice(0, 160),
              url: post.url || '',
              reasonId: top?.id?.startsWith('custom_') ? 'custom' : top?.id,
              reasons: decision.reasons.map((r) => ({ id: r.id, label: r.label, value: r.value })),
            },
          });
        }
        adapter.onHidden?.(el, post, decision);
      }

      // A post you just hid keeps its bar, so you can say why or undo it.
      if (settings().hideMode === 'collapse' || decision.fresh) return decision.manual ? showManual(ctx) : collapse(ctx);
      container.dataset.deslop = 'hidden';
    }

    // Placeholder bar with a Show button. Show and Hide again only change
    // data-deslop once each, so the post doesn't flicker.
    function collapse(ctx) {
      const { container, decision } = ctx;
      container.dataset.deslop = 'collapsed';
      setBar(container, {
        text: `Deslop hid a post — ${why(decision)}`,
        actions: [
          {
            label: 'Show',
            onClick: () => {
              decision.revealed = true;
              reveal(ctx);
            },
          },
        ],
      });
    }

    // A post you chose to see: marked so it stands out from the feed, with a
    // button to hide it again, or to unhide it for good and teach Deslop.
    function reveal(ctx) {
      const { container, decision } = ctx;
      container.dataset.deslop = 'revealed';
      setBar(container, {
        tag: 'Shown',
        text: `Deslop hid this — ${why(decision)}`,
        actions: [
          {
            label: 'Hide again',
            onClick: () => {
              decision.revealed = false;
              collapse(ctx);
            },
          },
          { label: 'Unhide', title: "Keep this post visible and teach Deslop it shouldn't have hidden it", onClick: () => unhide(ctx) },
        ],
      });
    }

    // ── Hiding and unhiding posts yourself ──────────────────────────────────
    // Each one is sent to the background as feedback (src/lib/learn.js), which
    // works out why and learns from it.

    function manualDecision(label = '') {
      return { hide: true, manual: true, reasons: [{ id: 'manual', label: 'Hidden by you', value: 1 }], message: label };
    }

    const showing = (ctx) => tracked.get(ctx.el) === ctx.post.key && decisions.get(ctx.post.key) === ctx.decision;

    async function hideByUser(el) {
      const post = posts.get(el);
      if (!post || tracked.get(el) !== post.key || mine(post.key)?.a === 'h') return;
      const container = adapter.container(el);
      const prev = decisions.get(post.key);
      const decision = { ...manualDecision('Learning why…'), fresh: true, prev: prev?.hide ? null : prev };
      const ctx = { el, container, post, decision };
      setMine(post.key, { a: 'h' });
      decisions.set(post.key, decision);
      render(el, container, post, decision);

      const res = await D.send('feedback:hide', { post });
      if (decisions.get(post.key) !== decision) return; // undone meanwhile
      if (!res.ok) decision.message = `Hidden, but Deslop couldn't save it (${res.error})`;
      else if (!res.result.gone) Object.assign(decision, { reason: res.result.reason, options: res.result.options, message: res.result.message });
      if (showing(ctx)) showManual(ctx);
    }

    function showManual(ctx) {
      const { container, decision } = ctx;
      if (container.dataset.deslop !== 'collapsed') container.dataset.deslop = 'collapsed';
      let extra = {};
      if (decision.fresh && decision.editing) {
        extra = {
          input: {
            onSubmit: (text) => {
              decision.editing = false;
              pickReason(ctx, { kind: 'other', text });
            },
            onCancel: () => {
              decision.editing = false;
              showManual(ctx);
            },
          },
        };
      } else if (decision.fresh && decision.options?.length) {
        extra = { chips: { options: decision.options, selected: decision.reason, onPick: (opt) => pickReason(ctx, opt) } };
      }
      setBar(container, {
        tag: 'Hidden by you',
        text: decision.message || '',
        actions: [{ label: 'Undo', title: 'Show this post again and forget you hid it', onClick: () => undoHide(ctx) }],
        ...extra,
      });
    }

    async function pickReason(ctx, opt) {
      const { post, decision } = ctx;
      if (opt.kind === 'other' && !opt.text) {
        decision.editing = true;
        return showManual(ctx);
      }
      decision.message = 'Learning…';
      if (opt.kind !== 'other') decision.reason = opt;
      showManual(ctx);
      const res = await D.send('feedback:reason', { platform, key: post.key, reason: opt });
      // Turning a filter on reloads settings and re-renders the feed, so the
      // decision is updated even while it's off screen.
      if (decisions.get(post.key) !== decision) return;
      if (!res.ok) decision.message = `Couldn't save that (${res.error})`;
      else if (!res.result.gone) {
        const { reason, message } = res.result;
        if (!decision.options.some((o) => o.kind === reason.kind && o.id === reason.id)) decision.options.unshift(reason);
        Object.assign(decision, { reason, message });
      }
      if (showing(ctx)) showManual(ctx);
    }

    // Back to how the post was: shown, hidden by Deslop, or unhidden by you.
    async function undoHide(ctx) {
      const { el, container, post, decision } = ctx;
      const id = `${platform}:${post.key}`;
      reported.delete(post.key); // so it's recorded if Deslop hides it later
      setMine(post.key, decision.prev?.kept ? { a: 's' } : null);
      if (decision.prev) {
        decisions.set(post.key, decision.prev);
        render(el, container, post, decision.prev);
        const res = await D.send('feedback:undo', { platform, key: post.key });
        if (res.ok) D.expectOverride(id, res.result.now);
        return;
      }
      // Hidden on an earlier visit: judge the post again once Deslop forgets.
      decisions.delete(post.key);
      clear(container);
      const res = await D.send('feedback:undo', { platform, key: post.key });
      if (res.ok) D.expectOverride(id, res.result.now);
      if (tracked.get(el) === post.key) tracked.delete(el);
      scheduleScan();
    }

    async function unhide(ctx) {
      const { post, decision } = ctx;
      const kept = { hide: false, kept: true, prev: decision, message: 'Unhidden. Learning…' };
      const kctx = { ...ctx, decision: kept };
      setMine(post.key, { a: 's' });
      decisions.set(post.key, kept);
      showKept(kctx);
      const fired = decision.reasons.map(({ id, label, value }) => ({ id, label, value }));
      const res = await D.send('feedback:show', { platform, key: post.key, post, fired });
      if (decisions.get(post.key) !== kept) return;
      kept.message = res.ok ? res.result.message : `Unhidden, but Deslop couldn't save it (${res.error})`;
      if (showing(kctx)) showKept(kctx);
    }

    function showKept(ctx) {
      const { container, decision } = ctx;
      if (container.dataset.deslop !== 'kept') container.dataset.deslop = 'kept';
      setBar(container, {
        tag: 'Unhidden',
        text: decision.message,
        actions: [{ label: 'Undo', title: 'Let Deslop hide this post again', onClick: () => undoUnhide(ctx) }],
      });
    }

    function undoUnhide(ctx) {
      const { el, container, post, decision } = ctx;
      setMine(post.key, null);
      const prev = { ...decision.prev, revealed: false };
      decisions.set(post.key, prev);
      render(el, container, post, prev);
      D.send('feedback:undo', { platform, key: post.key });
    }

    // You changed a decision elsewhere (the popup's "Recently hidden" list).
    function applyOverrides(before, after) {
      for (const [el, key] of tracked) {
        const id = `${platform}:${key}`;
        if (before[id]?.a === after[id]?.a) continue;
        const post = posts.get(el);
        const container = adapter.container(el);
        if (after[id]?.a === 'h') {
          const d = manualDecision(after[id].r);
          decisions.set(key, d);
          render(el, container, post, d);
        } else if (after[id]?.a === 's') {
          decisions.set(key, { hide: false, reasons: [] });
          clear(container);
        } else {
          decisions.delete(key);
          tracked.delete(el); // judge it again
        }
      }
      scheduleScan();
    }

    // ── The hide button ─────────────────────────────────────────────────────
    // On every post, shown when you hover it. It sits just left of the buttons
    // in the post's top right (X's ⋯ and Grok; LinkedIn's ⋯, ✕ and Follow),
    // wherever those are, so it never covers them.

    function ensureButton(el) {
      const container = adapter.container(el);
      const existing = container.querySelector(':scope > .deslop-hide-btn');
      if (noButton.has(el) || settings()?.learning?.hideButton === false) return existing?.remove();
      if (existing) return;
      if (getComputedStyle(container).position === 'static') container.dataset.deslopHost = 'relative';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deslop-hide-btn';
      btn.title = 'Hide this post. Deslop learns from it.';
      btn.setAttribute('aria-label', 'Hide this post (Deslop)');
      btn.append(hideIcon());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideByUser(owners.get(container));
      });
      btn.addEventListener('focus', () => place(container));
      container.addEventListener('pointerenter', () => place(container));
      container.append(btn);
    }

    function removeButtons() {
      for (const el of tracked.keys()) adapter.container(el).querySelector(':scope > .deslop-hide-btn')?.remove();
    }

    function place(container) {
      const btn = container.querySelector(':scope > .deslop-hide-btn');
      const el = owners.get(container);
      if (!btn || !el) return;
      const spot = headerSpot(el, container);
      btn.style.top = spot ? `${spot.top}px` : '';
      btn.style.right = spot ? `${spot.right}px` : '';
    }

    function headerSpot(el, container) {
      const c = container.getBoundingClientRect();
      const body = adapter.body?.(el)?.getBoundingClientRect();
      const bottom = body?.height ? body.top : c.top + 80;
      let left = Infinity;
      let middle = null;
      for (const b of el.querySelectorAll('button, [role="button"]')) {
        if (b.closest('.deslop-bar, .deslop-hide-btn')) continue;
        const r = b.getBoundingClientRect();
        if (!r.width || r.bottom > bottom + 2 || r.left < c.left + c.width / 2) continue;
        if (r.left < left) {
          left = r.left;
          middle = r.top + r.height / 2;
        }
      }
      if (middle === null) return null;
      return { top: Math.max(0, Math.round(middle - c.top - 15)), right: Math.max(0, Math.round(c.right - left + 6)) };
    }

    // ── Bars ────────────────────────────────────────────────────────────────

    // A bar at the top of a post: a message, its buttons, and optionally a row
    // of reasons to pick from or a field for your own.
    function setBar(container, { tag, text, actions = [], chips = null, input = null }) {
      container.querySelectorAll(':scope > .deslop-bar').forEach((b) => b.remove());
      const bar = document.createElement('div');
      bar.className = 'deslop-bar';
      const msg = document.createElement('span');
      msg.className = 'deslop-msg';
      if (tag) {
        const pill = document.createElement('b');
        pill.className = 'deslop-tag';
        pill.textContent = tag;
        msg.append(pill, ' ');
      }
      msg.append(text);
      const buttons = document.createElement('span');
      buttons.className = 'deslop-actions';
      for (const a of actions) buttons.append(barButton(a.label, a.onClick, a.title));
      bar.append(msg, buttons);
      if (chips) bar.append(reasonChips(chips));
      if (input) bar.append(reasonInput(input));
      container.prepend(bar);
    }

    function barButton(label, onClick, title) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (title) btn.title = title;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return btn;
    }

    const CHIP_TITLES = {
      category: 'Hide more posts like this',
      rule: 'Learn a filter for posts like this',
      author: 'Hide every post from this account',
      post: "Hide only this post; don't learn from it",
      other: 'Describe in your own words what to hide',
    };

    function reasonChips({ options, selected, onPick }) {
      const row = document.createElement('div');
      row.className = 'deslop-chips';
      const label = document.createElement('span');
      label.textContent = 'Why?';
      row.append(label);
      for (const opt of [...options, { kind: 'other', id: 'other', label: 'Other…' }]) {
        const title = opt.off ? 'Turn this filter on and hide posts like this' : CHIP_TITLES[opt.kind];
        const chip = barButton(opt.off ? `${opt.label} (off)` : opt.label, () => onPick(opt), title);
        chip.className = 'deslop-chip';
        chip.setAttribute('aria-pressed', String(selected?.kind === opt.kind && selected?.id === opt.id));
        row.append(chip);
      }
      return row;
    }

    function reasonInput({ onSubmit, onCancel }) {
      const form = document.createElement('form');
      form.className = 'deslop-chips deslop-other';
      const field = document.createElement('input');
      field.type = 'text';
      field.maxLength = 200;
      field.placeholder = 'Describe posts to hide, e.g. "Posts about my old company"';
      field.setAttribute('aria-label', 'What should Deslop hide?');
      // Keep X's and LinkedIn's keyboard shortcuts out of the field.
      for (const type of ['keydown', 'keyup', 'keypress', 'click', 'paste']) field.addEventListener(type, (e) => e.stopPropagation());
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Save';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (field.value.trim()) onSubmit(field.value.trim());
      });
      form.addEventListener('click', (e) => e.stopPropagation());
      form.append(field, save, barButton('Cancel', onCancel));
      setTimeout(() => field.focus());
      return form;
    }

    function why(decision) {
      return decision.reasons
        .slice(0, 2)
        .map((r) => (r.id === 'country' || r.value >= 1 ? r.label : `${r.label} ${Math.round(r.value * 100)}%`))
        .join(' · ');
    }

    // True when something other than Deslop (an ad blocker such as uBlock
    // Origin) already hides or removed the post's content. Such posts get no
    // bar and aren't counted: there's nothing left for Deslop to hide.
    // Deslop's own hiding is switched off for the check (deslop-probe in
    // content.css) without touching the post, so nothing watching it sees a change.
    function hiddenElsewhere(el) {
      const root = document.documentElement;
      root.classList.add('deslop-probe');
      const body = adapter.content ? adapter.content(el) : el;
      const gone = !body || !body.getClientRects().length;
      root.classList.remove('deslop-probe');
      return gone;
    }

    function clear(container) {
      delete container.dataset.deslop;
      container.querySelectorAll(':scope > .deslop-bar').forEach((b) => b.remove());
    }

    function isAllowlisted(post) {
      const list = settings()?.allowlist || [];
      if (!list.length) return false;
      const ids = [post.author?.handle, post.author?.slug, post.author?.name]
        .filter(Boolean)
        .map((s) => s.toLowerCase().replace(/^@/, ''));
      return list.some((a) => ids.includes(a.toLowerCase().trim().replace(/^@/, '')));
    }

    // Forget everything, as a page reload would.
    function reset() {
      rejudge();
      decisions.clear();
    }

    // Settings changed: judge every post again. Your own decisions don't depend
    // on settings, so they're kept, along with a bar you may be using (picking
    // a reason that turns a filter on changes settings).
    function rejudge() {
      for (const el of tracked.keys()) clear(adapter.container(el));
      if (!active()) removeButtons();
      tracked.clear();
      for (const [key, d] of decisions) if (!d.manual && !d.kept) decisions.delete(key);
      geoMemo.clear();
    }

    D.onSettingsChanged = () => {
      rejudge();
      scheduleScan();
    };

    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' && changes.settings) || (area === 'local' && changes.apiKey)) {
        D.loadSettings().then(() => D.onSettingsChanged());
      } else if (area === 'local' && changes[OVERRIDES_KEY]) {
        const before = D.state.overrides || {};
        applyOverrides(before, D.storeOverrides(changes[OVERRIDES_KEY].newValue));
      }
    });

    D.loadSettings().then(() => {
      new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
      scan();
    });

    return { scan, reset };
  };

  // Eye with a slash, built with DOM APIs (no innerHTML in page contexts).
  function hideIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
      svg.setAttribute(k, v);
    }
    for (const d of [
      'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
      'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
      'M14.12 14.12a3 3 0 1 1-4.24-4.24',
      'M1 1l22 22',
    ]) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }
})();
