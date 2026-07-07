# Cubicle — Design & Mechanics Reference

This document is the source of truth for game design intent. Use it when asking Claude Code (or any AI assistant) to modify the game, so changes stay consistent with the established systems and tone.

---

## Premise

You are an office worker. The week is Monday to Friday. Each day has a quota of "reports" to file. The game ends when:

- You hit Friday EOD with quota met = **win**
- You miss quota two days = **fired (week-fatal)**
- Bowel pressure hits 100 = **shartastrophe (week-fatal)**
- Jitter hits 100 = **cardiac event (week-fatal)**
- You fall catastrophically behind on a single day = **fired on the spot**

The player manages four meters: **Focus**, **Bowel pressure**, **Jitter**, **Stim load**. They take actions (coffee, nicotine, walk, etc.) to manipulate these. Random events fire throughout the day, some scheduled by previous actions, all written in dry Australian office humour.

The game is wrapped visually in a fake Microsoft Teams-style wellness dashboard called **Vitals 365**. The joke is that the corporate optimism layered over the player's bodily crisis is what makes it funny. The wrapper takes itself seriously; the player does not.

---

## Tone

- **Dry, sincere, Australian.** "Brilliant" not "epic". "Bit slammed" not "super busy".
- **Specific over generic.** Brand names (Bucked Up, Owala, F45, Mi Goreng, Tim Tam, Banh mi, ZYN) signal authenticity.
- **The body is a snitch.** Bowel/jitter are real-feeling, never twee.
- **Corporate satire** — Brad's thought leadership doc, Linda's dry July, Greg's Strava, Marcus from H&S, Karen's banana bread.
- **Never punch down at minorities or marginalised groups.** The targets are corporate culture, productivity culture, and the player's own choices.
- **Light on emojis.** Use them in event titles where they help readability; never in body text.

---

## The action grid (12 actions)

| Action | Focus | Bowel | Jitter | Stim load | Time |
|---|---|---|---|---|---|
| ☕ Coffee | +18 | +14 | +5 | +10 | 4-7m |
| ⊖ Dexi | +26 | +6 | +20 | +25 | 4-7m |
| 🚬 Nicotine | +26 | +14 | +6 | +15 | 8-12m |
| ⚡ Energy drink | +20 | +16 | +12 | +12 | 5-8m |
| 🥤 Pre-workout | +30 | +24 | +32 | +45 | 4-6m |
| 🚶 Walk | +28 | -8 | -15 to -25 (scales) | -5 | 18-24m |
| ⊘ Imodium | 0 | -25 | 0 | 0 | 3-5m (+18 rebound at 2hr) |
| ▤ Slack off | +4 | 0 | -10 | -8 | 15-30m |
| 🍫 Snack | +18 | +12 | -6 | 0 | 4-7m |
| 💧 Hydrate | +6 | +12 | -6 | 0 | 2-4m |
| 🚻 Bathroom | varies | resets to 5 (unless on Imodium) | varies | 0 | 8-30m |
| ⌨ Do work | -22 (then natural decay) | 0 | 0 | 0 | 22-32m, +1 task |

Focus decays at 0.7/min. Bowel rises at 0.35/min. Jitter decays at 0.7/min. Stim load decays at 2.0/min.

---

## Combos

Triggered when two stims are taken within a time window. Apply on the second action.

| Combo | Pair | Window | Effect |
|---|---|---|---|
| The Classic | Coffee + Nicotine (either order) | 15 min | +14 focus, +10 bowel, -4 jitter, lock-in boost |
| Jitter Coffee | Coffee + Coffee | 10 min | +4 focus, +18 jitter |
| Professional | Dexi + Coffee (either order) | 15 min | +18 focus, +8 jitter |
| Danger Zone | Dexi + Pre-workout (either order) | 10 min | +20 focus, +30 jitter, +25 stim |
| Convenience Store | Energy + Nicotine (either order) | 15 min | +10 focus, +10 bowel, +4 jitter |
| Reset | Walk + Coffee (either order) | 20 min | +12 focus, -6 bowel, -12 jitter |
| The Smoke Break | Nicotine + Walk (either order) | 15 min | +15 focus, -6 bowel, -10 jitter |

---

## Lock-in

The "send it" mechanic. Once per day, when focus ≥75, the player gets a chance to commit to a big productivity burst.

**Trigger eligibility (one-shot per day):**
- Focus ≥ 75
- `state.lockInUsedToday === false`
- Triggered only after a stim action

**Chance scales with focus:**
- 75-79: 15%
- 80-84: 25%
- 85-89: 35%
- 90-94: 45%
- 95+: 55%

**Modifiers:** +15% if combo fired in last 20 min, +10% if stim load 30-70, -15% if bowel >70, -10% if jitter >80.

**Lottery (20/40/30/10):**
- 1 task: 20%
- 2 tasks: 40%
- 3 tasks: 30%
- 4 tasks: 10%

**Cost:**
- 18-24 min per task
- Focus drop scales: -10/-12/-14/-16 per task by count
- +3 bowel, +2 jitter per task
- 3+ tasks = 12-min Do Work cooldown ("take five")
- Jitter-fail risk if jitter >55 during the lock-in

---

## Productivity Blackout

Separate from lock-in. Fires automatically on Do Work when conditions are met.

**Trigger:** Stim load >75 AND focus ≥60 → 40% roll.

**Outcomes:**
- 60% of triggers: +1 bonus task (2 total)
- 25%: +2 bonus tasks (3 total)
- 15%: backfire — task filed but +20 jitter, quality dropped

Flavour writes itself: *"You sat down at 11:47. You looked up at 11:47. Two reports were filed. You don't remember writing them."*

---

## Forced events

Some events fire automatically based on state, not random pool.

- **Stim crash** — stim load >90 — choose: sugar / walk / suffer
- **Forced pre-W crash** — scheduled 85-100min after every pre-workout (regardless of current load)
- **Two scoops** — taking a second pre-workout in one day — forced 50/50: hospital (instant cardiac fail) or "ascension" (+40 focus, +25 jitter, +25 stim)
- **The shakes** — three coffees within 30 game-minutes — choose: sit still / lap of building / power through

These bypass the trigger window and `shownEvents` dedup; they are guaranteed.

---

## Event system

**60 unique events**, organised:
- 40 standard (any day, random pool)
- 15 day-specific (`daysOnly: [n]`)
- 5 conditional (high bowel, high jitter, stim crash, sweat, etc.)

Each event has:
- `id` — unique key
- `title` — short heading with emoji
- `desc` — flavour body
- `triggerWindow: [start, end]` — optional, restricts firing to specific minute range
- `daysOnly: [n]` — optional, restricts to specific weekdays
- `triggerOn: 'high_bowel'|'high_jitter'|'critical_bowel'|'stim_crash'|'forced'` — optional
- `titleClass: 'good'|'warn'|'callback'|'crash'` — visual styling
- `choices: [{label, apply}]` — outcomes

**No event repeats within a week** (`week.shownEvents` is a Set persisting across days). Exceptions: `gut_warning` and `pavlov_ping` can repeat.

### Trigger windows

Some events are time-gated so they only fire when narratively appropriate:

| Event | Window (mm) | Equivalent time |
|---|---|---|
| `mon_inbox`, `fri_casual` | 540-630 | 9:00-10:30 |
| `mon_pep_talk` | 570-660 | 9:30-11:00 |
| `karen_baking` | 540-660 | 9:00-11:00 |
| `mon_gossip` | 540-690 | 9:00-11:30 |
| `free_donuts` | 570-690 | 9:30-11:30 |
| `lunch`, `tue_tacos` | 690-810 | 11:30-13:30 |
| `wed_panic` | 780-930 | 13:00-15:30 |
| `phone_buzz` | 630-930 | 10:30-15:30 |
| `tue_3pm_slump` | 870-930 | 14:30-15:30 |
| `birthday_song` | 840-960 | 14:00-16:00 |
| `boss_holiday`, `thu_friday_check`, `leaving_party` | 840-990 | 14:00-16:30 |
| `wed_drinks`, `thu_new_friday` | 840-1020 | 14:00-17:00 |
| `fri_early`, `fri_pub_run` | 870-990 | 14:30-16:30 |

Time is stored as absolute minutes since midnight (540 = 9:00, 1020 = 17:00).

---

## Mornings

Day starts with a "morning condition" — a one-time stat-setting event with flavour. Some days are gated (`days: [0]` etc.) and some morning conditions affect future events:

- **Tinder walk of shame** → sets `state.flags.walkOfShame` → modifies compliment event
- **Dodgy kebab** → schedules `kebab_revenge` callback
- **Hungover** → ramps bowel and focus drift
- **Pre-dosed** → starts with stim load 25 and high jitter
- **F45 morning / Therapy yesterday** → zen flag, reduces jitter drift impact

The **parking spot** event has a 25% chance of firing at day start (any day) — described as "half the office must be WFH today, the lot's a ghost town". Sets `gotParkingSpot` flag which schedules a Greg complaint callback 2-4 hours later.

---

## Callbacks (event memory chains)

Past actions schedule future events. Stored in `state.scheduled` as `{at, eventId}` and fired by `maybeTriggerEvent`.

Examples:
- Fake call to escape Gary → `gary_revenge` 3-5hr later
- Pretend no English with Gary → `gary_returns` 2-3hr later with Google Translate
- Spill coffee → `sticky_keyboard` later
- Ignore urgent email → `urgent_returns` with boss CC'd
- Ignore mum's call → `mum_again` later
- High Gary grudge → next-day 14-paragraph IT POLICY email
- High Linda grudge → next-day retaliatory crisps
- High Tara grudge → printer etiquette email blast
- High Brad grudge → recurring "alignment sync" meeting
- Second walk of day → `greg_walk_validation` ("getting after it mate!")

---

## State-aware event flavour (interconnection layer)

Same event reads differently based on state. Implemented via `state.history` flags read inside `apply` functions.

Current cross-references:
- **Boss compliment** — different variants if jittery / on dex / walk-of-shame morning
- **Boss laugh** — different variants if on dex/pre-W / high jitter
- **Lunch** — flavour changes if $20 in jacket triggered earlier, or if pre-workout still active
- **Boss check-in** — friendly if `bossLaughed` or `greatWorkFwd` flag, painful if `bossCompliment` flag and behind on quota
- **Bathroom** — "cement" outcome if Imodium taken within last 100 min (no relief, wasted time)

---

## Scoring

**Per-day score:** each Do Work adds `floor(focus/10)` points. Lock-ins score per-task.

**Week grade formula:**
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

## Key state objects

```js
// Per-day state, reset each morning
state = {
  time: 540,              // minutes since midnight
  focus, bowel, jitter, stim: 0-100,
  tasks, dayScore, quota,
  loperamide,             // banked Imodium count
  alive,
  lastStim: {action, time},
  lastLockIn, lockInUsedToday,
  flags: {},              // morning flags (hungover, dodgyGut, zen, walkOfShame, etc.)
  scheduled: [{at, eventId}],
  morning: {...},
  history: {              // tracking for interconnection
    coffees, nicotines, dexes, energies, preworkouts, walks, snacks, bathrooms,
    lastAteAt, lastImodiumAt,
    coffeeTimes: [],      // for triple-coffee detection
    bossLaughed, bossCompliment, greatWorkFwd, gotParkingSpot, twentyInJacket,
    dexUntil, preworkoutUntil,  // active substance windows
    blackoutsTriggered,
    gregWalkValidated, walkPipDecayUsed,
  }
}

// Week state, persists across days
week = {
  dayIndex: 0-4,
  weekScore, totalTasks, totalQuota, daysMissed, daysWon, perfectDays,
  shartCount, cardiacCount, bossWarnings,
  bathroomTrips, stimsConsumed, combosTriggered, lockInsSeized,
  pipRisk,                // wired but not fully consumed by events yet
  dayResults: [],
  grudges: {gary: n, linda: n, tara: n, brad: n, greg: n},
  shownEvents: Set,       // no repeats across week
  midweekDrinks: bool,    // Wed drinks → Thu hangover
  bossOnHoliday: bool,
}
```

---

## Pending / future work

The codebase has infrastructure for things not yet fully wired:

- **PIP risk system** — `week.pipRisk` accumulates from dodging meetings/lying, walks decay it (-1/day), but the Mandatory Values Refresher and PIP Discussion trigger events don't exist yet. Thresholds suggested: 4+ → Values Refresher (55 min event), 7+ → PIP discussion + warning, 10+ → instant fail.
- **End-of-week summary** — currently shows score and basic stats. Could show blackouts triggered, two-scoops survival, lock-in seizure rate, etc.
- **Save state** — `localStorage` works in Capacitor WebView. Would persist `week` between sessions.
- **Sound effects** — Slack ping, lock-in pulse, combo banner could all benefit.
- **Achievement system** — "First Lock-In", "Survived 5 Mondays", "The Classic ×10".

---

## Design philosophy

When adding to the game:

1. **Interconnection over isolation.** New events should reference existing flags or set new ones for future events to read. The texture comes from the game *remembering things*.
2. **Punishment should be a beat, not a wall.** Mistakes cost time and stats but rarely end the run. Only the bowel/cardiac/missed-quota-twice paths are week-fatal.
3. **Reward attentive play.** Players who notice patterns (combos, trigger windows, callbacks) should consistently outperform players who mash actions.
4. **Specific > generic.** "Linda is doing dry July in May" beats "a colleague is on a diet". Always.
5. **The wrapper takes itself seriously.** Vitals 365 never winks at the camera. The corporate optimism layered over the player's crisis is the joke.
