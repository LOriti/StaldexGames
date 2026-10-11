# Staldex Life Admin

An unlisted, dependency-free static app at **/life/**. Everything lives in
site/life/, so Cloudflare Pages serves it without a build step.

## What it does

- **Next days (primary screen)** — rolling 7-/14-day view, each day showing actual
  activities plus their times, people, locations, transport, care/handovers
  and logistics. Move forward/back by weeks or jump to a date.
- **Coordination** — watchlist of tentative, time-TBC or logistics-not-ready
  activities, with person-specific alerts for potentially overlapping timed
  plans. A separate care/handovers panel shows who is covering what.
- **Calendar activities** — one-off or repeated (daily, weekly, fortnightly,
  monthly etc.), all-day, fixed-time or unconfirmed-time, optional multi-day
  spans of up to 30 days, with one-occurrence skip and optional repeat-until.
  Copy the selected period as text or print/save it as PDF.
- **Overview** — overdue, today, the next seven days, waiting-on, upcoming
  reference dates, life areas, active outcomes, quick capture, a next-72-hours preview, and your top three.
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

Areas are preconfigured; owners start as Me, Partner and Shared and can be
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
- schedule-view.js — rolling dayboard, coordinated-activity cards, copy text.
- schedule.css — responsive dayboard and printable layout.

No app/framework build or package installation is needed.

Run model tests from repo root with:

    node --test tests/life-admin.test.mjs tests/life-schedule.test.mjs tests/life-schedule-view.test.mjs

Smoke test in a modern browser: start on Next Days, add timed care and work
activities, make one weekly, skip a single occurrence, add a multi-day trip,
confirm the 7-/14-day and prev/next navigation, verify the coordination panel,
copy and print the agenda. Then create and edit an action, select a focus task,
complete a recurring action, assign it to an outcome, add a reference with a
date and link, export and import a backup, refresh to verify persistence, and
repeat with mobile viewport.

## Deliberate V1 limits

No push reminders, cloud syncing, household multi-user collaboration,
calendar/email integrations, file attachments, or historical analytics.
There is no automatic inference of missing childcare coverage or travel time;
the coordination watchlist is based on flags/confirmation and explicit timing,
and a clash alert needs overlapping times plus shared named owners/participants.
No actual appointments or care rosters are seeded from earlier conversations.
Actions are deliberately separate from the LRMP meal planner: it is linked,
not embedded or duplicated.
