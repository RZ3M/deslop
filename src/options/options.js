import { loadSettings, saveSettings, getApiKey, setApiKey, getServerKey, setServerKey, DEFAULT_SETTINGS } from '../lib/settings.js';
import { DEFAULT_MODEL, DEFAULT_SERVER_MODEL, listOpenRouterModels, systemOneUrl, originPattern } from '../lib/jev.js';
import { connectOpenRouter } from '../lib/connect.js';
import { CATEGORIES, GROUPS, THRESHOLDS, FOCUS_STRENGTH } from '../lib/questions.js';
import { COUNTRIES, REGIONS, getCountry, getRegion } from '../lib/countries.js';

const $ = (id) => document.getElementById(id);
let settings = await loadSettings();

// ── Saving ──────────────────────────────────────────────────────────────────

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveSettings(settings);
    const el = $('saved');
    el.textContent = 'Saved';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1200);
  }, 250);
}

function bindToggle(id, get, set) {
  const input = $(id);
  input.checked = get();
  input.addEventListener('change', () => {
    set(input.checked);
    save();
  });
}

// ── Model ───────────────────────────────────────────────────────────────────

$('apiKey').value = await getApiKey();
$('serverKey').value = await getServerKey();
$('serverUrl').value = settings.server.url;
$('serverModel').value = settings.server.model;

function renderProvider() {
  for (const b of $('provider').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.provider));
  }
  $('openrouterPanel').hidden = settings.provider !== 'openrouter';
  $('serverPanel').hidden = settings.provider !== 'server';
  setStatus('');
}
$('provider').addEventListener('click', (e) => {
  const value = e.target.closest('button')?.dataset.value;
  if (!value) return;
  settings.provider = value;
  renderProvider();
  save();
});
renderProvider();

for (const btn of document.querySelectorAll('[data-reveal]')) {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.reveal);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
}

// OpenRouter's decision models, loaded live so new ones show up without an update.
const OTHER = '__other';
let models = [];
let modelsFailed = false;

function formatPrice(perThousand) {
  if (!perThousand) return 'free';
  return perThousand < 0.01 ? 'under $0.01 per 1,000 posts' : `$${perThousand.toFixed(2)} per 1,000 posts`;
}

function renderModels() {
  const select = $('modelSelect');
  const known = models.some((m) => m.id === settings.model);
  const groups = new Map();
  for (const m of models) {
    if (!groups.has(m.maker)) groups.set(m.maker, []);
    groups.get(m.maker).push(m);
  }
  const nodes = [...groups].map(([maker, list]) => {
    const group = document.createElement('optgroup');
    group.label = maker;
    group.append(
      ...list.map((m) => {
        const tags = [formatPrice(m.perThousandPosts)];
        if (m.id === DEFAULT_MODEL) tags.unshift('recommended');
        if (m.expires) tags.push(`retiring ${new Date(m.expires).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`);
        return new Option(`${m.name} · ${tags.join(' · ')}`, m.id);
      }),
    );
    return group;
  });
  if (!models.length) nodes.push(new Option(settings.model, settings.model));
  nodes.push(new Option('Other model ID…', OTHER));
  select.replaceChildren(...nodes);
  const other = models.length && !known;
  select.value = other ? OTHER : settings.model;
  $('modelOther').hidden = !other;
  if (other) $('modelOther').value = settings.model;
  renderModelHelp();
}

function renderModelHelp() {
  const notes = [
    settings.model === DEFAULT_MODEL
      ? "Deslop's questions and strictness levels are tuned for Jev, and Jev Latest always points at its newest version."
      : 'Strictness is tuned for Jev. Other models may hide a little more or less, so try Relaxed or Strict if it feels off.',
    'Prices assume the default filters; each filter you add costs a little more.',
  ];
  if (modelsFailed) notes.push("Couldn't load OpenRouter's model list, so pick Other and type a model ID.");
  $('modelHelp').textContent = notes.join(' ');
}

$('modelSelect').addEventListener('change', () => {
  const value = $('modelSelect').value;
  $('modelOther').hidden = value !== OTHER;
  if (value === OTHER) {
    $('modelOther').focus();
    return;
  }
  settings.model = value;
  renderModelHelp();
  save();
});
$('modelOther').addEventListener('change', () => {
  settings.model = $('modelOther').value.trim() || DEFAULT_MODEL;
  renderModelHelp();
  save();
});

renderModels();
listOpenRouterModels()
  .then((list) => (models = list))
  .catch(() => (modelsFailed = true))
  .finally(renderModels);

$('serverUrl').addEventListener('change', () => {
  settings.server.url = $('serverUrl').value.trim();
  save();
});
$('serverModel').addEventListener('change', () => {
  settings.server.model = $('serverModel').value.trim() || DEFAULT_SERVER_MODEL;
  save();
});
$('apiKey').addEventListener('change', () => setApiKey($('apiKey').value));
$('serverKey').addEventListener('change', () => setServerKey($('serverKey').value));

function setStatus(text, kind = '') {
  $('testStatus').className = `status ${kind}`.trim();
  $('testStatus').textContent = text;
}

$('testModel').addEventListener('click', async () => {
  settings.server.url = $('serverUrl').value.trim();
  settings.server.model = $('serverModel').value.trim() || DEFAULT_SERVER_MODEL;

  // A self-hosted server needs permission for its host. Ask first, while
  // Chrome still counts this as a click.
  if (settings.provider === 'server') {
    const endpoint = systemOneUrl(settings.server.url);
    if (!endpoint) return setStatus('Enter your server address, for example http://localhost:8000', 'err');
    const granted = await chrome.permissions.request({ origins: [originPattern(endpoint)] }).catch(() => false);
    if (!granted) return setStatus(`Deslop needs your permission to reach ${new URL(endpoint).host}.`, 'err');
  }

  await saveAndTest();
});

async function saveAndTest(prefix = '') {
  setStatus(`${prefix}Testing…`);
  clearTimeout(saveTimer);
  await Promise.all([saveSettings(settings), setApiKey($('apiKey').value), setServerKey($('serverKey').value)]);
  const res = await chrome.runtime.sendMessage({ type: 'model:test', settings });
  if (res?.ok) {
    const { model, ms, bait } = res.result;
    setStatus(`${prefix}Connected to ${model} in ${ms} ms. Test post scored ${Math.round(bait * 100)}% engagement bait.`, 'ok');
  } else {
    setStatus(`${prefix}${res?.error || 'Test failed'}`, 'err');
  }
}

$('connect').addEventListener('click', async () => {
  setStatus('Waiting for OpenRouter…');
  try {
    $('apiKey').value = await connectOpenRouter();
  } catch (err) {
    return setStatus(err.message, 'err');
  }
  await saveAndTest('OpenRouter connected. ');
});

// ── Spending cap ────────────────────────────────────────────────────────────

$('capAmount').value = settings.spendCap.daily.toFixed(2);

function renderCap() {
  const { enabled, daily } = settings.spendCap;
  $('capEnabled').checked = enabled;
  $('capAmount').disabled = !enabled;
  // ≈2,300 tokens per post at Jev's $0.042/M (README "Cost").
  const posts = Math.round(daily / 0.0001);
  $('capHelp').textContent = enabled
    ? `About ${posts.toLocaleString()} posts a day with Jev and the default filters. It can go over by a fraction of a cent while the last few posts finish.`
    : 'No cap: Deslop checks every post, however much that costs.';
}
$('capEnabled').addEventListener('change', () => {
  settings.spendCap.enabled = $('capEnabled').checked;
  renderCap();
  save();
});
$('capAmount').addEventListener('change', () => {
  const value = Number($('capAmount').value);
  if (Number.isFinite(value) && value > 0) settings.spendCap.daily = Math.round(value * 100) / 100;
  $('capAmount').value = settings.spendCap.daily.toFixed(2);
  renderCap();
  save();
});
renderCap();

// Saved before this version, or the permission was removed in chrome://extensions.
if (settings.provider === 'server' && settings.server.url) {
  const endpoint = systemOneUrl(settings.server.url);
  if (endpoint && !(await chrome.permissions.contains({ origins: [originPattern(endpoint)] }))) {
    setStatus(`Click Save & test to let Deslop reach ${new URL(endpoint).host}.`, 'err');
  }
}

// ── Categories and behaviour ────────────────────────────────────────────────

function categoryToggle(cat) {
  const label = document.createElement('label');
  label.className = 'toggle';
  label.innerHTML = `<span class="switch"><input type="checkbox"><span></span></span><span><b></b><small></small></span>`;
  label.querySelector('b').textContent = cat.label;
  label.querySelector('small').textContent = cat.description;
  const input = label.querySelector('input');
  input.checked = settings.categories[cat.id] ?? cat.defaultOn;
  input.addEventListener('change', () => {
    settings.categories[cat.id] = input.checked;
    save();
  });
  return label;
}

$('categories').replaceChildren(
  ...GROUPS.flatMap((group) => {
    const heading = document.createElement('h3');
    heading.textContent = group.label;
    const toggles = document.createElement('div');
    toggles.className = 'toggles';
    toggles.append(...CATEGORIES.filter((c) => c.group === group.id).map(categoryToggle));
    return [heading, toggles];
  }),
);

const STRICTNESS_HELP = {
  relaxed: 'Only hides posts the model is very sure about. Some slop gets through.',
  balanced: 'Recommended. Hides clear slop and keeps normal posts.',
  strict: 'Hides anything that leans sloppy, including some borderline posts.',
};

function renderStrictness() {
  for (const b of $('strictness').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.strictness));
  }
  const t = THRESHOLDS[settings.strictness];
  $('strictnessHelp').textContent = `${STRICTNESS_HELP[settings.strictness]} (hides at ≥${Math.round(t.default * 100)}% confidence)`;
}
$('strictness').addEventListener('click', (e) => {
  const value = e.target.closest('button')?.dataset.value;
  if (!value) return;
  settings.strictness = value;
  renderStrictness();
  save();
});
renderStrictness();

bindToggle('platform-x', () => settings.platforms.x, (v) => (settings.platforms.x = v));
bindToggle('platform-linkedin', () => settings.platforms.linkedin, (v) => (settings.platforms.linkedin = v));
bindToggle('hideWhileChecking', () => settings.hideWhileChecking, (v) => (settings.hideWhileChecking = v));
bindToggle('collapse', () => settings.hideMode === 'collapse', (v) => (settings.hideMode = v ? 'collapse' : 'remove'));
bindToggle('hidePromoted', () => settings.hidePromoted, (v) => (settings.hidePromoted = v));
bindToggle('notInterestedOnX', () => settings.notInterestedOnX, (v) => (settings.notInterestedOnX = v));

// ── Custom rules, muted words, allowlist ────────────────────────────────────

// An editable list of short phrases (custom rules, focus interests).
function bindPhraseList({ list, form, input, get, max, noun }) {
  function render() {
    $(list).replaceChildren(
      ...get().map((phrase, i) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = phrase;
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.title = `Remove ${noun}`;
        del.textContent = '✕';
        del.addEventListener('click', () => {
          get().splice(i, 1);
          render();
          save();
        });
        li.append(span, del);
        return li;
      }),
    );
  }
  $(form).addEventListener('submit', (e) => {
    e.preventDefault();
    const phrase = $(input).value.trim();
    if (!phrase || get().includes(phrase)) return;
    if (get().length >= max) {
      alert(`Up to ${max} ${noun}s.`);
      return;
    }
    get().push(phrase);
    $(input).value = '';
    render();
    save();
  });
  render();
}

bindPhraseList({ list: 'rules', form: 'addRule', input: 'newRule', get: () => settings.customRules, max: 10, noun: 'rule' });

function bindList(id, key) {
  const el = $(id);
  el.value = settings[key].join('\n');
  el.addEventListener('input', () => {
    settings[key] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    save();
  });
}
bindList('mutedWords', 'mutedWords');
bindList('allowlist', 'allowlist');

// ── Focus ───────────────────────────────────────────────────────────────────

const FOCUS_HELP = {
  light: 'Only hides posts that are clearly unrelated to your interests.',
  balanced: 'Hides posts that are very likely unrelated. Borderline posts stay.',
  strong: 'Hides anything that leans off-topic. Your feed narrows fast.',
};

function renderFocus() {
  for (const b of $('focusStrength').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.focus.strength));
  }
  const pct = Math.round((FOCUS_STRENGTH[settings.focus.strength] ?? FOCUS_STRENGTH.balanced) * 100);
  const empty = settings.focus.enabled && !settings.focus.interests.length ? ' Add at least one interest to start.' : '';
  $('focusHelp').textContent = `${FOCUS_HELP[settings.focus.strength] || FOCUS_HELP.balanced} (hides at ≥${pct}% off-topic)${empty}`;
}
$('focusStrength').addEventListener('click', (e) => {
  const value = e.target.closest('button')?.dataset.value;
  if (!value) return;
  settings.focus.strength = value;
  renderFocus();
  save();
});
bindToggle('focusEnabled', () => settings.focus.enabled, (v) => {
  settings.focus.enabled = v;
  renderFocus();
});
bindToggle('focusOnX', () => settings.focus.onX, (v) => (settings.focus.onX = v));
bindToggle('focusOnLinkedIn', () => settings.focus.onLinkedIn, (v) => (settings.focus.onLinkedIn = v));
bindPhraseList({
  list: 'interests',
  form: 'addInterest',
  input: 'newInterest',
  get: () => settings.focus.interests,
  max: 15,
  noun: 'interest',
});
$('addInterest').addEventListener('submit', () => setTimeout(renderFocus));
$('interests').addEventListener('click', () => setTimeout(renderFocus));
renderFocus();

// ── Countries ───────────────────────────────────────────────────────────────

const ITEMS = [
  ...REGIONS.map((r) => ({ value: `region:${r.id}`, label: r.name, flag: '🌐', group: 'Regions', search: [r.name, ...r.aliases] })),
  ...COUNTRIES.slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.code, label: c.name, flag: c.flag, group: 'Countries', search: [c.name, c.code, ...c.aliases] })),
];

function itemLabel(value) {
  if (value.startsWith('region:')) return `🌐 ${getRegion(value.slice(7))?.name || value}`;
  const c = getCountry(value);
  return c ? `${c.flag} ${c.name}` : value;
}

function renderChips() {
  $('blockedChips').replaceChildren(
    ...settings.countries.blocked.map((value) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = itemLabel(value);
      const x = document.createElement('button');
      x.type = 'button';
      x.title = 'Unblock';
      x.textContent = '✕';
      x.addEventListener('click', () => setBlocked(value, false));
      chip.appendChild(x);
      return chip;
    }),
  );
}

function renderCountryList() {
  const q = $('countrySearch').value.trim().toLowerCase();
  const matches = ITEMS.filter((it) => !q || it.search.some((s) => s.toLowerCase().includes(q)));
  const nodes = [];
  let group = null;
  for (const it of matches) {
    if (it.group !== group) {
      group = it.group;
      const g = document.createElement('li');
      g.className = 'group';
      g.textContent = group;
      nodes.push(g);
    }
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'plain';
    box.checked = settings.countries.blocked.includes(it.value);
    box.addEventListener('change', () => setBlocked(it.value, box.checked));
    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.textContent = it.flag;
    const name = document.createElement('span');
    name.textContent = it.label;
    label.append(box, flag, name);
    li.appendChild(label);
    nodes.push(li);
  }
  $('countryList').replaceChildren(...nodes);
}

function setBlocked(value, on) {
  const list = settings.countries.blocked.filter((v) => v !== value);
  if (on) list.push(value);
  settings.countries.blocked = list;
  renderChips();
  renderCountryList();
  save();
}

$('countrySearch').addEventListener('input', renderCountryList);
bindToggle('countriesOnX', () => settings.countries.onX, (v) => (settings.countries.onX = v));
bindToggle('countriesOnLinkedIn', () => settings.countries.onLinkedIn, (v) => (settings.countries.onLinkedIn = v));
bindToggle('includeRegions', () => settings.countries.includeRegions, (v) => (settings.countries.includeRegions = v));
renderChips();
renderCountryList();

// ── Data ────────────────────────────────────────────────────────────────────

async function renderData() {
  const res = await chrome.runtime.sendMessage({ type: 'stats:get' });
  if (!res?.ok) return;
  const { stats, cached } = res.result;
  $('dataInfo').textContent =
    `${stats.hiddenTotal} posts hidden so far · $${stats.spendTotal.toFixed(4)} spent on OpenRouter in total · ` +
    `${cached.posts} post verdicts and ${cached.accounts} account locations cached.`;
}

$('clearCache').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'cache:clear' });
  renderData();
});

$('resetSettings').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? Your API keys are kept.')) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  await saveSettings(settings);
  location.reload();
});

renderData();
