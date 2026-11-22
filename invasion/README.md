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
| Arrival, Year 100 | Time stops: final purchases with every tab open, one enemy capability confirmed, then the last-stand deployment (with back-and-forth to review) |
| Invasion | Four phases play out on the Earth view, with a war council call after each of the first three |
| Debrief | Time survived, intel vs reality, phase table, empire at arrival |

## Screen

- Top bar: Year and T-minus, Effort, Research, Population, each with its change per year; pause and speed.
- Earth view (left) with a side screen (right) that changes with the tab: Economy shows Effort,
  income and Research with what makes them up; People shows Growth, Crew and Traitors as tiles with
  contribution bars; Projects shows how the selected project's readiness is built (tap a name);
  Intel shows threat odds; Empire shows the Year 100 course and what readiness rests on.
  Every built project appears on the planet; warnings for debt, underfunding and undercrewing.
- Meters: Stability, Industry, Knowledge, Resolve, Traitors, each with its trend per year.
- Tabs: Economy, People, Projects (subtabs Defence, Endurance, Science, Emergent), Intel, Empire.
  Tap the ticker for the full log.

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

### Crew

```
crew needed   = Σ project crew × (1 + 0.4 × (size − 1)) × 0.9^tech × Counter-AI factor
crew available = Population × (5% + Resolve/1000 + National Service)
crewed %      = min(1, available ÷ needed)
```

Counter-AI factor: 0.7 when built, then −0.1 per tech level, floor 0.4.
Crewed projects run at crewed % strength.

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
| People | National Service | −1 Stability | +1% of Population can enlist |
| People | Internal Security | −8 Traitors, −3 Stability | −0.15 Traitors/yr |

Previews show only the effect on income, research, growth, crew and readiness. Survival is
shown only in the Empire tab.

## Projects

Three branches of four tiers plus three emergent projects. A tier needs the previous tier in its
branch built. Emergent projects appear once both of their requirements are built.

- **Effort builds and expands size** (1–4): +35% strength per size, +40% crew and upkeep.
  Price = Effort cost × (1 + 0.8 × current size).
- **Research improves tech** (Mk I–IV): +25% strength per level, −10% crew and upkeep.
  Price = Research cost × (1 + 0.8 × current tech). Only once built.
- **Growth over time:** Defence projects gain experience (2%/yr compounding, max ×3); all others
  mature (1.5%/yr compounding, max ×2.5), counted from the year built.

```
project readiness = base × 1.35^(size−1) × 1.25^tech × experience or maturity × crewed % × funding %
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

Four phases. Each compares your average readiness in the types it tests against the enemy's
average strength in the types they brought (Traitors as above). If the enemy brought none of a
phase's types, a generic strength of 65 is used.

```
ratio = your readiness ÷ their strength
days  = base × (0.25 + min(ratio, 2.5)^1.6) × phase multiplier × random 0.9–1.1
```

| Phase | Base days | Tests | Phase multiplier |
|---|---|---|---|
| First Contact | 30 | Orbital, Swarm | — |
| Landings | 90 | Ground, Swarm | — |
| Occupation | 180 | Traitors, Bio | 0.6 + Stability/125 |
| Resistance | 365 | Siege, Bio, Ground | (0.5 + Resolve/100) × (0.6 + Population/25) × Undercity 1.8 |

Score = total days × (1 + Ark bonus). Survivors = Population × (1 − 0.85 × progress),
reduced 30% by Dispersed Society and 20% by the Undercity.

### War council

After each of the first three phases the invasion pauses for one call:

| After | Options |
|---|---|
| First Contact | Sacrifice the fleet (Landings ×1.35, Resistance ×0.85) · Hold formation · Pull everything home (Landings ×0.8, Resistance ×1.15) |
| Landings | Scorched earth (Occupation ×1.4, lose 25% of the population) · Evacuate to the bunkers (Occupation ×0.8, Resistance ×1.25) · Hold the cities |
| Occupation | Launch the Ark now (needs Ark; bonus 35% instead of 20%, Resistance ×0.75) · Go underground (Resistance ×1.2, or ×1.4 with Bunkers or Undercity) · Open a channel (25%: a one-year truce; 75%: Resistance ×0.6) |

### Victory (hard)

- **Repelled:** if your readiness ratio is at least 3 in both First Contact and Landings, measured
  against the enemy's strength or 112, whichever is higher, they withdraw after Landings. Score counts
  as ten years plus a five-year bonus (Ark bonus still applies). Survivors are counted at that point.
- **Outlasted:** if the invasion runs to ten years (3,650 days) or more, they withdraw. Score is the
  days survived.
- The Empire tab shows both conditions, projected to Year 100 against your intel read.
- In testing, automated players never won (best about 3.9 years); a fully built, maxed Defence and
  Science programme repels comfortably.

### Spend-down warning

From Year 95 a banner counts down the last five years and shows what your leftovers would convert
to at 3 : 1, so you spend down before arrival.

### Last stand

At Year 100 time stops and the run enters **final preparations**: the fleet's strongest capability is
confirmed (shown as 100% likely in Intel), every tab still works, and you can make final purchases
with what you have. A red bar shows your reserves and a **Last stand** button. That opens the
deployment screen: each type shows confirmed or its likelihood, readiness now and after deploying,
with **Back to review** to return to the tabs and check more. Leftover Effort and Research convert
at 3 : 1 into readiness, sent all to one type or split evenly across six. With nothing left, a Begin button starts the invasion.
## Empire tab

- Year 100 survival on your current course (meters, maturity, population and Traitors projected
  forward), and survival if they arrived today, both against your intel read.
- What your readiness rests on: share from Defence, Endurance, Science, Emergent and Society.
- How survival adds up: the phase table with ratio, multiplier and days, plus the formula.
- Readiness by type with its top contributors, and the Effort ledger.

## Balance notes (Nov 2026)

- An automated player that buys whatever is cheapest each year survives about 1.3–2.8 years.
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
- Winning is allowed but must be hard: Repelled or Outlasted.

## Open ideas

- The enemy adapts to what it sees of your build (idea 1).
- Three eras with posture choices (idea 2).
- Blocs on the map with their own stats, placement and defection (idea 3).
- The Archive across runs, and a daily seeded run with a leaderboard on Workers + D1 (idea 5).
- Should Research also gate the higher tiers?
- Interest on debt; whether intel's 97% cap settles threats too early; early Defence feeling weak.
