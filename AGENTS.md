# Working in this repository

Notes for anyone, human or agent, changing this repo. Keep it short and team-neutral.

## What is here

- `site/`: the staldex.com Pages site (static, no build step). `site/STYLE.md` is the
  visual style guide.
- `worker/`, `worker-lrmp/`, `worker-brain/`: Cloudflare Workers, each deployed by
  Workers Builds from `main` with that folder as its root. Setup and smoke tests are
  in each folder's `README.md` and in `DEPLOY.md`.
- `cubicle-app/`, `lrmp/`: app sources; see `DEPLOY.md` before changing their synced or
  built copies under `site/`.

## Rules

- **This repository is public.** Never commit tokens, credentials, email addresses,
  allowlists or personal details. Secrets live only in the Cloudflare dashboard as
  Worker runtime secrets.
- **Brain viewer** (`site/brain/`, `worker-brain/`): it reads a private repository live
  through the Worker, behind Cloudflare Access. Never commit Brain content here, not even
  in test fixtures; use synthetic data. Its home page (`site/brain/home.js`) renders the
  read-only command centre view that Brain generates as `views/command-centre.json`;
  keep `home.js` free of imports so the tests can load it alone. Its only writes are the
  Worker's `WRITES` table: queue edits (done, Inbox line, Progress, categorise a line, remove a handled line),
  register edits (Confirm, Reject, Progress, close with Evidence, categorise) and time rows on Brain's `daily-log`
  branch (task clock, hours entered); their edits follow Brain's own rules, so change them
  only from a Brain request. Bump the `?v=` on the
  asset URLs in `index.html` and the imports in `app.js` when those files change, so
  phones pick up a deploy without a hard refresh.
- Change things through pull requests to `main`; `main` deploys.
- Run the tests before pushing: `node --test tests/*.test.mjs` from the repo root.
- For a Brain viewer change, look at it before merging: `node tests/brain-preview.mjs`
  serves `site/` locally with synthetic data and saves phone-size screenshots of the home,
  its tabs and a tapped item (`--out <dir>`, default `brain-preview/`). After the deploy,
  `--url https://staldexgames.pages.dev` runs the same check against the live site.

## Decisions

Put anything the owner must decide as numbered decisions (1, 2, 3…). For each give
**Context** (what we're trying to achieve, in plain terms), **Options** lettered A, B, C
with their trade-offs, and a **Recommendation** with the reason. Replies like `1A 2B` or
`all rec` should work.

## Handing results back

Work here is usually requested from a Brain session. Report back to that session with
the pull request links, what is live, anything that needs a dashboard step, and any open
decisions. Brain's own state is updated by a Brain session, not from this repository.
