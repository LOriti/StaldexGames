# L&R Meal Planner (LRMP) — working notes for Claude Code

Keto meal planner for two. Paint a month by cooking mode → dishes drop in → **lunches are
derived from dinner leftovers** → surplus rolls forward or gets banked in the freezer.

**The serving model:** **1 serve = 2 portions** (dinner for two). A cooked dinner needs
1 serve + extra/2. Each recipe also declares how many serves its written quantities
MAKE (`recipeServes`, default 1, settable on the recipe card) — planning a makes-2
recipe defaults to 2 leftovers, and the shopping list scales by needed/written, so
cooking it as written shops at the written amounts. `core/recipes.js` owns all of this.

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
about to introduce a second source of truth and a sync bug. The one exception is lunch
*pinning* (now built): `state.lunchPins` is a sparse `{ dayIndex: dishName }` override
layer passed to `allocate(plan, pins)`. A pin **reserves** a portion from the queue —
it never invents one — and deleting the pin returns the day to fully derived. That's
the pattern for any future user override: sparse layer over derivation, never a
parallel lunch array.

---

## Layout

```
src/
  data/       pure data, no logic
    modes.js      the 5 cooking modes (curry, fry, assembly, soup, bake)
    dishes.js     40 built-in dishes + the USER CATALOG OVERLAY (customs/removals —
                  registered by state.js; always read pools via dishPool/allDishNames,
                  and identity via metaOf, never DISHES/DISH_INDEX directly)
    recipes.js    40 recipes, keyed by dish name
  core/       pure domain logic — NO DOM, NO imports from ui/ or state.js
    plan.js       plan shape, seeding, painting, shuffling, swapping
    allocate.js   *** the FIFO leftover→lunch allocator. Read this first. ***
    freezer.js    freezer accounting
    shopping.js   weekly shopping list derived from the plan; week-scoped ticks
    recipes.js    serving maths (1 serve = 2 portions) + recipeEdits resolution/scaling
  storage/
    adapter.js    persistence. See "Gotchas" — do not bypass this.
    sync.js       optional remote sync layer (Worker in ../worker-lrmp/). See Gotcha 1b.
  ui/         rendering + interaction. Imports from core/, never the reverse.
    dom.js        $ / $$ / toast / beginDrag (pointer-based drag)
    recipesView.js
    monthView.js
    weeklyView.js   the complex one
    shoppingView.js weekly list: tick off ingredients, skip dishes, copy as text
    dishPicker.js   tap-an-empty-day picker: mode click filters, then pick/random/note
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
  extra: number,               // leftover portions this dinner yields
  note:  string                // OPTIONAL free-text day note ("dinner out") — a note day
                               // cooks nothing and the allocator ignores it
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
Pure: `(plan, lunchPins) → { lunch[28], weekSurplus[4] }`.

- A dinner cooked on day D releases leftovers **from day D+1**. Never same-day — you ate it.
- **FIFO**: earliest-cooked is eaten first. Walk days in order; each day, release
  yesterday's leftovers into a queue, then shift one off the front for lunch.
- **Gaps are legitimate.** Empty queue = no lunch that day. Do NOT fill a gap by borrowing
  from a future dinner — that's eating food that hasn't been cooked. A gap is real
  information: cook more, or accept it.
- **Rolling surplus.** Leftovers don't expire at week boundaries. Whatever is still queued
  when we cross into week W+1 is week W's surplus — it rolls forward. `weekSurplus[3]` is
  terminal (a new month starts fresh — no wrap-feeding into Wk 1's lunches, that would be
  eating this month's food before it's cooked), so the UI nudges freezing it.
- **Pins.** `allocate(plan, pins)` honours sparse `{ dayIndex: dishName }` overrides.
  A pin reserves the earliest-cooked portion of that dish that exists by the pinned day,
  so plain FIFO days can't eat it first. No portion available by then → the pin renders
  as *unfulfilled* (honest), never auto-filled. The UI sets pins by dragging lunch tiles
  between days; unpinning returns the day to derived.
- **The surplus strip is also a drop zone.** Dropping a dinner tile on it defers that
  dinner to the next week (`deferDinner` in `core/plan.js`) — same weekday if free, else
  first empty day. Wk 4 wraps to Wk 1, framed as "next month" (the board is reused).

The default of **2 leftovers per `keeps` dish deliberately over-produces** relative to 7
lunch slots. That's why surplus and the freezer exist. `DEFAULT_EXTRA` in `core/plan.js` is
a one-line change if it turns out to be too generous in practice.

### The freezer
`{ [dishName]: portionCount }`. Zero-count keys are **deleted**, not kept at 0, so
`Object.keys(freezer)` is always the true inventory.

Three ways in, all drags onto the freezer panel: a dinner tile (all its leftovers),
a lunch tile (that single portion — this replaced the old per-dinner ❄ button), or a
surplus batch (decrementing its source days). `core/freezer.js#freezeOne` still exists —
it's what the lunch-tile drag calls.
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
`src/storage/sync.js` mirrors the four persisted slices (plan, freezer, favourites,
lunch pins) to the Worker in
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
- The theme is minimal light (warm paper, white cards, one dark ink). Var-name gotcha
  from its dark-theme past: `--cream` is the dark page text and `--chit` the white card —
  semantics moved, names stayed. Don't "fix" the names without touching every rule.
- Fraunces for dish names (the human/edible layer), JetBrains Mono for chrome (the system
  layer). That split is deliberate — it's what stops it reading like a generic dashboard.
- User-editable data (recipeEdits, freezer free-text names) must never assume a dish
  exists in DISH_INDEX — unknown names get neutral colour and "No recipe yet".

---

## State of play

**Works:** month painting + auto-dish-selection, week board with derived lunches, leftover
steppers, FIFO allocation with gaps, rolling weekly surplus, lunch pinning (drag a lunch to
another day), freezer (bank/use/remove; drag dinner/lunch/surplus tiles in), defer-a-dinner
to next week (drop it on the surplus strip; Wk 4 wraps to Wk 1), free-text day notes
("dinner out") on empty days, all 40 recipes, persistence, mobile drag.

**Not built yet:** see `docs/BACKLOG.md`. The top three are drag-from-freezer onto a
specific day, per-dish net carbs, and the shopping list.

**Tests:** 52 passing, covering `core/` and data integrity. `ui/` is untested — if you add
a headless-DOM test setup, that's a genuine improvement, but don't let it block feature work.
