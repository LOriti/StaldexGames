# Backlog

Ordered by value. Each item notes the trap, because most of these have one.

---

## ~~1. Lunch pinning~~ ✅ shipped

Built exactly as designed here: `state.lunchPins` sparse override layer,
`allocate(plan, pins)` stays pure, pins *reserve* a queue portion (FIFO can't eat a
promised one first), unfulfillable pins render honestly with 📌, un-pinning returns the
day to derived. Set by dragging a lunch tile onto another day. Covered in
`tests/allocate.test.js`.

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

## 6. Real dates — shipped

The plan is now a rolling 28-day window: three days of context, Today, and 24 future days.
Meals and lunch pins move with their calendar dates; expired days fall off and new future
days enter empty. Shopping ticks reset when the window moves because they are week-scoped.

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
