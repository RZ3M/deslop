// Reddit adapter, for the current www.reddit.com ("Shreddit"). Posts are
// <shreddit-post> elements that carry their facts as attributes (id, author,
// post-title, permalink…); comments are <shreddit-comment>, with their text in
// a [slot="comment"] element and their replies nested inside them. Both render
// through shadow DOM, so bars go just before them (barOutside).
// old.reddit.com uses different markup and isn't supported.
(() => {
  const D = globalThis.__deslop;
  if (!D || D.redditLoaded) return;
  D.redditLoaded = true;

  const POST = 'shreddit-post';
  const COMMENT = 'shreddit-comment';
  const ADS = 'shreddit-ad-post, shreddit-comment-tree-ad, shreddit-comments-page-ad';
  const BODY = '[slot="comment"]:not(.deslop-bar)'; // Deslop's bar takes the same slot
  const NOT_PEOPLE = new Set(['[deleted]', '[removed]', 'automoderator']);
  const DAILY_LOOKUP_CAP = 1000;
  const MAX_PAGE_BYTES = 1_500_000;
  const PAUSE_KEY = 'rd:pausedUntil';

  const redditSettings = () => D.state.settings?.reddit || {};

  function findPosts() {
    // On someone's profile you're looking at them on purpose.
    if (/^\/(user|u)\//i.test(location.pathname)) return [];
    const posts = [...document.querySelectorAll(`${POST}, ${ADS}`)].filter(
      (p) => (p.matches(ADS) || p.closest('article, shreddit-feed')) && !p.parentElement?.closest(ADS),
    );
    if (redditSettings().comments === false) return posts;
    // Replies inside a comment Deslop removed are gone with it.
    const comments = [...document.querySelectorAll(COMMENT)].filter((c) => !c.parentElement?.closest('[data-deslop="hidden"]'));
    return [...posts, ...comments];
  }

  function extract(el) {
    return el.matches(COMMENT) ? extractComment(el) : extractPost(el);
  }

  function extractPost(el) {
    const promoted = el.matches(ADS) || el.hasAttribute('promoted') || el.hasAttribute('is-promoted');
    const id = el.getAttribute('id') || el.getAttribute('post-id') || '';
    const title = (el.getAttribute('post-title') || D.textOf(ownSlot(el, 'title'))).trim();
    // In feeds this is the excerpt Reddit shows under the title.
    const body = D.textOf(el.querySelector('[slot="text-body"]'));
    const text = [title, body].filter(Boolean).join('\n\n');
    if (!text && !promoted) return null;
    const name = el.getAttribute('author') || '';
    const permalink = el.getAttribute('permalink') || '';

    const post = {
      platform: 'reddit',
      key: id ? `r${id}` : `rh${D.hash(`${name}|${text.slice(0, 500)}`)}`,
      id,
      url: permalink ? new URL(permalink, location.origin).href : '',
      author: account(name),
      community: el.getAttribute('subreddit-prefixed-name') || '',
      text,
      promoted,
    };

    const type = el.getAttribute('post-type') || '';
    if (type === 'video') post.media = 'video';
    else if (/image|gallery/.test(type)) post.media = 'image';
    const domain = el.getAttribute('domain') || '';
    if (type === 'link' && domain && !/^self\.|(^|\.)(reddit\.com|redd\.it)$/.test(domain)) post.linkPreview = domain;
    return post;
  }

  function extractComment(c) {
    const body = ownBody(c);
    if (!body) return null; // collapsed or deleted
    const text = D.textOf(body);
    if (!text) return null;
    const name = c.getAttribute('author') || '';
    const id = c.getAttribute('thingid') || c.getAttribute('thing-id') || '';
    const permalink = c.getAttribute('permalink') || '';
    return {
      platform: 'reddit',
      kind: 'comment',
      key: id ? `r${id}` : `rh${D.hash(`${name}|${text.slice(0, 500)}`)}`,
      id,
      url: permalink ? new URL(permalink, location.origin).href : '',
      author: account(name),
      community: communityOf(permalink || location.pathname),
      text,
    };
  }

  const communityOf = (path) => {
    const sub = path.match(/\/r\/([^/]+)/)?.[1];
    return sub ? `r/${sub}` : '';
  };

  // The comment's own text, not one of its replies'.
  const ownBody = (c) => [...c.querySelectorAll(BODY)].find((b) => b.closest(COMMENT) === c) || null;
  const ownSlot = (el, slot) => [...el.children].find((c) => c.slot === slot) || el.querySelector(`[slot="${slot}"]`);
  const account = (name) => (name ? { handle: `u/${name}` } : {});
  const nameOf = (post) => post.author?.handle?.replace(/^u\//, '') || '';

  function ownName() {
    for (const host of document.querySelectorAll('shreddit-app, reddit-header-large, reddit-header-action-items')) {
      for (const attr of ['logged-in-user', 'username', 'user-name', 'account-name']) {
        const v = host.getAttribute(attr);
        if (v) return v.replace(/^\/?u(ser)?\//i, '').replace(/\/$/, '').toLowerCase();
      }
    }
    const link = document.querySelector('[data-testid="user-dropdown"] a[href*="/user/"], #expand-user-drawer-button a[href*="/user/"]');
    return link?.getAttribute('href').match(/\/user\/([^/?#]+)/)?.[1]?.toLowerCase() || null;
  }

  function skip(post, el) {
    // The post you opened.
    const opened = location.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1];
    if (el.matches(POST) && opened && post.id === `t3_${opened}`) return true;
    const me = ownName();
    return Boolean(me && nameOf(post).toLowerCase() === me);
  }

  // ── Author profiles ──────────────────────────────────────────────────────
  // For "Hide OnlyFans & porn-bot accounts": the author's about.json (account
  // age, NSFW profile, bio) and their profile page, which is the only place
  // Reddit shows the links people add to their profile. Both are fetched from
  // this tab with your own session, spaced out, capped per day and cached by
  // the background for two weeks.

  const queue = D.createQueue({ spacingMs: 800, maxLength: 120 });

  function profileKey(post) {
    const r = redditSettings();
    if ((!r.adultLinks && !r.newAccounts) || post.promoted) return null;
    if (post.kind === 'comment' && !r.checkCommenters) return null;
    const name = nameOf(post);
    return name && !NOT_PEOPLE.has(name.toLowerCase()) ? name.toLowerCase() : null;
  }

  function lookupProfile(post) {
    return queue(() => fetchProfile(nameOf(post)));
  }

  // The raw facts, null when the account is gone, or undefined when the lookup
  // couldn't be made (so it's retried later).
  async function fetchProfile(name) {
    const { [PAUSE_KEY]: pausedUntil = 0 } = await chrome.storage.local.get(PAUSE_KEY);
    if (Date.now() < pausedUntil || !(await countLookup())) return undefined;

    const path = `/user/${encodeURIComponent(name)}/`;
    const about = await fetchAbout(path);
    if (about === undefined || about === null) return about;
    const page = await fetchProfilePage(path);
    if (!page && !Object.keys(about).length) return undefined;
    return { ...about, links: page?.links || [], hidden: page?.hidden || false };
  }

  async function countLookup() {
    const day = new Date().toLocaleDateString('en-CA');
    const { 'rd:lookups': count = { day, n: 0 } } = await chrome.storage.local.get('rd:lookups');
    if (count.day !== day) Object.assign(count, { day, n: 0 });
    if (count.n >= DAILY_LOOKUP_CAP) return false;
    count.n += 1;
    await chrome.storage.local.set({ 'rd:lookups': count });
    return true;
  }

  // Backs off when Reddit says to: on 429, on a block (403 for a profile
  // page), or when its rate-limit headers say the allowance is nearly used up.
  async function respectLimits(res, { pauseOnBlock = true } = {}) {
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset')); // seconds from now
    let pauseMs = 0;
    if (res.status === 429) pauseMs = Number.isFinite(reset) && reset > 0 ? reset * 1000 : 120e3;
    else if (res.status === 403 && pauseOnBlock) pauseMs = 10 * 60e3;
    else if (Number.isFinite(remaining) && remaining < 5 && Number.isFinite(reset)) pauseMs = reset * 1000;
    if (pauseMs) await chrome.storage.local.set({ [PAUSE_KEY]: Date.now() + pauseMs });
  }

  // { created, karma, nsfw, bio }, {} if Reddit wouldn't give them (the
  // profile page may still have links), null for a deleted or suspended
  // account, undefined to try again later.
  async function fetchAbout(path) {
    const res = await fetch(`${path}about.json?raw_json=1`, { credentials: 'include', headers: { accept: 'application/json' } });
    // Reddit may refuse .json while still serving profile pages.
    await respectLimits(res, { pauseOnBlock: false });
    if (res.status === 429) return undefined;
    if (res.status === 404) return null;
    if (!res.ok) return {};
    const data = await res.json().then((j) => j?.data, () => null);
    if (!data) return {};
    if (data.is_suspended) return null;
    return {
      created: data.created_utc,
      karma: data.total_karma ?? (data.link_karma || 0) + (data.comment_karma || 0),
      nsfw: data.subreddit?.over_18 === true,
      bio: data.subreddit?.public_description || '',
    };
  }

  async function fetchProfilePage(path) {
    const res = await fetch(path, { credentials: 'include' });
    await respectLimits(res);
    if (!res.ok || !res.body) return null;
    const page = parseProfilePage(await readText(res.body, MAX_PAGE_BYTES));
    // The sidebar may arrive as a separate fragment.
    for (const src of page.partials.slice(0, 2)) {
      const part = await fetch(src, { credentials: 'include' }).catch(() => null);
      if (!part?.ok) continue;
      const more = parseProfilePage(await part.text());
      page.links = [...new Set([...page.links, ...more.links])];
      page.hidden ||= more.hidden;
    }
    page.links = page.links.slice(0, 60);
    return page;
  }

  async function readText(stream, maxBytes) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (html.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return html;
  }

  const REDDIT_HOST = /(^|\.)(reddit\.com|redditstatic\.com|redd\.it|redditmedia\.com|reddituploads\.com|redditinc\.com|reddithelp\.com)$/i;
  const HIDDEN_ACTIVITY = /keeps? their (posts|comments|activity) hidden|has hidden (their|this account's) (posts|activity)/i;

  // Links on the profile itself (its social links and bio), not in the posts
  // and comments listed on it, plus whether its owner hides their history.
  function parseProfilePage(html) {
    const own = html
      .replace(/<shreddit-feed\b[\s\S]*?<\/shreddit-feed>/gi, '')
      .replace(/<(shreddit-post|shreddit-profile-comment|shreddit-comment)\b[\s\S]*?<\/\1>/gi, '');
    const links = new Set();
    for (const [, raw] of own.matchAll(/\bhref="(https?:\/\/[^"]+)"/gi)) {
      const url = outbound(decode(raw));
      if (url) links.add(url);
    }
    const partials = [...own.matchAll(/<faceplate-partial\b[^>]*\bsrc="(\/svc\/shreddit\/[^"]+)"/gi)]
      .map((m) => decode(m[1]))
      .filter((src) => /sidebar|social|about/i.test(src) && !/more-posts|comments|feed/i.test(src));
    return { links: [...links], hidden: HIDDEN_ACTIVITY.test(html), partials };
  }

  // External URLs only, unwrapping Reddit's click-tracking redirects.
  function outbound(url) {
    try {
      let u = new URL(url);
      if (REDDIT_HOST.test(u.hostname)) {
        const target = u.searchParams.get('url');
        if (!target) return null;
        u = new URL(target);
        if (REDDIT_HOST.test(u.hostname)) return null;
      }
      return u.href;
    } catch {
      return null;
    }
  }

  function decode(s) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return named[e.toLowerCase()] ?? m;
    });
  }

  D.reddit = D.createEngine({
    platform: 'reddit',
    findPosts,
    extract,
    barOutside: true,
    // A comment's text is hidden, with the bar in its place; its author line
    // and replies stay. Removing a comment removes its replies too.
    container: (el) => (el.matches(COMMENT) ? ownBody(el) || el : el),
    removeTarget: (el) => (el.matches(COMMENT) ? el : null),
    noun: (el) => (el.matches(COMMENT) ? 'comment' : 'post'),
    content: (el) => (el.matches(COMMENT) ? ownBody(el) : el),
    skip,
    // Expanding a collapsed comment shows its replies without adding them.
    watchAttributes: ['collapsed'],
    profileKey,
    lookupProfile,
  });
})();
