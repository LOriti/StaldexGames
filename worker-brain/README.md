# Brain viewer — Cloudflare Worker + Access

Read-only API behind the private page at `staldex.com/brain/` (shell in `site/brain/`).
It reads the **private** `LOriti/brain` repo live through the GitHub API, so no Brain
content is ever committed to this public repo or baked into the Pages deploy.

**This one is actually private, not just unlisted.** LRMP and Life Admin rely on nobody
knowing the URL. Brain holds personal admin and portfolio state, so it has two gates:

1. **Cloudflare Access** in front of `staldex.com/brain` *and* `staldex.com/api/brain`.
   Anyone who isn't on the policy gets the Access login page and never reaches the site
   or the Worker.
2. **The Worker re-checks the Access token** (signature, audience, issuer, expiry, and
   optionally an email allowlist) on every request. If the Access app is ever deleted or
   mis-scoped, the API answers 401 instead of serving Brain. While `ACCESS_TEAM_DOMAIN`,
   `ACCESS_AUD` or `GITHUB_TOKEN` are unset it answers 503 and serves nothing.

Read-only by design: Brain is a single-writer control plane, so changes still go through
a normal session + `handoff`. Only `.md`, `.json` and `.jsonl` files outside dot-folders
are exposed, never `context/local-paths.json`.

## Setup (once, dashboard only — about 15 minutes)

Do these in order; the Worker refuses to serve anything until steps 1–3 are done.

### 1. Cloudflare Access application

1. Cloudflare dashboard → **Zero Trust**. First time only: pick a team name (the free plan
   covers up to 50 users). Your team domain is `<team>.cloudflareaccess.com`.
2. **Settings → Authentication → Login methods**: One-time PIN is on by default (a code
   by email). Add Google too if you want one-tap sign-in.
3. **Access → Applications → Add an application → Self-hosted**:
   - Name: `Brain`. Session duration: whatever you like (e.g. 1 week on your own devices).
   - Destinations (add both):
     - `staldex.com` path `brain`
     - `staldex.com` path `api/brain`
   - Policy: **Allow**, Include → **Emails** → your email address. Nobody else.
4. Open the application → **Overview** → copy the **Application Audience (AUD) Tag**.

### 2. Commit the two Access values

In `wrangler.toml`, replace the `REPLACE_ME`s:

- `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`
- `ACCESS_AUD` = the AUD tag from step 1.4

Neither is a secret (they identify the Access app, they don't grant entry). Commit and push.

### 3. GitHub token (secret)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** →
   Generate new token.
   - Resource owner: `LOriti`. Repository access: **Only select repositories → `brain`**.
   - Permissions: **Contents → Read-only** (Metadata read-only is added automatically).
     Nothing else.
   - Expiration: up to a year; put the renewal date in your calendar.
2. After step 4 creates the Worker: Workers & Pages → `brain-viewer` → **Settings →
   Variables and Secrets** → add a **Secret** named `GITHUB_TOKEN` with the token.
3. Optional second gate: add a plain variable `ALLOWED_EMAILS` (comma-separated). Keep it
   out of `wrangler.toml` — this repo is public, and a value there would override the
   dashboard one. `keep_vars = true` keeps dashboard values across Git deploys.

### 4. Connect the Worker to this repo

Same as `worker/` and `worker-lrmp/`: Workers & Pages → Create → Workers → connect to
Git → this repo → project name `brain-viewer` → root directory (Path) `worker-brain`.
Deploys on every push to `main`. Then do step 3.2 and re-deploy once so the secret is
picked up.

The page itself (`site/brain/`) ships with the normal Pages deploy.

## Smoke test

1. Private/incognito window → `https://staldex.com/brain/` → you should get the **Access
   login**, not the page. Sign in with your email → the portfolio index renders, and the
   sidebar footer shows the latest Brain commit and "Signed in as …".
2. Push a change to Brain → click **Refresh** within ~30 s → it shows up.
3. Still in a fresh incognito window (not signed in), open
   `https://staldex.com/api/brain/tree` → Access login page, not JSON.

Page messages map to API states: **Not set up yet** = 503 (step 2 or 3 missing),
**Signed out** = Access session ended or token rejected (401), **github 401/404** = the
token expired or lost access to the repo.

## API

All `GET`, all require a valid Access token, all `Cache-Control: private, no-store`.

- `GET /api/brain/tree` → `{ repo, ref, truncated, commit: { sha, date, message }, viewer, files: [{ path, sha, size }] }`
- `GET /api/brain/file?path=<path>` → `{ path, sha, text }`. Only paths in the current
  readable tree resolve. Files over 512 KB are refused.

## Design notes

- The tree is cached in-isolate for 30 s; file contents are cached by blob sha (immutable),
  so a page view costs at most three GitHub calls and usually zero.
- The `staldex.pages.dev` mirror is outside Access, but it only carries the empty shell:
  its `/api/brain` doesn't exist, so it has nothing to show.
- Tests (repo root): `node --test tests/brain-worker.test.mjs tests/brain-markdown.test.mjs`.
  They cover the fail-closed config, forged/expired/wrong-audience tokens, key rotation,
  the email allowlist, the file allowlist, and HTML/script escaping in the renderer.
