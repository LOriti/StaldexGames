// LRMP sync — Cloudflare Worker + D1
//
// State sync for the meal planner at staldex.com/lrmp. The whole app state
// ({ plan, freezer, favourites }) is stored as one JSON blob, last-write-wins.
//
// Deliberately unauthenticated: the planner is unlisted (never linked, noindex) and the
// only protection is that nobody knows the URL. Anyone who finds it shares the one
// household slot — accepted trade-off for zero-friction sync across Leon's devices.
// If that's ever abused: D1 Time Travel restores any point in the last 30 days, and a
// passphrase gate existed in this file's history (git log) ready to be revived.
//
// Routed at staldex.com/api/lrmp/* (see wrangler.toml). Endpoints:
//   GET /api/lrmp/state — returns { data, updatedAt } (data null if nothing stored yet)
//   PUT /api/lrmp/state — body { data: { plan, freezer, favourites } } → { ok, updatedAt }

// Origins allowed to call this API: the live site and the Vite dev server.
const ALLOWED_ORIGINS = new Set(['https://staldex.com', 'http://localhost:5173']);

function cors(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://staldex.com',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Mirrors the client's snapshot shape (lrmp/src/state.js snapshot()). This is the only
// write gate now that there's no auth, so it stays strict about shape and size.
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

    if (request.method === 'GET') return handleGet(env, corsHeaders);
    if (request.method === 'PUT') return handlePut(request, env, corsHeaders);
    return json({ error: 'method not allowed' }, 405, corsHeaders);
  },
};
