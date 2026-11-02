// "Connect OpenRouter": OpenRouter's OAuth PKCE flow, which creates an API key
// in the user's own OpenRouter account and hands it to Deslop. No client
// registration or Deslop server is involved.
// Docs: https://openrouter.ai/docs/guides/overview/auth/oauth

export const AUTH_URL = 'https://openrouter.ai/auth';
export const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

export async function connectOpenRouter({
  launch = (url) => chrome.identity.launchWebAuthFlow({ url, interactive: true }),
  redirectUrl = chrome.identity.getRedirectURL(),
  fetchImpl = fetch,
} = {}) {
  const verifier = randomString();
  const state = randomString();
  const url = authUrl({ redirectUrl, challenge: await challengeFor(verifier), state });

  let returned;
  try {
    returned = await launch(url);
  } catch (err) {
    // Chrome rejects with this when the user closes the window.
    if (/did not approve|cancel|closed/i.test(err.message)) throw new Error('Connection cancelled');
    throw err;
  }
  const params = new URL(returned).searchParams;
  if (params.get('state') !== state) throw new Error('OpenRouter sent back an unexpected response; try again');
  const code = params.get('code');
  if (!code) throw new Error('OpenRouter didn’t return a key; try again');

  const res = await fetchImpl(KEYS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!res.ok) throw new Error(`OpenRouter couldn’t create a key (${res.status})`);
  const { key } = await res.json();
  if (!key) throw new Error('OpenRouter didn’t return a key; try again');
  return key;
}

export function authUrl({ redirectUrl, challenge, state }) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    callback_url: redirectUrl,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    key_label: 'Deslop',
    state,
  });
  return url.href;
}

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
