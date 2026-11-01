import { loadSettings, saveSettings, getApiKey, setApiKey, DEFAULT_SETTINGS } from '../lib/settings.js';
import { CATEGORIES, GROUPS, THRESHOLDS, FOCUS_STRENGTH, LEARNING } from '../lib/questions.js';
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

const categoryInputs = {};

function categoryToggle(cat) {
  const label = document.createElement('label');
  label.className = 'toggle';
  label.innerHTML = `<span class="switch"><input type="checkbox"><span></span></span><span><b></b><small></small></span>`;
  label.querySelector('b').textContent = cat.label;
  label.querySelector('small').textContent = cat.description;
  const input = label.querySelector('input');
  categoryInputs[cat.id] = input;
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

// ── Learning from you ───────────────────────────────────────────────────────

const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });
const pct = (v) => `${Math.round(v * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

bindToggle('learningEnabled', () => settings.learning.enabled, (v) => (settings.learning.enabled = v));
bindToggle('hideButton', () => settings.learning.hideButton, (v) => (settings.learning.hideButton = v));
bindToggle('autoRules', () => settings.learning.autoRules, (v) => (settings.learning.autoRules = v));

const RULE_STATUS = {
  active: (r) => `On · hid ${plural(r.hits, 'post')}${r.keeps ? ` · you unhid ${r.keeps}` : ''}`,
  learning: (r) => `Learning · hide ${plural(LEARNING.ruleMinHides - r.hides, 'more post')} like this to turn it on`,
  suggested: () => 'Suggested · turn it on to start hiding these',
  paused: (r) => `Paused on its own · you unhid ${r.keeps} of the ${r.hits} posts it hid`,
  off: () => 'Off',
};

function row(title, detail, ...controls) {
  const li = document.createElement('li');
  const text = document.createElement('span');
  const b = document.createElement('b');
  b.textContent = title;
  const small = document.createElement('small');
  small.textContent = detail;
  text.append(b, small);
  li.append(text, ...controls);
  return li;
}

function smallButton(label, onClick, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small';
  btn.textContent = label;
  if (title) btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function removeButton(title, onClick) {
  const del = document.createElement('button');
  del.className = 'icon-btn';
  del.type = 'button';
  del.title = title;
  del.textContent = '✕';
  del.addEventListener('click', onClick);
  return del;
}

function ruleSwitch(rule) {
  const label = document.createElement('label');
  label.className = 'switch';
  label.title = rule.status === 'active' ? 'Turn this filter off' : 'Turn this filter on';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = rule.status === 'active';
  input.addEventListener('change', () => send('learning:rule', { id: rule.id, patch: input.checked ? { on: true } : { off: true } }));
  label.append(input, document.createElement('span'));
  return label;
}

function fill(list, block, items) {
  $(list).replaceChildren(...items);
  $(block).hidden = items.length === 0;
}

async function renderLearning() {
  const res = await send('learning:get');
  if (!res?.ok) return;
  const L = res.result;

  $('learningSummary').textContent = !L.enabled
    ? 'Learning is off. The posts you hid or unhid yourself stay that way, but nothing else changes.'
    : L.hidden + L.kept === 0
      ? 'Nothing learned yet.'
      : `You hid ${plural(L.hidden, 'post')} yourself and unhid ${L.kept}. Deslop tuned ${plural(L.adjusted.length, 'filter')}, ` +
        `learned ${plural(L.rules.length, 'new filter')} and shows Jev ${L.examples === 1 ? 'one of your posts' : `${L.examples} of your posts`} as examples.`;

  fill(
    'suggestions',
    'suggestionsBlock',
    L.suggestions.map((s) => {
      if (s.type === 'enable') {
        return row(`Turn on ${s.label}?`, `You hid ${plural(s.n, 'post')} that look like this, but the filter is off.`, smallButton('Turn on', () => {
          settings.categories[s.id] = true;
          if (categoryInputs[s.id]) categoryInputs[s.id].checked = true;
          save();
        }));
      }
      if (s.type === 'block') {
        return row(`Hide everything from ${s.label}?`, `You hid ${plural(s.n, 'post')} from this account yourself.`, smallButton('Hide all', () =>
          send('learning:author', { key: s.key, label: s.label, block: true }),
        ));
      }
      return row(`Never hide ${s.label}?`, `You unhid ${plural(s.n, 'post')} from this account.`, smallButton('Never hide', () => {
        settings.allowlist.push(s.account);
        $('allowlist').value = settings.allowlist.join('\n');
        save();
      }));
    }),
  );

  fill(
    'learnedRules',
    'learnedRulesBlock',
    L.rules.map((r) => {
      const li = row(r.label, RULE_STATUS[r.status]?.(r) || r.status, ruleSwitch(r), removeButton('Delete this filter and stop learning it', () => {
        if (confirm(`Delete the learned filter “${r.label}”? Deslop won't learn it from your hides again.`)) {
          send('learning:rule', { id: r.id, patch: { deleted: true } });
        }
      }));
      li.title = `Asks Jev: does the post fit “${r.text}”? Learned from ${plural(r.examples.hide, 'post')} you hid${r.examples.keep ? ` and ${r.examples.keep} you unhid` : ''}.`;
      if (r.status !== 'active') li.classList.add('dim');
      return li;
    }),
  );

  fill(
    'adjusted',
    'adjustedBlock',
    L.adjusted.map((a) => {
      const effect = a.learned > a.base ? 'so it hides fewer posts' : 'so it hides more posts';
      const counts = [a.kept && `you unhid ${a.kept}`, a.hidden && `you hid ${a.hidden} it missed`].filter(Boolean).join(' · ');
      return row(a.label, `Hides at ≥${pct(a.learned)} instead of ${pct(a.base)}, ${effect}${counts ? ` · ${counts}` : ''}`);
    }),
  );

  fill(
    'learnedAuthors',
    'authorsBlock',
    L.authors.map((a) =>
      row(a.label, 'Everything they post is hidden', removeButton('Stop hiding this account', () => send('learning:author', { key: a.key, block: false }))),
    ),
  );
}

$('exportFeedback').addEventListener('click', async () => {
  const status = $('exportStatus');
  const res = await send('learning:export');
  if (!res?.ok) {
    status.className = 'status err';
    status.textContent = res?.error || 'Export failed';
    return;
  }
  const bundle = res.result;
  if (!bundle.feedback.length) {
    status.className = 'status';
    status.textContent = 'Nothing to export yet: hide or unhide a few posts first.';
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
  a.download = `deslop-feedback-${bundle.exported}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  status.className = 'status ok';
  status.textContent = `Exported ${plural(bundle.feedback.length, 'post')}. Read the file, then attach it to a new issue with "Share it on GitHub".`;
});

$('resetLearning').addEventListener('click', async () => {
  if (!confirm('Forget every post you hid or unhid and everything Deslop learned from them?')) return;
  await send('learning:reset');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'local' && changes['learning:v1']) || (area === 'sync' && changes.settings)) renderLearning();
});
renderLearning();

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
