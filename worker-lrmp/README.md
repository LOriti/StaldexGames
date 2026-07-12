# LRMP Sync — Cloudflare Worker + D1

State sync for the meal planner at `staldex.com/lrmp` (source in `lrmp/`). The whole app
state (`{plan, freezer, favourites}`) is one JSON blob in one D1 row, last-write-wins.

**Deliberately unauthenticated.** The planner is unlisted (never linked from the site,
`noindex`) and the URL itself is the only gate — everyone who opens the app shares the
single household slot, which makes cross-device sync zero-friction. If a stranger ever
finds and vandalises it: D1 **Time Travel** can restore any point in the last 30 days,
and a passphrase-gated version of `src/index.js` exists in git history, ready to revive.

The planner works fully standalone without this Worker — if it's down or undeployed the
footer shows "☁ offline" and state stays per-device (localStorage).

Served at `staldex.com/api/lrmp/*` — same domain as the site (see `routes` in
`wrangler.toml`).

## Deploy

Same as `worker/` (the cubicle leaderboard): `wrangler` doesn't run on this machine
(Windows ARM64 has no `workerd` build), so deployment goes through **Cloudflare Workers
Builds** (Git integration). One-time setup, all in the dashboard:

1. **Create the D1 database**: Workers & Pages → D1 SQL Database → Create database →
   name it `lrmp-sync`.
2. **Apply the schema**: open the new database → Console tab → run the `CREATE TABLE`
   from `schema.sql` (paste it as a single line — the console treats newlines poorly and
   `--` comments swallow everything after them).
3. **Copy the database_id** from the database's Overview page into `wrangler.toml`.
4. **Connect the Worker to this repo**: Workers & Pages → Create → Workers → connect to
   Git → select this repo → project name `lrmp-sync` → root directory (Path) `worker-lrmp`.
   Deploys on every push to `main`.

Smoke test: `https://staldex.com/api/lrmp/state` should return `{"data":null,"updatedAt":null}`
(or your current plan once something has synced). The footer of `staldex.com/lrmp` should
show **☁ synced**.

## API

- `GET /api/lrmp/state` → `{data, updatedAt}` (`data: null` if nothing stored yet)
- `PUT /api/lrmp/state` — `{data: {plan, freezer, favourites}}` → `{ok, updatedAt}`
- Write gate is shape + size only: `plan` must be a 28-entry array; >200KB rejected.

## Design notes

- **Last-write-wins, whole blob.** Right-sized for one household. If two devices edit
  while offline, the later push wins — nothing merges. Upgrading to per-slice timestamps
  or a merge is possible later without schema changes (the blob is opaque to D1).
- The client half lives in `lrmp/src/storage/sync.js`; local storage remains the source
  of truth on-device, so a dead Worker degrades to exactly the old fully-client-side app.
