// LRMP sync — Cloudflare Worker + D1
//
// Private single-slot state sync for the meal planner at staldex.com/lrmp. The whole
// app state ({ plan, freezer, favourites }) is stored as one JSON blob, last-write-wins.
// Every request must carry the shared passphrase; there are no accounts and no public
// endpoints, which is the point — the planner is unlisted and this keeps its data that way.
//
// Routed at staldex.com/api/lrmp/* (see wrangler.toml). Endpoints:
//   GET /api/lrmp/state — returns { data, updatedAt } (data null if nothing stored yet)
//   PUT /api/lrmp/state — body { data: { plan, freezer, favourites } } → { ok, updatedAt }
//
// Auth: Authorization: Bearer <passphrase>, checked against the LRMP_TOKEN secret.

// Origins allowed to call this API: the live site and the Vite dev server.
const ALLOWED_ORIGINS = new Set(['https://staldex.com', 'http://localhost:5173']);

function cors(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://staldex.com',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Constant-time comparison via SHA-256 — hashing first sidesteps the "inputs must be
// equal length" requirement and avoids leaking passphrase length through timing.
async function authorized(request, env) {
  if (!env.LRMP_TOKEN) return false; // secret not configured — fail closed
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(m[1])),
    crypto.subtle.digest('SHA-256', enc.encode(env.LRMP_TOKEN)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Mirrors the client's snapshot shape (lrmp/src/state.js snapshot()). Loose on purpose —
// the client is trusted once authenticated; this only blocks obviously broken writes.
function validSnapshot(data) {
  return (
    data && typeof data === 'object' &&
    Array.isArray(data.plan) && data.plan.length === 28 &&
    typeof data.freezer === 'object' && data.freezer !== null &&
    Array.isArray(data.favourites)
  );
}

async function handleGet(env, corsHeaders) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM state WHERE id = ?')
    .bind('default').first();
  if (!row) return json({ data: null, updatedAt: null }, 200, corsHeaders);
  return json({ data: JSON.parse(row.data), updatedAt: row.updated_at }, 200, corsHeaders);
}

async function handlePut(request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, corsHeaders); }
  if (!validSnapshot(body.data)) return json({ error: 'invalid snapshot' }, 400, corsHeaders);

  const raw = JSON.stringify(body.data);
  // ~40 dishes + a 28-day plan serializes to a few KB; 200KB means something is wrong.
  if (raw.length > 200_000) return json({ error: 'snapshot too large' }, 413, corsHeaders);

  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO state (id, data, updated_at) VALUES ('default', ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).bind(raw, now).run();

  return json({ ok: true, updatedAt: now }, 200, corsHeaders);
}

export default {
  async fetch(request, env) {
    const corsHeaders = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(request.url);
    if (url.pathname !== '/api/lrmp/state') return json({ error: 'not found' }, 404, corsHeaders);

    if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401, corsHeaders);

    if (request.method === 'GET') return handleGet(env, corsHeaders);
    if (request.method === 'PUT') return handlePut(request, env, corsHeaders);
    return json({ error: 'method not allowed' }, 405, corsHeaders);
  },
};
