# Invasion — game design and mechanics

The playable build is one self-contained file, `site/invasion.html`, served at
`staldex.com/invasion` and listed under Games on the homepage (old path `/lead-time` and short forms redirect there). There is no
build step, no Worker and no server state; the best score is kept in the player's browser.

This document is the source of truth for how the game works. When a number in the code
changes, change it here too.

## Premise

Earth confirms a hostile signal from 100 light-years away: an advanced fleet arrives in a
century. The player is the single Director of Planetary Preparedness. The score is how long
humanity lasts once the invasion begins. Winning is possible but hard (see Victory).

- Phone only, portrait, about 10 minutes a run at 1× (4.5 s per year; 2× and 4× available).
- The invasion is watched, not played, apart from three war council calls.
- The enemy stays a mystery: you only learn what it brought in the debrief.
- Serious tone, written as briefings, council minutes and dispatches; dry, never jokey.

## Run structure

| Stage | What happens |
|---|---|
| Detection, Year 0 | Briefing; enemy profile rolled in secret |
| The century, Years 1–100 | Real time with pause. Programs, projects, intel every decade, events |
| Vanguard, Year 90 | Their scouts skirmish in orbit: a second capability is revealed and each lane's result is shown |
| Arrival, Year 100 | Time stops: final purchases, mothball or reactivate with every tab open, one enemy capability confirmed, then the war council at Year 100 (reactivations, leftovers to a lane) |
| Invasion | Three waves in four lanes, with turning points, lane chatter and a war council call after each wave; a long war if any fleet survives |
| Debrief | Win grade or time survived, the war chart, lanes per wave, manpower spent, calls, intel vs reality |

## Screen (one screen, no scrolling)

- Top bar: Year and T-minus, Effort, Research, Population with change per year; pause and speed.
- Earth view (150px, switches per tab) with a side screen of 2–3 tiles.
- Meters as one row of chips (Stability, Industry, Knowledge, Resolve, Traitors); tap for drivers and what each feeds.
- Tabs: **Society · Economy · Projects · War Room**. Empire is gone: its projection, match-up and
  "rests on" moved to the War Room, the Effort ledger to Economy.
- Ticker at the bottom carries the log, plus the vanguard and spend-down warnings.
- **Tap any number** (side tiles, meter chips, project output, crew bars, lanes) for a sheet with the full calculation.

| Tab | Side screen | Content |
|---|---|---|
| Society | Manpower, Traitors, Growth | People programs (Welfare, Unity, Family, National Service, Basic Training, Internal Security) and Purge |
| Economy | Effort, Income, Research | Economy programs and the upkeep ledger |
| Projects | Selected project's readiness chain | Subtabs (tap the active one for branch scores). Cards: Level pips (Effort), Mk pips (Research), output as "+41 of 52" (actual vs fully crewed), crew bar (regulars, conscripts, unfilled), buttons showing the gain and crew change ("frees 0.13bn · conscripts out"), mothball / reactivate |
| War Room | Manning, Intel, their supply | Match-up per lane: your Year 100 readiness vs their likely range from intel, predicted result; battle estimate from 24 sampled enemies (fleet destroyed, Repel and Outlast chance, weakest lane and fixes); what readiness rests on; intel reports and readiness by type behind taps. No days |

## Currencies and meters

### Effort (base currency)

```
gross  = workforce × Industry × 0.011 × (0.7 + Stability/200) × Infrastructure × (0.9 if Dispersed Society)
net    = gross − upkeep of every built project
workforce = Population − crew in service
```

Starts at 30. Can go negative from events (debt). In debt you cannot buy anything with Effort;
income pays it down. If net income is negative and there is nothing left to pay with, projects
run underfunded (funding % = what can be paid ÷ upkeep) and lose that share of their strength.

### Research (secondary currency)

```
research/yr = (Knowledge × 0.035 + 0.5 × (size of Signal Analysis + size of Xenobiology Lab)) × Universities
```

Starts at 3. Never called "RP" in the UI. Can go negative from events (research debt), which
blocks tech improvements until cleared.

### Population

Starts at 8.0bn. Growth per year = Population × (0.4% × Stability/50 + 0.1% per Xenobiology size).
Family Policy adds +0.05% to the base rate. Population is the workforce, the crew pool, a
Resistance multiplier and the survivor count.

### Manpower

```
military-able = Population × (25% + Resolve/1000 + 3% per National Service)
trained       starts at 0.12bn; grows each year by military-able × 0.3% (+0.3% per Basic Training)
crew needed   = Σ project crew × (1 + 0.4 × (size − 1)) × Mk crew factor × Counter-AI factor
Mk crew factor: Mk I 1.00 · Mk II 0.65 · Mk III 0.40 · Mk IV 0.30
deployed      = trained first (regulars), then untrained military-able (conscripts)
crew strength = (regulars + 0.5 × conscripts) ÷ crew needed
reserves      = trained − regulars deployed
```

Crewed projects run at crew strength. Conscripts fight at half strength. Real-world check: 35–45%
of a population is typically fit for service, but only around 1% serves, so trained starts small.

**Mothballing:** any built project with crew or upkeep can be mothballed: 0 crew, upkeep −70%,
readiness 0, and experience or maturity fades (counted age falls 0.5 years each year, about −1%/yr).
Reactivating is immediate, except at Year 100, where a reactivated project starts the war at 50%.

### Meters (0–100)

| Meter | Start | Trend per year | Feeds |
|---|---|---|---|
| Stability | 60 | Moves 2% of the gap toward its settle point (50, +2 per Welfare); −0.5 extra if Resolve < 30 | Effort multiplier, population growth, Occupation length, Traitors readiness, Traitors trend |
| Industry | 45 | +0.10, +0.05 per Industrial Mobilisation | Effort, Siege and Orbital readiness |
| Knowledge | 25 | +0.15, +0.05 per Research Grants | Research, intel reliability, Bio and Swarm readiness, Traitors via the signal |
| Resolve | 55 | −0.35, +0.10 per Unity Campaign | Crew pool, Resistance length, Ground and Traitors readiness, Traitors trend |
| Traitors | 5 | see below | Enemy Traitors strength at the invasion |

Riots: Stability < 20 gives a 25% yearly chance of Industry −4 (blocked by Strategic Reserves).
Surrender movements: Resolve < 20 gives a 25% yearly chance of Stability −4.

### Traitors

Humans working for the enemy: believers and defectors, armed with code hidden in the signal.

```
trend/yr = +0.30 base
         + Knowledge × 0.005   (signal decoding; zero once Counter-AI Network is built)
         + (50 − Stability) × 0.02 + (50 − Resolve) × 0.01   (loyalty gap; negative when high)
         − Internal Security
```

Also moved by Research Grants (+2 each) and event choices. Log lines at 25, 50 and 75.
At the invasion: if the enemy brought Traitors, its strength gains Traitors × 0.8. If not, a
level above 20 still tests the Occupation phase at strength Traitors × 1.2.

## Programs (Economy and People tabs)

Each costs Effort: 10, then +5 more each time it is funded. Each gives a small effect now and a
permanent effect every year after, so early funding compounds. The side screen beside Earth shows how the
tab's numbers add up, so the tabs themselves hold only the program cards.

| Tab | Program | Now | Permanent |
|---|---|---|---|
| Economy | Industrial Mobilisation | +3 Industry, −2 Stability | +0.05 Industry/yr |
| Economy | Infrastructure Program | — | Effort income ×1.05 (stacks) |
| Economy | Research Grants | +3 Knowledge, +2 Traitors | +0.05 Knowledge/yr |
| Economy | University Expansion | — | Research output ×1.06 (stacks) |
| People | Public Welfare | +4 Stability | Stability settle point +2 |
| People | Unity Campaign | +4 Resolve | +0.10 Resolve/yr |
| People | Family Policy | +1 Stability | +0.05% population growth |
| People | National Service | −1 Stability | +3% of Population military-able |
| People | Basic Training | +2% of military-able trained | +0.3% of military-able trained per year |
| People | Internal Security | −8 Traitors, −3 Stability | −0.15 Traitors/yr |

Previews show only the effect on income, research, growth, crew and readiness. Survival is
shown only in the Empire tab.

## Projects

Three branches of four tiers plus three emergent projects. A tier needs the previous tier in its
branch built. Emergent projects appear once both of their requirements are built.

- **Effort builds and expands size** (1–4): +35% strength per size, +40% crew and upkeep.
  Price = Effort cost × (1 + 0.8 × current size).
- **Research improves tech** (Mk I–IV): +25% strength per level, crew ×0.65 / 0.40 / 0.30 (Mk II–IV), upkeep −10% per level.
  Price = Research cost × (1 + 0.8 × current tech). Only once built.
- **Growth over time:** Defence projects gain experience (2%/yr compounding, max ×3); all others
  mature (1.5%/yr compounding, max ×2.5), counted from the year built.

```
project readiness = base × 1.35^(size−1) × 1.25^tech × experience or maturity × crew strength × funding %
```

| Branch | Project | Effort | Research | Crew bn | Upkeep/yr | Readiness | Other |
|---|---|---|---|---|---|---|---|
| Defence | Planetary Defence Grid | 15 | 10 | 0.10 | 0.3 | +10 Orbital, +10 Swarm | |
| Defence | Global Legion | 30 | 20 | 0.50 | 0.5 | +20 Ground, +5 Swarm | |
| Defence | Orbital Fleet | 50 | 35 | 0.20 | 0.8 | +25 Orbital, +10 Swarm | |
| Defence | Planetary Lance | 80 | 50 | 0.05 | 1.0 | +20 Orbital, +10 Ground | |
| Endurance | Strategic Reserves | 15 | 10 | — | 0.2 | +15 Siege, +5 Bio | Riots no longer cut Industry |
| Endurance | Hardened Cities | 30 | 20 | 0.05 | 0.3 | +10 Orbital, +10 Ground, +5 Siege | |
| Endurance | Deep Bunkers | 50 | 35 | 0.10 | 0.4 | +20 Siege, +10 Orbital, +10 Bio | |
| Endurance | Dispersed Society | 80 | 50 | — | — | +15 Bio, +10 Traitors, +10 Ground, +10 Siege | Effort ×0.9; 30% fewer invasion deaths |
| Science | Signal Analysis | 15 | 10 | 0.02 | 0.1 | — | +0.5 Research/yr per size; intel +15% (+5% per tech) |
| Science | Xenobiology Lab | 30 | 20 | 0.05 | 0.3 | +25 Bio | +0.5 Research/yr and +0.1% growth per size |
| Science | Counter-AI Network | 50 | 35 | 0.05 | 0.5 | +25 Traitors, +15 Swarm | Crew ×0.7 (−0.1 per tech, floor 0.4); blocks signal Traitors |
| Science | Shield Physics | 80 | 50 | 0.05 | 1.2 | +20 Orbital, +15 Swarm, +5 Ground | |
| Emergent | Ark Project (Fleet + Bunkers) | 60 | 40 | 0.10 | 0.5 | — | +20% score |
| Emergent | Deep Strike Deterrent (Lance + Shields) | 70 | 40 | 0.05 | 0.8 | — | Enemy strength ×0.75 |
| Emergent | The Undercity (Dispersed + Counter-AI) | 60 | 40 | — | 0.3 | — | Resistance ×1.8 |

## Readiness

Six types, each the sum of projects, meters and event bonuses:

| Type | From meters | Tested in |
|---|---|---|
| Orbital | Industry × 0.08 | Contact |
| Swarm | Knowledge × 0.08 | Contact, Landings |
| Ground | Resolve × 0.3 | Landings, Resistance |
| Traitors | Stability × 0.3 + Resolve × 0.15 | Occupation |
| Bio | Knowledge × 0.15 | Occupation, Resistance |
| Siege | Industry × 0.3 | Resistance |

## The enemy and intel

- The enemy brings 3 of the 6 types, each at a strength of 85–140 (typical 112). Hidden until the debrief.
- An intel report arrives in Year 5 of each decade. It is true with probability equal to source
  reliability: 50% + 0.4% per Knowledge, +15% with Signal Analysis, +5% per Signal Analysis tech, max 95%.
  A true report names one of their real types; a false one names a type they did not bring.
- Likelihood per type starts at 50% and each report multiplies its odds by reliability ÷ (1 − reliability),
  capped at 97%.
- The Intel tab shows likelihood, readiness now and projected to Year 100 against the 85–140 band,
  and Countered (≥ 1.2× typical), Contested (≥ 0.7×) or Exposed.

## Events

At the end of each decade (80% chance) and in Year 7 of each decade (45% chance), the council
must choose. Each of 14 events is used once per run. Options let the player choose where the
hit lands: Effort, Research, Population, meters, readiness or Traitors. Effort and Research may
go negative; the option says so first. Previews show the effect on income, research, growth,
crew and readiness.

Events: The Hoax Movement, Superpower Schism, Pandemic, Unverified Breakthrough, Doomsday Cult,
Global Recession, Conscription Debate, Generational Fatigue, Asteroid Impact, Refugee Wave,
Automation Boom, Rogue Lab, Fertility Collapse, Mutiny in the Ranks.

## The invasion

Three waves fight in four lanes. Each lane compares your readiness with their strength there.

| Lane | Readiness types |
|---|---|
| Orbit | Orbital |
| Sky | Swarm |
| Ground | Ground |
| Inside | Traitors, Bio |

Their lane strength is their value in those types (Traitors as above); a lane where they brought
nothing is 40 and counts half when weighing the wave. Year 100 leftovers add straight to a lane.

| Wave | Share of their fleet | Base days |
|---|---|---|
| Contact | 50% | 30 |
| Landings | 30% | 90 |
| Assault | 20% | 120 |

```
lane ratio  = your lane strength ÷ their lane strength × random 0.9–1.1
lane kill   = clamp((ratio − 0.6) ÷ 1.4, 0, 1)   (2× or better destroys the lane's full share)
destroyed   = wave share × weighted average lane kill
days        = base × (0.25 + min(average ratio, 2.5)^1.6)
your losses = clamp(0.25 ÷ ratio, 3%, 50%) × wave share ÷ 50% of each lane's crew
```

- **Momentum:** a lane won (≥1.2) gets +10% next wave; a lane lost (<0.8) −10% and Resolve −2.
- **Losses carry over:** lost crew refill from trained reserves (experience ×1.00), then conscripts
  (×0.50). A lane's experience is its crew mix: regulars bring the project's experience.
- **Turning points:** most waves draw one event from the situation, such as the Lance firing on the
  flagship, reserves arriving by rail, a garrison declaring for the signal, or a pathogen in the water.
  Each changes one lane for that wave.
- **Chatter:** each wave reports the best and worst lane in the voice of Fleet, Air Defence, Legion HQ
  or Security, plus refills and experience changes.
- **Long war:** if any fleet survives three waves, one more stage runs:

```
their strength = average enemy strength × (0.4 + 0.6 × fleet left)
your endurance = average of Siege, Bio, Ground, Traitors readiness × average lane momentum
days = 545 × (0.25 + min(ratio, 2.5)^1.6) × √((0.6 + Stab/125)(0.5 + Resolve/100)(0.6 + Pop/25)) × Undercity 1.8 × council
```

Survivors fall with lanes lost in Orbit and Ground during waves and with long-war progress (30% fewer
with Dispersed Society, 20% fewer with the Undercity).

### War council

After waves 1 and 2: **Press the attack** (45%, 60% if Orbit won: fleet −15%; fail: Orbit −30%) ·
**Reinforce the weakest lane** (×1.3 next wave, strongest ×0.85) · **Dig in** (their remaining supply
−20%, Resolve +2). The sheet shows lanes with crew mix, and losses and refills per lane.

Before the long war: Scorched earth (×1.4, lose 25% of the population) · Go underground (×1.2, or ×1.4
with Bunkers or Undercity) · Launch the Ark now (needs Ark) · Open a channel (25%: a one-year truce;
75%: ×0.6).

### Victory (hard)

- **Repel:** their fleet reaches 0% during the three waves.
- **Outlast:** their supply runs out first. Supply = 3,000 days − 2 × your Siege − your Endurance
  branch score (+3 × their Siege if they brought it), minimum 540.
- Wins are graded: (100 − days ÷ 21) + % of population kept (+10 with the Ark). S ≥ 170, A ≥ 130,
  B ≥ 100, C ≥ 70, else D. Losses score days survived × (1 + Ark bonus). Best loss and best win are
  both kept.
- In testing, automated players never won (1.7–4.5 years); all twelve projects at size 2 repel,
  and maxed builds win either way.

### Vanguard and spend-down

At Year 90 their vanguard skirmishes in orbit: the second-strongest capability is revealed and each
lane shows won, even or lost. A banner keeps this up until Year 95, when it switches to the spend-down
countdown with what your leftovers would convert to at 3 : 1.

### Year 100

Time stops and the run enters **final preparations**: the strongest capability is confirmed, every tab
still works, and projects can be bought, mothballed or reactivated (50% on day 1). The **War council**
button opens the Year 100 sheet: reactivate mothballed projects, then send leftovers (3 : 1) to one
lane or spread across four, with Back to return to the tabs.


## Round 3 changes (Nov 2026)

**Programs** cost 8 + 4 per repeat. Industrial Mobilisation +0.10 Industry/yr, Research Grants +0.10
Knowledge/yr, Family Policy +0.10% growth. Infrastructure (+5%) and University (+6%) count 80% of the
previous each repeat. Unity also takes 0.06/yr off Traitors. Internal Security −10 Traitors −2 Stability
now, −0.25/yr. Basic Training +0.2% trained/yr; base training 0.1% of military-able a year.

**Traitors trend** = 0.30 + signal (Knowledge × 0.005, none with Counter-AI) + loyalty
((50 − Stab) × 0.02 + (50 − Resolve) × 0.01) − Internal Security − Unity − (Resolve above 50) × 0.02 − 0.1 with Counter-AI.
**Purge** (Society): 25 Effort, Traitors −40%, Stability −6, Resolve −3, 10-year cooldown.

**Crew:** Mk crew factor Mk I 1.5 · Mk II 0.975 · Mk III 0.6 · Mk IV 0.45 (Mk II is −35% vs Mk I).
**Tiers** unlock by branch levels below: tier 2 needs 1, tier 3 needs 2, tier 4 needs 3 (any mix).
**Xenobiology** adds +10 Traitors readiness. **Signal Analysis** cuts their supply 5% and their lane
strength 3% per level. **Veterans:** once a Defence project has 20 years of service, reserves refill at
×1.20. **Field Hospitals** (Xenobiology + Hardened Cities): Inside +10, 30% fewer losses at home.

**Project events:** 13 one-off events unlocked by a project's Level or Mk (decode attempt, captured
sample with vaccine or weapon path, the generals want more, deep patrol, Lance test-fire, it answered
back, and others). Each choice locks the other. Checked most years with a 30% chance.

**Battle:** each wave opens with a card picked from the situation: Purge the garrisons (Inside ×1.5,
once), Emergency draft (+0.3bn conscripts to Ground), Martial law (Inside ×1.25, fewer losses at home,
Stability −6 for the long war), Surge the weakest lane (×1.3), or Hold. A situation report beside Earth
explains the worst lane and how much damage it costs.

**Balance check after the changes** (automated players, 16 runs each): cheapest-first median 1,631 days
with 2 wins in 16; no-programs 1,600 with 1; Science-first 1,424 (Inside 3.2×). Best value per cost:
Unity Campaign, Xenobiology, Counter-AI, Hardened Cities.


## Round 4 layout (Nov 2026)

Sized to a real phone's game area (about 390×742). Rule: nothing is cut off with "…"; it wraps or
moves into a tap sheet.

| Area | Now |
|---|---|
| Meters | A 2×2 of pills: Stability (shown as "64 → 60", where it is heading), Resolve, Industry, Traitors. Knowledge moved into the Research waterfall and sheet |
| Society | Side screen: Traitors/yr and Stability waterfalls by source (Unity LV, Security LV, Welfare LV), dashed ghost = what the next level adds. Programs are slim rows: name, LV, track pips, "+1 → …" (amber where it costs something), cost button. Purge only appears as a red strip once Traitors reach 25 |
| Economy | Effort/yr and Research/yr waterfalls by source with next-level ghosts; slim program rows; upkeep box |
| Projects | Full-width cards: LV and Mk pips, "+41 of 52" output, crew bar, wide cost-first buttons (one gain line, crew change). Locked projects are one line. Tap a card for its readiness chain, crew calculation and Mothball/Reactivate |
| War Room | Lane cards (your Y100 strength vs their likely range, prediction, fix on the weakest), Manning/Intel/Supply tiles, estimate box; reports and readiness by type behind taps |
| Meter sheets | Tap a pill: trend, what it feeds, **Raise it** (programs with level and a FUND button right there, plus linked projects and events), **Pulling it down** (inactive ones shown as "not active") |
| Year 100 | War council opens with "What we take into the war": one card per lane with the projects behind it, a summary line, reactivations, then leftovers with before → after per lane; Back to spend / Commit |
| Battle | Situation and each lane are tappable; the log shows the last 3 lines; a Wave summary button appears after each wave; the council has a full wave report |
| Debrief | One screen: result (grade if won), compact chart, ratio grid per wave (tap a wave), four tiles (Why it ended, Intel read, Manpower, Calls) and Empire at arrival, each opening a sheet |

Outlast wins are graded on 40 + 60 × (1 − days ÷ 3,000) for speed, so a slow Outlast is not an automatic D.

## Empire tab (retired, see War Room)

- Year 100 survival on your current course (meters, maturity, population and Traitors projected
  forward), and survival if they arrived today, both against your intel read.
- What your readiness rests on: share from Defence, Endurance, Science, Emergent and Society.
- How the war plays out: each wave's lane ratios, fleet left and days, the long war, and both win conditions.
- The Empire side screen shows lanes against wave 1 and their supply.
- Readiness by type with its top contributors, and the Effort ledger.

## Balance notes (Nov 2026)

- An automated player that buys whatever is cheapest each year survives about 1.7–4.5 years and never wins.
- Research was too fast and Effort too slow; Effort was raised about 40% and Research cut about 40%.
- Ignoring Traitors reached about 66 by Year 100 in testing, adding about 53 to enemy strength.

## Decisions taken

- Phone only, 10-minute runs, invasion watched, threat stays a mystery, one director, free to play.
- War council calls during the invasion (idea 4 of 5).
- Events can push Effort and Research into debt.
- Bonuses compound: programs are permanent per-year effects; projects mature or gain experience.
- Effort and Research do different jobs for projects (size vs tech).
- Society comes first, split into Economy and People with formula bars.
- Projects tab with subtabs that fit one phone screen.
- Survival appears only in the Empire tab, not on cards or events.
- Infiltration became Traitors: collaborators plus code from the signal, a visible meter you can kill.
- The game is called Invasion.
- Winning is allowed but must be hard: Repel (fleet 0%) or Outlast (supply 0), graded.
- Manpower: military-able, trained reserves, deployed crew; conscripts at half strength; mothballing.
- End game: Year 100 stop, vanguard at T−10, four lanes, three waves, losses carry over, momentum,
  turning points and lane chatter; reserves fight at ×1.00 experience.
- Graphics: flat stylised planet with outlines, square city lights and chunkier ships.

## Open ideas

- The enemy adapts to what it sees of your build (idea 1).
- Three eras with posture choices (idea 2).
- Blocs on the map with their own stats, placement and defection (idea 3).
- The Archive across runs, and a daily seeded run with a leaderboard on Workers + D1 (idea 5).
- Should Research also gate the higher tiers?
- Interest on debt; whether intel's 97% cap settles threats too early; early Defence feeling weak.
