# Go-live checklist

Everything below has been integration-tested end-to-end (real game code → real Worker
code over a local D1-compatible database: submission, ranking, best-week upsert,
mode isolation, flags, rate limiting — all passing). The only steps left are the ones
that need your Cloudflare account.

## 1. Deploy the leaderboard Worker (~10 min, once, dashboard only)

`wrangler` doesn't run on this machine (Windows ARM64 has no `workerd` build), so this
goes through Cloudflare's dashboard + its own Git-connected build, not a local CLI.
Full steps: `worker/README.md`. Short version:

1. Workers & Pages → D1 → Create database `cubicle-leaderboard`.
2. Open it → Console → paste + run `worker/schema.sql`.
3. Copy its `database_id` into `worker/wrangler.toml` (replaces `REPLACE_ME`), commit, push.
4. Workers & Pages → Create → Workers → connect to Git → this repo → root directory `worker/`.
   Cloudflare deploys it from there on every push, at `staldex.com/api/cubicle/*`
   (the route is already declared in `wrangler.toml` — no manual route setup needed).

## 2. The client code is already wired up

`LEADERBOARD_API` is already set to `https://staldex.com/api/cubicle` in all three
places that call it — `site/index.html`, `site/cubicle.html`, and
`cubicle-app/www/index.html` (which is a synced copy of `site/cubicle.html`, not a
separate source — never hand-edit the app copy; after editing `site/cubicle.html`,
run `powershell -File sync-game.ps1` from the repo root to sync it).
Nothing to change here once the Worker above is live; it'll just start working.

## 3. Deploy the site

Either drag the `site/` folder into Cloudflare Pages (Upload assets), or connect the
repo to Pages with `site/` as the output directory so every push auto-deploys.

## 4. Smoke test (2 minutes, do this before telling anyone)

1. Open the live site → expand Cubicle → board should say "No completed weeks on this board yet."
2. Play a week (3-day sprint is fastest) → submit with a name → expect "You're #1 …".
3. Refresh the homepage board → your entry appears.
4. Submit a second week → it appears as its own new row (arcade-style, not best-only).
5. Repeat on the native Android app — same Worker, same boards.

If step 2 errors: open `https://staldex.com/api/cubicle/leaderboard?mode=week_normal` in
a browser directly — it should return JSON, not an error page. If that 404s, the Worker's
route isn't live yet (check step 1.4 completed and the deploy succeeded in the Cloudflare
dashboard's build log).

## LRMP (meal planner, unlisted at staldex.com/lrmp)

The planner's source lives in `lrmp/`; its production build is committed to `site/lrmp/`,
so it ships with the normal site deploy — nothing extra for Pages. It is deliberately
unlisted: no links from the homepage and a `noindex` meta tag. After changing `lrmp/src/`,
run `npm test && npm run build` in `lrmp/` and commit the regenerated `site/lrmp/`.

Cross-device sync runs through its own Worker (`worker-lrmp/`, route `staldex.com/api/lrmp/*`):
same dashboard dance as the leaderboard — D1 database `lrmp-sync`, run `worker-lrmp/schema.sql`,
paste the `database_id` into `worker-lrmp/wrangler.toml`, connect Git with root directory
`worker-lrmp/`. No secrets, no accounts — sync is automatic and the unlisted URL is the only
gate (rationale + recovery options in `worker-lrmp/README.md`). If the Worker is down the
app still works fine — state stays per-device and the footer shows "☁ offline".

## SEND IT (bucks night game, unlisted at staldex.com/send)

Single self-contained file, `site/send.html` — no build step, no Worker, no leaderboard;
it ships with the normal site deploy. Unlisted on the same terms as LRMP: no links from
the homepage and a `noindex` meta tag. It loads Fraunces and Inter from Google Fonts,
which is fine here — the no-external-fonts rule in `site/STYLE.md` binds the shell, not a
standalone project page.

## BRIZZY (Brisbane trip page, unlisted at staldex.com/brizzy)

Single self-contained file, `site/brizzy.html` — no build step, no Worker; it ships with the
normal site deploy. Unlisted on the same terms as LRMP and SEND IT: no links from the
homepage and a `noindex` meta tag. It loads Space Grotesk and IBM Plex Mono from Google
Fonts, allowed for a standalone project page (the no-external-fonts rule binds the shell).

All trip details live in the single `const TRIP = {...}` object in the page's script — flights,
stay, gig, itinerary, transport, picks, crew. Nothing else needs editing; the DOM renders from
it, and any field left `null` shows as a visible "to confirm" placeholder rather than a gap.
The countdown reads `TRIP.gig.date` + `TRIP.gig.doors`.

## Notes

- Every submitted run is its own board entry — one player can hold multiple of the 10
  slots (six boards: {week|sprint} × {normal|hungover|openplan}).
- Identity is a localStorage UUID — clearing browser data = new identity. By design (no accounts).
- Suspicious scores are accepted but flagged ⚠. Rate limit: 12 submissions/hour per player.
- Getting fired or hitting a wellbeing incident (shart/cardiac) still reaches the submit UI —
  it grades as "DNF" instead of a letter, and posts to the same board as a normal run.
