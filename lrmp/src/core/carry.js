/**
 * MOVING A MEAL MOVES ITS LEFTOVERS.
 *
 * Plain leftover lunches already follow a moved meal: they are derived from where it is.
 * Two things are tied to a date instead, and would be left behind:
 *   - a pinned lunch fed by that meal (state.lunchPins)
 *   - a leftover dinner fed by it (src: 'leftover')
 * Left behind, they end up before the meal is cooked ("no portion by then") or eat
 * another meal's leftovers. So carryLeftovers() notes what each moving meal feeds, runs
 * the move, then shifts those by the same number of days. One that can't follow (the
 * new day is taken, or past the end of the plan) stays where it was; a pin that would
 * fall off the plan is dropped, and its portion simply joins the surplus.
 */

import { allocate } from './allocate.js';
import { manualAt } from './lunches.js';
import { DAYS, emptyDinner } from './plan.js';

/**
 * @param {Array} plan, pins, manual   the state slices; mutated in place
 * @param {Array<{day:number, meal?:'dinner'|'lunch'}>} sources   the meals about to move
 * @param {() => ({to?: Array<number|null>} & object)} apply   does the move; returns
 *        `to`, each source's new day (null if it didn't move), plus anything else
 * @returns {{ result: object, carried: number }}  apply's result, and how many
 *        leftovers followed
 */
export function carryLeftovers(plan, pins, manual, sources, apply) {
  const { lunch, dinner } = allocate(plan, pins, manual);
  const fedBy = (x, src) => x && !x.unfulfilled && x.from === src.day &&
    ((src.meal ?? 'dinner') === 'lunch') === (x.meal === 'lunch');
  const deps = sources.map((src) => ({
    pins: lunch.flatMap((l, d) => (l?.pinned && fedBy(l, src) ? [{ d, dish: pins[d] }] : [])),
    dinners: dinner.flatMap((x, d) => (fedBy(x, src) ? [{ d, dish: x.dish }] : [])),
  }));

  const result = apply() ?? {};
  const tos = result.to ?? [];

  const pinShifts = [];
  const dinShifts = [];
  sources.forEach((src, i) => {
    const to = tos[i];
    if (to == null || to === src.day) return;
    const delta = to - src.day;
    for (const p of deps[i].pins) pinShifts.push({ ...p, to: p.d + delta });
    for (const x of deps[i].dinners) dinShifts.push({ ...x, to: x.d + delta });
  });

  let carried = 0;

  // Pins: lift them all first, so meals swapping days don't trip over each other.
  const liftedPins = pinShifts.filter((p) => pins[p.d] === p.dish);
  for (const p of liftedPins) delete pins[p.d];
  for (const p of liftedPins) {
    if (p.to >= 0 && p.to < DAYS && !pins[p.to] && !manualAt(manual, p.to)) {
      pins[p.to] = p.dish;
      carried++;
    }
  }

  // Leftover dinners: the same, but one that can't land goes back where it was.
  const liftedDinners = dinShifts.flatMap((x) => {
    const din = plan[x.d].dinner;
    if (din.src !== 'leftover' || din.dish !== x.dish) return []; // the move itself took it
    plan[x.d].dinner = emptyDinner();
    return [{ ...x, din }];
  });
  for (const x of liftedDinners) {
    const target = plan[x.to]?.dinner;
    if (target && !target.dish && !target.note) {
      plan[x.to].dinner = x.din;
      carried++;
    } else {
      plan[x.d].dinner = x.din;
    }
  }

  return { result, carried };
}
