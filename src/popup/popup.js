import { loadSettings, saveSettings } from '../lib/settings.js';
import { reasonLabel } from '../lib/reasons.js';

const $ = (id) => document.getElementById(id);
const PLATFORMS = { x: 'X', linkedin: 'LinkedIn', reddit: 'Reddit' };
const BADGES = { x: '𝕏', linkedin: 'in', reddit: 'r/' };

let settings = await loadSettings();

function renderSettings() {
  $('enabled').checked = settings.enabled;
  for (const b of $('strictness').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.strictness));
  }
  for (const b of $('platforms').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(Boolean(settings.platforms[b.dataset.platform])));
  }
  $('placeholders').checked = settings.hideMode === 'collapse';
  const on = Object.keys(PLATFORMS).filter((k) => settings.platforms[k]).map((k) => PLATFORMS[k]);
  $('subtitle').textContent = !settings.enabled
    ? 'Paused'
    : on.length
      ? `${on.length === 1 ? 'Filtering ' : ''}${listOf(on)} · ${cap(settings.strictness)}${settings.focus?.enabled && settings.focus.interests?.length ? ' · Focus on' : ''}`
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
$('platforms').addEventListener('click', (e) => {
  const platform = e.target.closest('button')?.dataset.platform;
  if (platform) update((s) => (s.platforms[platform] = !s.platforms[platform]));
});
$('placeholders').addEventListener('change', (e) => update((s) => (s.hideMode = e.target.checked ? 'collapse' : 'remove')));
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function renderStats() {
  const res = await chrome.runtime.sendMessage({ type: 'stats:get' });
  if (!res?.ok) return;
  const { stats, recent, lastError, ready, cap, cached } = res.result;

  $('hiddenToday').textContent = stats.hiddenToday;
  $('checksToday').textContent = stats.checksToday;
  $('spendToday').textContent = formatUsd(stats.spendToday);
  $('spendLabel').textContent = cap ? `of ${formatUsd(cap)}` : 'spent';
  $('cacheInfo').textContent = `${cached.posts} posts · ${cached.accounts} accounts cached`;

  const notice = $('notice');
  if (!ready) {
    notice.hidden = false;
    notice.innerHTML = 'Connect OpenRouter or set up your own server to start filtering. <a href="#" id="setKey">Open settings</a>';
    $('setKey').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  } else if (cap && stats.spendToday >= cap) {
    notice.hidden = false;
    notice.innerHTML = `Today's ${formatUsd(cap)} spending cap is reached, so new posts aren't checked until midnight. <a href="#" id="setCap">Change the cap</a>`;
    $('setCap').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  } else if (lastError && Date.now() - lastError.at < 10 * 60e3) {
    notice.hidden = false;
    notice.textContent = `Model error: ${lastError.message.slice(0, 140)}`;
  } else {
    notice.hidden = true;
  }

  const list = $('recent');
  list.replaceChildren(...recent.slice(0, 25).map(renderItem));
  $('empty').hidden = recent.length > 0;
  $('recentCount').textContent = recent.length ? `· ${Math.min(recent.length, 25)}` : '';
}

function renderItem(item) {
  const li = document.createElement('li');
  const top = document.createElement('div');
  top.className = 'top-line';

  const plat = document.createElement('span');
  plat.className = 'plat';
  plat.textContent = BADGES[item.platform] || '';

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
    ['country', 'custom', 'muted', 'porn_bot'].includes(item.reasonId)
      ? reason?.label || reasonLabel(item.reasonId)
      : item.reasonId
        ? reasonLabel(item.reasonId)
        : reason?.label || 'Hidden';
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

// "X", "X & LinkedIn", "X, LinkedIn & Reddit"
function listOf(names) {
  return names.length < 3 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

renderSettings();
renderStats();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.recent || changes.lastError)) renderStats();
});
