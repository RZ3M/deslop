// Shared content-script engine. Platform adapters (x.js, linkedin.js,
// reddit.js) tell it how to find posts, extract them and look up authors; the
// engine handles classification, the account checks and hiding.
(() => {
  if (globalThis.__deslop) return;
  const D = (globalThis.__deslop = {});

  const PENDING_MAX_MS = 4000; // never keep a post blurred longer than this
  const ACCOUNT_WAIT_MS = 1500; // wait this long for the account checks before revealing

  D.state = { settings: null, ready: false };

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
    if (res.ok) Object.assign(D.state, res.result);
    return D.state;
  };

  D.createEngine = (adapter) => {
    const platform = adapter.platform;
    const tracked = new Map(); // post element -> post key currently rendered
    const decisions = new Map(); // post key -> decision (instant re-render after virtualization)
    const lookups = new Map(); // "geo:key" or "profile:key" -> Promise<verdict>
    const reported = new Set();
    const outsideBars = new WeakMap(); // container -> its bar, when bars go outside posts
    const unseen = new Set(); // posts to hide that something else hides for now (an ad blocker, a collapsed thread)
    let scanScheduled = false;

    const settings = () => D.state.settings;
    const active = () => settings()?.enabled && settings()?.platforms?.[platform];

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
      recheckUnseen();
      for (const el of adapter.findPosts()) processPost(el);
    }

    // A post that comes into view (a reply in a thread you expand) is looked at again.
    function recheckUnseen() {
      if (!unseen.size) return;
      for (const el of unseen) {
        if (!el.isConnected) unseen.delete(el);
        else if (!hiddenElsewhere(el)) {
          unseen.delete(el);
          tracked.delete(el);
        }
      }
    }

    async function processPost(el) {
      let post;
      try {
        post = adapter.extract(el);
      } catch {
        return;
      }
      if (!post) return;
      if (tracked.get(el) === post.key) return;
      tracked.set(el, post.key);

      const container = adapter.container(el);
      clear(el, container);
      if (adapter.skip(post, el) || isAllowlisted(post)) return;

      const known = decisions.get(post.key);
      if (known) return render(el, container, post, known);

      const blur = settings().hideWhileChecking && D.state.ready;
      if (blur) {
        container.dataset.deslop = 'pending';
        setTimeout(() => {
          if (tracked.get(el) === post.key && container.dataset.deslop === 'pending') delete container.dataset.deslop;
        }, PENDING_MAX_MS);
      }

      // Slop check first. Account lookups are rate-limited (X, Reddit) or may
      // count as a profile view (LinkedIn), so they only run for posts that
      // survive it.
      const textRes = await D.send('classify', { post });
      if (tracked.get(el) !== post.key) return;

      let decision = { hide: false, reasons: [] };
      let account = null;
      let quick = null;
      if (textRes.ok && textRes.result.hide) {
        decision = { hide: true, reasons: textRes.result.reasons };
      } else {
        account = firstBlock([countryCheck(post), profileCheck(post)]);
        quick = await Promise.race([account, D.sleep(ACCOUNT_WAIT_MS).then(() => 'slow')]);
        if (tracked.get(el) !== post.key) return;
        if (quick && quick !== 'slow') decision = quick;
      }

      decisions.set(post.key, decision);
      render(el, container, post, decision);

      if (!decision.hide && quick === 'slow') {
        account.then((late) => {
          if (!late || tracked.get(el) !== post.key) return;
          decisions.set(post.key, late);
          render(el, container, post, late);
        });
      }
    }

    // The first account check to hide the post, or null once none does.
    function firstBlock(checks) {
      return new Promise((resolve) => {
        let left = checks.length;
        const done = (d) => (d ? resolve(d) : --left || resolve(null));
        checks.forEach((c) => c.then(done, () => done(null)));
      });
    }

    function countryCheck(post) {
      const c = settings().countries;
      const enabledHere = { x: c.onX, linkedin: c.onLinkedIn }[platform];
      if (!c.blocked.length || !enabledHere || !adapter.placeKey) return Promise.resolve(null);
      const key = adapter.placeKey(post);
      if (!key) return Promise.resolve(null);
      return lookup('geo', key, () => adapter.lookupPlace(post)).then((g) =>
        g?.blocked ? { hide: true, reasons: [{ id: 'country', label: `Based in ${g.label}`, value: 1 }] } : null,
      );
    }

    // Rules about the author's profile (Reddit: OnlyFans links, new NSFW
    // accounts). The adapter decides which authors are worth a lookup.
    function profileCheck(post) {
      const key = adapter.profileKey?.(post);
      if (!key) return Promise.resolve(null);
      return lookup('profile', key, () => adapter.lookupProfile(post)).then((p) =>
        p?.blocked ? { hide: true, reasons: [{ id: 'porn_bot', label: p.label, value: 1 }] } : null,
      );
    }

    // Raw account facts are cached by the background (which turns them into a
    // verdict under the current settings); each one is looked up once per page.
    function lookup(kind, key, fetchRaw) {
      const id = `${kind}:${key}`;
      if (!lookups.has(id)) {
        lookups.set(
          id,
          (async () => {
            const cached = await D.send(`${kind}:get`, { platform, key });
            if (cached.ok && cached.result.hit) return cached.result;
            const raw = await fetchRaw();
            if (raw === undefined) {
              lookups.delete(id); // lookup failed or was deferred; try again later
              return null;
            }
            const put = await D.send(`${kind}:put`, { platform, key, raw });
            return put.ok ? put.result : null;
          })(),
        );
      }
      return lookups.get(id);
    }

    function render(el, container, post, decision) {
      clear(el, container);
      if (!decision.hide) return;
      if (hiddenElsewhere(el)) return unseen.add(el);
      // Ad blockers can hide a post a moment after it appears.
      setTimeout(() => {
        if (tracked.get(el) !== post.key || !container.dataset.deslop || !hiddenElsewhere(el)) return;
        clear(el, container);
        tracked.delete(el); // look again if the post comes back
      }, 1000);
      const noun = adapter.noun?.(el) || 'post'; // "Deslop hid a comment"
      if (decision.revealed) return reveal(container, decision, noun);

      if (!reported.has(post.key)) {
        reported.add(post.key);
        const top = decision.reasons[0];
        D.send('hidden', {
          entry: {
            platform,
            author: post.author?.name || post.author?.handle || '',
            handle: post.author?.handle || post.author?.slug || '',
            snippet: (post.text || '').slice(0, 160),
            url: post.url || '',
            reasonId: top?.id?.startsWith('custom_') ? 'custom' : top?.id,
            reasons: decision.reasons.map((r) => ({ label: r.label, value: r.value })),
          },
        });
        adapter.onHidden?.(el, post, decision);
      }

      if (settings().hideMode === 'collapse') collapse(container, decision, noun);
      else (adapter.removeTarget?.(el) || container).dataset.deslop = 'hidden';
    }

    // Placeholder bar with a Show button. Show and Hide again only change
    // data-deslop once each, so the post doesn't flicker.
    function collapse(container, decision, noun) {
      container.dataset.deslop = 'collapsed';
      setBar(container, null, `Deslop hid a ${noun} — ${why(decision)}`, 'Show', () => {
        decision.revealed = true;
        reveal(container, decision, noun);
      });
    }

    // A post the user chose to see: marked so it stands out from the feed,
    // with a button to hide it again.
    function reveal(container, decision, noun) {
      container.dataset.deslop = 'revealed';
      container.toggleAttribute('data-deslop-dark', onDarkBackground(container));
      setBar(container, 'Shown', `Deslop hid this — ${why(decision)}`, 'Hide again', () => {
        decision.revealed = false;
        collapse(container, decision, noun);
      });
    }

    // True when the post is painted on a dark background (X's dark themes):
    // the first mostly opaque background of the post or an ancestor, through
    // shadow roots, falling back to the page's.
    function onDarkBackground(el) {
      for (let node = el; node; node = node.parentElement || node.getRootNode?.().host) {
        const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
        if (!m || (m[3] !== undefined && +m[3] < 0.5)) continue;
        const [r, g, b] = m.map(Number);
        return 0.299 * r + 0.587 * g + 0.114 * b < 128;
      }
      return false;
    }

    function setBar(container, tag, text, label, onClick) {
      removeBar(container);
      const bar = document.createElement('div');
      bar.className = tag ? 'deslop-bar deslop-revealed' : 'deslop-bar';
      const msg = document.createElement('span');
      if (tag) {
        const pill = document.createElement('b');
        pill.className = 'deslop-tag';
        pill.textContent = tag;
        msg.append(pill, ' ');
      }
      msg.append(text);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      bar.append(msg, btn);
      if (!adapter.barOutside) return container.prepend(bar);
      // Reddit's posts and comments render through shadow DOM, where a bar
      // inside them may never show. The bar goes just before the post instead,
      // in the same slot, and the post itself is hidden. It takes the post's
      // background and corners (the bottom ones: a revealed post's top ones
      // join the bar).
      container.dataset.deslopOutside = '';
      bar.classList.add('deslop-outside');
      const style = getComputedStyle(container);
      if (parseFloat(style.borderBottomLeftRadius)) bar.style.setProperty('--deslop-radius', style.borderBottomLeftRadius);
      bar.style.setProperty('--deslop-card', style.backgroundColor);
      if (container.slot) bar.slot = container.slot;
      container.before(bar);
      outsideBars.set(container, bar);
    }

    function removeBar(container) {
      container.querySelectorAll(':scope > .deslop-bar').forEach((b) => b.remove());
      outsideBars.get(container)?.remove();
      outsideBars.delete(container);
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

    function clear(el, container = adapter.container(el)) {
      delete container.dataset.deslop;
      delete container.dataset.deslopOutside;
      removeBar(container);
      const target = adapter.removeTarget?.(el);
      if (target) delete target.dataset.deslop;
    }

    // "@handle" on X, a profile slug on LinkedIn, "u/name" on Reddit.
    const accountId = (s) => s.toLowerCase().trim().replace(/^@|^\/?u\//, '');

    function isAllowlisted(post) {
      const list = settings()?.allowlist || [];
      if (!list.length) return false;
      const ids = [post.author?.handle, post.author?.slug, post.author?.name].filter(Boolean).map(accountId);
      return list.some((a) => ids.includes(accountId(a)));
    }

    function reset() {
      for (const el of tracked.keys()) clear(el);
      tracked.clear();
      unseen.clear();
      decisions.clear();
      lookups.clear();
    }

    D.onSettingsChanged = () => {
      reset();
      scheduleScan();
    };

    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' && changes.settings) || (area === 'local' && changes.apiKey)) {
        D.loadSettings().then(() => D.onSettingsChanged());
      }
    });

    D.loadSettings().then(() => {
      // Adapters can also watch attributes that show or hide posts (Reddit's collapsed threads).
      const attributes = adapter.watchAttributes ? { attributes: true, attributeFilter: adapter.watchAttributes } : {};
      new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, ...attributes });
      scan();
    });

    return { scan, reset };
  };
})();
