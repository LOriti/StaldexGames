// Cubicle Leaderboard — Cloudflare Worker + D1
// Trust submissions, apply heuristic flags. Arcade-style: every submitted run is its
// own board entry (one player can hold multiple slots); boards display the top 10 runs.
//
// Routed at staldex.com/api/cubicle/* (see wrangler.toml). Endpoints:
//   POST /api/cubicle/score        — submit a completed week, body includes {ratings: {kitchen, shareholder, calendar, socio, sphincter, watercooler}}
//   GET  /api/cubicle/leaderboard  — ?mode=week_normal&limit=20&uuid=<optional, returns your rank>
//
// Modes: {week|sprint}_{normal|hungover|openplan} — six boards.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_MODES = new Set([
  'week_normal', 'week_hungover', 'week_openplan',
  'sprint_normal', 'sprint_hungover', 'sprint_openplan',
]);
const VALID_GRADES = new Set(['S', 'A', 'B', 'C', 'D', 'F', 'DNF']);

// Six end-of-week personality ratings — see computeRatings() in cubicle.html.
const RATING_KEYS = ['kitchen', 'shareholder', 'calendar', 'socio', 'sphincter', 'watercooler'];
function clampRating(v) {
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[<>\\\/&"'`]/g, '').trim().slice(0, 20);
  return name.length >= 1 ? name : null;
}

// Heuristic flags — accepted but marked. Thresholds informed by playtesting:
// a strong careful full week lands ~180-220; sprint proportionally lower.
function computeFlags(body) {
  const flags = [];
  const isSprint = body.mode.startsWith('sprint');
  const scoreCeiling = isSprint ? 200 : 300;
  const softCeiling = isSprint ? 160 : 250;
  const dayCount = isSprint ? 3 : 5;

  if (body.score > scoreCeiling) flags.push('score_impossible');
  else if (body.score > softCeiling) flags.push('score_improbable');
  if (body.tasks > body.quota * 2) flags.push('task_ratio');
  if (body.perfectDays === dayCount && body.score > softCeiling) flags.push('too_perfect');
  if (Array.isArray(body.breakdown) && body.breakdown.length !== dayCount && body.breakdown.length !== 0) {
    // died mid-week is fine (shorter breakdown), but LONGER than the mode allows is not
    if (body.breakdown.length > dayCount) flags.push('breakdown_shape');
  }
  return flags;
}

async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  // Validate
  const uuid = typeof body.uuid === 'string' && /^[a-f0-9-]{16,40}$/i.test(body.uuid) ? body.uuid : null;
  const name = sanitizeName(body.name);
  const mode = VALID_MODES.has(body.mode) ? body.mode : null;
  const grade = VALID_GRADES.has(body.grade) ? body.grade : null;
  const score = Number.isFinite(body.score) ? Math.round(body.score) : null;

  if (!uuid) return json({ error: 'invalid uuid' }, 400);
  if (!name) return json({ error: 'invalid name' }, 400);
  if (!mode) return json({ error: 'invalid mode' }, 400);
  if (!grade) return json({ error: 'invalid grade' }, 400);
  if (score === null || score < -100 || score > 100000) return json({ error: 'invalid score' }, 400);

  const tasks = Number.isFinite(body.tasks) ? Math.round(body.tasks) : 0;
  const quota = Number.isFinite(body.quota) ? Math.round(body.quota) : 0;
  const daysWon = Number.isFinite(body.daysWon) ? Math.round(body.daysWon) : 0;
  const perfectDays = Number.isFinite(body.perfectDays) ? Math.round(body.perfectDays) : 0;
  const ratings = Object.fromEntries(RATING_KEYS.map(k => [k, clampRating(body.ratings && body.ratings[k])]));

  // Light rate limit: max 12 submissions per uuid per hour (across modes)
  const hourAgo = Date.now() - 3600_000;
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM submissions_log WHERE uuid = ? AND at > ?'
  ).bind(uuid, hourAgo).first();
  if (recent && recent.n >= 12) return json({ error: 'rate limited — take a walk' }, 429);
  await env.DB.prepare('INSERT INTO submissions_log (uuid, at) VALUES (?, ?)').bind(uuid, Date.now()).run();

  const flags = computeFlags({ ...body, mode, score, tasks, quota, perfectDays });
  const breakdown = JSON.stringify(Array.isArray(body.breakdown) ? body.breakdown.slice(0, 5) : []);

  // Arcade-style: every submitted run is its own row. The same player can hold
  // multiple board slots; the top-10 display cutoff is what filters the junk.
  await env.DB.prepare(`
    INSERT INTO runs (uuid, mode, name, grade, score, tasks, quota, days_won, perfect_days, flagged, flags, breakdown, submitted_at, kitchen, shareholder, calendar, socio, sphincter, watercooler)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uuid, mode, name, grade, score, tasks, quota, daysWon, perfectDays, flags.length ? 1 : 0, JSON.stringify(flags), breakdown, Date.now(),
    ratings.kitchen, ratings.shareholder, ratings.calendar, ratings.socio, ratings.sphincter, ratings.watercooler
  ).run();

  // This run's rank on the board
  const rankRow = await env.DB.prepare(
    'SELECT COUNT(*) + 1 AS rank FROM runs WHERE mode = ? AND score > ?'
  ).bind(mode, score).first();

  return json({ ok: true, rank: rankRow ? rankRow.rank : null, flagged: flags.length > 0, flags });
}

async function handleLeaderboard(url, env) {
  const mode = VALID_MODES.has(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'week_normal';
  // Boards are top-10 only — better weeks push the junk off the bottom.
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 10);
  const uuid = url.searchParams.get('uuid');

  const rows = await env.DB.prepare(
    'SELECT name, grade, score, tasks, quota, days_won, perfect_days, flagged, submitted_at, kitchen, shareholder, calendar, socio, sphincter, watercooler FROM runs WHERE mode = ? ORDER BY score DESC, submitted_at ASC LIMIT ?'
  ).bind(mode, limit).all();

  const out = { mode, entries: (rows.results || []).map((r, i) => ({ rank: i + 1, ...r })) };

  if (uuid) {
    // "You" = the player's best run on this board
    const me = await env.DB.prepare('SELECT MAX(score) AS score FROM runs WHERE uuid = ? AND mode = ?').bind(uuid, mode).first();
    if (me && me.score !== null) {
      const rankRow = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM runs WHERE mode = ? AND score > ?').bind(mode, me.score).first();
      out.you = { rank: rankRow.rank, score: me.score };
    }
  }
  return json(out);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST' && url.pathname === '/api/cubicle/score') return handleSubmit(request, env);
    if (request.method === 'GET' && url.pathname === '/api/cubicle/leaderboard') return handleLeaderboard(url, env);
    return json({ error: 'not found' }, 404);
  },
};
