import { askJev, createLimiter } from '../src/lib/jev.js';
import { buildState, buildQuestions, verdictFrom } from '../src/lib/classify.js';
import { CATEGORIES } from '../src/lib/questions.js';
import { FIXTURES } from './fixtures.js';

const summary = document.getElementById('summary');
const table = document.getElementById('out');
const strictnessSelect = document.getElementById('strictness');

const config = await fetch('../config.local.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
if (!config.openrouterApiKey) {
  summary.textContent = 'Missing config.local.json with openrouterApiKey.';
  throw new Error('no key');
}

const limit = createLimiter(6);
const started = performance.now();
let cost = 0;

const answered = await Promise.all(
  FIXTURES.map((f) =>
    limit(async () => {
      const t0 = performance.now();
      const res = await askJev({
        apiKey: config.openrouterApiKey,
        state: buildState(f.post),
        questions: buildQuestions(),
      });
      cost += res.usage?.cost || 0;
      return { ...f, answers: res.answers, usage: res.usage, ms: Math.round(performance.now() - t0) };
    }),
  ),
);

const elapsed = Math.round(performance.now() - started);

function render() {
  const settings = { strictness: strictnessSelect.value, categories: {}, customRules: [] };
  let passed = 0;
  const rows = answered.map((r) => {
    const v = verdictFrom(r.answers, settings);
    const hitIds = v.reasons.map((x) => x.id);
    const ok = r.expect === 'keep' ? !v.hide : v.hide;
    const exact = r.expect === 'keep' || hitIds.includes(r.expect);
    if (ok) passed++;
    return { r, v, ok, exact };
  });

  summary.innerHTML = `<b>${passed}/${answered.length}</b> correct at <b>${settings.strictness}</b> · ${elapsed} ms total · $${cost.toFixed(6)} spent`;
  const head = `<tr><th>#</th><th>expect</th><th>result</th>${CATEGORIES.map((c) => `<th>${c.id}</th>`).join('')}<th>ms</th><th>tokens</th><th>text</th></tr>`;
  table.innerHTML =
    head +
    rows
      .map(({ r, v, ok, exact }, i) => {
        const cells = v.signals
          .filter((s) => !s.id.startsWith('custom_'))
          .map((s) => `<td class="num ${s.hit ? 'hit' : ''}">${s.value.toFixed(2)}</td>`)
          .join('');
        const res = v.hide ? `hide: ${v.reasons.map((x) => x.id).join(', ')}` : 'keep';
        return `<tr><td>${i}</td><td>${r.expect}</td><td class="${ok ? 'pass' : 'fail'}">${res}${ok && !exact ? ' (other cat)' : ''}</td>${cells}<td class="num">${r.ms}</td><td class="num">${r.usage?.input_tokens ?? ''}</td><td class="text">${escapeHtml(r.post.text.slice(0, 140))}</td></tr>`;
      })
      .join('');

  window.results = rows.map(({ r, v, ok }, i) => ({
    i,
    expect: r.expect,
    ok,
    hide: v.reasons.map((x) => x.id),
    signals: Object.fromEntries(v.signals.map((s) => [s.id, +s.value.toFixed(2)])),
  }));
}

strictnessSelect.addEventListener('change', render);
render();
window.answered = answered;

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
