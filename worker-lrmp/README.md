# LRMP Sync — Cloudflare Worker + D1

Private state sync for the meal planner at `staldex.com/lrmp` (source in `lrmp/`). The
whole app state (`{plan, freezer, favourites}`) is one JSON blob in one D1 row,
last-write-wins. Every request needs the shared passphrase — no accounts, no public
endpoints. The planner works fully offline/standalone without this Worker; sync is
opt-in via the ☁ button in the app's footer.

Served at `staldex.com/api/lrmp/*` — same domain as the site (see `routes` in
`wrangler.toml`).

## Deploy

Same as `worker/` (the cubicle leaderboard): `wrangler` doesn't run on this machine
(Windows ARM64 has no `workerd` build), so deployment goes through **Cloudflare Workers
Builds** (Git integration). One-time setup, all in the dashboard:

1. **Create the D1 database**: Workers & Pages → D1 SQL Database → Create database →
   name it `lrmp-sync`.
2. **Apply the schema**: open the new database → Console tab → paste in `schema.sql` → run.
3. **Copy the database_id** shown on the database's page into `wrangler.toml` (replaces
   `REPLACE_ME`), commit and push.
4. **Connect the Worker to this repo**: Workers & Pages → Create → Workers → connect to
   Git → select this repo → set the root directory to `worker-lrmp/`.
5. **Set the passphrase secret**: the new Worker → Settings → Variables and Secrets →
   Add → type **Secret** → name `LRMP_TOKEN` → value = your sync passphrase (anything
   long and private). The Worker rejects everything until this is set (fails closed).

Then on each device: open `staldex.com/lrmp` → tap **☁ sync off** in the footer → enter
the same passphrase. The footer flips to **☁ synced** and every change pushes
automatically (debounced ~1.5s); each app load pulls the newest copy.

## API

- `GET /api/lrmp/state` → `{data, updatedAt}` (`data: null` if nothing stored yet)
- `PUT /api/lrmp/state` — `{data: {plan, freezer, favourites}}` → `{ok, updatedAt}`
- Both require `Authorization: Bearer <passphrase>`; wrong/missing → 401.
- Snapshot validation: `plan` must be a 28-entry array; >200KB rejected.

## Design notes

- **Last-write-wins, whole blob.** Right-sized for one household. If two devices edit
  while offline, the later push wins — nothing merges. Upgrading to per-slice timestamps
  or a merge is possible later without schema changes (the blob is opaque to D1).
- The client half lives in `lrmp/src/storage/sync.js`; local storage remains the source
  of truth on-device, so a dead Worker degrades to exactly the old fully-client-side app.
- Auth compares SHA-256 digests byte-for-byte (constant-time, no length leak).
