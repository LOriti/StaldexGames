import { DAYS, emptyDinner } from './plan.js';

export const CONTEXT_DAYS = 3;

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateFromKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

export function timelineAnchor(now = new Date()) {
  return localDateKey(addDays(now, -CONTEXT_DAYS));
}

export function dateForIndex(index, anchor = timelineAnchor()) {
  return addDays(dateFromKey(anchor), index);
}

export function dayDelta(fromKey, toKey) {
  const from = dateFromKey(fromKey);
  const to = dateFromKey(toKey);
  if (!from || !to) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Keep meals attached to their dates while the 28-day rolling window advances. */
export function rollPlan(plan, pins, fromAnchor, toAnchor) {
  const delta = dayDelta(fromAnchor, toAnchor);
  if (!delta) return { plan, pins, changed: false };

  const nextPlan = Array.from({ length: DAYS }, (_, index) => {
    const oldIndex = index + delta;
    return oldIndex >= 0 && oldIndex < DAYS
      ? plan[oldIndex]
      : { dinner: emptyDinner() };
  });

  const nextPins = {};
  for (const [oldIndex, dish] of Object.entries(pins || {})) {
    const nextIndex = Number(oldIndex) - delta;
    if (nextIndex >= 0 && nextIndex < DAYS) nextPins[nextIndex] = dish;
  }

  return { plan: nextPlan, pins: nextPins, changed: true };
}

export function dayContext(index) {
  const delta = index - CONTEXT_DAYS;
  if (delta === 0) return 'Today';
  if (delta === -1) return 'Yesterday';
  if (delta < 0) return `${Math.abs(delta)}d ago`;
  if (delta === 1) return 'Tomorrow';
  return `+${delta}d`;
}

export function formatDay(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}

export function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(date);
}

export function formatRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const left = new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: sameMonth ? undefined : 'short',
  }).format(start);
  const right = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(end);
  return `${left}–${right}`;
}
