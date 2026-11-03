// Account checks for Reddit, decided in code from the author's profile: the
// links on it, its bio, whether it's marked NSFW and how old it is. Reddit's
// porn bots are brand-new accounts that hide their history and link to
// OnlyFans or similar from their profile, which is the tell these rules use.
// Pure functions only (no chrome.* APIs) so the unit tests can import them.

// Adult platforms. A link to one of these on a profile, or its name in the
// bio, is enough on its own.
export const ADULT_SITES = [
  // Not "only fans" with a space: "the only fans of jazz".
  { name: 'OnlyFans', domains: ['onlyfans.com'], words: ['onlyfan', '0nlyfan', 'only fan$', 'onlyfan$'] },
  { name: 'Fansly', domains: ['fansly.com'], words: ['fansly'] },
  { name: 'Fanvue', domains: ['fanvue.com'], words: ['fanvue'] },
  { name: 'FanCentro', domains: ['fancentro.com'], words: ['fancentro'] },
  { name: 'ManyVids', domains: ['manyvids.com'], words: ['manyvids'] },
  { name: 'LoyalFans', domains: ['loyalfans.com'], words: ['loyalfans'] },
  { name: 'JustFor.Fans', domains: ['justfor.fans'] },
  { name: 'AdmireMe', domains: ['admireme.vip'] },
  { name: '4based', domains: ['4based.com'] },
  { name: 'FanTime', domains: ['fantime.com'] },
  { name: 'MYM', domains: ['mym.fans'] },
  { name: 'Alua', domains: ['alua.com'] },
  { name: 'Slushy', domains: ['slushy.com'] },
  { name: 'Unfiltrd', domains: ['unfiltrd.com'] },
  { name: 'Clips4Sale', domains: ['clips4sale.com'] },
  { name: 'iWantClips', domains: ['iwantclips.com'] },
  { name: 'SextPanther', domains: ['sextpanther.com'] },
  { name: 'NiteFlirt', domains: ['niteflirt.com'] },
  { name: 'Pornhub', domains: ['pornhub.com', 'modelhub.com'] },
  { name: 'XVideos', domains: ['xvideos.com'] },
  { name: 'xHamster', domains: ['xhamster.com', 'xhamsterlive.com'] },
  { name: 'Chaturbate', domains: ['chaturbate.com'], words: ['chaturbate'] },
  { name: 'Stripchat', domains: ['stripchat.com'], words: ['stripchat'] },
  { name: 'CamSoda', domains: ['camsoda.com'] },
  { name: 'MyFreeCams', domains: ['myfreecams.com'] },
  { name: 'BongaCams', domains: ['bongacams.com'] },
  { name: 'Cam4', domains: ['cam4.com'] },
  { name: 'LiveJasmin', domains: ['livejasmin.com'] },
];

// Link-in-bio pages. Plenty of ordinary people use them, so they only count
// on a profile that is marked NSFW, where they're how bots point to OnlyFans.
export const LINK_PAGES = [
  { name: 'Linktree', domains: ['linktr.ee'] },
  { name: 'AllMyLinks', domains: ['allmylinks.com', 'getallmylinks.com'] },
  { name: 'Beacons', domains: ['beacons.ai', 'beacons.page'] },
  { name: 'link.me', domains: ['link.me'] },
  { name: 'Linkr', domains: ['linkr.bio'] },
  { name: 'lnk.bio', domains: ['lnk.bio'] },
  { name: 'solo.to', domains: ['solo.to'] },
  { name: 'hoo.be', domains: ['hoo.be'] },
  { name: 'bio.link', domains: ['bio.link'] },
  { name: 'Carrd', domains: ['carrd.co'] },
  { name: 'Campsite', domains: ['campsite.bio'] },
  { name: 'tap.bio', domains: ['tap.bio'] },
  { name: 'Snipfeed', domains: ['snipfeed.co'] },
];

// "Brand-new" for the new-account rule.
export const NEW_ACCOUNT_DAYS = 30;
const DAY_MS = 24 * 3600e3;

// Only the fields the rules read, with sane limits: the raw facts come from a
// content script and thousands are cached, so of the links only those to
// sites the rules know are kept (Reddit bios are at most 200 characters).
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const links = Array.isArray(raw.links) ? raw.links.filter((l) => typeof l === 'string' && l.length <= 400) : [];
  return {
    created: num(raw.created), // seconds since the epoch, as Reddit gives it
    karma: num(raw.karma),
    nsfw: raw.nsfw === true,
    hidden: raw.hidden === true,
    bio: typeof raw.bio === 'string' ? raw.bio.slice(0, 300) : '',
    links: [...new Set(links.filter((l) => matchSite([l], [...ADULT_SITES, ...LINK_PAGES])))].slice(0, 10),
  };
}

// { blocked, label } for a profile under the user's Reddit settings.
export function profileVerdict(raw, opts = {}, now = Date.now()) {
  const profile = sanitizeProfile(raw);
  if (!profile) return { blocked: false };

  if (opts.adultLinks !== false) {
    const linked = matchSite(profile.links, ADULT_SITES);
    if (linked) return { blocked: true, label: `Profile links to ${linked.name}` };
    const named = bioSite(profile.bio);
    if (named) return { blocked: true, label: `Bio mentions ${named.name}` };
    const page = profile.nsfw && (matchSite(profile.links, LINK_PAGES) || bioDomain(profile.bio, LINK_PAGES));
    if (page) return { blocked: true, label: `NSFW profile linking to ${page.name}` };
  }

  if (opts.newAccounts) {
    const days = ageDays(profile, now);
    if (days !== null && days < NEW_ACCOUNT_DAYS && (profile.nsfw || profile.hidden)) {
      const age = days < 1 ? 'under a day old' : `${days} day${days === 1 ? '' : 's'} old`;
      return { blocked: true, label: profile.nsfw ? `New NSFW account, ${age}` : `New account with hidden posts, ${age}` };
    }
  }
  return { blocked: false };
}

export function ageDays(profile, now = Date.now()) {
  if (!profile?.created) return null;
  return Math.max(0, Math.floor((now - profile.created * 1000) / DAY_MS));
}

// The first site whose domain (or a subdomain of it) one of the links goes to.
export function matchSite(links, sites) {
  for (const link of links || []) {
    const host = hostOf(link);
    if (!host) continue;
    const site = sites.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`)));
    if (site) return site;
  }
  return null;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Adult platforms named in the bio, by name ("OnlyFans", "only fans") or by
// domain written without https:// ("onlyfans.com/someone").
export function bioSite(bio) {
  if (!bio) return null;
  const text = fold(bio);
  const byName = ADULT_SITES.find((s) => (s.words || []).some((w) => wordPattern(w).test(text)));
  return byName || bioDomain(bio, ADULT_SITES);
}

function bioDomain(bio, sites) {
  if (!bio) return null;
  const text = fold(bio);
  return sites.find((s) => s.domains.some((d) => new RegExp(`(^|[^a-z0-9-])(?:[a-z0-9-]+\\.)*${escape(d)}(?![a-z0-9-])`).test(text))) || null;
}

function wordPattern(word) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}s?(?![\\p{L}\\p{N}])`, 'u');
}

// NFKC folds fancy-font and full-width letters ("𝐎𝐧𝐥𝐲𝐅𝐚𝐧𝐬" → "onlyfans").
function fold(s) {
  return s.normalize('NFKC').toLowerCase();
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
