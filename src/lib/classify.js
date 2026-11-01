// Turns an extracted post into a Jev request, and Jev's answers into a verdict.
// Pure functions only (no chrome.* APIs) so the test harness can import them.

import {
  QUESTIONS,
  CATEGORIES,
  THRESHOLDS,
  FOCUS_STRENGTH,
  LEARNING,
  customRuleQuestion,
  focusQuestion,
  topicQuestion,
  withExamples,
} from './questions.js';

const PLATFORM_NAMES = { x: 'X (Twitter)', linkedin: 'LinkedIn' };
const MAX_TEXT = 4000;

// Only the fields the questions need; everything else stays out of the context.
export function buildState(post) {
  const state = {
    platform: PLATFORM_NAMES[post.platform] || post.platform,
    post: {
      author: compact({ name: post.author?.name, handle: post.author?.handle, headline: post.author?.headline }),
      text: clip(unstyle(post.text)),
    },
  };
  if (fancyFonts(post.text).letters >= FANCY_MIN_LETTERS) {
    state.post.formatting =
      'Parts of the text were written in Unicode bold/italic "fancy font" characters for emphasis; they are shown here as plain letters.';
  }
  if (post.quoted?.text) {
    state.post.quoted_post = compact({ author: post.quoted.author, text: clip(unstyle(post.quoted.text), 1500) });
  }
  if (post.linkPreview) state.post.link_preview = post.linkPreview;
  if (post.media) state.post.media = post.media;
  return state;
}

// Custom rules are keyed by their text, so removing one rule doesn't
// invalidate the cached answers for the others.
export function customRuleId(rule) {
  return `custom_${fnv1a(rule)}`;
}

// Filters learned from posts you hid (see learn.js), keyed the same way.
export function learnedRuleId(rule) {
  return `learned_${fnv1a(rule)}`;
}

// The account a post is from, as `platform:@handle` (X) or `platform:slug`
// (LinkedIn), for authors you hide everything from or never hide.
export function authorKey(platform, author) {
  const id = author?.handle || author?.slug;
  return id ? `${platform}:${id.toLowerCase()}` : null;
}

export function isCategoryEnabled(settings, cat) {
  return settings.categories?.[cat.id] ?? cat.defaultOn;
}

// Focus mode is on, has interests, and applies to this platform (any platform
// when none is given, as in the test harness).
export function focusActive(settings, platform) {
  const f = settings.focus;
  if (!f?.enabled || !f.interests?.length) return false;
  if (platform === 'x') return f.onX !== false;
  if (platform === 'linkedin') return f.onLinkedIn !== false;
  return true;
}

// Every question the extension knows, for the test harness.
export function buildQuestions(customRules = []) {
  const questions = { ...QUESTIONS };
  for (const rule of customRules) questions[customRuleId(rule)] = customRuleQuestion(rule);
  return questions;
}

// Only the questions the current settings need. Disabled categories cost nothing.
// `model` is what Deslop learned from your feedback (learn.js): your examples
// are added to the questions, and filters it learned are asked too.
export function questionsFor(settings, platform, model) {
  const ex = model?.examples || {};
  const questions = {};
  for (const cat of CATEGORIES) {
    if (!isCategoryEnabled(settings, cat)) continue;
    for (const id of cat.questions) questions[id] = withExamples(QUESTIONS[id], ex[id]);
  }
  for (const rule of settings.customRules || []) {
    const id = customRuleId(rule);
    questions[id] = withExamples(customRuleQuestion(rule), ex[id]);
  }
  for (const rule of model?.rules || []) {
    if (rule.active) questions[rule.id] = withExamples(customRuleQuestion(rule.text), ex[rule.id]);
  }
  if (focusActive(settings, platform)) {
    questions.focus = withExamples(focusQuestion(settings.focus.interests), ex.focus, { invert: true });
  }
  return questions;
}

// For a post you hid yourself: every question Deslop can ask, including
// categories you have off and filters still being learned, plus the post's
// topic, so it can work out why you hid it (learn.js).
export function analysisQuestions(settings, platform, model) {
  const ex = model?.examples || {};
  const questions = questionsFor(settings, platform, model);
  for (const [id, q] of Object.entries(QUESTIONS)) questions[id] ||= withExamples(q, ex[id]);
  for (const rule of model?.rules || []) {
    if (rule.status !== 'off') questions[rule.id] ||= withExamples(customRuleQuestion(rule.text), ex[rule.id]);
  }
  questions.topic = topicQuestion();
  return questions;
}

// A cache entry is { answers: {id: answer}, hashes: {id: question hash} }.
// A question is (re)asked when it has no answer yet or its wording changed.
export function missingQuestions(entry, questions) {
  const missing = {};
  for (const [id, q] of Object.entries(questions)) {
    if (entry?.hashes?.[id] !== questionHash(q)) missing[id] = q;
  }
  return missing;
}

export function mergeAnswers(entry, questions, answers) {
  const next = { answers: { ...entry?.answers }, hashes: { ...entry?.hashes } };
  for (const [id, q] of Object.entries(questions)) {
    if (!answers?.[id]) continue;
    next.answers[id] = answers[id];
    next.hashes[id] = questionHash(q);
  }
  return next;
}

export function questionHash(question) {
  return fnv1a(JSON.stringify(question));
}

// Signals computed in code rather than asked of Jev.
export function localSignals(post) {
  return { fancy_fonts: fancyFontScore(post) };
}

// `model.thresholds` holds thresholds learned from your feedback; anything
// you haven't corrected uses the strictness threshold.
export function verdictFrom(answers, settings, platform, local = {}, model) {
  const strictness = THRESHOLDS[settings.strictness] ? settings.strictness : 'balanced';
  const t = THRESHOLDS[strictness];
  const learned = model?.thresholds || {};
  const signals = [];

  for (const cat of CATEGORIES) {
    const value = cat.value(answers, local);
    const threshold = learned[cat.id] ?? t[cat.id] ?? t.default;
    const enabled = isCategoryEnabled(settings, cat);
    signals.push({ id: cat.id, label: cat.label, value, threshold, enabled, hit: enabled && value >= threshold });
  }

  const rules = [
    ...(settings.customRules || []).map((rule) => ({ id: customRuleId(rule), label: rule })),
    ...(model?.rules || []).filter((r) => r.active).map((r) => ({ id: r.id, label: r.label })),
  ];
  for (const { id, label } of rules) {
    const a = answers[id];
    const value = a && a.type === 'noul' ? a.noul : 0;
    const threshold = learned[id] ?? t.custom;
    signals.push({ id, label, value, threshold, enabled: true, hit: value >= threshold });
  }

  if (focusActive(settings, platform)) {
    const a = answers.focus;
    const value = a && a.type === 'noul' ? 1 - a.noul : 0;
    const threshold = learned.off_topic ?? FOCUS_STRENGTH[settings.focus.strength] ?? FOCUS_STRENGTH.balanced;
    signals.push({ id: 'off_topic', label: 'Outside your focus', value, threshold, enabled: true, hit: value >= threshold });
  }

  const reasons = signals.filter((s) => s.hit).sort((a, b) => b.value - a.value);
  return { hide: reasons.length > 0, reasons, signals };
}

// A post as an example for Jev: plain letters, short, and the quoted post when
// the post itself is only a reaction to it.
export function exampleText(post, max = LEARNING.exampleChars) {
  const tidy = (t) => unstyle(t || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  let text = tidy(post?.text);
  const quoted = tidy(post?.quoted?.text);
  if (quoted && text.length < 80) text = text ? `${text} [quoting: ${quoted}]` : quoted;
  return clip(text, max);
}

// Word counting that works for languages written without spaces (Chinese,
// Japanese, Thai…). A short reaction to a quoted post is still checked,
// because the quoted post may be what you don't want to see.
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

export function wordCount(text = '') {
  let n = 0;
  for (const s of words.segment(text)) if (s.isWordLike) n++;
  return n;
}

export function hasEnoughText(post) {
  return wordCount(`${post.text || ''}\n${post.quoted?.text || ''}`) >= 3;
}

// Muted words match whole words and their forms: a word of 4+ letters also
// matches words up to 3 letters longer ("canadian" → "canadians").
// "crypto*" matches any word starting with crypto; "ai" in double quotes
// matches only the exact word. Scripts that don't put spaces between words
// (and Korean, which attaches particles to them) match anywhere.
const NO_WORD_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const LETTER = '[\\p{L}\\p{M}]';
const EDGE = '[^\\p{L}\\p{M}\\p{N}]';

export function findMutedWord(post, mutedWords = []) {
  if (!mutedWords.length) return null;
  const hay = fold(`${post.text || ''}\n${post.quoted?.text || ''}`);
  return mutedWords.find((w) => mutedPattern(w)?.test(hay));
}

function mutedPattern(word) {
  let needle = fold(word.trim());
  const exact = /^".+"$/.test(needle);
  const prefix = !exact && needle.endsWith('*');
  needle = needle.replace(/^"|"$|\*$/g, '').trim();
  if (!needle) return null;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (NO_WORD_SPACES.test(needle)) return new RegExp(escaped, 'u');
  const letters = needle.match(/[\p{L}\p{M}\p{N}]/gu)?.length || 0;
  const endsInLetter = /[\p{L}\p{M}]$/u.test(needle);
  const tail = prefix ? `${LETTER}*` : !exact && endsInLetter && letters >= 4 ? `${LETTER}{0,3}` : '';
  return new RegExp(`(^|${EDGE})${escaped}${tail}($|${EDGE})`, 'u');
}

// ── Fancy fonts ─────────────────────────────────────────────────────────────
// 𝐁𝐨𝐥𝐝, 𝘪𝘵𝘢𝘭𝘪𝘤 and 𝓈𝒸𝓇𝒾𝓅𝓉 "fonts" are really Unicode math letters, a heavy tell
// of LinkedIn-style slop. Mixed with emojis they are flagged in code with high
// confidence. On their own they can be human, so they're only a hint for Jev
// (see buildState), and the LinkedInfluencer question decides.
const LETTERLIKE = 'ℂℊℋℌℍℎℐℑℒℓℕℙℚℛℜℝℤℨℬℭℯℰℱℳℴ';
const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ';
const FANCY = new RegExp(`[\\u{1D400}-\\u{1D7FF}\\u{24B6}-\\u{24E9}\\u{1F130}-\\u{1F149}${LETTERLIKE}${SMALL_CAPS}]`, 'gu');
const EMOJI = /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}/gu;
const FANCY_MIN_LETTERS = 5; // a stray 𝑥 or ℝ in a maths post doesn't count
// Math digits and Greek letters, mapped onto the matching Latin style so
// 𝐁𝐨𝐥𝐝 𝟏𝟐𝟑 counts as one style, not two.
const DIGIT_STYLE = [0, 6, 8, 9, 12];
const GREEK_STYLE = [0, 1, 2, 9, 11];

function fancyStyle(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x1d400 && cp < 0x1d6a4) return Math.floor((cp - 0x1d400) / 52);
  if (cp >= 0x1d6a8 && cp < 0x1d7cc) return GREEK_STYLE[Math.floor((cp - 0x1d6a8) / 58)];
  if (cp >= 0x1d7ce && cp <= 0x1d7ff) return DIGIT_STYLE[Math.floor((cp - 0x1d7ce) / 10)];
  if (SMALL_CAPS.includes(ch)) return 'small-caps';
  if (LETTERLIKE.includes(ch)) return 'letterlike';
  return 'enclosed';
}

export function fancyFonts(text = '') {
  const styles = new Set();
  let letters = 0;
  for (const [ch] of text.matchAll(FANCY)) {
    letters++;
    styles.add(fancyStyle(ch));
  }
  return { letters, styles: styles.size, emojis: text.match(EMOJI)?.length || 0 };
}

// 0.9+ (hidden at every strictness) for fancy fonts with emojis; 0.5–0.6
// (never hidden on its own) for fancy fonts without them.
export function fancyFontScore(post) {
  const { letters, styles, emojis } = fancyFonts(post.text);
  if (letters < FANCY_MIN_LETTERS) return 0;
  if (!emojis) return styles > 1 ? 0.6 : 0.5;
  return Math.round((0.9 + (styles > 1 ? 0.05 : 0) + (emojis >= 3 ? 0.04 : 0)) * 100) / 100;
}

// Fancy letters back to plain ones, so Jev reads words rather than symbols.
const SMALL_CAPS_PLAIN = Object.fromEntries([...SMALL_CAPS].map((c, i) => [c, 'abcdefghijklmnopqrstuvwyz'[i]])); // no small-capital x exists
function unstyle(text = '') {
  return text.replace(FANCY, (c) => SMALL_CAPS_PLAIN[c] || c.normalize('NFKC'));
}

// NFKC folds full-width, compatibility and fancy-font forms ("ＢＴＣ", "𝐁𝐓𝐂" → "btc").
function fold(s) {
  return s.normalize('NFKC').toLowerCase();
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function clip(text = '', max = MAX_TEXT) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v) out[k] = v;
  return out;
}
