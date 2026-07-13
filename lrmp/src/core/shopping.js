/**
 * Shopping list for one week, derived from the plan — same philosophy as lunches:
 * never a second source of truth. The list is recomputed from `plan` every render;
 * the only state it owns is what the user has ticked off, in `shopping`:
 *
 *   shopping = {
 *     excluded: { 'week|dish': 1 },        // dish toggled out of the list entirely
 *     have:     { 'week|dish|ingIdx': 1 }, // ingredient already purchased / in stock
 *   }
 *
 * Keys are week-scoped so ticking off Wk 1's chicken doesn't pre-tick Wk 3's. Zero/false
 * entries are deleted, not stored (same convention as the freezer) — stale keys from a
 * repainted plan simply never render and get cleaned by clearWeek.
 *
 * Only `src: 'cook'` dinners shop. Freezer nights are already cooked, and empty/leftover
 * days need nothing — that's the whole point of the rotation.
 */

import { RECIPES } from '../data/recipes.js';

export const dishKey = (week, dish) => `${week}|${dish}`;
export const ingKey = (week, dish, i) => `${week}|${dish}|${i}`;

/** Unique cooked dishes in a week, with how many times each is cooked. */
export function weekCooked(plan, week) {
  const out = [];
  const seen = new Map();
  for (let d = 0; d < 7; d++) {
    const dinner = plan[week * 7 + d].dinner;
    if (!dinner.dish || dinner.src !== 'cook') continue;
    const entry = seen.get(dinner.dish);
    if (entry) entry.count += 1;
    else {
      const fresh = { dish: dinner.dish, cat: dinner.cat, count: 1 };
      seen.set(dinner.dish, fresh);
      out.push(fresh);
    }
  }
  return out;
}

/** The full render model: every cooked dish with its ingredients and tick state. */
export function buildList(plan, week, shopping = { excluded: {}, have: {} }) {
  return weekCooked(plan, week).map((e) => ({
    ...e,
    excluded: Boolean(shopping.excluded[dishKey(week, e.dish)]),
    ing: (RECIPES[e.dish]?.ing ?? []).map((text, i) => ({
      text,
      i,
      have: Boolean(shopping.have[ingKey(week, e.dish, i)]),
    })),
  }));
}

/** Count of ingredients still to buy (excluded dishes contribute nothing). */
export function remainingCount(plan, week, shopping) {
  return buildList(plan, week, shopping).reduce(
    (n, d) => (d.excluded ? n : n + d.ing.filter((x) => !x.have).length),
    0
  );
}

/**
 * Plain-text export of what's still to buy — grouped by dish, ready to paste into
 * a message or notes app. Excluded dishes and ticked ingredients are left out.
 */
export function listText(plan, week, shopping) {
  const lines = [`Shopping — Wk ${week + 1}`];
  for (const d of buildList(plan, week, shopping)) {
    if (d.excluded) continue;
    const remaining = d.ing.filter((x) => !x.have);
    if (!remaining.length) continue;
    lines.push('', d.count > 1 ? `${d.dish} ×${d.count}` : d.dish);
    for (const x of remaining) lines.push(`- ${x.text}`);
  }
  return lines.join('\n');
}

/** Drop every tick belonging to `week` — the "fresh shop" reset. Mutates `shopping`. */
export function clearWeek(shopping, week) {
  const prefix = `${week}|`;
  for (const k of Object.keys(shopping.excluded)) {
    if (k.startsWith(prefix)) delete shopping.excluded[k];
  }
  for (const k of Object.keys(shopping.have)) {
    if (k.startsWith(prefix)) delete shopping.have[k];
  }
}
