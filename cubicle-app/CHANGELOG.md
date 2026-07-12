# CUBICLE — Build Changelog

A summary of every system change made across the build, from the first prototype to the final Viva Insights wrap.

---

## v1.0.5 (versionCode 6) — UI pass, leaderboard, project moved into GitHub

> **Status: web-only.** This version shipped to staldex.com/cubicle but was never built
> as an Android release — the native app is parked at v1.0.4 for now. If/when Android
> resumes, this is the pending versionCode 6 build.

- **Desktop phone-frame layout**: the game now renders inside a 480×900px frame,
  centered with a letterboxed background, when opened in a desktop browser (previously
  stretched full-bleed). No change on the native app, which already fills the screen.
- **Mode-select**: 3-Day Sprint listed above Full Week and pre-selected as the default.
- **DNF outcome**: a wellbeing incident (shart/cardiac/fired-for-pattern) now runs into
  the full end-of-week summary — ratings, day strip, next-week punchline — with a red
  "DNF" grade badge, instead of jumping to a separate bare game-over screen. DNF runs
  CAN submit to the leaderboard (grade shows as "DNF").
- **Leaderboard live** at `staldex.com/api/cubicle` (Cloudflare Worker + D1): name +
  best-score-per-board submission, six boards ({week|sprint} × {normal|hungover|openplan}),
  six personality ratings stored and the standout trait shown per entry. Boards are
  hard-capped at top 10 — better weeks push the junk off the bottom.
- **Week-end modal**: Week summary / Leaderboard tab toggle (replaces the stacking
  "View leaderboard" button that overflowed the screen); board auto-refreshes after
  submitting; split length/difficulty selectors defaulting to the mode just played;
  column headers (#, Name, Grade, Trait, Tasks, Days, Score); lock-ins/blackouts/
  combos/boss-warnings condensed to one icon-chip strip.
- **Resign button** in the header — abandon the run and return to the mode select.
- **Project relocated**: the whole Capacitor/Android project moved from a local-only
  folder into `StaldexGames/cubicle-app/` — see the versioning protocol at the top of
  `RELEASE.md`. Everything now lives in git; no more ad-hoc `.bak` copies.

---

## The arc

1. **v1** — Bare prototype. One day, simple stim/work/bathroom loop.
2. **v2** — Quotas, hourly boss check-ins, randomised endings.
3. **v3** — Random events, morning conditions, callback events that bite later in the day.
4. **v4** — Walked → modafinil dropped, action time flex, variable bathroom outcomes.
5. **v5** — Full week (Mon-Fri), persistent grudges across days, weekly grade.
6. **v6 (this build)** — Stim load, lock-in mechanic, 60 unique events, combos, action timing flex, Viva Insights wrapper.

---

## Mechanics added in the final build

### Stim Load (4th meter)
A fourth metric tracking cumulative stimulant intake. Decays naturally at 2/min.

| Stim | Stim Load added | Focus |
|---|---|---|
| Coffee | +10 | +15 |
| Energy drink | +12 | +18 |
| Nicotine | +15 | +22 |
| Dex | +25 | +28 |
| Pre-workout | +35 | +35 |
| Walk | -5 (active recovery) | +22 |

**Diminishing returns:**
- Load 0-40: stims at 100% effect
- Load 41-70: stims at 80%
- Load 71-90: stims at 60%, surge chance bumped
- Load >90: stims at 40%, forced crash event fires

### Forced stim crash
Auto-triggered when load >90. Pre-workout always schedules one 85-100 game-minutes later regardless of load. Three response options: eat sugar (patch), walk it off (real reset), suffer (brutal cost).

### Lock-in mechanic
Triggers when all conditions are met after a stim:
- Focus ≥ 70
- Jitter between 30-70
- Bowel < 60
- Stim load between 30-80
- 60+ game-minutes since last lock-in

35% chance to fire. Player gets a 5-second real-time countdown to commit.

**Lottery payouts:**
- 1 task — 25% chance
- 2 tasks — 40% chance
- 3 tasks — 25% chance
- 4 tasks — 10% chance

Each task: 10 game-minutes, -8 focus, +3 bowel, +2 jitter. Jitter-fail risk if jitter >55. Post-lockin cooldown: Do Work disabled for 15 game-minutes.

### Combo system
Seven stim combos detected when paired within a time window:

| Combo | Pair | Window | Bonus |
|---|---|---|---|
| The Classic | Coffee + Nicotine | 15 min | +10 focus, +12 bowel, lock-in boost |
| Jitter Coffee | Coffee + Coffee | 10 min | +5 focus, +15 jitter |
| Professional | Dex + Coffee | 15 min | +15 focus, +10 jitter |
| Danger Zone | Dex + Pre-workout | 10 min | +20 focus, +25 jitter, +20 stim |
| Convenience Store | Energy + Nicotine | 15 min | +8 focus, +10 bowel, +6 jitter |
| Reset | Walk + Coffee | 20 min | +10 focus, -10 jitter |

Each fires a banner across the screen and a log line.

### Action timing flex ranges

| Action | Old | New |
|---|---|---|
| Coffee | 5 | 5-8 |
| Dex | 3 | 4-7 |
| Nicotine | 8 | 8-12 |
| Energy | 4 | 5-8 |
| Pre-workout | 3 | 4-6 |
| Walk | 20 | 20-28 |
| Imodium | 2 | 3-5 |
| Slack off | 10 | **15-30** |
| Do Work | 25 | **22-32** |
| Bathroom | 4-22 | **8-30** |

### Imodium nerf
- Effect: -25 bowel (was -40)
- Schedules a rebound event ~2 hours later that adds +18 bowel
- Now a real tradeoff, not a free panic button

### Bowel surge scaling
Surge chance now scales with the specific stim's bowel impact:
- Pre-workout: 75% at bowel >60
- Nicotine: 55%
- Energy: 40%
- Coffee: 35%
- Dex: 25%

### Event timing buffer
When an action resolves and an event is queued, a 600ms "EVENT INCOMING" state activates:
- Time display switches to "EVENT INCOMING" text
- Time pill turns amber
- All action buttons disabled
- After 600ms the event modal opens

Prevents the visual confusion where stats update and event modal pop in the same frame.

---

## Content additions

### 60 total events (up from 27)
- **40 standard events** (any day)
- **15 day-specific events** (3 per day, gated by `daysOnly`)
- **5 conditional events** (stat-gated: high bowel, high jitter, critical bowel, stim crash, lock-in)

`shownEvents` is now stored on the week-level set, so no event repeats across the 5-day run.

**New standard events added:** Pavlovian Slack ping, Karen's perfume cloud, Boss is on holiday, Dropped pen behind desk, Mandatory AI tool training, Leaving party, No-agenda calendar invite, Unknown number recruiter call, Office plant dying, 2FA meltdown, Surprise 1:1, Aircon dripping, Greg's Strava, Power outage, Karen's baked goods, Screen-sharing all day.

**New day-specific events:**
- Mon: Inbox apocalypse, Priya's weekend gossip
- Tue: Brad's thought leadership doc, 3pm slump, Tuesday tacos
- Wed: Half-week panic, Linda's dry July
- Thu: Thursday is the new Friday, Boss Friday check, Late-arriving project
- Fri: Pub run, Casual Friday gone wrong

**New conditional events:** Sweat moment (high jitter), Stim crash (load critical).

Note: critical bowel does **not** auto-trigger a bailout event — the player must manage it themselves. Hitting 100 is the shart. The body does not save you.

### Closed grudge loops
Previous versions tracked Tara and Brad grudges but never triggered anything. Now:
- **Tara grudge** (≥2): triggers passive-aggressive printer etiquette email next day
- **Brad grudge** (≥2): triggers recurring "alignment sync" meeting invite
- Gary (≥3): 14-paragraph IT POLICY email
- Linda (≥3): retaliatory crisps at your desk pod

### Expanded flavour pools
Stim flavour lines: 8-10 variants per stim (was 4-6).
Scroll/bathroom/work/staring/jitter-fail pools all bumped to 5-12 variants.

---

## Visual redesign — Concept C: Viva Insights

The whole game is now framed as a Microsoft Viva Insights dashboard. Sincere corporate.

### Chrome
- Segoe UI typography
- Microsoft purple primary (#5b5fc7)
- Viva-style header with logo + nav (Home / Wellbeing / Productivity / Team)
- User avatar top-right with role label

### Stats as KPI tiles
- Tasks today, Week score, Imodium count, Time left
- Behind-pace tile turns amber and shows "⚠ Behind pace"

### Wellbeing meters
- Focus, Bowel pressure, Jitter index, Stim load
- Real-time biometrics framing ("Data exclusive to you and HR")

### Wellbeing score
- Composite metric (focus + inverse of bowel/jitter/stim)
- Big number, trend arrow, contextual blurb
- Updates continuously

### Insights cards
Replaces the modal-only event system with cards styled as Microsoft "Insights":
- Purple for standard events
- Green for positive
- Amber for warnings
- Red for critical
- Event titles use icon prefixes (📧 📅 ⚠ ✨)

### Activity feed
- Replaces the old log
- Timestamps in subdued grey
- Colour-coded entries: action, event, good, warn, crit, boss, callback, combo

### Pills system
Persistent labels in the header showing morning conditions and active grudges. Colour-coded.

### Week strip
Five-day overview at the top of the right column. Green for won days, red for missed, gold for perfect (★).

### End-of-day and end-of-week modals
Clean Fluent UI styling. Per-day breakdown with check/cross/star indicators. Grade letter (S/A/B/C/D/F) styled like a corporate dashboard score.

---

## Scoring

### Per-day score
Each work action: `floor(focus / 10)` points. Lock-ins score per-task.

### Week grade formula
```
score = (totalTasks / totalQuota) × 100
      + perfectDays × 8
      + min(combos, 5) × 2
      + lockIns × 3
      - bossWarnings × 4
      - daysMissed × 12
      - 50 (if any shart or cardiac)
```

| Score | Grade | Verdict |
|---|---|---|
| ≥110 | S | Inhuman. HR reviewing CCTV. |
| ≥95 | A | Elite. Promotion incoming. |
| ≥80 | B | Solid. Future here. |
| ≥65 | C | Survived. Bar cleared. |
| ≥50 | D | Rough. Boss wants a chat. |
| <50 | F | Disastrous. Update LinkedIn. |

---

## Failure conditions

**Soft fail (forgivable):** Miss quota on one day. Wellbeing score drops, week continues.

**Week-fatal:**
- Miss quota on two days → boss calls it a pattern, fired
- Bowel hits 100 → Shartastrophe (various flavours)
- Jitter hits 100 → Cardiac event (various flavours)
- Catastrophically behind on a single day (deficit >3.5 tasks before noon) → fired on the spot

---

## Things still on the table

If we want a v7:

- **Save state** — close the tab Wednesday, lose your week. Could persist `week` and `state` to localStorage.
- **Saturday / Sunday recovery** — choose how you spend the weekend, sets up Monday morning differently.
- **Boss personality** — currently the boss is a generic boss. Could randomise per week (micromanager, ghosted boss, weirdly nice boss).
- **Sound effects** — a single "ding" on Slack pings would land.
- **Achievement system** — "First Lock-In", "Survived 5 Mondays", "The Classic ×10", etc.
- **Mobile layout** — current build is 980px-wide desktop. Could responsively reflow.
- **Difficulty modes** — Easy (8 tasks/day, lenient boss), Hard (10 tasks/day, no Imodium banking), Hardcore (one mistake = run over).
