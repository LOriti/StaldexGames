# Go-live checklist

Everything below has been integration-tested end-to-end (real game code → real Worker
code over a local D1-compatible database: submission, ranking, best-week upsert,
mode isolation, flags, rate limiting — all passing). The only steps left are the ones
that need your Cloudflare account.

## 1. Deploy the leaderboard Worker (~10 min, once)

```bash
cd worker
npm install -g wrangler        # if not already installed
wrangler login                 # opens browser
wrangler d1 create cubicle-leaderboard
#   → copy the database_id it prints into wrangler.toml (replaces REPLACE_ME)
wrangler d1 execute cubicle-leaderboard --file=schema.sql --remote
wrangler deploy
#   → note the URL, e.g. https://cubicle-leaderboard.<you>.workers.dev
```

## 2. Set the Worker URL in BOTH files (the easy one to miss)

There are two independent pages that talk to the leaderboard, each with its own constant:

- `site/index.html`   → `const LEADERBOARD_API = '';`
- `site/cubicle.html` → `const LEADERBOARD_API = '';`

Paste the same Worker URL into both. No trailing slash.
(While empty, all leaderboard UI stays hidden/holding — the game is fully playable.)

## 3. Deploy the site

Either drag the `site/` folder into Cloudflare Pages (Upload assets), or connect the
repo to Pages with `site/` as the output directory so every push auto-deploys.

## 4. Smoke test (2 minutes, do this before telling anyone)

1. Open the live site → expand Cubicle → board should say "No completed weeks on this board yet."
2. Play a week (3-day sprint is fastest) → submit with a name → expect "You're #1 …".
3. Refresh the homepage board → your entry appears.
4. Submit a worse week → board still shows your best.

If step 2 errors: check the URL constant in cubicle.html; check the Worker URL opens
in a browser (`<url>/api/leaderboard` should return JSON, not an error page).

## Notes

- One best score per player per board (six boards: {week|sprint} × {normal|hungover|openplan}).
- Identity is a localStorage UUID — clearing browser data = new identity. By design (no accounts).
- Suspicious scores are accepted but flagged ⚠. Rate limit: 12 submissions/hour per player.
- Getting fired ends the week without the submit UI — only survived weeks post. Intended.
