// Turns an extracted post into a Jev request, and Jev's answers into a verdict.
// Pure functions only (no chrome.* APIs) so the test harness can import them.

import { QUESTIONS, CATEGORIES, THRESHOLDS, customRuleQuestion } from './questions.js';

const PLATFORM_NAMES = { x: 'X (Twitter)', linkedin: 'LinkedIn' };
const MAX_TEXT = 4000;

// Only the fields the questions need; everything else stays out of the context.
export function buildState(post) {
  const state = {
    platform: PLATFORM_NAMES[post.platform] || post.platform,
    post: {
      author: compact({ name: post.author?.name, handle: post.author?.handle, headline: post.author?.headline }),
      text: clip(post.text),
    },
  };
  if (post.quoted?.text) {
    state.post.quoted_post = compact({ author: post.quoted.author, text: clip(post.quoted.text, 1500) });
  }
  if (post.linkPreview) state.post.link_preview = post.linkPreview;
  if (post.media) state.post.media = post.media;
  return state;
}

export function buildQuestions(customRules = []) {
  const questions = { ...QUESTIONS };
  customRules.forEach((rule, i) => {
    questions[`custom_${i}`] = customRuleQuestion(rule);
  });
  return questions;
}

// Changes whenever the question set changes, so cached answers from an older
// question set are not reused.
export function questionsHash(customRules = []) {
  return fnv1a(JSON.stringify(buildQuestions(customRules)));
}

export function verdictFrom(answers, settings) {
  const strictness = THRESHOLDS[settings.strictness] ? settings.strictness : 'balanced';
  const t = THRESHOLDS[strictness];
  const signals = [];

  for (const cat of CATEGORIES) {
    const value = cat.value(answers);
    const threshold = t[cat.id] ?? t.default;
    const enabled = settings.categories?.[cat.id] ?? cat.defaultOn;
    signals.push({ id: cat.id, label: cat.label, value, threshold, enabled, hit: enabled && value >= threshold });
  }

  (settings.customRules || []).forEach((rule, i) => {
    const a = answers[`custom_${i}`];
    const value = a && a.type === 'noul' ? a.noul : 0;
    signals.push({ id: `custom_${i}`, label: rule, value, threshold: t.custom, enabled: true, hit: value >= t.custom });
  });

  const reasons = signals.filter((s) => s.hit).sort((a, b) => b.value - a.value);
  return { hide: reasons.length > 0, reasons, signals };
}

export function hasEnoughText(post) {
  const words = (post.text || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 3;
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
