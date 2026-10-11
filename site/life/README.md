# Staldex Life Admin

An unlisted, dependency-free static app at **/life/**. Everything lives in
site/life/, so Cloudflare Pages serves it without a build step.

## What it does

- **Overview** — overdue, today, the next seven days, waiting-on, upcoming
  reference dates, life areas, active outcomes, quick capture, and your top three.
- **Actions** — owner, life area, due date, importance, notes, status
  (to do / in progress / waiting / done), project, search and filters.
- **Recurring actions** — daily, weekly, fortnightly, monthly, quarterly and
  yearly. Completing an instance advances its next date beyond today; the
  completion count and last completion are retained. Monthly schedules
  preserve the original day-of-month anchor where possible.
- **Outcomes** — multi-action projects with owner, category, target date,
  progress, and a quick way to add or view related actions.
- **Reference** — useful links, notes and dated reminders; not a credentials
  store or place for sensitive documents.
- **Weekly reset** — five practical review prompts, a top-three spotlight,
  overdue actions, loose inbox actions, and a running weekly note.
- **Backup** — JSON export, validated import, browser-local data and a
  deliberate CLEAR-to-reset flow.

Areas are preconfigured; owners start as Leon, Rahana and Shared and can be
changed in Settings.

## Privacy and persistence

The application has **no backend, account, telemetry, analytics, or remote
requests** of its own. It uses browser localStorage scoped to the Staldex origin
and includes only generic app code in GitHub. On-device records are NOT synced
to other browsers/devices, and clearing site data may remove them. Users should
download backups regularly and protect those JSON files.

**Unlisted != authenticated.** No homepage navigation link has been added;
the page has noindex but is publicly accessible by URL. Avoid passwords,
identity details, banking credentials, sensitive medical details, and private
document contents. It is not encrypted and other scripts on the same origin
could access browser storage. Adding cross-device sync in future should use
separate authenticated storage, not the unprotected LRMP sync Worker.

The sidebar links to the existing /lrmp/ planner (on desktop); an overview
link is also exposed to support phone use.

## Implementation

- index.html — shell, dialogs, semantic navigation.
- style.css — responsive layout.
- core.js — pure state, dates, repeat schedule, sanitisation and metrics.
- app.js — UI rendering, local persistence, interactions, backup.

No app/framework build or package installation is needed.

Run model tests from repo root with:

    node --test tests/life-admin.test.mjs

Smoke test in a modern browser: create and edit an action, select a focus task,
complete a recurring action, assign it to an outcome, add a reference with a
date and link, export and import a backup, refresh to verify persistence, and
repeat with mobile viewport.

## Deliberate V1 limits

No push reminders, cloud syncing, household multi-user collaboration,
calendar/email integrations, file attachments, or historical analytics.
Actions are deliberately separate from the LRMP meal planner: it is linked,
not embedded or duplicated.
