# Jaryd's Last Day — Revision History

Single-file HTML game · TLDK Games · Built iteratively 8 June – 13 July 2026.
Live file: `jaryds-last-day.html` (62KB, self-contained, no dependencies).

---

## v0.1 — Initial build (8 Jun 2026)
- First playable: "Jared's Last Day", office-sabotage decision game in the style of the referenced situation-manager artifact. Score = "how fucked you leave the place."
- Fixed scene sequence, visible risk labels on choices, basic meters, end verdict.

## v0.2 — Core identity
- Spelling corrected to **Jaryd**; login handle **Jazza**; company **CrapCorp**.
- Risk labels hidden — choices are just "flavours of mayhem."
- Step counter removed; run length concealed.
- Clean "model employee" ending added for no-mayhem runs.

## v0.3 — Intro rework
- Title slide scrapped for a straight-to-dashboard **System Notice popup** ("It's your last day, Jazza. Good luck with offboarding.").

## v0.4 — Result popups & hidden levers
- Choice outcomes moved into stat popups (per reference game).
- **16 hidden "4th levers"** introduced (Karen's Annoyance, Director's Blood Pressure, Billable Units Lost, Government Dignity, Tea-Room Standing, Disclosure Risk, Minister's Office, IT Tickets, Shredding, Linda's Tears, Greg's Anxiety, Whisper Network, Office Plant, Coffee Fund, Audit Trail, Lift Awkwardness) feeding end-game flavour.

## v0.5 — Achievements & the Department
- Achievement system tied to lever combos (THE GHOST, GOT AWAY WITH IT, PLANT KILLER, etc.).
- CrapCorp renamed **Department of Government Solicitors (DOGS)** — AGS parody chosen from shortlist.

## v0.6 — The cooked dog
- Hand-built SVG **cooked greyhound crest** (spiral fried eye, bloodshot googly eye, sweat bead, lolling tongue, one ear down). Gold-on-navy.
- Full reskin as **OFFBOARD™ · DOGS · Workforce Lifecycle Suite** fake-corporate portal.

## v0.7 — Jargon audit
- Full terminology sweep. Removed **APS, SES, Protective Services, ICT, Secretary, SECRET//AUSTEO**; FOI generalised to "Disclosure Risk" (kept in full once as an ending punchline).
- Kept: People & Capability, Minister's office, legal-practice terms (matters, briefs, billable units, deeds).

## v0.8 — Coherence & report layout
- Context bugs fixed (no billable units from the car park; Karen moved from Registry to People & Capability).
- Report screen redesigned to fit one page: prominent crest + department title, verdict rank, 2×2 stat grid (Facilities Damage / Final Entitlements / Legend Status / Time To Discovery), disclaimer killed.

## v0.9 — Randomisation & story arcs
- Runs assembled at random: **1 of 3 openers** (Car Park / Morning Lift / Badging In) + 7 of 13 pool scenes + closer.
- **Three 3-beat arcs** (Karen's Mug → Dossier; Greg's Conflict → The Leak; The Good Stapler → Kingpin) that only cascade if drawn *and* triggered — completion deliberately not guaranteed (~40% blind).
- More levers added per request; "public standing" renamed **Government Dignity**.

## v0.10 — Dashboard & balance (screenshot round 1)
- Balanced **2×2 dashboard**: Mayhem | Heat / Legend | Entitlements ($8,000), uniform value fonts, aligned bars.
- Duplicate chips deduped; good-toned levers blocked on damaging choices.
- Coffee shrinkflation scene confirmed 10/10.

## v0.11 — Fit & polish (screenshot round 2)
- Bar/font alignment across all four meters.
- "Let it lie" no longer harms the office plant (context fix).
- Opener variety confirmed working (car park no longer guaranteed).

## v0.12 — Balance simulation pass
- Node-simulated thousands of runs across five play styles.
- **Fix:** arc beats now *replace* an upcoming filler scene instead of extending the run — petty play no longer balloons to top tier by scene count; smart heat-management now reaches high tiers clean.
- Accessibility: `prefers-reduced-motion` support, keyboard focus outlines.

## v0.13 — Report screen standalone (screenshot round 3)
- Stapler/Karen/conflict **double-note dedupe** (arc payoff suppresses matching lever echo).
- Top bar hidden on report — it reads as its own document; restored on New Last Day.
- Field report capped at 3 lines, achievements at 4; buttons aligned.
- Caught ending reformatted: **"{time} · EARLY TERMINATION"** with actual escort time.

## v0.14 — Naming & sharing
- File renamed `Jaryd's Last Day.html` → broke artifact sharing (apostrophe/spaces in URL) → renamed **`jaryds-last-day.html`**; in-game title unchanged.
- **Copy Verdict button removed** (report is screenshot-friendly); New Last Day full-width.

## v0.15 — Chip economy (screenshot round 4)
- Cosmetic no-point flavour lines scrapped ("It goes in the file…" etc.) — every chip now carries a number.
- **Whisper Network restricted** to authored gossip moments only; no longer a random-roll fallback.
- Red corruption wash removed from the report screen.

## v0.16 — Full mechanics audit (13 Jul 2026)
20,000 instrumented runs. Verified: distinct ending lanes, all 5 tiers reachable, catch pacing fair (earliest scene 6), all content fires. Fixed:
- **Silent pay forfeiture** — heat ≥ 60 voided entitlements with no warning (bit 68% of petty runs). Entitlements meter now flips live to **AT RISK ⚠** + one-time PAYROLL toast; recoverable if heat drops.
- **CARDIAC EVENT mathematically impossible** (needed bp≥4; max obtainable 2) → threshold 2.
- **TEA-ROOM LEGEND** 0.85% → threshold 3 (now ~13% on nice play).
- Stale heat number behind popups (missing element id).
- **Fence income**: stapler sale +$45, cartel +$135 — entitlements can exceed $8,000.
- Dead constants removed.

## v1.0 — Content drop (13 Jul 2026)
- **3 random closers**: Security Gates / **The Exit Interview** (Karen, 4:40pm) / **The Box** (4:50pm, the $1,900 chair "retires with you", +$300). No scene repeats every run.
- **Internal Bulletin** on the report: 3 wire headlines reacting to the run (plant memorial, stapler futures, "root cause was a person"), padded from a generic pool.
- **3 start personas**: 😤 Disgruntled (Heat 8, Karen pre-annoyed — 70% more likely caught) / 🏆 Beloved ($8,500, tea standing) / 🚬 Checked Out (Mayhem 6 — clean exit must be earned back via good works).
- Validated: 18,000 runs, zero errors; closers split evenly; personas mechanically distinct.

---

### File lineage
`jareds-last-day.html` → `Jaryd's Last Day.html` (broke sharing) → **`jaryds-last-day.html`** (current).
Side artifact: `end-screen-mock.html` (throwaway layout mock, v0.13).

### Standing validation practice
Every mechanical change re-verified by headless Node simulation (DOM-stubbed): JS parse, full random playthroughs to report render, structural checks (unique scene ids, valid lever keys, chip dedupe), and balance distribution across five scripted play styles.
