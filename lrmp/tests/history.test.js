import { describe, it, expect } from 'vitest';
import { allocate } from '../src/core/allocate.js';
import { emptyPlan, emptyDinner, leftoverDinner } from '../src/core/plan.js';
import {
  HISTORY_DAYS, archiveDays, earliestKey, entryFor, historyWeek, isValidHistory, pruneHistory, weeksOfHistory,
} from '../src/core/history.js';

const ANCHOR = '2026-11-10';

function planned() {
  const plan = emptyPlan();
  plan[0].dinner = { cat: 'curry', dish: 'Keema', src: 'cook', extra: 2 };
  plan[1].dinner = { ...emptyDinner(), note: 'Dinner out' };
  plan[2].dinner = leftoverDinner('Keema', 'curry');
  return plan;
}

describe('history — recording days as they leave the plan', () => {
  it('records the dinner as planned and the lunch as derived', () => {
    const plan = planned();
    const manual = { 2: { name: 'Sandwich' } };
    const { lunch } = allocate(plan, {}, manual);
    const h = archiveDays({}, plan, lunch, ANCHOR, 3);
    expect(h['2026-11-10']).toEqual({ dinner: { dish: 'Keema', cat: 'curry', src: 'cook', extra: 2 } });
    expect(h['2026-11-11']).toEqual({ dinner: { note: 'Dinner out' }, lunch: { dish: 'Keema', kind: 'leftovers' } });
    expect(h['2026-11-12']).toEqual({
      dinner: { dish: 'Keema', cat: 'curry', src: 'leftover' },
      lunch: { dish: 'Sandwich', kind: 'added' },
    });
  });

  it('only archives the days that roll off, and skips empty ones', () => {
    const plan = planned();
    const { lunch } = allocate(plan);
    const h = archiveDays({}, plan, lunch, ANCHOR, 1);
    expect(Object.keys(h)).toEqual(['2026-11-10']);
    expect(archiveDays({}, emptyPlan(), [], ANCHOR, 5)).toEqual({});
  });

  it('labels freezer lunches and waiting pins', () => {
    expect(entryFor({ dinner: emptyDinner() }, { dish: 'Soup', manual: true, frozen: true }).lunch.kind).toBe('frozen');
    expect(entryFor({ dinner: emptyDinner() }, { dish: 'Soup', pinned: true, unfulfilled: true }).lunch.kind).toBe('waiting');
  });

  it('prunes anything older than the limit', () => {
    const h = { '2025-01-01': { lunch: { dish: 'Old', kind: 'added' } }, '2026-11-01': { lunch: { dish: 'New', kind: 'added' } } };
    pruneHistory(h, '2026-11-15');
    expect(Object.keys(h)).toEqual(['2026-11-01']);
    expect(HISTORY_DAYS).toBeGreaterThanOrEqual(365);
  });
});

describe('history — browsing', () => {
  const h = {
    '2026-11-09': { lunch: { dish: 'Soup', kind: 'added' } },
    '2026-10-20': { dinner: { dish: 'Keema' } },
  };

  it('a week back is the 7 days ending the day before the window', () => {
    const days = historyWeek(h, ANCHOR, 1);
    expect(days.map((d) => d.key)).toEqual([
      '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09',
    ]);
    expect(days[6].entry).toEqual({ lunch: { dish: 'Soup', kind: 'added' } });
    expect(days[0].entry).toBeNull();
  });

  it('knows how far back there is anything to see', () => {
    expect(earliestKey(h)).toBe('2026-10-20');
    expect(weeksOfHistory(h, ANCHOR)).toBe(3);
    expect(weeksOfHistory({}, ANCHOR)).toBe(1);
  });

  it('validates the stored shape', () => {
    expect(isValidHistory(h)).toBe(true);
    expect(isValidHistory({})).toBe(true);
    expect(isValidHistory({ 'not-a-date': {} })).toBe(false);
    expect(isValidHistory([])).toBe(false);
  });
});
