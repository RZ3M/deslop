import { loadSettings, saveSettings } from '../lib/settings.js';
import { CATEGORIES } from '../lib/questions.js';

const $ = (id) => document.getElementById(id);
const REASON_LABELS = {
  ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short || c.label])),
  country: 'Country',
  off_topic: 'Off-focus',
  muted: 'Muted word',
  promoted: 'Promoted',
  custom: 'Custom rule',
};

let settings = await loadSettings();

function renderSettings() {
  $('enabled').checked = settings.enabled;
  for (const b of $('strictness').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.strictness));
  }
  for (const input of document.querySelectorAll('[data-platform]')) {
    input.checked = Boolean(settings.platforms[input.dataset.platform]);
  }
  const on = Object.entries(settings.platforms).filter(([, v]) => v).map(([k]) => (k === 'x' ? 'X' : 'LinkedIn'));
  $('subtitle').textContent = !settings.enabled
    ? 'Paused'
    : on.length
      ? `Filtering ${on.join(' & ')} · ${cap(settings.strictness)}${settings.focus?.enabled && settings.focus.interests?.length ? ' · Focus on' : ''}`
      : 'No platforms enabled';
}

async function update(mutator) {
  mutator(settings);
  renderSettings();
  await saveSettings(settings);
}

$('enabled').addEventListener('change', (e) => update((s) => (s.enabled = e.target.checked)));
$('strictness').addEventListener('click', (e) => {
  const value = e.target.closest('button')?.dataset.value;
  if (value) update((s) => (s.strictness = value));
});
for (const input of document.querySelectorAll('[data-platform]')) {
  input.addEventListener('change', () => update((s) => (s.platforms[input.dataset.platform] = input.checked)));
}
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function renderStats() {
  const res = await chrome.runtime.sendMessage({ type: 'stats:get' });
  if (!res?.ok) return;
  const { stats, recent, lastError, hasKey, cached } = res.result;

  $('hiddenToday').textContent = stats.hiddenToday;
  $('checksToday').textContent = stats.checksToday;
  $('spendToday').textContent = formatUsd(stats.spendToday);
  $('cacheInfo').textContent = `${cached.posts} posts · ${cached.accounts} accounts cached`;

  const notice = $('notice');
  if (!hasKey) {
    notice.hidden = false;
    notice.innerHTML = 'Add your OpenRouter API key to start filtering. <a href="#" id="setKey">Open settings</a>';
    $('setKey').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  } else if (lastError && Date.now() - lastError.at < 10 * 60e3) {
    notice.hidden = false;
    notice.textContent = `Jev error: ${lastError.message.slice(0, 140)}`;
  } else {
    notice.hidden = true;
  }

  const list = $('recent');
  list.replaceChildren(...recent.slice(0, 25).map(renderItem));
  $('empty').hidden = recent.length > 0;
}

function renderItem(item) {
  const li = document.createElement('li');
  const top = document.createElement('div');
  top.className = 'top';

  const plat = document.createElement('span');
  plat.className = 'plat';
  plat.textContent = item.platform === 'x' ? '𝕏' : 'in';

  const who = document.createElement('span');
  who.className = 'who';
  const label = item.author || item.handle || 'Unknown';
  if (item.url) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    who.appendChild(a);
  } else {
    who.textContent = label;
  }

  const chip = document.createElement('span');
  chip.className = 'chip';
  const reason = item.reasons?.[0];
  chip.textContent =
    item.reasonId === 'country' || item.reasonId === 'custom' || item.reasonId === 'muted'
      ? reason?.label || REASON_LABELS[item.reasonId]
      : REASON_LABELS[item.reasonId] || reason?.label || 'Hidden';
  if (reason && reason.value < 1) chip.title = `${Math.round(reason.value * 100)}% confidence`;

  top.append(plat, who, chip);
  li.appendChild(top);

  if (item.snippet) {
    const snippet = document.createElement('div');
    snippet.className = 'snippet';
    snippet.textContent = item.snippet;
    li.appendChild(snippet);
  }
  return li;
}

function formatUsd(n) {
  if (!n) return '$0';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

renderSettings();
renderStats();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.recent || changes.lastError)) renderStats();
});
