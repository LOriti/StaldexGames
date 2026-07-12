/**
 * The freezer is a simple tally: { [dishName]: portionCount }. Zero-count entries are
 * deleted rather than kept at 0, so `Object.keys(freezer)` is always the real inventory.
 *
 * CONSERVATION RULE — the thing to not break:
 *   Portions are never created or destroyed by a freezer operation. Every portion that
 *   lands in the freezer must be decremented from a dinner's `extra`, and every portion
 *   taken out must land somewhere (a dinner slot) or be explicitly discarded.
 *   tests/freezer.test.js checks this.
 *
 * All functions here mutate the objects passed in and return them, matching the rest of
 * the core modules.
 */

import { metaOf } from '../data/dishes.js';

export function bank(freezer, dish, count = 1) {
  if (!dish || count <= 0) return freezer;
  freezer[dish] = (freezer[dish] ?? 0) + count;
  return freezer;
}

export function take(freezer, dish, count = 1) {
  if (!freezer[dish]) return freezer;
  freezer[dish] -= count;
  if (freezer[dish] <= 0) delete freezer[dish];
  return freezer;
}

export function totalPortions(freezer) {
  return Object.values(freezer).reduce((a, b) => a + b, 0);
}

/**
 * Freeze ONE leftover portion from a specific dinner (the snowflake button).
 * @returns {boolean} whether anything was frozen
 */
export function freezeOne(plan, freezer, idx) {
  const d = plan[idx].dinner;
  if (!d.dish || d.src !== 'cook' || d.extra <= 0) return false;
  d.extra -= 1;
  bank(freezer, d.dish, 1);
  return true;
}

/**
 * Freeze ALL of a dinner's leftovers at once (drag the dinner tile onto the freezer).
 * @returns {number} how many portions were banked
 */
export function freezeDinner(plan, freezer, idx) {
  const d = plan[idx].dinner;
  if (!d.dish || d.src !== 'cook' || d.extra <= 0) return 0;
  const n = d.extra;
  d.extra = 0;
  bank(freezer, d.dish, n);
  return n;
}

/**
 * Freeze a rolling-surplus batch (drag the surplus tile onto the freezer).
 * `froms` are the day indexes the portions came from; we decrement each so the plan's
 * `extra` counts stay honest and the allocator re-derives correctly.
 * @returns {number} how many portions were banked
 */
export function freezeSurplus(plan, freezer, dish, froms = []) {
  let banked = 0;
  for (const from of froms) {
    const d = plan[from]?.dinner;
    if (d && d.dish === dish && d.extra > 0) {
      d.extra -= 1;
      banked += 1;
    }
  }
  if (banked) bank(freezer, dish, banked);
  return banked;
}

/**
 * Pull a frozen meal out into a dinner slot.
 * Frozen meals are a single reheated portion — they yield no leftovers (extra: 0).
 *
 * @param {number|null} idx  target day index; if null, the first EMPTY day in `week`
 * @returns {{ ok: boolean, idx?: number, reason?: string }}
 */
export function useFromFreezer(plan, freezer, dish, { idx = null, week = 0 } = {}) {
  if (!freezer[dish]) return { ok: false, reason: 'not-in-freezer' };

  let target = idx;
  if (target === null) {
    target = -1;
    for (let d = 0; d < 7; d++) {
      const gi = week * 7 + d;
      if (!plan[gi].dinner.dish) {
        target = gi;
        break;
      }
    }
    if (target === -1) return { ok: false, reason: 'no-empty-slot' };
  }

  const info = metaOf(dish);
  plan[target].dinner = {
    cat: info ? info.mode : null,
    dish,
    src: 'freezer',
    extra: 0, // a frozen meal is one portion. It does not breed.
  };
  take(freezer, dish, 1);
  return { ok: true, idx: target };
}
