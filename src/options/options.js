import { loadSettings, saveSettings, getApiKey, setApiKey, DEFAULT_SETTINGS } from '../lib/settings.js';
import { CATEGORIES, THRESHOLDS } from '../lib/questions.js';
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

// ── API key ─────────────────────────────────────────────────────────────────

$('apiKey').value = await getApiKey();
$('model').value = settings.model;

$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggleKey').textContent = input.type === 'password' ? 'Show' : 'Hide';
});

$('testKey').addEventListener('click', async () => {
  const status = $('keyStatus');
  const key = $('apiKey').value.trim();
  status.className = 'status';
  status.textContent = 'Testing…';
  await setApiKey(key);
  const res = await chrome.runtime.sendMessage({ type: 'key:test', apiKey: key });
  if (res?.ok) {
    const { model, ms, bait } = res.result;
    status.className = 'status ok';
    status.textContent = `Connected to ${model} in ${ms} ms. Test post scored ${Math.round(bait * 100)}% engagement bait.`;
  } else {
    status.className = 'status err';
    status.textContent = res?.error || 'Test failed';
  }
});

$('model').addEventListener('change', () => {
  settings.model = $('model').value.trim() || DEFAULT_SETTINGS.model;
  save();
});

// ── Categories and behaviour ────────────────────────────────────────────────

$('categories').replaceChildren(
  ...CATEGORIES.map((cat) => {
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
  }),
);

const STRICTNESS_HELP = {
  relaxed: 'Only hides posts Jev is very sure about. Some slop gets through.',
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

// ── Custom rules, muted words, allowlist ────────────────────────────────────

function renderRules() {
  $('rules').replaceChildren(
    ...settings.customRules.map((rule, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = rule;
      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.title = 'Remove rule';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        settings.customRules.splice(i, 1);
        renderRules();
        save();
      });
      li.append(span, del);
      return li;
    }),
  );
}
$('addRule').addEventListener('submit', (e) => {
  e.preventDefault();
  const rule = $('newRule').value.trim();
  if (!rule || settings.customRules.includes(rule)) return;
  if (settings.customRules.length >= 10) {
    alert('Up to 10 custom rules.');
    return;
  }
  settings.customRules.push(rule);
  $('newRule').value = '';
  renderRules();
  save();
});
renderRules();

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
    `${stats.hiddenTotal} posts hidden so far · $${stats.spendTotal.toFixed(4)} spent on Jev in total · ` +
    `${cached.posts} post verdicts and ${cached.accounts} account locations cached.`;
}

$('clearCache').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'cache:clear' });
  renderData();
});

$('resetSettings').addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? Your API key is kept.')) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  await saveSettings(settings);
  location.reload();
});

renderData();
