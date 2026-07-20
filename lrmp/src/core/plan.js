/**
 * The plan is the single source of truth for the whole app.
 * The Month view and the Weekly view are two renderings of THIS array —
 * there is deliberately no sync layer between them, because there is nothing to sync.
 *
 * Shape: a flat array of 28 days (4 weeks x 7 days).
 *   index = week * 7 + dayOfWeek     (week 0-3, dayOfWeek 0-6 = Mon-Sun)
 *
 * Each day:
 *   {
 *     dinner: {
 *       cat:   string|null   // mode key ('curry' | 'fry' | 'assembly' | 'soup' | 'bake')
 *       dish:  string|null   // dish name, must exist in DISH_INDEX
 *       src:   'cook' | 'freezer' | null
 *       extra: number        // leftover portions this dinner yields
 *       note:  string        // OPTIONAL free-text day note ("dinner out"). A note day
 *                            // has cat/dish/src null and extra 0 — it cooks nothing,
 *                            // yields nothing, and the allocator ignores it.
 *     }
 *   }
 *
 * INVARIANTS (tests enforce these — don't break them):
 *   - plan.length === 28, always.
 *   - Only src === 'cook' dinners produce leftovers. A 'freezer' dinner is a single
 *     reheated portion; it yields nothing. Its `extra` must stay 0.
 *   - An empty day has cat/dish/src null and extra 0. Empty days are legitimate and
 *     common — not every day needs a category.
 */

import { MODES } from '../data/modes.js';
import { dishPool, metaOf } from '../data/dishes.js';

export const DAYS = 28;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * How many leftover portions a dinner yields by default, by leftover class.
 * These are just sensible starting numbers — the user overrides per-dinner with -/+.
 *
 * NOTE: 2 is generous. Across a week of five 'keeps' dinners it over-produces relative
 * to the 7 lunch slots, which is why surplus rolls forward and the freezer exists.
 * Dropping keeps to 1 is a one-line change if the surplus is annoying in practice.
 */
export const DEFAULT_EXTRA = { keeps: 2, parts: 1, fresh: 0 };

export function emptyDinner() {
  return { cat: null, dish: null, src: null, extra: 0 };
}

export function emptyPlan() {
  return Array.from({ length: DAYS }, () => ({ dinner: emptyDinner() }));
}

/** Default leftover count for a dish, from its leftover class. */
export function defaultExtraFor(dishName) {
  const info = metaOf(dishName);
  return DEFAULT_EXTRA[info ? info.dish.l : 'fresh'] ?? 0;
}

/**
 * The starter plan: Mon-Fri cooked, one dish from each of the 5 modes, Sat/Sun free.
 * Weekends are intentionally left empty — that's what the freezer and rolling
 * leftovers are for.
 */
export function seedPlan(rng = Math.random) {
  const plan = emptyPlan();
  for (let w = 0; w < 4; w++) {
    MODES.forEach((mode, dayOfWeek) => {
      const idx = w * 7 + dayOfWeek;
      const used = new Set();
      // avoid repeating a dish already seeded earlier in this same week
      for (let d = 0; d < dayOfWeek; d++) {
        const prev = plan[w * 7 + d].dinner.dish;
        if (prev) used.add(prev);
      }
      const dish = pickDish(mode.key, used, rng);
      plan[idx].dinner = { cat: mode.key, dish, src: 'cook', extra: defaultExtraFor(dish) };
    });
  }
  return plan;
}

/**
 * Pick a dish from a mode's pool, avoiding names in `avoid` where possible.
 * Falls back to the full pool if `avoid` would leave nothing.
 */
export function pickDish(modeKey, avoid = new Set(), rng = Math.random) {
  // dishPool = built-ins minus user removals, plus user customs (see data/dishes.js).
  const pool = dishPool(modeKey);
  const names = pool.map((d) => d.n);
  const open = names.filter((n) => !avoid.has(n));
  const arr = open.length ? open : names;
  if (!arr.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

/** Dish names already used elsewhere in the same week as `idx` (excluding idx itself). */
export function sameWeekDishes(plan, idx) {
  const w = Math.floor(idx / 7);
  const set = new Set();
  for (let d = 0; d < 7; d++) {
    const gi = w * 7 + d;
    if (gi !== idx && plan[gi].dinner.dish) set.add(plan[gi].dinner.dish);
  }
  return set;
}

/**
 * Month-view brush. Mutates `plan` in place.
 *   brush = a mode key  -> set that category and drop in a dish
 *           (re-painting the SAME category re-rolls to a different dish)
 *   brush = 'erase'     -> clear the day
 */
export function paintDay(plan, idx, brush, rng = Math.random) {
  const d = plan[idx].dinner;

  if (brush === 'erase') {
    plan[idx].dinner = emptyDinner();
    return plan;
  }

  const avoid = sameWeekDishes(plan, idx);
  // Re-tapping the same category should give you a DIFFERENT dish, not the same one.
  if (d.cat === brush && d.dish) avoid.add(d.dish);

  const dish = pickDish(brush, avoid, rng);
  plan[idx].dinner = { cat: brush, dish, src: 'cook', extra: defaultExtraFor(dish) };
  return plan;
}

/** Re-roll every painted day, keeping its category. Empty days stay empty. */
export function shuffleAll(plan, rng = Math.random) {
  for (let i = 0; i < DAYS; i++) {
    const d = plan[i].dinner;
    if (!d.cat) continue;
    const avoid = sameWeekDishes(plan, i);
    if (d.dish) avoid.add(d.dish);
    const dish = pickDish(d.cat, avoid, rng);
    plan[i].dinner = { cat: d.cat, dish, src: 'cook', extra: defaultExtraFor(dish) };
  }
  return plan;
}

export function clearPlan(plan) {
  for (let i = 0; i < DAYS; i++) plan[i].dinner = emptyDinner();
  return plan;
}

/**
 * Push a dinner out of its week into the NEXT week (the drag-onto-the-surplus-strip
 * action). Lands on the same weekday if that's free, otherwise the first empty day of
 * the target week. Week 3 wraps to week 0 — the board is reused month to month, so
 * "next week" after Wk 4 is next month's Wk 1.
 *
 * @returns {{ ok: boolean, idx?: number, wrapped?: boolean, reason?: string }}
 */
export function deferDinner(plan, idx) {
  const d = plan[idx].dinner;
  if (!d.dish && !d.note) return { ok: false, reason: 'empty' };

  const week = Math.floor(idx / 7);
  const targetWeek = (week + 1) % 4;
  const isFree = (gi) => !plan[gi].dinner.dish && !plan[gi].dinner.note;

  let target = -1;
  const sameDay = targetWeek * 7 + (idx % 7);
  if (isFree(sameDay)) target = sameDay;
  else {
    for (let dd = 0; dd < 7; dd++) {
      const gi = targetWeek * 7 + dd;
      if (isFree(gi)) { target = gi; break; }
    }
  }
  if (target === -1) return { ok: false, reason: 'full' };

  plan[target].dinner = d;
  plan[idx].dinner = emptyDinner();
  return { ok: true, idx: target, wrapped: targetWeek < week };
}

/** Swap two days' dinners (the drag-to-reorder action). */
export function swapDinners(plan, a, b) {
  if (a === b) return plan;
  const tmp = plan[a].dinner;
  plan[a].dinner = plan[b].dinner;
  plan[b].dinner = tmp;
  return plan;
}

/** Guard against corrupt/stale persisted state. */
export function isValidPlan(plan) {
  return Array.isArray(plan) && plan.length === DAYS && plan.every((d) => d && d.dinner);
}
