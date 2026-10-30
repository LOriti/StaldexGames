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

**Writes are exactly four actions.** Two on one project's `projects/<slug>/QUEUE.md`:
mark a groomed card done (it moves under `## Done` with a `done:` Perth date) and add a
line under `## Inbox`. Two on `register/open-items.md`, settling what a daily routine
flagged: **Confirm** or **Reject** an item carrying `unconfirmed` (a new item) or
`close-proposed` (evidence it is done), with exactly Brain's edits (`src/register.js`
lists them). There is no free-form editing; everything else in Brain still goes through a
Claude session. Each write:

- passes the same two gates as a read (fails closed the same way), plus a forged-request
  guard: `Content-Type: application/json`, `Origin: https://staldex.com` exactly, and
  `X-Brain-Write: 1`. A cross-site page can't send that without a CORS preflight, which
  the Worker never grants, so anything else gets 403 before Access is even checked;
- validates the slug (`[a-z0-9-]`, no dots or slashes), the card id (date-based like
  `DEV-61025.14`, or the older `<slug>-NNN`), the register id (the same, with an optional
  `P-`) and the flag;
- reads the file and its blob `sha`, applies a pure transform (`src/queue.js` or
  `src/register.js`, no I/O)
  and `PUT`s it back with that `sha`. If the file changed in between, GitHub refuses and
  the API answers **409 `changed elsewhere, refresh`**. It never retries or forces;
- makes one commit per action: `web: done <id>`, `web: inbox <slug>`,
  `web: confirm [close ]<id>` or `web: reject [close ]<id>`. GitHub requires an
  email with a custom committer, so none is sent and the commit is attributed to the
  token's owner; the `web:` prefix marks where it came from.

In Brain, `.github/workflows/index.yml` regenerates `INDEX.md` and the command centre
view after each such commit.

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
     automatically). Nothing else. Write is needed only for the four write actions; a
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
5. Open `register/open-items.md` (or tap **Clarify** on the home page): a box at the top
   lists what awaits confirmation, and each flagged item has **Confirm** and **Reject**.

After a deploy that changes `site/brain/`, hard-refresh (Ctrl+Shift+R): the browser may
keep the old `app.js`/`style.css` for a while.

To diagnose, open `https://staldex.com/api/brain/tree` in the signed-in window: it shows
the API's raw answer (`{"error": "not configured"}`, a file list, or a Cloudflare error
page). The page shows the API's own error, or `HTTP <status>` for anything that isn't JSON.

Page messages map to API states: **Not set up yet** = 503 `not configured` (step 2 or
3.2 missing, often a token added as a *build* secret); **access unavailable** = 503, the
Worker couldn't fetch the Access signing keys;
**Signed out** = Access session ended or token rejected (401), **github 401/404** = the
token expired or lost access to the repo, **Not saved: changed elsewhere, refresh** = the
file moved on since it was read (409); press Refresh and try again. **Not saved: … is no
longer unconfirmed** (or `close-proposed`) = a session settled that item already (409).

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
- `POST /api/brain/confirm` and `POST /api/brain/reject` `{ id, flag }` → `{ path, sha, commit }`,
  `flag` being `unconfirmed` or `close-proposed`, on `register/open-items.md`.
- `POST /api/brain/progress` `{ id, text[, project] }` → sets the `Progress: <date>, <text>`
  line of a groomed card (with `project`) or an open register item.
- `POST /api/brain/close` `{ id, text }` → an open register item becomes `state: done` with
  `Evidence: <text>`. Refused (409) for an unconfirmed item, a decision or a closed item.
- `POST /api/brain/clock` `{ action: start | stop, ref, start, date?, title, area, lens }` and
  `POST /api/brain/hours` `{ minutes, area | lens | ref, note }` → append a `## HH:MM Time` row to
  `logs/daily/<Perth date>.md` on Brain's `daily-log` branch (created if missing), as a
  `time: …` commit. Stop rows count minutes since the start, capped at 12 h; hours are
  quarter hours up to 12 h. The page holds a clock's start row back for its first minute,
  so a clock stopped under a minute leaves no row (Brain D-114 A).
- `POST /api/brain/focal` `{ ref | '', lens }` → appends a `focal` row the same way: Leon's
  pick of the one thing for today, an empty `ref` going back to the brief's pick (Brain
  D-113 A). Both screens read the day's latest one.
- `POST /api/brain/confirm-all` `{ ids, flag }` → one commit settling every id (`web: confirm all <n>`
  or `web: close all <n>`, Brain D-112 A); if any id is no longer flagged the whole batch is
  refused with **409 `{ error, ids }`** naming them, so nothing is half applied. A close on
  an item still `unconfirmed` lands it and closes it in the one edit, as `/close` now does.
- `POST /api/brain/place` `{ kind: today | next-week, items: [{ ref, note[, kind] }], lens }` → one
  `today` or `next-week` row per item on the daily log, a whole list per commit
  (`time: <date> place <kind> <n>`, Brain D-109 A): the note is the position, `out` or `keep`.
  Both screens read the day's `today` rows (fresh each morning) and the latest `next-week`
  row per item; `/time` now reaches back 42 days so a Next week run's first day is in view.
- `POST /api/brain/promote` `{ project, line }` → a `## Someday` line comes back under `## Inbox`
  for clarifying (`web: promote someday <slug>`, Brain DEV-61026.35); refused if the Inbox
  already has it.
- `POST /api/brain/someday`, `/reference` and `/trash` `{ project, line }` → the Inbox tab's
  first question (Brain D-104 C): the line moves to the queue's `## Someday` section with a
  `someday:` date, is tagged `reference:` for Brain's groom to file, or is removed
  (`web: someday|reference|trash inbox <slug>`).
- `POST /api/brain/categorise` `{ project, line, details }` or `{ id, details }` → Leon's details
  (`title`, `next`, `family`, `priority`, `minutes`, `due`, `owner`) kept on an Inbox line as
  code spans for Brain's scheduled groom, or set on an open register item, which is confirmed
  if new (a family change keeps the old id as an alias).
- `POST /api/brain/decide` `{ id, text }` → an open register item of `kind: decision` becomes
  `state: done` with `Correction: Decided <date>: <text>` (Brain D-111 A). Refused (409) for any
  other kind or an unconfirmed item; Brain's own D-n decisions are not in the register file.
- `POST /api/brain/handled` `{ project, line }` → removes an Inbox line Leon dealt with on the
  spot (Brain D-110 A); the commit keeps the record. `POST /api/brain/inbox` refuses (422) a
  line already in that inbox, so a second tap on a slow save cannot add it twice.
- `GET /api/brain/time?from=<date>` → `{ from, to, rows }`: the parsed time rows of the
  daily logs from `from` to today, at most 14 days. Only rows leave the Worker.

Write errors: 400 bad body, slug, id, flag or text · 403 missing JSON type, Origin or
`X-Brain-Write` · 404 no such project, groomed card or register item · 409 changed
elsewhere, the item no longer carries the flag, or a proposed close on an item not yet
confirmed · 422 file not in the expected shape (no `## Inbox`, duplicate id) · 502 GitHub refused
(for example a read-only token). Read and write routes refuse each other's method (405).

## Design notes

- The tree is cached in-isolate for 30 s; file contents are cached by blob sha (immutable),
  so a page view costs at most three GitHub calls and usually zero.
- The `staldex.pages.dev` mirror is outside Access, but it only carries the empty shell:
  its `/api/brain` doesn't exist, so it has nothing to show.
- Tests (repo root): `node --test tests/brain-*.test.mjs`. They cover the fail-closed
  config, forged/expired/wrong-audience tokens, key rotation, the email allowlist, the
  file allowlist, HTML/script escaping in the renderer, the write guards, the stale-sha
  409, commit messages, the QUEUE transforms (CRLF, missing or existing `## Done`,
  unknown and duplicate ids, a card right before `## Inbox`, a missing Inbox, and
  byte-for-byte preservation of everything else) and the four register edits (each flag
  confirmed and rejected, both flags on one item, settled, unknown and duplicate ids).
