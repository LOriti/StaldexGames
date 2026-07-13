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
 *  6. PINS are the one user override. `pins` is a sparse map { dayIndex: dishName } —
 *     "I want THIS dish for lunch on THIS day". A pin RESERVES the earliest-cooked
 *     portion of that dish that exists by the pinned day, so ordinary FIFO days can't
 *     eat it first. If no such portion can exist by then (not cooked yet, or none
 *     left), the pin is reported `unfulfilled: true` — honest, not auto-filled.
 *     Days without a pin stay 100% derived. Lunches never become a second source of
 *     truth: delete the pin and the day re-derives.
 *
 * Pure function: same plan in, same result out. No DOM, no mutation of `plan` or `pins`.
 *
 * @param {Array} plan  28-day plan (see core/plan.js)
 * @param {Object<number,string>} pins  sparse { dayIndex: dishName } lunch overrides
 * @returns {{ lunch: Array<{dish:string, from:number, pinned?:true, unfulfilled?:true}|null>, weekSurplus: Array<Array<{dish:string, from:number}>> }}
 *          lunch[i]        = the lunch on day i, or null for a gap
 *          weekSurplus[w]  = portions rolling OUT of week w (into week w+1)
 */
export function allocate(plan, pins = {}) {
  const DAYS = 28;

  // Every leftover portion as a token, in cook order (which IS the FIFO order).
  // A dinner cooked on day D releases from day D+1; day 27's tokens release "day 28",
  // i.e. never inside this plan — they can only be terminal surplus.
  const tokens = [];
  for (let d = 0; d < DAYS; d++) {
    const din = plan[d].dinner;
    if (din.dish && din.src === 'cook' && din.extra > 0) {
      for (let k = 0; k < din.extra; k++) tokens.push({ dish: din.dish, from: d, release: d + 1 });
    }
  }

  // Reserve a token for each pin (earliest pinned day first) so plain FIFO days
  // can't eat a portion the user has promised to a later lunch.
  const reserved = new Set();
  const reservedFor = new Map(); // dayIndex -> token
  const pinDays = Object.keys(pins)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d < DAYS && pins[d])
    .sort((a, b) => a - b);
  for (const day of pinDays) {
    const t = tokens.find((tok) => !reserved.has(tok) && tok.dish === pins[day] && tok.release <= day);
    if (t) {
      reserved.add(t);
      reservedFor.set(day, t);
    }
  }

  const queue = [];
  let next = 0;
  const lunch = new Array(DAYS).fill(null);
  const weekSurplus = [[], [], [], []];

  for (let day = 0; day < DAYS; day++) {
    // (a) release everything cooked before today
    while (next < tokens.length && tokens[next].release <= day) queue.push(tokens[next++]);

    // (b) snapshot the queue as we cross a week boundary — this is what rolls forward.
    //     Order matters: the release above must happen first, so Sunday's dinner counts
    //     toward the surplus rolling into Monday. Reserved tokens are still physically
    //     in the queue (they exist, they roll), so they appear here too.
    if (day > 0 && day % 7 === 0) {
      weekSurplus[day / 7 - 1] = queue.map((t) => ({ dish: t.dish, from: t.from }));
    }

    // (c) eat: the pinned portion if this day has one, else the oldest unreserved one
    if (pins[day]) {
      const t = reservedFor.get(day);
      if (t) {
        queue.splice(queue.indexOf(t), 1);
        lunch[day] = { dish: t.dish, from: t.from, pinned: true };
      } else {
        lunch[day] = { dish: pins[day], from: -1, pinned: true, unfulfilled: true };
      }
    } else {
      const i = queue.findIndex((t) => !reserved.has(t));
      if (i !== -1) {
        const t = queue.splice(i, 1)[0];
        lunch[day] = { dish: t.dish, from: t.from };
      }
    }
  }

  // Day 27 (final Sunday) still releases its leftovers — they have nowhere to go.
  while (next < tokens.length) queue.push(tokens[next++]);
  weekSurplus[3] = queue.map((t) => ({ dish: t.dish, from: t.from }));

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
