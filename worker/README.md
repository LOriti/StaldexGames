# Cubicle Leaderboard — Cloudflare Worker + D1

Trust-based leaderboard (Option A): submissions accepted, suspicious scores flagged ⚠ not rejected.
Six boards: `{week|sprint}_{normal|hungover|openplan}`. One best score per player per board.
Identity: localStorage UUID + display name. No login.

## Deploy (~10 min, free tier)

```bash
# 1. Install wrangler + login (opens browser)
npm install -g wrangler
wrangler login

# 2. Create the D1 database — copy the database_id it prints into wrangler.toml
wrangler d1 create cubicle-leaderboard

# 3. Apply the schema to the remote DB
wrangler d1 execute cubicle-leaderboard --file=schema.sql --remote

# 4. Deploy — note the URL it prints (https://cubicle-leaderboard.<you>.workers.dev)
wrangler deploy
```

Then in `cubicle.html`, set:
```js
const LEADERBOARD_API = 'https://cubicle-leaderboard.<you>.workers.dev';
```
Leave it `''` and all leaderboard UI stays hidden — the game runs fully standalone.

## API

- `POST /api/score` — `{uuid, name, mode, grade, score, tasks, quota, daysWon, perfectDays, breakdown}` → `{ok, rank, flagged, flags}`
- `GET /api/leaderboard?mode=week_normal&limit=20&uuid=<optional>` → `{mode, entries[], you?}`

## Heuristic flags (accepted but marked ⚠)
- `score_impossible` — >300 week / >200 sprint
- `score_improbable` — >250 week / >160 sprint
- `task_ratio` — tasks > 2× quota
- `too_perfect` — every day perfect AND improbable score
- Rate limit: 12 submissions/uuid/hour → 429 "rate limited — take a walk"

## Local testing
The Worker was integration-tested against a D1-compatible SQLite shim
(13 checks: upsert semantics, mode isolation, flag heuristics, sanitisation,
rate limiting, rank queries — all passing). To re-run locally you can use
`wrangler dev --local` with a local D1, or any Node 22+ with `node:sqlite`.

## Later upgrades (designed-for, not built)
- Option B validation: server recomputes score from breakdown before accepting
- Admin delete endpoint with shared secret
- Season resets: add a `season` column, filter boards by current season
