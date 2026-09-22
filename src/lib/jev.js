// Minimal client for Jev on OpenRouter's Decisions API.
// Docs: https://openrouter.ai/~typesafe/jev-latest and https://docs.typesafe.ai/api

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const DEFAULT_MODEL = '~typesafe/jev-latest';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

export class JevError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'JevError';
    this.status = status;
  }
}

export async function askJev({ apiKey, model = DEFAULT_MODEL, state, questions, retries = 3, fetchImpl = fetch }) {
  if (!apiKey) throw new JevError('No OpenRouter API key set', 401);

  const body = JSON.stringify({ model, state, questions });
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt));
    let res;
    try {
      res = await fetchImpl(DECISIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/RZ3M/deslop',
          'X-Title': 'Deslop',
        },
        body,
      });
    } catch (err) {
      lastError = new JevError(`Network error: ${err.message}`, 0);
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      if (!data || typeof data.answers !== 'object') {
        throw new JevError('Malformed response from Jev', res.status);
      }
      return data;
    }

    const detail = await res.text().catch(() => '');
    lastError = new JevError(`Jev request failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
    if (!RETRYABLE.has(res.status)) throw lastError;
  }

  throw lastError;
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
