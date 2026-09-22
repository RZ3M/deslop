// X (Twitter) adapter.
(() => {
  const D = globalThis.__deslop;
  if (!D || D.xLoaded) return;
  D.xLoaded = true;

  // X's public web-client token (the same one x.com itself sends). Requests
  // are made from this tab with your existing session, like the About page does.
  const WEB_BEARER =
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const DEFAULT_ABOUT_QUERY_ID = 'TzOG2twZEfhr9KmClvVVqA';
  const RATE_KEY = 'x:aboutRate';
  const QUERY_ID_KEY = 'x:aboutQueryId';

  let aboutQueryId = DEFAULT_ABOUT_QUERY_ID;
  chrome.storage.local.get(QUERY_ID_KEY).then((r) => {
    if (r[QUERY_ID_KEY]) aboutQueryId = r[QUERY_ID_KEY];
  });

  // x-main-world.js watches x.com's own requests: it reports the current
  // AboutAccountQuery id and any About pages you open, which prime the cache.
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'deslop-main') return;
    const { type } = e.data;
    if (type === 'about-query-id' && /^[\w-]{10,40}$/.test(e.data.id) && e.data.id !== aboutQueryId) {
      aboutQueryId = e.data.id;
      chrome.storage.local.set({ [QUERY_ID_KEY]: aboutQueryId, 'x:aboutQueryStale': false });
    }
    if (type === 'about-result' && /^\w{1,15}$/.test(e.data.screenName || '')) {
      const raw = typeof e.data.basedIn === 'string' ? e.data.basedIn.slice(0, 80) : null;
      D.send('geo:put', { platform: 'x', key: e.data.screenName.toLowerCase(), raw });
    }
  });

  const queue = D.createQueue({ spacingMs: 350, maxLength: 150 });

  const csrfToken = () => document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];

  async function lookupPlace(post) {
    const handle = post.author?.handle?.replace(/^@/, '');
    if (!handle || !csrfToken()) return undefined; // logged out: nothing to look up with
    return queue(() => fetchAccountBasedIn(handle));
  }

  // Returns the "Account based in" string, null when X has none, or undefined
  // when the lookup could not be made (so it is retried later).
  async function fetchAccountBasedIn(handle) {
    const { [RATE_KEY]: rate } = await chrome.storage.local.get(RATE_KEY);
    if (rate && rate.remaining <= 1 && Date.now() < rate.reset * 1000) {
      await D.sleep(rate.reset * 1000 - Date.now() + 1000);
    }

    const csrf = csrfToken();
    if (!csrf) return undefined;

    const url = `/i/api/graphql/${aboutQueryId}/AboutAccountQuery?variables=${encodeURIComponent(
      JSON.stringify({ screenName: handle }),
    )}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        authorization: `Bearer ${WEB_BEARER}`,
        'x-csrf-token': csrf,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'content-type': 'application/json',
      },
    });

    const remaining = Number(res.headers.get('x-rate-limit-remaining'));
    const reset = Number(res.headers.get('x-rate-limit-reset'));
    if (Number.isFinite(remaining) && Number.isFinite(reset) && reset > 0) {
      await chrome.storage.local.set({ [RATE_KEY]: { remaining, reset } });
    }

    if (res.status === 429) {
      await chrome.storage.local.set({ [RATE_KEY]: { remaining: 0, reset: reset || Date.now() / 1000 + 900 } });
      return undefined;
    }
    if (res.status === 400 || res.status === 404) {
      // The query id rotated. Opening any profile's About page teaches us the new one.
      await chrome.storage.local.set({ 'x:aboutQueryStale': true });
      return undefined;
    }
    if (!res.ok) return undefined;

    const json = await res.json();
    const result = json?.data?.user_result_by_screen_name?.result;
    if (!result) return null;
    return result.about_profile?.account_based_in || null;
  }

  function ownHandle() {
    const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    return el?.textContent.match(/@(\w{1,15})/)?.[1]?.toLowerCase() || null;
  }

  function focalTweetId() {
    return location.pathname.match(/\/status\/(\d+)/)?.[1] || null;
  }

  function quoteBox(article) {
    return [...article.querySelectorAll('div[role="link"]')].find((d) => d.querySelector('[data-testid="User-Name"]'));
  }

  function author(nameEl) {
    if (!nameEl) return {};
    const handleHref = [...nameEl.querySelectorAll('a[href^="/"]')]
      .map((a) => a.getAttribute('href'))
      .find((h) => /^\/\w{1,15}$/.test(h));
    const handleText = nameEl.textContent.match(/@(\w{1,15})/)?.[1];
    const handle = handleHref ? handleHref.slice(1) : handleText;
    const name = D.textOf(nameEl.querySelector('a') || nameEl).split('\n')[0].trim();
    return { name, handle: handle ? `@${handle}` : undefined };
  }

  function extract(article) {
    const nameEl = article.querySelector('[data-testid="User-Name"]');
    if (!nameEl) return null;
    const quote = quoteBox(article);
    const texts = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const mainTextEl = texts.find((t) => !quote?.contains(t));
    const quoteTextEl = quote ? texts.find((t) => quote.contains(t)) : null;

    const a = author(nameEl);
    const text = D.textOf(mainTextEl);
    const statusHref = [...article.querySelectorAll('a[href*="/status/"]')]
      .find((l) => l.querySelector('time') && !quote?.contains(l))
      ?.getAttribute('href');
    const id = statusHref?.match(/\/status\/(\d+)/)?.[1];

    const post = {
      platform: 'x',
      key: id ? `t${id}` : `h${D.hash(`${a.handle}|${text}`)}`,
      id,
      url: statusHref ? new URL(statusHref, location.origin).href : '',
      author: a,
      text,
    };

    if (quoteTextEl) {
      const qa = author(quote.querySelector('[data-testid="User-Name"]'));
      post.quoted = { author: qa.handle || qa.name, text: D.textOf(quoteTextEl) };
    }

    const card = article.querySelector('[data-testid="card.wrapper"]');
    if (card) post.linkPreview = D.textOf(card).replace(/\s+/g, ' ').slice(0, 200);

    if (article.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) post.media = 'video';
    else if (article.querySelector('[data-testid="tweetPhoto"]')) post.media = 'image';

    post.promoted = [...article.querySelectorAll('span')].some(
      (s) => (s.textContent === 'Ad' || s.textContent === 'Promoted') && !s.closest('[data-testid="tweetText"]'),
    );
    return post;
  }

  D.x = D.createEngine({
    platform: 'x',
    findPosts: () => document.querySelectorAll('article[data-testid="tweet"]'),
    extract,
    container: (article) => article.closest('[data-testid="cellInnerDiv"]') || article,
    skip: (post) => {
      if (post.id && post.id === focalTweetId()) return true; // the tweet you opened
      const me = ownHandle();
      return Boolean(me && post.author.handle?.toLowerCase() === `@${me}`);
    },
    placeKey: (post) => post.author?.handle?.replace(/^@/, '').toLowerCase() || null,
    lookupPlace,
  });
})();
