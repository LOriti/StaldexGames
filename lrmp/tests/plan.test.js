import { describe, it, expect } from 'vitest';
import { seedPlan, paintDay, shuffleAll, clearPlan, swapDinners, deferDinner, sameWeekDishes, isValidPlan, emptyDinner, DAYS, DEFAULT_EXTRA } from '../src/core/plan.js';
import { metaOf } from '../src/data/dishes.js';
import { MODES } from '../src/data/modes.js';

describe('plan — shape and seeding', () => {
  it('is always 28 days', () => {
    expect(seedPlan()).toHaveLength(DAYS);
    expect(isValidPlan(seedPlan())).toBe(true);
  });

  it('rejects corrupt persisted state', () => {
    expect(isValidPlan(null)).toBe(false);
    expect(isValidPlan([])).toBe(false);
    expect(isValidPlan(Array(28).fill(null))).toBe(false);
  });

  it('seeds Mon-Fri with one dish per mode, leaving the weekend free', () => {
    const plan = seedPlan();
    for (let w = 0; w < 4; w++) {
      MODES.forEach((mode, d) => {
        expect(plan[w * 7 + d].dinner.cat).toBe(mode.key);
        expect(plan[w * 7 + d].dinner.src).toBe('cook');
      });
      expect(plan[w * 7 + 5].dinner.dish).toBeNull(); // Sat
      expect(plan[w * 7 + 6].dinner.dish).toBeNull(); // Sun
    }
  });

  it('gives every seeded dinner the right default leftover count for its class', () => {
    for (const day of seedPlan()) {
      if (!day.dinner.dish) continue;
      const info = metaOf(day.dinner.dish);
      expect(day.dinner.extra).toBe(DEFAULT_EXTRA[info.dish.l]);
    }
  });

  it('does not repeat a dish within the same week', () => {
    for (let run = 0; run < 20; run++) {
      const plan = seedPlan();
      for (let w = 0; w < 4; w++) {
        const names = plan.slice(w * 7, w * 7 + 7).map((d) => d.dinner.dish).filter(Boolean);
        expect(new Set(names).size).toBe(names.length);
      }
    }
  });
});

describe('plan — painting', () => {
  it('painting a blank day sets the category and drops in a dish from that pool', () => {
    const plan = clearPlan(seedPlan());
    paintDay(plan, 0, 'bake');
    expect(plan[0].dinner.cat).toBe('bake');
    expect(metaOf(plan[0].dinner.dish).mode).toBe('bake');
    expect(plan[0].dinner.src).toBe('cook');
  });

  it('re-painting the SAME category re-rolls to a different dish', () => {
    const plan = clearPlan(seedPlan());
    paintDay(plan, 0, 'curry');
    const first = plan[0].dinner.dish;
    paintDay(plan, 0, 'curry');
    expect(plan[0].dinner.dish).not.toBe(first); // pool has 8, so a swap is always possible
  });

  it('erase clears the day completely', () => {
    const plan = seedPlan();
    paintDay(plan, 0, 'erase');
    expect(plan[0].dinner).toEqual({ cat: null, dish: null, src: null, extra: 0 });
  });

  it('shuffleAll keeps categories but changes dishes, and leaves blanks blank', () => {
    const plan = seedPlan();
    paintDay(plan, 3, 'erase');
    const cats = plan.map((d) => d.dinner.cat);
    shuffleAll(plan);
    expect(plan.map((d) => d.dinner.cat)).toEqual(cats);
    expect(plan[3].dinner.dish).toBeNull();
  });
});

describe('plan — moving dinners', () => {
  it('swapDinners exchanges two days', () => {
    const plan = seedPlan();
    const a = { ...plan[0].dinner };
    const b = { ...plan[1].dinner };
    swapDinners(plan, 0, 1);
    expect(plan[0].dinner).toEqual(b);
    expect(plan[1].dinner).toEqual(a);
  });

  it('sameWeekDishes excludes the day itself and other weeks', () => {
    const plan = seedPlan();
    const names = sameWeekDishes(plan, 0);
    expect(names.has(plan[0].dinner.dish)).toBe(false);
    expect(names.has(plan[1].dinner.dish)).toBe(true);
    expect(names.has(plan[7].dinner.dish)).toBe(false); // next week
  });
});

describe('plan — deferDinner (push to next week)', () => {
  it('prefers the same weekday of the next week when it is free', () => {
    const plan = seedPlan(); // Sat/Sun free in every week
    // move week 0 Monday somewhere free: Sat of week 1? No — same weekday (Mon wk1) is taken.
    // Use a Saturday note-free plan: defer wk0 Monday; Mon wk1 occupied -> first empty is Sat wk1.
    const moved = { ...plan[0].dinner };
    const res = deferDinner(plan, 0);
    expect(res.ok).toBe(true);
    expect(res.idx).toBe(7 + 5); // Mon wk1 taken, Sat wk1 is the first empty day
    expect(plan[res.idx].dinner).toEqual(moved);
    expect(plan[0].dinner).toEqual(emptyDinner());
  });

  it('lands on the same weekday when that day is empty', () => {
    const plan = seedPlan();
    const moved = { ...plan[5].dinner, cat: 'curry', dish: 'Keema', src: 'cook', extra: 2 };
    plan[5].dinner = moved; // Sat wk0 now cooked; Sat wk1 still empty
    const res = deferDinner(plan, 5);
    expect(res.ok).toBe(true);
    expect(res.idx).toBe(7 + 5); // same weekday, next week
    expect(res.wrapped).toBe(false);
  });

  it('wraps week 4 into week 1 (next month)', () => {
    const plan = seedPlan();
    expect(deferDinner(plan, 26).ok).toBe(false); // Sat wk3 is empty — nothing to defer
    plan[26].dinner = { cat: 'curry', dish: 'Keema', src: 'cook', extra: 2 }; // Sat wk3
    plan[5].dinner = { cat: 'fry', dish: 'Steak', src: 'cook', extra: 0 }; // Sat wk0 occupied
    const res2 = deferDinner(plan, 26);
    expect(res2.ok).toBe(true);
    expect(res2.idx).toBe(6); // Sat wk0 taken -> first empty in wk0 is Sun (day 6)
    expect(res2.wrapped).toBe(true);
  });

  it('refuses when the next week has no empty day', () => {
    const plan = seedPlan();
    for (let d = 0; d < 7; d++) plan[7 + d].dinner = { cat: 'curry', dish: 'D' + d, src: 'cook', extra: 0 };
    const res = deferDinner(plan, 0);
    expect(res.ok).toBe(false);
    expect(plan[0].dinner.dish).not.toBeNull(); // nothing moved
  });

  it('refuses to defer an empty day', () => {
    const plan = seedPlan();
    expect(deferDinner(plan, 5).ok).toBe(false); // Sat wk0 is empty
  });

  it('treats note days as occupied targets and movable sources', () => {
    const plan = seedPlan();
    plan[7 + 5].dinner = { ...emptyDinner(), note: 'dinner out' }; // Sat wk1 has a note
    const res = deferDinner(plan, 0); // Mon wk1 taken, Sat wk1 noted -> Sun wk1
    expect(res.idx).toBe(7 + 6);
    const res2 = deferDinner(plan, 7 + 5); // the note itself can be pushed to wk2
    expect(res2.ok).toBe(true);
    expect(plan[res2.idx].dinner.note).toBe('dinner out');
  });
});
