/**
 * MANUAL LUNCHES — the second sparse override layer over derived lunches (pins are the
 * first). `manual` is { [dayIndex]: { name: string, frozen?: true } }:
 *
 *   - A manual lunch fills its day WITHOUT eating a leftover portion. Whatever FIFO would
 *     have served that day stays in the queue and feeds a later lunch. That is the point:
 *     "we're having a sandwich on Tuesday" moves the leftovers along, it doesn't waste them.
 *   - `frozen: true` means the lunch was taken out of the freezer. The freezer
 *     conservation rule still holds: taking one out decrements the freezer, and clearing
 *     the lunch (or replacing it) puts the portion back, because it was never eaten.
 *   - A manual lunch beats a pin on the same day; setting one removes that day's pin.
 *   - Clearing the entry returns the day to fully derived. Lunches never become a second
 *     source of truth.
 *
 * Mutating helpers, like the rest of core/: they change the objects passed in.
 */

import { bank, take } from './freezer.js';

export const MAX_LUNCH_NAME = 40;

export function manualAt(manual, idx) {
  const m = manual?.[idx];
  return m && typeof m.name === 'string' && m.name.trim() ? m : null;
}

/** Remove a day's manual lunch, returning a frozen portion to the freezer. */
export function clearManualLunch(manual, freezer, idx) {
  const m = manualAt(manual, idx);
  if (m?.frozen) bank(freezer, m.name, 1);
  delete manual[idx];
  return Boolean(m);
}

/** Free-text (or picked dish) lunch for a day. Returns false for an empty name. */
export function setManualLunch(manual, freezer, pins, idx, name) {
  const clean = String(name ?? '').trim().slice(0, MAX_LUNCH_NAME);
  if (!clean) return false;
  clearManualLunch(manual, freezer, idx);
  manual[idx] = { name: clean };
  if (pins) delete pins[idx];
  return true;
}

/** Take one portion of `dish` out of the freezer for a day's lunch. */
export function setFrozenLunch(manual, freezer, pins, idx, dish) {
  if (!freezer[dish]) return false;
  clearManualLunch(manual, freezer, idx);
  take(freezer, dish, 1);
  manual[idx] = { name: dish, frozen: true };
  if (pins) delete pins[idx];
  return true;
}

export function isValidManualLunches(m) {
  return Boolean(
    m && typeof m === 'object' && !Array.isArray(m) &&
    Object.values(m).every((v) => v && typeof v === 'object' && typeof v.name === 'string')
  );
}
