// Cloudflare Access token verification for the Brain viewer.
//
// Access sits in front of staldex.com/brain and staldex.com/api/brain and adds a signed
// JWT (Cf-Access-Jwt-Assertion header, CF_Authorization cookie) to every request it lets
// through. The Worker checks that token itself rather than trusting the edge config, so
// a deleted or mis-scoped Access application fails closed instead of exposing Brain.
//
// Pure WebCrypto, no imports — runs unchanged in Workers and in Node's test runner.

const CERT_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_S = 60;

// teamDomain → { keys, fetchedAt }. Isolate-local; Access rotates keys every ~6 weeks.
const certCache = new Map();

function configured(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'REPLACE_ME';
}

// Returns null while Access hasn't been set up, so the API answers 503 rather than
// serving anything.
export function accessConfig(env) {
  if (!configured(env.ACCESS_TEAM_DOMAIN) || !configured(env.ACCESS_AUD)) return null;
  const teamDomain = env.ACCESS_TEAM_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const allowed = (env.ALLOWED_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return { teamDomain, aud: env.ACCESS_AUD.trim(), allowed };
}

export function readAccessToken(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header.trim();
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? match[1] : null;
}

function b64urlBytes(segment) {
  let s = segment.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function b64urlJson(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(segment)));
}

async function signingKeys(teamDomain, fetchImpl, now, force) {
  const cached = certCache.get(teamDomain);
  if (!force && cached && now - cached.fetchedAt < CERT_TTL_MS) return cached.keys;
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs ${res.status}`);
  const { keys } = await res.json();
  if (!Array.isArray(keys)) throw new Error('access certs malformed');
  certCache.set(teamDomain, { keys, fetchedAt: now });
  return keys;
}

// Resolves to { email } for a valid token, or null for anything else. Never throws for a
// bad token; only a failure to reach the Access certs endpoint propagates.
export async function verifyAccessJwt(token, cfg, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!token || !cfg) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const nowS = now / 1000;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${cfg.teamDomain}`) return null;
  if (!auds.includes(cfg.aud)) return null;
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < nowS) return null;
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > nowS) return null;

  let keys = await signingKeys(cfg.teamDomain, fetchImpl, now, false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Key rotation: refetch once before rejecting an unknown kid.
    keys = await signingKeys(cfg.teamDomain, fetchImpl, now, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (cfg.allowed.length && !cfg.allowed.includes(email)) return null;
  return { email };
}
