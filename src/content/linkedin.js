// LinkedIn adapter. LinkedIn's 2026 feed uses hashed class names, so this
// relies on roles, data-testids and profile URLs instead of CSS classes.
(() => {
  const D = globalThis.__deslop;
  if (!D || D.linkedinLoaded) return;
  D.linkedinLoaded = true;

  const TEXT_BOX = '[data-testid="expandable-text-box"]';
  const COMMENTS = '[data-testid*="commentList"]';
  const PROFILE_LINK = 'a[href*="/in/"], a[href*="/company/"], a[href*="/school/"], a[href*="/showcase/"]';
  const DAILY_LOOKUP_CAP = 300;

  function findPosts() {
    const feed = document.querySelector('[data-testid="mainFeed"]');
    if (!feed) return [];
    return [...feed.querySelectorAll('[role="listitem"]')].filter(
      (li) => !li.parentElement?.closest('[role="listitem"]') && li.querySelector(TEXT_BOX),
    );
  }

  function extract(card) {
    const boxes = [...card.querySelectorAll(TEXT_BOX)].filter((b) => !b.closest(COMMENTS));
    const main = boxes[0];
    if (!main) return null;
    const text = cleanText(main);
    if (!text) return null;

    // The author is the last named profile link before the post text; any
    // earlier one belongs to a "X commented / likes this" header.
    const links = [...card.querySelectorAll(PROFILE_LINK)].filter(
      (a) =>
        !a.closest(TEXT_BOX) &&
        !a.closest(COMMENTS) &&
        a.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const named = links.filter((a) => a.textContent.trim());
    const authorLink = named[named.length - 1] || links[links.length - 1];
    const href = authorLink?.getAttribute('href') || '';
    const person = href.match(/\/in\/([^/?#]+)/)?.[1];
    const org = href.match(/\/(?:company|school|showcase)\/([^/?#]+)/)?.[1];
    const name = authorLink ? (authorLink.innerText || authorLink.textContent).split(/\n|•/)[0].trim() : '';
    const lines = headerLines(card, name);

    const post = {
      platform: 'linkedin',
      // innerText reads differently once Deslop hides the card, so the key
      // comes from the DOM text; otherwise a hidden post looks like a new one.
      key: `l${D.hash(`${person || org || name}|${stripMore(D.textOf(main)).slice(0, 500)}`)}`,
      author: {
        name,
        slug: person ? decodeURIComponent(person) : org ? decodeURIComponent(org) : undefined,
        kind: person ? 'person' : org ? 'organization' : undefined,
        headline: lines.headline,
      },
      text,
      url: person ? `https://www.linkedin.com/in/${person}/` : '',
      promoted: lines.promoted,
    };

    if (boxes[1]) post.quoted = { text: cleanText(boxes[1]) };
    if (card.querySelector('video')) post.media = 'video';
    return post;
  }

  function cleanText(box) {
    return stripMore(box.innerText || D.textOf(box));
  }

  function stripMore(text) {
    return text.replace(/…\s*(see )?more\s*$/i, '').trim();
  }

  // Best effort: the line after the author's name is usually their headline.
  function headerLines(card, name) {
    const lines = (card.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const promoted = lines.slice(0, 8).some((l) => /^Promoted\b/.test(l) || D.isAdLabel(l));
    const i = name ? lines.findIndex((l) => l.startsWith(name)) : -1;
    let headline;
    if (i >= 0) {
      headline = lines
        .slice(i + 1, i + 4)
        .find((l) => !/^•?\s*(1st|2nd|3rd\+?|Following|Verified|Premium|Follow)?\s*$/i.test(l) && !/^\d+\s*(s|m|h|d|w|mo|yr)\b/.test(l));
    }
    return { promoted, headline: headline?.slice(0, 160) };
  }

  // ── Author location ──────────────────────────────────────────────────────
  // LinkedIn doesn't show location in the feed, so it's read from the author's
  // profile page (the line above "Contact info"). Only the first ~60 KB of the
  // page is downloaded. Lookups are spaced out and capped per day.

  const queue = D.createQueue({ spacingMs: 2500, maxLength: 80 });

  async function lookupPlace(post) {
    if (post.author?.kind !== 'person' || !post.author.slug) return null;
    return queue(() => fetchProfileLocation(post.author.slug));
  }

  async function fetchProfileLocation(slug) {
    const day = new Date().toISOString().slice(0, 10);
    const { 'li:lookups': count = { day, n: 0 } } = await chrome.storage.local.get('li:lookups');
    if (count.day !== day) Object.assign(count, { day, n: 0 });
    if (count.n >= DAILY_LOOKUP_CAP) return undefined;
    count.n += 1;
    await chrome.storage.local.set({ 'li:lookups': count });

    const res = await fetch(`/in/${encodeURIComponent(slug)}/`, { credentials: 'include' });
    if (res.status === 404) return null;
    if (!res.ok || !res.body) return undefined;

    const html = await readUntil(res.body, '/overlay/contact-info/', 400_000);
    return parseLocation(html);
  }

  async function readUntil(stream, marker, maxBytes) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (html.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        const at = html.indexOf(marker);
        if (at >= 0 && html.length > at + 200) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return html;
  }

  function parseLocation(html) {
    const at = html.indexOf('/overlay/contact-info/');
    if (at < 0) return null;
    const before = html.slice(Math.max(0, at - 4000), at);
    const paragraphs = [...before.matchAll(/<p\b[^>]*>([^<>]{2,120})<\/p>/g)].map((m) => decode(m[1]).trim());
    const loc = paragraphs[paragraphs.length - 1];
    return loc && !/contact info/i.test(loc) ? loc : null;
  }

  function decode(s) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return named[e.toLowerCase()] ?? m;
    });
  }

  D.linkedin = D.createEngine({
    platform: 'linkedin',
    findPosts,
    extract,
    container: (card) => card,
    // Ad blockers hide a promoted card's insides, not the card itself.
    content: (card) => card.querySelector(TEXT_BOX),
    body: (card) => card.querySelector(TEXT_BOX), // where the post's text starts, below its header
    skip: () => false,
    placeKey: (post) => (post.author?.kind === 'person' ? post.author.slug?.toLowerCase() : null),
    lookupPlace,
  });
})();
