import { loadSettings, saveSettings, getApiKey, setApiKey, getServerKey, setServerKey, DEFAULT_SETTINGS } from '../lib/settings.js';
import { DEFAULT_MODEL, DEFAULT_SERVER_MODEL, listOpenRouterModels, systemOneUrl, originPattern } from '../lib/jev.js';
import { connectOpenRouter } from '../lib/connect.js';
import { CATEGORIES, GROUPS, SITES, SITE_DEFAULT_REASONS, THRESHOLDS, FOCUS_STRENGTH } from '../lib/questions.js';
import { siteOverride } from '../lib/classify.js';
import { reasonLabel } from '../lib/reasons.js';
import { stackedColumns, stackedBars, legend, table, formatCount } from './charts.js';
import { COUNTRIES, REGIONS, getCountry, getRegion } from '../lib/countries.js';

const $ = (id) => document.getElementById(id);
let settings = await loadSettings();

// ── Navigation ──────────────────────────────────────────────────────────────
// One section at a time, picked from the side menu and kept in the URL
// (#filters, #rules…), so going back or reloading returns to it. Until a
// model is set up, the page opens on Model.

const SECTIONS = [...document.querySelectorAll('[data-section]')];

function showSection(id) {
  const section = SECTIONS.find((s) => s.dataset.section === id) || SECTIONS[0];
  for (const s of SECTIONS) s.hidden = s !== section;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.getAttribute('href') === `#${section.dataset.section}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', () => {
  showSection(location.hash.slice(1));
  window.scrollTo(0, 0);
});
const firstStats = await chrome.runtime.sendMessage({ type: 'stats:get' }).catch(() => null);
showSection(location.hash.slice(1) || (firstStats?.result?.ready === false ? 'model' : 'filters'));

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

// ── Filters ─────────────────────────────────────────────────────────────────
// Every setting here has one control for all sites. Its "Per site" panel lets
// a site follow that control ("Same as all") or override it, and the button
// says which sites differ.

const STRICTNESS_HELP = {
  relaxed: 'Only hides posts the model is very sure about. Some slop gets through.',
  balanced: 'Recommended. Hides clear slop and keeps normal posts.',
  strict: 'Hides anything that leans sloppy, including some borderline posts.',
};
const LEVELS = ['relaxed', 'balanced', 'strict'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const openPanels = new Set(); // per-site panels stay open across re-renders

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function switchEl(checked, label, onChange) {
  const wrap = el('span', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createElement('span'));
  return wrap;
}

function chevron() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return icon;
}

// The sites Deslop runs on, each with its own on/off switch.
function renderSites() {
  $('sites').replaceChildren(
    ...SITES.map((site) => {
      const card = el('label', 'site-card');
      const state = el('small', '', settings.platforms[site.id] ? 'Filtering' : 'Off');
      const text = el('span', 'site-card-text');
      text.append(el('b', '', site.label), state);
      card.append(
        text,
        switchEl(settings.platforms[site.id], `Filter ${site.label}`, (on) => {
          settings.platforms[site.id] = on;
          state.textContent = on ? 'Filtering' : 'Off';
          renderFilters();
          save();
        }),
      );
      return card;
    }),
  );
}

// A setting row: its all-sites control, and a panel of per-site overrides.
// `get(site)` is the override's value or null; `set(site, value)` stores one.
function settingRow({ id, title, detail, control, controlFirst, choices, get, set, note }) {
  const row = el('div', 'setting');
  const head = el('div', 'setting-head');
  const main = el(controlFirst ? 'label' : 'div', 'setting-main');
  const text = el('span', 'setting-text');
  text.append(el('b', '', title));
  const detailEl = el('small', '', detail || '');
  text.append(detailEl);
  if (controlFirst) main.append(control, text);
  else main.append(text, control);

  const panel = el('div', 'per-site');
  panel.id = `per-site-${id}`;
  const button = el('button', 'per-site-btn');
  button.type = 'button';
  button.setAttribute('aria-controls', panel.id);
  const summaryEl = el('span');
  button.append(summaryEl, chevron());
  const summary = () => {
    const diffs = SITES.filter((s) => get(s.id) !== null).map((s) => `${s.label}: ${choices.find((c) => c.value === get(s.id))?.label}`);
    summaryEl.textContent = diffs.length ? diffs.join(', ') : 'Per site';
    row.classList.toggle('has-overrides', diffs.length > 0);
  };
  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) openPanels.add(id);
    else openPanels.delete(id);
  };
  button.addEventListener('click', () => setOpen(panel.hidden));

  const options = [{ value: null, label: 'Same as all' }, ...choices];
  for (const site of SITES) {
    const line = el('div', 'per-site-row');
    const name = el('span', 'per-site-name', site.label);
    if (!settings.platforms[site.id]) name.append(el('small', '', 'site off'));
    const group = el('div', 'segmented small');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${title} on ${site.label}`);
    const buttons = options.map((o) => {
      const b = el('button', '', o.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        set(site.id, o.value);
        mark();
        summary();
        save();
      });
      return b;
    });
    const mark = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === get(site.id))));
    mark();
    group.append(...buttons);
    line.append(name, group);
    panel.append(line);
  }
  if (note) panel.append(el('p', 'muted small', note));

  head.append(main, button);
  row.append(head, panel);
  summary();
  setOpen(openPanels.has(id));
  return { row, detailEl };
}

function strictnessHelp() {
  const t = THRESHOLDS[settings.strictness];
  return `${STRICTNESS_HELP[settings.strictness]} Hides at ${Math.round(t.default * 100)}% confidence or more.`;
}

function renderFilters() {
  const levels = el('div', 'segmented');
  levels.setAttribute('role', 'group');
  levels.setAttribute('aria-label', 'Strictness on every site');
  const strictness = settingRow({
    id: 'strictness',
    title: 'Strictness',
    detail: strictnessHelp(),
    control: levels,
    choices: LEVELS.map((l) => ({ value: l, label: cap(l) })),
    get: (site) => settings.siteStrictness[site] || null,
    set: (site, value) => (settings.siteStrictness[site] = value || ''),
  });
  levels.append(
    ...LEVELS.map((level) => {
      const b = el('button', '', cap(level));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(level === settings.strictness));
      b.addEventListener('click', () => {
        settings.strictness = level;
        for (const other of levels.children) other.setAttribute('aria-pressed', String(other === b));
        strictness.detailEl.textContent = strictnessHelp();
        save();
      });
      return b;
    }),
  );

  const nodes = [strictness.row];
  for (const group of GROUPS) {
    nodes.push(el('h2', '', group.label));
    for (const cat of CATEGORIES.filter((c) => c.group === group.id)) {
      const words = SITES.filter((s) => cat.minWords?.[s.id]).map((s) => `On ${s.label}, only judged on posts and comments of ${cat.minWords[s.id]}+ words.`);
      const starts = SITES.filter((s) => cat.siteDefaults?.[s.id] !== undefined).map((s) => SITE_DEFAULT_REASONS[s.id]);
      nodes.push(
        settingRow({
          id: cat.id,
          title: cat.label,
          detail: [cat.description, ...words].join(' '),
          controlFirst: true,
          control: switchEl(settings.categories[cat.id], `${cat.label} on every site`, (on) => {
            settings.categories[cat.id] = on;
            save();
          }),
          choices: [
            { value: true, label: 'On' },
            { value: false, label: 'Off' },
          ],
          get: (site) => siteOverride(settings, cat, site),
          set: (site, value) => (settings.siteOverrides[site][cat.id] = value),
          note: [...new Set(starts)].join(' '),
        }).row,
      );
    }
  }
  $('filterList').replaceChildren(...nodes);
}

$('resetFilters').addEventListener('click', () => {
  if (!confirm('Reset every filter, its per-site settings and strictness to the defaults?')) return;
  for (const key of ['categories', 'siteOverrides', 'strictness', 'siteStrictness']) settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
  renderFilters();
  save();
});

renderSites();
renderFilters();

// Toggle buttons for the sites something applies on.
function siteChips(sites, isOn, set, { keepOne = false } = {}) {
  return sites.map((site) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'site-chip';
    b.textContent = site.label;
    b.setAttribute('aria-pressed', String(isOn(site.id)));
    b.addEventListener('click', () => {
      const on = !isOn(site.id);
      if (!on && keepOne && sites.filter((s) => isOn(s.id)).length === 1) return;
      set(site.id, on);
      b.setAttribute('aria-pressed', String(on));
      save();
    });
    return b;
  });
}

// ── Behaviour ───────────────────────────────────────────────────────────────

bindToggle('hideWhileChecking', () => settings.hideWhileChecking, (v) => (settings.hideWhileChecking = v));
bindToggle('collapse', () => settings.hideMode === 'collapse', (v) => (settings.hideMode = v ? 'collapse' : 'remove'));
bindToggle('hidePromoted', () => settings.hidePromoted, (v) => (settings.hidePromoted = v));
bindToggle('notInterestedOnX', () => settings.notInterestedOnX, (v) => (settings.notInterestedOnX = v));
bindToggle('redditComments', () => settings.reddit.comments, (v) => (settings.reddit.comments = v));

// ── Reddit porn bots ────────────────────────────────────────────────────────

bindToggle('redditAdultLinks', () => settings.reddit.adultLinks, (v) => {
  settings.reddit.adultLinks = v;
  renderCommenters();
});
bindToggle('redditNewAccounts', () => settings.reddit.newAccounts, (v) => {
  settings.reddit.newAccounts = v;
  renderCommenters();
});
bindToggle('redditCheckCommenters', () => settings.reddit.checkCommenters, (v) => (settings.reddit.checkCommenters = v));

// Commenters' profiles are only checked when there's a profile check to run.
function renderCommenters() {
  $('redditCheckCommenters').disabled = !settings.reddit.adultLinks && !settings.reddit.newAccounts;
}
renderCommenters();

// ── Custom rules, muted words, allowlist ────────────────────────────────────

// An editable list of short phrases (custom rules, focus interests).
// `decorate` adds controls to a phrase's row; `onRemove` cleans up after it.
function bindPhraseList({ list, form, input, get, max, noun, decorate, onRemove }) {
  function render() {
    $(list).replaceChildren(
      ...get().map((phrase, i) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = phrase;
        li.append(span);
        decorate?.(li, phrase);
        const del = document.createElement('button');
        del.className = 'icon-btn';
        del.type = 'button';
        del.title = `Remove ${noun}`;
        del.setAttribute('aria-label', `Remove ${noun} "${phrase}"`);
        del.textContent = '✕';
        del.addEventListener('click', () => {
          get().splice(i, 1);
          onRemove?.(phrase);
          render();
          save();
        });
        li.append(del);
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

// A rule applies on every site unless it's limited to some (customRuleSites).
const ALL_SITES = SITES.map((s) => s.id);
const ruleSites = (rule) => settings.customRuleSites[rule] || ALL_SITES;

bindPhraseList({
  list: 'rules',
  form: 'addRule',
  input: 'newRule',
  get: () => settings.customRules,
  max: 10,
  noun: 'rule',
  decorate: (li, rule) => {
    const chips = document.createElement('span');
    chips.className = 'site-chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', `Sites "${rule}" applies on`);
    chips.append(
      ...siteChips(
        SITES,
        (id) => ruleSites(rule).includes(id),
        (id, on) => {
          const next = ALL_SITES.filter((s) => (s === id ? on : ruleSites(rule).includes(s)));
          if (next.length === ALL_SITES.length) delete settings.customRuleSites[rule];
          else settings.customRuleSites[rule] = next;
        },
        { keepOne: true },
      ),
    );
    li.append(chips);
  },
  onRemove: (rule) => delete settings.customRuleSites[rule],
});

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
const FOCUS_KEYS = { x: 'onX', linkedin: 'onLinkedIn', reddit: 'onReddit' };

function renderFocus() {
  for (const b of $('focusStrength').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.focus.strength));
  }
  const pct = Math.round((FOCUS_STRENGTH[settings.focus.strength] ?? FOCUS_STRENGTH.balanced) * 100);
  const empty = settings.focus.enabled && !settings.focus.interests.length ? ' Add at least one interest to start.' : '';
  $('focusHelp').textContent = `${FOCUS_HELP[settings.focus.strength] || FOCUS_HELP.balanced} Hides at ${pct}% off-topic or more.${empty}`;
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
$('focusSites').append(
  ...siteChips(
    SITES,
    (id) => settings.focus[FOCUS_KEYS[id]] !== false,
    (id, on) => (settings.focus[FOCUS_KEYS[id]] = on),
  ),
);
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
// Reddit doesn't show where accounts are based.
const COUNTRY_KEYS = { x: 'onX', linkedin: 'onLinkedIn' };
$('countrySites').append(
  ...siteChips(
    SITES.filter((s) => COUNTRY_KEYS[s.id]),
    (id) => settings.countries[COUNTRY_KEYS[id]] !== false,
    (id, on) => (settings.countries[COUNTRY_KEYS[id]] = on),
  ),
);
bindToggle('includeRegions', () => settings.countries.includeRegions, (v) => (settings.countries.includeRegions = v));
renderChips();
renderCountryList();

// ── Data ────────────────────────────────────────────────────────────────────
// Charts of what Deslop hid, from the background's daily history. The period
// and site controls above them scope every number in the section.

const SERIES_COLORS = { x: 'var(--series-x)', linkedin: 'var(--series-linkedin)', reddit: 'var(--series-reddit)' };
const view = { days: 30, site: 'all' };
let stats = null;
let cached = null;

const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
const formatUsd = (n) => (!n ? '$0' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

function lastDays(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i)).toLocaleDateString('en-CA'));
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function segmentedChoice(container, choices, current, onPick) {
  container.replaceChildren(
    ...choices.map((c) => {
      const b = el('button', '', c.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(c.value === current()));
      b.addEventListener('click', () => {
        onPick(c.value);
        for (const other of container.children) other.setAttribute('aria-pressed', String(other === b));
      });
      return b;
    }),
  );
}

function tile(label, value, sub) {
  const t = el('div', 'tile');
  t.append(el('span', 'tile-label', label), el('b', /\d/.test(value) ? 'tile-value' : 'tile-value words', value));
  if (sub) t.append(el('span', 'tile-sub', sub));
  return t;
}

// Without the history, only today's totals (kept for the popup) are known.
function renderToday() {
  const top = Object.entries(stats.byReason || {}).sort((a, b) => b[1] - a[1])[0];
  $('todayTiles').replaceChildren(
    tile('Hidden today', formatCount(stats.hiddenToday)),
    tile('Hidden most today', top ? reasonLabel(top[0]) : 'Nothing yet', top ? `${formatCount(top[1])} posts` : ''),
    tile('Checked by the model today', formatCount(stats.checksToday), `${formatUsd(stats.spendToday)} spent`),
    tile('Hidden since you installed Deslop', formatCount(stats.hiddenTotal)),
  );
}

function renderStats() {
  if (!stats) return;
  const keep = Boolean(settings.keepHistory);
  $('keepHistory').checked = keep;
  $('historyView').hidden = !keep;
  $('historyPrompt').hidden = keep;
  $('todayTiles').hidden = keep;
  if (!keep) return renderToday();
  const series = SITES.filter((s) => view.site === 'all' || s.id === view.site).map((s) => ({ id: s.id, label: s.label, color: SERIES_COLORS[s.id] }));
  const dates = lastDays(view.days);
  const day = (d) => stats.days?.[d] || { hidden: {}, checks: {}, spend: 0 };

  const daily = dates.map((d) => ({ date: d, label: shortDate(d), values: Object.fromEntries(series.map((s) => [s.id, sum(day(d).hidden[s.id])])) }));
  const byReason = {};
  for (const d of dates) {
    for (const s of series) {
      for (const [reason, n] of Object.entries(day(d).hidden[s.id] || {})) {
        const row = (byReason[reason] ||= {});
        row[s.id] = (row[s.id] || 0) + n;
      }
    }
  }
  const reasons = Object.entries(byReason)
    .map(([id, values]) => ({ label: reasonLabel(id), values, total: sum(values) }))
    .sort((a, b) => b.total - a.total);

  const hidden = reasons.reduce((n, r) => n + r.total, 0);
  const today = daily[daily.length - 1];
  const checked = dates.reduce((n, d) => n + series.reduce((m, s) => m + (day(d).checks?.[s.id] || 0), 0), 0);
  const spent = dates.reduce((n, d) => n + (day(d).spend || 0), 0);
  const period = `last ${view.days} days`;
  $('statTiles').replaceChildren(
    tile(`Hidden, ${period}`, formatCount(hidden)),
    tile('Hidden today', formatCount(sum(today.values))),
    tile(`Hidden most, ${period}`, reasons[0]?.label || 'Nothing yet', reasons[0] ? `${formatCount(reasons[0].total)} posts` : ''),
    tile(`Checked by the model, ${period}`, formatCount(checked), view.site === 'all' ? `${formatUsd(spent)} spent` : ''),
  );

  const dailyChart = $('dailyChart');
  const reasonChart = $('reasonChart');
  const multi = series.length > 1;
  legend(dailyChart.querySelector('.legend'), series);
  legend(reasonChart.querySelector('.legend'), series);
  const head = (first) => [first, ...series.map((s) => s.label), ...(multi ? ['Total'] : [])];
  const cells = (values) => [...series.map((s) => values[s.id] || 0), ...(multi ? [sum(values)] : [])];

  if (!hidden) {
    const where = view.site === 'all' ? 'X, LinkedIn or Reddit' : SITES.find((s) => s.id === view.site).label;
    for (const chart of [dailyChart, reasonChart]) {
      chart.querySelector('.plot').replaceChildren(el('p', 'empty-chart', `Nothing hidden in the ${period}. Browse ${where} and what Deslop hides shows up here.`));
      chart.querySelector('.table-view').hidden = true;
    }
    return;
  }
  for (const chart of [dailyChart, reasonChart]) chart.querySelector('.table-view').hidden = false;
  stackedColumns(dailyChart.querySelector('.plot'), daily, series);
  table(
    dailyChart.querySelector('.table-view > div'),
    head('Day'),
    daily.filter((d) => sum(d.values)).reverse().map((d) => [d.label, ...cells(d.values)]),
  );
  stackedBars(reasonChart.querySelector('.plot'), reasons, series);
  table(reasonChart.querySelector('.table-view > div'), head('Filter'), reasons.map((r) => [r.label, ...cells(r.values)]));
}

async function loadStats() {
  const res = await chrome.runtime.sendMessage({ type: 'stats:get' });
  if (!res?.ok) return;
  ({ stats, cached } = res.result);
  $('dataInfo').textContent =
    `${stats.hiddenTotal.toLocaleString()} posts hidden in total, and $${stats.spendTotal.toFixed(4)} spent on OpenRouter. ` +
    `${cached.posts.toLocaleString()} post verdicts and ${cached.accounts.toLocaleString()} accounts are cached.`;
  renderStats();
}

// Opt-in: nothing is recorded per day until this is on, and turning it off
// deletes what was kept.
$('keepHistory').addEventListener('change', async (e) => {
  if (!e.target.checked && !confirm('Turn off the history and delete the counts kept so far?')) {
    e.target.checked = true;
    return;
  }
  settings.keepHistory = e.target.checked;
  save();
  if (!settings.keepHistory) await chrome.runtime.sendMessage({ type: 'history:clear' });
  loadStats();
});

segmentedChoice($('statsRange'), [7, 30, 90].map((n) => ({ value: n, label: `${n} days` })), () => view.days, (n) => {
  view.days = n;
  renderStats();
});
segmentedChoice($('statsSite'), [{ value: 'all', label: 'All sites' }, ...SITES.map((s) => ({ value: s.id, label: s.label }))], () => view.site, (site) => {
  view.site = site;
  renderStats();
});

// The day chart fits its width, so it's redrawn when that changes (including
// when the section is first shown).
let lastWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (width && width !== lastWidth) {
    lastWidth = width;
    renderStats();
  }
}).observe($('dailyChart'));

let statsTimer;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.stats) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(loadStats, 1000);
});

$('clearCache').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'cache:clear' });
  loadStats();
});

$('resetSettings').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? Your API keys and stats are kept.')) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  await saveSettings(settings);
  location.reload();
});

loadStats();
