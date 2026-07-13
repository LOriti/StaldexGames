# L&R Meal Planner (LRMP)

A keto meal planner for two where **lunches are derived from dinner leftovers**, not
planned separately. Recipe quantities are per serve, and 1 serve = 2 portions.

Paint a month by cooking mode → dishes drop in automatically → leftovers flow forward into
lunch slots (earliest-cooked first) → whatever isn't eaten rolls into next week or gets
banked in the freezer.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm test          # 38 tests
npm run build     # -> dist/  (static, no backend — deploy anywhere)
```

## The three views

**Recipes** — all 40 dishes across the five cooking modes: Curry, Fry/BBQ, Assembly,
Soup & Stew, Bake. Ingredients and method for each. Star your favourites.

**Month** — a 4×7 grid. Pick a category brush and tap days; a dish from that category drops
in, avoiding same-week repeats. Tap a painted day again to re-roll it. Blank days are fine —
they're your leftover and freezer nights.

**Weekly** — the working view. Each day shows Dinner and Lunch.
- **−/+** sets how many leftover portions a dinner yields.
- Those portions **fill later lunches automatically**, earliest-cooked first. Not enough?
  You get a gap — which is honest information, not a bug.
- Leftovers **roll into the next week** rather than expiring. Week 4's surplus is
  freeze-it-or-lose-it.
- **Drag a dinner** onto another day to swap, or onto the **freezer** to bank all its
  leftovers at once. **❄** banks a single portion.
- **Use ▸** pulls a frozen meal back out into an empty dinner slot.

Everything saves automatically.

## Architecture in one line

`data/ ← core/ ← ui/`, with `core/` pure and framework-free (and fully tested), so the domain
logic is portable and the UI is replaceable.

See **[CLAUDE.md](./CLAUDE.md)** for the domain rules, invariants, and gotchas — read it
before changing anything in `core/`. See **[docs/BACKLOG.md](./docs/BACKLOG.md)** for what's
next.

## Naming

"LRMP" is the project name; the expansion above is a placeholder — rename freely.
