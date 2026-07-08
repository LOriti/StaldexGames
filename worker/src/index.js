// Cubicle Leaderboard — Cloudflare Worker + D1
// Option A: trust submissions, apply heuristic flags, single best week per player per mode.
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

  // Upsert: keep the best score per (uuid, mode). Name always updates to latest.
  await env.DB.prepare(`
    INSERT INTO scores (uuid, mode, name, grade, score, tasks, quota, days_won, perfect_days, flagged, flags, breakdown, submitted_at, kitchen, shareholder, calendar, socio, sphincter, watercooler)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uuid, mode) DO UPDATE SET
      name = excluded.name,
      grade = CASE WHEN excluded.score > scores.score THEN excluded.grade ELSE scores.grade END,
      tasks = CASE WHEN excluded.score > scores.score THEN excluded.tasks ELSE scores.tasks END,
      quota = CASE WHEN excluded.score > scores.score THEN excluded.quota ELSE scores.quota END,
      days_won = CASE WHEN excluded.score > scores.score THEN excluded.days_won ELSE scores.days_won END,
      perfect_days = CASE WHEN excluded.score > scores.score THEN excluded.perfect_days ELSE scores.perfect_days END,
      flagged = CASE WHEN excluded.score > scores.score THEN excluded.flagged ELSE scores.flagged END,
      flags = CASE WHEN excluded.score > scores.score THEN excluded.flags ELSE scores.flags END,
      breakdown = CASE WHEN excluded.score > scores.score THEN excluded.breakdown ELSE scores.breakdown END,
      submitted_at = CASE WHEN excluded.score > scores.score THEN excluded.submitted_at ELSE scores.submitted_at END,
      kitchen = CASE WHEN excluded.score > scores.score THEN excluded.kitchen ELSE scores.kitchen END,
      shareholder = CASE WHEN excluded.score > scores.score THEN excluded.shareholder ELSE scores.shareholder END,
      calendar = CASE WHEN excluded.score > scores.score THEN excluded.calendar ELSE scores.calendar END,
      socio = CASE WHEN excluded.score > scores.score THEN excluded.socio ELSE scores.socio END,
      sphincter = CASE WHEN excluded.score > scores.score THEN excluded.sphincter ELSE scores.sphincter END,
      watercooler = CASE WHEN excluded.score > scores.score THEN excluded.watercooler ELSE scores.watercooler END,
      score = MAX(scores.score, excluded.score)
  `).bind(
    uuid, mode, name, grade, score, tasks, quota, daysWon, perfectDays, flags.length ? 1 : 0, JSON.stringify(flags), breakdown, Date.now(),
    ratings.kitchen, ratings.shareholder, ratings.calendar, ratings.socio, ratings.sphincter, ratings.watercooler
  ).run();

  // Return the player's rank on this board
  const rankRow = await env.DB.prepare(
    'SELECT COUNT(*) + 1 AS rank FROM scores WHERE mode = ? AND score > (SELECT score FROM scores WHERE uuid = ? AND mode = ?)'
  ).bind(mode, uuid, mode).first();

  return json({ ok: true, rank: rankRow ? rankRow.rank : null, flagged: flags.length > 0, flags });
}

async function handleLeaderboard(url, env) {
  const mode = VALID_MODES.has(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'week_normal';
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 50);
  const uuid = url.searchParams.get('uuid');

  const rows = await env.DB.prepare(
    'SELECT name, grade, score, tasks, quota, days_won, perfect_days, flagged, submitted_at, kitchen, shareholder, calendar, socio, sphincter, watercooler FROM scores WHERE mode = ? ORDER BY score DESC, submitted_at ASC LIMIT ?'
  ).bind(mode, limit).all();

  const out = { mode, entries: (rows.results || []).map((r, i) => ({ rank: i + 1, ...r })) };

  if (uuid) {
    const me = await env.DB.prepare('SELECT score FROM scores WHERE uuid = ? AND mode = ?').bind(uuid, mode).first();
    if (me) {
      const rankRow = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE mode = ? AND score > ?').bind(mode, me.score).first();
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
