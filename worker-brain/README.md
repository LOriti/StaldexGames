# Brain viewer — Cloudflare Worker + Access

API behind the private page at `staldex.com/brain/` (shell in `site/brain/`).
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

Reads cover only `.md`, `.json` and `.jsonl` files outside dot-folders, never
`context/local-paths.json`.

**Writes are exactly two actions**, both on one project's `projects/<slug>/QUEUE.md`:
mark a groomed card done (it moves under `## Done` with a `done:` Perth date) and add a
line under `## Inbox`. There is no free-form editing; everything else in Brain still goes
through a Claude session. Each write:

- passes the same two gates as a read (fails closed the same way), plus a forged-request
  guard: `Content-Type: application/json`, `Origin: https://staldex.com` exactly, and
  `X-Brain-Write: 1`. A cross-site page can't send that without a CORS preflight, which
  the Worker never grants, so anything else gets 403 before Access is even checked;
- validates the slug (`[a-z0-9-]`, no dots or slashes) and the card id (`<slug>-NNN`);
- reads the file and its blob `sha`, applies a pure transform (`src/queue.js`, no I/O)
  and `PUT`s it back with that `sha`. If the file changed in between, GitHub refuses and
  the API answers **409 `changed elsewhere, refresh`**. It never retries or forces;
- makes one commit per action: `web: done <id>` or `web: inbox <slug>`. GitHub requires an
  email with a custom committer, so none is sent and the commit is attributed to the
  token's owner; the `web:` prefix marks where it came from.

In Brain, `.github/workflows/index.yml` regenerates `INDEX.md` after each such commit.

## Setup (once, dashboard only — about 15 minutes)

Do these in order; the Worker refuses to serve anything until steps 1–3 are done.

### 1. Cloudflare Access application

1. Cloudflare dashboard → **Zero Trust** → **Settings** shows the team domain
   (`<team>.cloudflareaccess.com`). An account has one team: if one already exists for
   another project, reuse it and **don't rename it** (that breaks the other project's
   logins). Access applications are independent, so adding Brain doesn't touch them.
   First time only: pick a team name (the free plan covers up to 50 users).
2. **Access controls → Applications → Create new application**. In the dialog, pick the
   **Self-hosted and private** tab, then the **Public DNS** sub-tab (the default
   "Private destinations" opens a private-IP form, which is wrong here), then continue.
   - Destinations, both **public hostname**, subdomain blank:
     - `staldex.com` path `brain`
     - `staldex.com` path `api/brain`
   - Browser-based RDP/SSH/VNC: **off**.
   - Access policies → **Create new policy**: Action **Allow**, Include → **Emails** (not
     "Emails ending in") → your address. Nobody else. Leave MFA, purpose justification and
     the RDP connection settings at their defaults.
   - Authentication → Identity: turn **off** "Accept all available identity providers",
     choose **One-time PIN** only, and turn **on** "Apply instant authentication".
     (Access can't use your Cloudflare dashboard login; Google needs its own OAuth app.)
   - Name `Brain`; session duration to taste (e.g. 1 week on your own devices). Create.
3. Open the application → copy the **Application Audience (AUD) Tag** (a 64-character
   hex string, on its overview or application details).

The login page may show a different `*.cloudflareaccess.com` host from the team domain.
That's cosmetic: the Worker still accepts only tokens issued by `ACCESS_TEAM_DOMAIN`.

### 2. Commit the two Access values

In `wrangler.toml`, replace the `REPLACE_ME`s:

- `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com`
- `ACCESS_AUD` = the AUD tag from step 1.4

Neither is a secret (they identify the Access app, they don't grant entry). Commit and push.

### 3. GitHub token (secret)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** →
   Generate new token.
   - Resource owner: `LOriti`. Repository access: **Only select repositories → `brain`**.
   - Permissions: **Contents → Read and write** (Metadata read-only is added
     automatically). Nothing else. Write is needed only for the two queue actions; a
     read-only token still serves the viewer and makes every write answer 502.
   - Expiration: up to a year; put the renewal date in your calendar.
2. After step 4 creates the Worker: Workers & Pages → `brain-viewer` → **Settings →
   Runtime variables and secrets** (Production) → **Add variable** → key `GITHUB_TOKEN`,
   paste the token, tick **Secret** → *Add variable and deploy*. It takes effect at once.
   - Not the **Variables and secrets** box under *Build* (next to Root directory and API
     token): values there exist only while Cloudflare builds, so the running Worker
     still answers `not configured`.
   - Ignore the banner suggesting you copy the change into `wrangler.toml`: a secret must
     never go in this public file, and dashboard secrets survive Git deploys anyway.
   - The runtime list should then show `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `BRAIN_REF`,
     `BRAIN_REPO` (from `wrangler.toml`) and `GITHUB_TOKEN` (Secret).
   - **Renewal:** on GitHub open the token → *Regenerate token* (same repo and
     permissions), then on the runtime `GITHUB_TOKEN` row → *Rotate* → paste.
3. Optional second gate: add a plain variable `ALLOWED_EMAILS` (comma-separated). Keep it
   out of `wrangler.toml` — this repo is public, and a value there would override the
   dashboard one. `keep_vars = true` keeps dashboard values across Git deploys.

### 4. Connect the Worker to this repo

Same as `worker/` and `worker-lrmp/`: Workers & Pages → Create → Workers → connect to
Git → this repo, then:

| Field | Value |
|---|---|
| Project name | `brain-viewer` (must match `name` in `wrangler.toml`, or the build fails) |
| Build command | blank |
| Deploy command | `npx wrangler deploy` |
| Enable Preview builds | off |
| Protect with Cloudflare Access | off (the `Brain` app already covers the route; that toggle would add a second app for `workers.dev`) |
| Advanced settings → Path | `worker-brain` |
| API token | *Create new token* (a dedicated build token; it can't read Brain) |
| Build variables | blank (the GitHub token is a runtime secret, step 3.2) |

It deploys on every push to `main`. If Settings ever shows *API token: Configured API
token unavailable*, pick or create a token there and *Retry build* under Deployments,
or the next push won't deploy. Then do step 3.2.

The page itself (`site/brain/`) ships with the normal Pages deploy.

## Smoke test

1. Private/incognito window → `https://staldex.com/brain/` → you should get the **Access
   login**, not the page. Sign in with your email → the portfolio index renders, and the
   sidebar footer shows the latest Brain commit and "Signed in as …".
2. Push a change to Brain → click **Refresh** within ~30 s → it shows up.
3. Still in a fresh incognito window (not signed in), open
   `https://staldex.com/api/brain/tree` → Access login page, not JSON.
4. Open a project's QUEUE → **Add to inbox** a test line → the page reloads with it, and
   Brain gets a `web: inbox <slug>` commit followed shortly by an `index:` commit (only if
   the index changed). Mark a throwaway card **Done** the same way. Then remove the test
   line in a session.

After a deploy that changes `site/brain/`, hard-refresh (Ctrl+Shift+R): the browser may
keep the old `app.js`/`style.css` for a while.

To diagnose, open `https://staldex.com/api/brain/tree` in the signed-in window: it shows
the API's raw answer (`{"error": "not configured"}`, a file list, or a Cloudflare error
page). The page itself shows "The Brain API answered: error" for anything that isn't JSON.

Page messages map to API states: **Not set up yet** = 503 (`not configured`: step 2 or
3.2 missing, often a token added as a *build* secret; `access unavailable`: the Worker
couldn't fetch the Access signing keys),
**Signed out** = Access session ended or token rejected (401), **github 401/404** = the
token expired or lost access to the repo, **Not saved: changed elsewhere, refresh** = the
QUEUE moved on since it was read (409); press Refresh and try again.

## API

All require a valid Access token, all answer `Cache-Control: private, no-store`.

- `GET /api/brain/tree` → `{ repo, ref, truncated, commit: { sha, date, message }, viewer, files: [{ path, sha, size }] }`.
  `?fresh=1` skips the 30 s isolate cache. `?commit=<40-hex sha>` returns the tree at that
  exact commit instead of the branch head (404 if the repo has no such commit).
- `GET /api/brain/file?path=<path>[&commit=<sha>]` → `{ path, sha, text }`. Only paths in
  the readable tree (of the head, or of the pinned commit) resolve. Files over 512 KB are
  refused.

After a write the page reloads with `?commit=` set to the commit the write returned, and
pins every file read to the tree it is showing. Right after a commit GitHub can briefly
serve the branch head from before it, which used to make a fresh write look as if it
hadn't happened. Commit trees never change, so they're cached per isolate (last 20).
- `POST /api/brain/done` `{ project, id }` → `{ path, sha, commit }`
- `POST /api/brain/inbox` `{ project, text }` → `{ path, sha, commit }`. `text` is trimmed
  and folded onto one line; empty or over 500 characters is refused.

Write errors: 400 bad body, slug, id or text · 403 missing JSON type, Origin or
`X-Brain-Write` · 404 no such project or groomed card · 409 changed elsewhere ·
422 QUEUE not in the expected shape (no `## Inbox`, duplicate id) · 502 GitHub refused
(for example a read-only token). Read and write routes refuse each other's method (405).

## Design notes

- The tree is cached in-isolate for 30 s; file contents are cached by blob sha (immutable),
  so a page view costs at most three GitHub calls and usually zero.
- The `staldex.pages.dev` mirror is outside Access, but it only carries the empty shell:
  its `/api/brain` doesn't exist, so it has nothing to show.
- Tests (repo root): `node --test tests/brain-*.test.mjs`. They cover the fail-closed
  config, forged/expired/wrong-audience tokens, key rotation, the email allowlist, the
  file allowlist, HTML/script escaping in the renderer, the write guards, the stale-sha
  409, commit messages, and the QUEUE transforms (CRLF, missing or existing `## Done`,
  unknown and duplicate ids, a card right before `## Inbox`, a missing Inbox, and
  byte-for-byte preservation of everything else).
