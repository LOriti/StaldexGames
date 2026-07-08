# Cubicle Leaderboard — Cloudflare Worker + D1

Trust-based leaderboard (Option A): submissions accepted, suspicious scores flagged ⚠ not rejected.
Six boards: `{week|sprint}_{normal|hungover|openplan}`. One best score per player per board.
Identity: localStorage UUID + display name. No login.

Served at `staldex.com/api/cubicle/*` — same domain as the site, no separate `workers.dev`
subdomain (see `routes` in `wrangler.toml`).

## Deploy

`wrangler` needs a platform it doesn't ship for (this was built/tested on Windows ARM64,
which has no `workerd` binary), so deployment goes through **Cloudflare Workers Builds**
(Git integration) instead of running `wrangler` locally — Cloudflare builds and deploys
this on its own servers on every push to `main`, the same way Pages already does for `site/`.

One-time setup, all in the Cloudflare dashboard, no CLI:

1. **Create the D1 database**: Workers & Pages → D1 SQL Database → Create database →
   name it `cubicle-leaderboard`. This is a provisioning step `wrangler deploy` can't do
   for you even from CI, so it has to happen once, here.
2. **Apply the schema**: open the new database → Console tab → paste in `schema.sql` → run.
3. **Copy the database_id** shown on the database's page into `wrangler.toml` (replaces
   `REPLACE_ME`), commit and push.
4. **Connect the Worker to this repo**: Workers & Pages → Create → Workers → connect to
   Git → select this repo → set the root directory to `worker/`. Cloudflare will run
   `wrangler deploy` from there (picks up `wrangler.toml`'s D1 binding and `routes`
   automatically) on every push.

Leave `LEADERBOARD_API` empty in the game files and all leaderboard UI stays hidden — the
game runs fully standalone either way.

## API

- `POST /api/cubicle/score` — `{uuid, name, mode, grade, score, tasks, quota, daysWon, perfectDays, breakdown, ratings: {kitchen, shareholder, calendar, socio, sphincter, watercooler}}` → `{ok, rank, flagged, flags}`
- `GET /api/cubicle/leaderboard?mode=week_normal&limit=20&uuid=<optional>` → `{mode, entries[] (each including the six ratings), you?}`

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
