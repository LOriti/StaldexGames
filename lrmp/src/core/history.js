/**
 * HISTORY — what was planned and eaten on days that have left the rolling window.
 *
 * The plan only holds 28 days. Every morning rollPlan() drops the oldest day; before it
 * does, state.js archives that day here, keyed by its local date:
 *
 *   history['2026-11-12'] = {
 *     dinner?: { dish?, note?, cat?, src?, extra? },  // as planned on the day
 *     lunch?:  { dish, kind },                         // as derived on the day
 *   }
 *
 * kind: 'leftovers' | 'added' (typed by hand) | 'frozen' (from the freezer) |
 *       'waiting' (a pin that never got a portion).
 *
 * It is a read-only record: nothing derives from it, so it can never disagree with the
 * plan. Empty days are not stored, and anything older than HISTORY_DAYS is pruned so
 * the synced blob stays small (a year of busy days is ~50KB; the Worker's cap is 200KB).
 */

import { addDays, dateForIndex, dateFromKey, dayDelta, localDateKey } from './timeline.js';

export const HISTORY_DAYS = 371; // 53 weeks

function lunchKind(l) {
  if (l.manual) return l.frozen ? 'frozen' : 'added';
  return l.unfulfilled ? 'waiting' : 'leftovers';
}

/** The record for one plan day and its derived lunch, or null if nothing happened. */
export function entryFor(day, lunch) {
  const out = {};
  const d = day?.dinner;
  if (d && (d.dish || d.note)) {
    out.dinner = {};
    for (const k of ['dish', 'note', 'cat', 'src']) if (d[k]) out.dinner[k] = d[k];
    if (d.extra > 0) out.dinner.extra = d.extra;
  }
  if (lunch?.dish) out.lunch = { dish: lunch.dish, kind: lunchKind(lunch) };
  return Object.keys(out).length ? out : null;
}

/**
 * Archive the first `count` days of the window starting at `anchor` (the days about to
 * roll off). `lunch` is allocate(...).lunch for that same window. Mutates `history`.
 */
export function archiveDays(history, plan, lunch, anchor, count) {
  const n = Math.min(Math.max(0, count), plan.length);
  for (let i = 0; i < n; i++) {
    const key = localDateKey(dateForIndex(i, anchor));
    const e = entryFor(plan[i], lunch?.[i]);
    if (e) history[key] = e;
    else delete history[key];
  }
  return history;
}

/** Drop records older than HISTORY_DAYS before `todayKey`. Mutates `history`. */
export function pruneHistory(history, todayKey) {
  for (const key of Object.keys(history)) {
    if (dayDelta(key, todayKey) > HISTORY_DAYS) delete history[key];
  }
  return history;
}

/** The oldest recorded date key, or null. */
export function earliestKey(history) {
  const keys = Object.keys(history || {}).filter((k) => dateFromKey(k)).sort();
  return keys[0] ?? null;
}

/**
 * The 7 days of the week `weeksBack` weeks before the window: weeksBack 1 is the 7 days
 * ending the day before `anchor`. Each item is { key, date, entry|null }.
 */
export function historyWeek(history, anchor, weeksBack) {
  const start = addDays(dateFromKey(anchor), -7 * weeksBack);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = localDateKey(date);
    return { key, date, entry: history?.[key] ?? null };
  });
}

/** How many weeks back there is anything to see (at least 1, so the button explains). */
export function weeksOfHistory(history, anchor) {
  const first = earliestKey(history);
  if (!first) return 1;
  return Math.max(1, Math.ceil(dayDelta(first, anchor) / 7));
}

export function isValidHistory(h) {
  return Boolean(
    h && typeof h === 'object' && !Array.isArray(h) &&
    Object.entries(h).every(([k, v]) => dateFromKey(k) && v && typeof v === 'object')
  );
}
