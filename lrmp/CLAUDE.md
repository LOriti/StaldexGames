# LRMP — working notes for Claude Code

Keto meal planner. Paint a month by cooking mode → dishes drop in → **lunches are derived
from dinner leftovers** → surplus rolls forward or gets banked in the freezer.

Vanilla JS + Vite. No framework. State is client-side first (localStorage via the adapter),
with automatic cross-device sync through a tiny Worker (`../worker-lrmp/`, route
`staldex.com/api/lrmp/*`) — see Gotcha 1b. The app must always work with the Worker down.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 38 tests, all must stay green
npm run build     # -> ../site/lrmp/, committed, served unlisted at staldex.com/lrmp
```

After changing `src/`, rebuild and commit the regenerated `site/lrmp/` output — that's
what Cloudflare Pages serves (see `../DEPLOY.md`).

---

## The one idea

**Lunches are never chosen. They are derived.**

The user plans *dinners*. Leftovers from those dinners flow forward in time and fill lunch
slots. Move a dinner and every lunch downstream of it re-derives automatically. There is
one source of truth (`state.plan`, a 28-day array) and everything else is computed from it.

If you find yourself adding a "lunch" field that the user sets directly, stop — you're
about to introduce a second source of truth and a sync bug. (The one legitimate exception
is lunch *pinning*, which is a real backlog item — see `docs/BACKLOG.md` for how to do it
without breaking this.)

---

## Layout

```
src/
  data/       pure data, no logic
    modes.js      the 5 cooking modes (curry, fry, assembly, soup, bake)
    dishes.js     40 dishes, indexed by name; metaOf(name)
    recipes.js    40 recipes, keyed by dish name
    notes.js      keto watch-outs
  core/       pure domain logic — NO DOM, NO imports from ui/ or state.js
    plan.js       plan shape, seeding, painting, shuffling, swapping
    allocate.js   *** the FIFO leftover→lunch allocator. Read this first. ***
    freezer.js    freezer accounting
  storage/
    adapter.js    persistence. See "Gotchas" — do not bypass this.
    sync.js       optional remote sync layer (Worker in ../worker-lrmp/). See Gotcha 1b.
  ui/         rendering + interaction. Imports from core/, never the reverse.
    dom.js        $ / $$ / toast / beginDrag (pointer-based drag)
    recipesView.js
    monthView.js
    weeklyView.js   the complex one
    recipeModal.js
  state.js    tiny observable store; hydrate / commit / subscribe
  main.js     entry, tab switching
tests/        vitest. core/ and data/ are fully covered; ui/ is not.
```

**The dependency rule:** `data/ ← core/ ← ui/`. `core/` is framework-free and side-effect
free on purpose — it's what makes a React migration cheap later, and it's why the tests are
fast and meaningful. Keep it that way.

---

## Domain model

### The plan
Flat array of **28 days**. `index = week * 7 + dayOfWeek` (week 0–3, day 0–6 = Mon–Sun).

```js
plan[i].dinner = {
  cat:   'curry' | 'fry' | 'assembly' | 'soup' | 'bake' | null,
  dish:  string | null,        // must exist in DISH_INDEX
  src:   'cook' | 'freezer' | null,
  extra: number                // leftover portions this dinner yields
}
```

Month view and Weekly view render **the same array**. There is no sync layer because there
is nothing to sync. Edit either, both update.

### Invariants (tests enforce these)
1. `plan.length === 28`, always.
2. **Only `src: 'cook'` dinners produce leftovers.** A `'freezer'` dinner is a single
   reheated portion — `extra` stays 0. It does not breed.
3. Empty days are **legitimate and expected**. Not every day needs a category; blanks are
   leftover/freezer nights. Don't "helpfully" auto-fill them.
4. Portions are conserved. Every portion banked in the freezer is decremented from a
   dinner's `extra`. Nothing is created or destroyed by a freezer op.

### The allocator (`core/allocate.js`)
Pure: `plan → { lunch[28], weekSurplus[4] }`.

- A dinner cooked on day D releases leftovers **from day D+1**. Never same-day — you ate it.
- **FIFO**: earliest-cooked is eaten first. Walk days in order; each day, release
  yesterday's leftovers into a queue, then shift one off the front for lunch.
- **Gaps are legitimate.** Empty queue = no lunch that day. Do NOT fill a gap by borrowing
  from a future dinner — that's eating food that hasn't been cooked. A gap is real
  information: cook more, or accept it.
- **Rolling surplus.** Leftovers don't expire at week boundaries. Whatever is still queued
  when we cross into week W+1 is week W's surplus — it rolls forward. `weekSurplus[3]` is
  terminal (nothing to roll into), so the UI labels it *freeze-it-or-lose-it*.

The default of **2 leftovers per `keeps` dish deliberately over-produces** relative to 7
lunch slots. That's why surplus and the freezer exist. `DEFAULT_EXTRA` in `core/plan.js` is
a one-line change if it turns out to be too generous in practice.

### The freezer
`{ [dishName]: portionCount }`. Zero-count keys are **deleted**, not kept at 0, so
`Object.keys(freezer)` is always the true inventory.

Three ways in: ❄ button (one portion), drag a dinner tile onto the freezer (all its
leftovers), drag a surplus batch onto the freezer (that batch, decrementing source days).
One way out: `Use ▸` → fills the first empty dinner slot in the current week.

---

## Gotchas

**1. Storage. This one will bite you.**
The original prototype was a Claude.ai artifact and used `window.storage` — a sandbox-only
API that **does not exist in a normal browser**. Ported naively, the app looks fine and
then silently loses everything on reload.

`src/storage/adapter.js` handles this: it detects `window.storage` → `localStorage` →
in-memory, and exposes one async interface. **Never call `localStorage` or `window.storage`
directly anywhere else.** If `backend() === 'memory'` the app toasts a warning.

**1b. Remote sync is a layer, not a replacement.**
`src/storage/sync.js` mirrors the three persisted slices to the Worker in
`../worker-lrmp/` (single shared blob, last-write-wins, deliberately unauthenticated —
the unlisted URL is the only gate; see that Worker's README). Rules: local persistence
always happens first and must never depend on the network; `commit()` schedules a
debounced push; boot-time pull goes through `applyRemote()` in `state.js`, which persists
**without** calling `commit()` (committing would push back the state we just pulled).
The Worker being unreachable is a supported state ("☁ offline" in the footer), not an
error — the app must always work fully client-side.

**2. Drag uses pointer events, not HTML5 drag-and-drop.**
HTML5 DnD does not work on touch. This app gets used on a phone, in a kitchen, with one
hand. `beginDrag()` in `ui/dom.js` is the shared implementation — 6px threshold to
distinguish tap from drag, `elementFromPoint` for hit-testing, a floating ghost element.

**3. Render strategy is "nuke and rebuild".**
Every state change re-renders the whole active view via `innerHTML`. At this scale (28 days,
40 dishes) it's imperceptible and it kills a whole class of stale-DOM bugs. It also means
**event handlers must be re-attached on every render** — that's what `wire()` does in
`weeklyView.js`. If you add interaction, attach it there, not once at init.

**4. Dish name is the primary key.**
`dishes.js`, `recipes.js`, the freezer, and the plan all key off the dish name string.
Rename a dish in one place and you orphan it everywhere. `tests/data.test.js` catches this
in both directions — run the tests after touching data.

**5. Buttons inside draggable tiles.**
`pointerdown` on a tile starts a drag. The −/+/❄/📖 buttons live *inside* tiles, so the
drag handler bails early on `e.target.closest('button')`. Keep that guard if you add
controls to a tile.

---

## Conventions

- ES modules, `type: module`. Modern syntax is fine (`??=`, optional chaining) — build
  targets es2022.
- 2-space indent, single quotes, semicolons.
- `core/` gets JSDoc on anything non-obvious; the *why* matters more than the *what*.
- CSS: one stylesheet, CSS custom properties. **Mode colour is set once** in `:root`
  (`--curry`, `--fry`, …) and read everywhere via `--gc`, set inline per element. Adding a
  6th cooking mode = add a var + an entry in `modes.js` + a dish pool. Nothing else.
- Fraunces for dish names (the human/edible layer), JetBrains Mono for chrome (the system
  layer). That split is deliberate — it's what stops it reading like a generic dashboard.

---

## State of play

**Works:** month painting + auto-dish-selection, week board with derived lunches, leftover
steppers, FIFO allocation with gaps, rolling weekly surplus, freezer (bank/use/remove,
drag-to-freeze), all 40 recipes, persistence, mobile drag.

**Not built yet:** see `docs/BACKLOG.md`. The top three are lunch pinning, drag-from-freezer
onto a specific day, and per-dish net carbs.

**Tests:** 38 passing, covering `core/` and data integrity. `ui/` is untested — if you add
a headless-DOM test setup, that's a genuine improvement, but don't let it block feature work.
