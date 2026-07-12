# Backlog

Ordered by value. Each item notes the trap, because most of these have one.

---

## 1. Lunch pinning ⭐ next

**Why:** lunches are currently 100% derived — you can't say "no, I want Tuesday's lunch to
be the chilli." This was asked for explicitly ("most earliest meal scheduled for lunches
sooner *unless shuffled*").

**The trap:** the naive fix — letting the user drag lunch tiles freely — creates a second
source of truth and the sync bugs come straight back.

**How to do it right:** keep derivation as the default, add a sparse *override* layer.

```js
// state.lunchPins = { [dayIndex]: dishName }
// allocate(plan, pins) — pins are honoured first, then FIFO fills the rest
```

`allocate()` stays pure; it just takes a second argument. A pinned lunch consumes a portion
of that dish from the queue if one is available (otherwise show the pin as unfulfilled —
that's honest, and it tells the user to cook more). Un-pinning returns the day to derived.
Show pinned lunches with a 📌 so the distinction is visible.

---

## 2. Drag a frozen meal onto a specific day

Currently `Use ▸` drops it into the first empty slot in the current week. Make freezer items
draggable onto any `.dslot`.

The drag infrastructure already handles this — `beginDrag` in `ui/dom.js` is generic, and
`findTarget` in `weeklyView.js` already resolves `.dslot`. Add a `type: 'frozen'` payload
and let `findTarget` return day slots for it. Then `applyDrop` calls
`freezer.useFromFreezer(plan, freezer, dish, { idx })` — the `idx` parameter is already
supported and tested. This is maybe 20 lines.

**Trap:** dropping onto an *occupied* day should probably ask, or refuse, not silently
overwrite a planned dinner.

---

## 3. Net carbs per dish

The whole point is keto and there is currently **no carb data anywhere**. Add `c` (net carbs
per serve, grams) to each dish in `data/dishes.js`, surface it on the recipe card and in the
modal, and total the day / week.

**Trap:** these numbers need to be *right* or they're worse than nothing. Don't let an LLM
guess them — derive from the actual ingredient list, or pull from a nutrition API, and mark
anything estimated as estimated.

---

## 4. Shopping list

Generate from a week's dinners: union the `ing` arrays, group by aisle, dedupe. Big practical
win, low complexity.

**Trap:** ingredients are free-text strings (`"500g beef mince"`, `"3 garlic cloves"`).
Merging quantities properly means parsing them into `{ qty, unit, item }`. Either do that
parse (and store ingredients structured), or accept a dumb grouped list without quantity
maths. Don't half-do it — a shopping list that says "beef mince ×3" without amounts is worse
than one that just lists each line.

---

## 5. Serving scaling

Recipes are written for ~4 serves with no scaling control. If dinner-for-2 + 2 lunches is the
real pattern, quantities should scale. Needs structured ingredients (see #4) — do these
together.

---

## 6. Real dates

Weeks are abstract (Wk 1–4). Anchoring to real calendar dates would let the app know what
"today" is, show the current week by default, and roll the plan forward automatically as
weeks pass. This is the difference between a planner you consult and one you live in.

**Trap:** it makes the 28-day array a *window* rather than the whole world, and the rolling
surplus needs to survive the window sliding. Think it through before starting.

---

## 7. More dishes

Pools are 8 per mode. Bench ideas already scoped:
- Curry: vindaloo, laksa, beef rendang, saag gosht
- Fry/BBQ: pork chops, prawn skewers, lamb backstrap, chicken skewers
- Assembly: cobb salad, smoked salmon plate, banh-mi bowl
- Soup & Stew: goulash, osso-style braise, French onion (no crouton)
- Bake: sausage traybake, chicken thigh + veg tray, egg muffins

Adding a dish = an entry in `dishes.js` **and** a matching key in `recipes.js`.
`tests/data.test.js` fails loudly if you forget one.

---

## 8. React + TS migration *(optional)*

`core/` is deliberately framework-free and fully tested, so a migration only touches `src/ui/`
— the domain logic ports untouched. Worth doing **if** the UI grows a lot more interactive
surface (multi-select, undo, animations). Not worth doing just to have React.

If you do: keep `core/` exactly as-is, replace the nuke-and-rebuild renders with components,
and keep `state.js`'s shape (it's already an observable store, so `useSyncExternalStore` maps
onto it directly).

---

## 9. Cross-device sync *(optional)*

`storage/adapter.js` is the seam. Adding a Supabase backend means one more branch in that
module and an auth flow — nothing else in the codebase changes. Only worth it if the plan
needs to be on a phone in the kitchen *and* a laptop.

---

## Known rough edges

- **`DEFAULT_EXTRA.keeps = 2` over-produces.** Five keeper dinners a week yield ~10 portions
  against 7 lunch slots, so surplus accumulates. Intentional (that's what the freezer is
  for), but if it's annoying in real use, drop it to 1 in `core/plan.js`.
- **`extra` is "leftover portions", not "total serves cooked".** Simpler, but it means the
  app doesn't know how many people ate dinner. If household size ever matters, that's a
  model change, not a tweak.
- **`ui/` has no tests.** Everything meaningful is in `core/`, which is fully covered — but
  drag-and-drop is genuinely fiddly and a regression there would be silent.
