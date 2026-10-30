// Shared content-script engine. Platform adapters (x.js, linkedin.js) tell it
// how to find posts, extract them and look up author locations; the engine
// handles classification, the country filter and hiding.
(() => {
  if (globalThis.__deslop) return;
  const D = (globalThis.__deslop = {});

  const PENDING_MAX_MS = 4000; // never keep a post blurred longer than this
  const GEO_WAIT_MS = 1500; // wait this long for a location before revealing

  D.state = { settings: null, hasKey: false };

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
    const geoMemo = new Map(); // place key -> Promise<geo verdict>
    const reported = new Set();
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
      if (tracked.get(el) === post.key) return;
      tracked.set(el, post.key);

      const container = adapter.container(el);
      clear(container);
      if (adapter.skip(post, el) || isAllowlisted(post)) return;

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
      if (tracked.get(el) !== post.key) return;

      let decision = { hide: false, reasons: [] };
      let geo = null;
      let quickGeo = null;
      if (textRes.ok && textRes.result.hide) {
        decision = { hide: true, reasons: textRes.result.reasons };
      } else {
        geo = countryCheck(post);
        quickGeo = await Promise.race([geo, D.sleep(GEO_WAIT_MS).then(() => 'slow')]);
        if (tracked.get(el) !== post.key) return;
        if (quickGeo && quickGeo !== 'slow' && quickGeo.blocked) decision = countryDecision(quickGeo);
      }

      decisions.set(post.key, decision);
      render(el, container, post, decision);

      if (!decision.hide && quickGeo === 'slow') {
        geo.then((g) => {
          if (!g?.blocked || tracked.get(el) !== post.key) return;
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
      if (!decision.hide) return;
      if (decision.revealed) return reveal(container, decision);

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

      if (settings().hideMode === 'collapse') collapse(container, decision);
      else container.dataset.deslop = 'hidden';
    }

    // Placeholder bar with a Show button. Show and Hide again only change
    // data-deslop once each, so the post doesn't flicker.
    function collapse(container, decision) {
      container.dataset.deslop = 'collapsed';
      setBar(container, null, `Deslop hid a post — ${why(decision)}`, 'Show', () => {
        decision.revealed = true;
        reveal(container, decision);
      });
    }

    // A post the user chose to see: marked so it stands out from the feed,
    // with a button to hide it again.
    function reveal(container, decision) {
      container.dataset.deslop = 'revealed';
      setBar(container, 'Shown', `Deslop hid this — ${why(decision)}`, 'Hide again', () => {
        decision.revealed = false;
        collapse(container, decision);
      });
    }

    function setBar(container, tag, text, label, onClick) {
      container.querySelectorAll(':scope > .deslop-bar').forEach((b) => b.remove());
      const bar = document.createElement('div');
      bar.className = 'deslop-bar';
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
      container.prepend(bar);
    }

    function why(decision) {
      return decision.reasons
        .slice(0, 2)
        .map((r) => (r.id === 'country' || r.value >= 1 ? r.label : `${r.label} ${Math.round(r.value * 100)}%`))
        .join(' · ');
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

    function reset() {
      for (const el of tracked.keys()) clear(adapter.container(el));
      tracked.clear();
      decisions.clear();
      geoMemo.clear();
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
      new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
      scan();
    });

    return { scan, reset };
  };
})();
