// Minimal client for decision models: Jev (or any other decision model) on
// OpenRouter's Decisions API, or a self-hosted server that speaks the same
// System One API (Laya, LocalAI, Ollama, SGLang…).
// Docs: https://openrouter.ai/~typesafe/jev-latest and https://docs.typesafe.ai/api

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=decisions';
export const DEFAULT_MODEL = '~typesafe/jev-latest';
export const DEFAULT_SERVER_MODEL = 'laya';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export class JevError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'JevError';
    this.status = status;
  }
}

// `endpoint` defaults to OpenRouter, which needs a key. Self-hosted servers
// usually don't.
export async function askJev({ apiKey, endpoint = DECISIONS_URL, model = DEFAULT_MODEL, state, questions, retries = 3, fetchImpl = fetch }) {
  const openrouter = endpoint === DECISIONS_URL;
  if (openrouter && !apiKey) throw new JevError('No OpenRouter API key set', 401);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (openrouter) Object.assign(headers, { 'HTTP-Referer': 'https://github.com/RZ3M/deslop', 'X-Title': 'Deslop' });

  const body = JSON.stringify({ model, state, questions });
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt));
    let res;
    try {
      res = await fetchImpl(endpoint, { method: 'POST', headers, body });
    } catch (err) {
      lastError = new JevError(`Network error: ${err.message}`, 0);
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      if (!data || typeof data.answers !== 'object') {
        throw new JevError('Malformed response from the model', res.status);
      }
      return data;
    }

    const detail = await res.text().catch(() => '');
    lastError = new JevError(`Model request failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
    if (!RETRYABLE.has(res.status)) throw lastError;
  }

  throw lastError;
}

// Where to send requests, from the user's settings and stored keys, or null
// if the chosen provider isn't set up yet.
export function resolveBackend(settings, { apiKey = '', serverKey = '' } = {}) {
  if (settings.provider === 'server') {
    const endpoint = systemOneUrl(settings.server?.url);
    if (!endpoint) return null;
    return { endpoint, apiKey: serverKey, model: settings.server.model || DEFAULT_SERVER_MODEL };
  }
  if (!apiKey) return null;
  return { endpoint: DECISIONS_URL, apiKey, model: settings.model || DEFAULT_MODEL };
}

// Different models give different answers, so cached answers are kept per
// model. Jev on OpenRouter keeps the unprefixed keys it always had.
export function backendTag({ endpoint, model }) {
  return endpoint === DECISIONS_URL && model === DEFAULT_MODEL ? '' : `${endpoint}|${model}|`;
}

// A server address as typed ("localhost:8000", "http://box:8888/v1") to its
// System One endpoint. Full endpoint URLs are kept as they are.
export function systemOneUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/(systemone|decisions)$/.test(path)) url.pathname = path;
  else url.pathname = `${path.replace(/\/v1$/, '')}/v1/systemone`;
  return url.href;
}

// The match pattern a server needs host permission for (any port).
export function originPattern(endpoint) {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.hostname}/*`;
}

// These makers expect their own `state` format, not the post object Deslop sends.
const OWN_STATE_FORMAT = ['scaledown/', 'respan/'];
const TOKENS_PER_POST = 2300;

// OpenRouter's live list of decision models, Jev Latest on top, then by maker.
export async function listOpenRouterModels(fetchImpl = fetch) {
  const res = await fetchImpl(MODELS_URL);
  if (!res.ok) throw new JevError(`Couldn't load models (${res.status})`, res.status);
  const { data = [] } = await res.json();
  return pickModels(data);
}

export function pickModels(data, now = Date.now()) {
  return data
    .filter((m) => !OWN_STATE_FORMAT.some((p) => m.id.startsWith(p)))
    .filter((m) => !m.expiration_date || Date.parse(m.expiration_date) > now)
    .map((m) => ({
      id: m.id,
      name: m.name.replace(/^[^:]+:\s*/, ''),
      maker: m.name.includes(':') ? m.name.split(':')[0] : m.id.replace(/^~/, '').split('/')[0],
      perThousandPosts: Number(m.pricing?.prompt || 0) * TOKENS_PER_POST * 1000,
      expires: m.expiration_date || null,
    }))
    .sort((a, b) => (b.id === DEFAULT_MODEL) - (a.id === DEFAULT_MODEL) || a.maker.localeCompare(b.maker) || a.name.localeCompare(b.name));
}

// Runs at most `limit` tasks at once; later calls wait their turn.
export function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

function backoff(attempt) {
  return Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
