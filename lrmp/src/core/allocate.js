/**
 * THE CORE ALGORITHM. Read this before touching anything in the Weekly view.
 *
 * Lunches are never chosen by the user — they are DERIVED from dinners. Move a dinner
 * and the lunches downstream of it re-derive automatically. That's the whole design:
 * one source of truth (the plan), lunches computed from it.
 *
 * Rules, in order:
 *
 *  1. A dinner cooked on day D makes its leftovers available from day D+1 onward.
 *     Never same-day — you ate it for dinner.
 *
 *  2. Only src === 'cook' dinners produce leftovers. A 'freezer' dinner is already a
 *     single reheated portion; it produces nothing.
 *
 *  3. FIFO — earliest-cooked is eaten first. Walk the days in order, maintaining a
 *     queue. Each day: (a) release yesterday's leftovers into the queue, (b) shift one
 *     off the front for today's lunch.
 *
 *  4. GAPS ARE LEGITIMATE. If the queue is empty, that day gets no lunch. Do not
 *     "fill" it by borrowing from a future dinner — that would mean eating food that
 *     hasn't been cooked yet. A gap is real information: cook more, or accept a gap.
 *
 *  5. ROLLING SURPLUS. Leftovers do not expire at the week boundary. Whatever is still
 *     in the queue when we cross from week W into week W+1 is week W's surplus: it
 *     rolls forward and will fill lunches in week W+1. weekSurplus[W] is a snapshot of
 *     the queue at that crossing. Week 3's surplus has no week to roll into — that's
 *     the terminal surplus, and it's freeze-it-or-lose-it.
 *
 * Pure function: same plan in, same result out. No DOM, no mutation of `plan`.
 *
 * @param {Array} plan  28-day plan (see core/plan.js)
 * @returns {{ lunch: Array<{dish:string, from:number}|null>, weekSurplus: Array<Array<{dish:string, from:number}>> }}
 *          lunch[i]        = the lunch on day i, or null for a gap
 *          weekSurplus[w]  = portions rolling OUT of week w (into week w+1)
 */
export function allocate(plan) {
  const DAYS = 28;
  const queue = [];
  const lunch = new Array(DAYS).fill(null);
  const weekSurplus = [[], [], [], []];

  for (let day = 0; day < DAYS; day++) {
    // (a) yesterday's leftovers become available today
    if (day > 0) {
      const prev = plan[day - 1].dinner;
      if (prev.dish && prev.src === 'cook' && prev.extra > 0) {
        for (let k = 0; k < prev.extra; k++) queue.push({ dish: prev.dish, from: day - 1 });
      }
    }

    // (b) snapshot the queue as we cross a week boundary — this is what rolls forward.
    //     Order matters: the release above must happen first, so Sunday's dinner counts
    //     toward the surplus rolling into Monday.
    if (day > 0 && day % 7 === 0) {
      weekSurplus[day / 7 - 1] = queue.map((t) => ({ ...t }));
    }

    // (c) eat the oldest available portion
    if (queue.length) lunch[day] = queue.shift();
  }

  // Day 27 (final Sunday) still releases its leftovers — they have nowhere to go.
  const last = plan[DAYS - 1].dinner;
  if (last.dish && last.src === 'cook' && last.extra > 0) {
    for (let k = 0; k < last.extra; k++) queue.push({ dish: last.dish, from: DAYS - 1 });
  }
  weekSurplus[3] = queue.map((t) => ({ ...t }));

  return { lunch, weekSurplus };
}

/**
 * Group a surplus token list into draggable batches: [{ dish, froms: number[], count }]
 * `froms` is retained so freezing a batch can decrement the right source dinners.
 */
export function groupSurplus(tokens = []) {
  const byDish = new Map();
  for (const t of tokens) {
    if (!byDish.has(t.dish)) byDish.set(t.dish, []);
    byDish.get(t.dish).push(t.from);
  }
  return [...byDish.entries()].map(([dish, froms]) => ({ dish, froms, count: froms.length }));
}

/** Convenience stats for the UI. */
export function lunchStats(lunchArr, week = null) {
  const range = week === null ? [0, 28] : [week * 7, week * 7 + 7];
  let filled = 0;
  let gaps = 0;
  for (let i = range[0]; i < range[1]; i++) {
    if (lunchArr[i]) filled++;
    else gaps++;
  }
  return { filled, gaps };
}
