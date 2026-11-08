import { lunchYield, manualAt } from './lunches.js';
import { dinnerYield } from './plan.js';

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
 *  2. Cooked dinners, note days and hand-added lunches with a leftover count produce
 *     leftovers (dinnerYield / lunchYield). A lunch's leftovers can be that same day's
 *     dinner and later lunches (they release at "day + 0.5"). A 'freezer' dinner is already a
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
 *  7. MANUAL LUNCHES (`manual`, see core/lunches.js) fill a day with something the user
 *     added by hand: free text, a dish, or a portion out of the freezer. That day eats
 *     NO leftover token, so the queue carries on to later days. A manual lunch beats a
 *     pin on the same day, and such a pin reserves nothing.
 *
 *  8. LEFTOVER DINNERS. A dinner with src === 'leftover' eats one portion of its dish
 *     instead of cooking (lunch is still the default home for leftovers; this is the
 *     opt-in). It reserves the earliest-cooked portion of that dish released by that
 *     day, exactly like a pin, and is `unfulfilled` when none can exist by then. It
 *     yields nothing. Cooked Monday, leftovers for Tuesday dinner: fine. Same day: no.
 *
 * Pure function: same plan in, same result out. No DOM, no mutation of `plan`, `pins` or `manual`.
 *
 * @param {Array} plan  28-day plan (see core/plan.js)
 * @param {Object<number,string>} pins  sparse { dayIndex: dishName } lunch overrides
 * @param {Object<number,{name:string,frozen?:true}>} manual  sparse hand-added lunches
 * @returns {{ lunch: Array<{dish:string, from:number, pinned?:true, unfulfilled?:true, manual?:true, frozen?:true}|null>, weekSurplus: Array<Array<{dish:string, from:number}>> }}
 *          lunch[i]        = the lunch on day i, or null for a gap
 *          dinner[i]       = for a leftover dinner, { dish, from } or { dish, from: -1,
 *                            unfulfilled: true }; null on every other day
 *          weekSurplus[w]  = portions rolling OUT of week w (into week w+1)
 */
export function allocate(plan, pins = {}, manual = {}) {
  const DAYS = 28;

  // Every leftover portion as a token, in cook order (which IS the FIFO order).
  // A dinner cooked on day D releases from day D+1; day 27's tokens release "day 28",
  // i.e. never inside this plan — they can only be terminal surplus. A lunch made on
  // day D releases at D + 0.5: after that day's lunch, in time for its dinner.
  const tokens = [];
  for (let d = 0; d < DAYS; d++) {
    const ly = lunchYield(manualAt(manual, d));
    if (ly) for (let k = 0; k < ly.extra; k++) tokens.push({ dish: ly.name, from: d, meal: 'lunch', release: d + 0.5 });
    const dy = dinnerYield(plan[d].dinner);
    if (dy) for (let k = 0; k < dy.extra; k++) tokens.push({ dish: dy.name, from: d, release: d + 1 });
  }
  // What a token looks like once eaten or carried: a lunch-made one says so.
  const view = (t) => (t.meal ? { dish: t.dish, from: t.from, meal: t.meal } : { dish: t.dish, from: t.from });

  // Reserve a token for each pin (earliest pinned day first) so plain FIFO days
  // can't eat a portion the user has promised to a later lunch.
  // Leftover dinners reserve the same way. Claims are settled earliest day first, and on
  // the same day the lunch pin before the dinner (lunch is eaten first).
  const reserved = new Set();
  const reservedFor = new Map(); // dayIndex -> token (lunch pins)
  const dinnerFor = new Map(); // dayIndex -> token (leftover dinners)
  const claims = Object.keys(pins)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d < DAYS && pins[d] && !manualAt(manual, d))
    .map((day) => ({ day, meal: 0, dish: pins[day], into: reservedFor, by: day }));
  for (let d = 0; d < DAYS; d++) {
    const din = plan[d].dinner;
    if (din.dish && din.src === 'leftover') claims.push({ day: d, meal: 1, dish: din.dish, into: dinnerFor, by: d + 0.5 });
  }
  claims.sort((a, b) => a.day - b.day || a.meal - b.meal);
  for (const c of claims) {
    const t = tokens.find((tok) => !reserved.has(tok) && tok.dish === c.dish && tok.release <= c.by);
    if (t) {
      reserved.add(t);
      c.into.set(c.day, t);
    }
  }

  const queue = [];
  let next = 0;
  const lunch = new Array(DAYS).fill(null);
  const dinner = new Array(DAYS).fill(null);
  const weekSurplus = [[], [], [], []];

  for (let day = 0; day < DAYS; day++) {
    // (a) release everything cooked before today
    while (next < tokens.length && tokens[next].release <= day) queue.push(tokens[next++]);

    // (b) snapshot the queue as we cross a week boundary — this is what rolls forward.
    //     Order matters: the release above must happen first, so Sunday's dinner counts
    //     toward the surplus rolling into Monday. Reserved tokens are still physically
    //     in the queue (they exist, they roll), so they appear here too.
    if (day > 0 && day % 7 === 0) {
      weekSurplus[day / 7 - 1] = queue.map(view);
    }

    // (c) eat: a hand-added lunch eats nothing; else the pinned portion if this day has
    //     one; else the oldest unreserved one
    const m = manualAt(manual, day);
    if (m) {
      lunch[day] = { dish: m.name, from: -1, manual: true, ...(m.frozen ? { frozen: true } : {}) };
    } else if (pins[day]) {
      const t = reservedFor.get(day);
      if (t) {
        queue.splice(queue.indexOf(t), 1);
        lunch[day] = { ...view(t), pinned: true };
      } else {
        lunch[day] = { dish: pins[day], from: -1, pinned: true, unfulfilled: true };
      }
    } else {
      const i = queue.findIndex((t) => !reserved.has(t));
      if (i !== -1) {
        const t = queue.splice(i, 1)[0];
        lunch[day] = view(t);
      }
    }

    // (c2) anything made at today's lunch is now available for tonight
    while (next < tokens.length && tokens[next].release <= day + 0.5) queue.push(tokens[next++]);

    // (d) a leftover dinner eats its reserved portion
    const din = plan[day].dinner;
    if (din.dish && din.src === 'leftover') {
      const t = dinnerFor.get(day);
      if (t) {
        queue.splice(queue.indexOf(t), 1);
        dinner[day] = view(t);
      } else {
        dinner[day] = { dish: din.dish, from: -1, unfulfilled: true };
      }
    }
  }

  // Day 27 (final Sunday) still releases its leftovers — they have nowhere to go.
  while (next < tokens.length) queue.push(tokens[next++]);
  weekSurplus[3] = queue.map(view);

  return { lunch, weekSurplus, dinner };
}

/**
 * Group a surplus token list into draggable batches: [{ dish, froms, count }]
 * `froms` is retained so freezing a batch can decrement the right sources: a dinner's day
 * index as a number, or 'L<day>' for a portion made at that day's lunch.
 */
export function groupSurplus(tokens = []) {
  const byDish = new Map();
  for (const t of tokens) {
    if (!byDish.has(t.dish)) byDish.set(t.dish, []);
    byDish.get(t.dish).push(t.meal === 'lunch' ? `L${t.from}` : t.from);
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

/**
 * Which leftovers could be dinner on day `idx` without inventing food: dishes cooked on
 * an earlier day with leftovers, where a leftover dinner of that dish would be fulfilled.
 * Taking one may move a later lunch along or open a gap, which is honest.
 * @returns {Array<{dish:string, cat:string|null}>} in cook order
 */
export function leftoverOptions(plan, pins = {}, manual = {}, idx) {
  const seen = new Map();
  for (let d = 0; d <= idx; d++) {
    const ly = lunchYield(manualAt(manual, d));
    if (ly && !seen.has(ly.name)) seen.set(ly.name, null);
    if (d === idx) break; // tonight's own dinner can't feed itself
    const dy = dinnerYield(plan[d].dinner);
    if (dy && !seen.has(dy.name)) seen.set(dy.name, plan[d].dinner.cat ?? null);
  }
  const out = [];
  for (const [dish, cat] of seen) {
    const trial = plan.map((day, i) => (i === idx ? { ...day, dinner: { cat, dish, src: 'leftover', extra: 0 } } : day));
    const r = allocate(trial, pins, manual).dinner[idx];
    if (r && !r.unfulfilled) out.push({ dish, cat });
  }
  return out;
}
