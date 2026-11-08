import { describe, it, expect } from 'vitest';
import { allocate, groupSurplus, leftoverOptions } from '../src/core/allocate.js';
import { emptyPlan, emptyDinner, dinnerYield, leftoverDinner } from '../src/core/plan.js';
import * as fz from '../src/core/freezer.js';
import { setManualLunch, lunchYield } from '../src/core/lunches.js';

const note = (text, extra) => ({ ...emptyDinner(), note: text, extra });

describe('leftovers from note days', () => {
  it('a note with a leftover count feeds later lunches', () => {
    const plan = emptyPlan();
    plan[0].dinner = note('Chicken salad', 2);
    const { lunch } = allocate(plan);
    expect(lunch[0]).toBeNull();
    expect(lunch[1]).toEqual({ dish: 'Chicken salad', from: 0 });
    expect(lunch[2]).toEqual({ dish: 'Chicken salad', from: 0 });
    expect(lunch[3]).toBeNull();
  });

  it('a plain note still makes nothing', () => {
    const plan = emptyPlan();
    plan[0].dinner = note('Dinner out', 0);
    expect(allocate(plan).lunch.every((l) => l === null)).toBe(true);
    expect(dinnerYield(plan[0].dinner)).toBeNull();
  });

  it('freezer and leftover nights never yield, whatever extra says', () => {
    expect(dinnerYield({ cat: 'bake', dish: 'Moussaka', src: 'freezer', extra: 3 })).toBeNull();
    expect(dinnerYield({ ...leftoverDinner('Keema'), extra: 3 })).toBeNull();
  });
});

describe('leftovers from hand-added lunches', () => {
  it('feed that evening\'s leftover dinner and later lunches', () => {
    const plan = emptyPlan();
    plan[2].dinner = leftoverDinner('Big salad');
    const manual = { 2: { name: 'Big salad', extra: 2 } };
    const { lunch, dinner } = allocate(plan, {}, manual);
    expect(lunch[2]).toMatchObject({ dish: 'Big salad', manual: true });
    expect(dinner[2]).toEqual({ dish: 'Big salad', from: 2, meal: 'lunch' });
    expect(lunch[3]).toEqual({ dish: 'Big salad', from: 2, meal: 'lunch' });
    expect(lunch[4]).toBeNull();
  });

  it('are eaten in cook order: a lunch before that day\'s dinner', () => {
    const plan = emptyPlan();
    plan[1].dinner = { cat: 'curry', dish: 'Keema', src: 'cook', extra: 1 };
    const manual = { 1: { name: 'Soup', extra: 1 } };
    const { lunch } = allocate(plan, {}, manual);
    expect(lunch[2].dish).toBe('Soup');
    expect(lunch[3].dish).toBe('Keema');
  });

  it('a frozen lunch makes nothing', () => {
    expect(lunchYield({ name: 'Keema', frozen: true, extra: 2 })).toBeNull();
  });

  it('renaming a lunch keeps its leftover count', () => {
    const manual = { 3: { name: 'Soup', extra: 2 } };
    setManualLunch(manual, {}, {}, 3, 'Pumpkin soup');
    expect(manual[3]).toEqual({ name: 'Pumpkin soup', extra: 2 });
  });

  it('show up as leftover options for that night and later', () => {
    const manual = { 2: { name: 'Big salad', extra: 1 } };
    expect(leftoverOptions(emptyPlan(), {}, manual, 2)).toEqual([{ dish: 'Big salad', cat: null }]);
    expect(leftoverOptions(emptyPlan(), {}, manual, 1)).toEqual([]);
  });
});

describe('freezing leftovers from notes and lunches', () => {
  it('freezes one lunch-made portion', () => {
    const manual = { 2: { name: 'Soup', extra: 2 } };
    const freezer = {};
    expect(fz.freezeOne(emptyPlan(), freezer, 2, manual, 'lunch')).toBe(true);
    expect(manual[2].extra).toBe(1);
    expect(freezer).toEqual({ Soup: 1 });
  });

  it('freezes one note-made portion and a whole note dinner', () => {
    const plan = emptyPlan();
    plan[0].dinner = note('Chicken salad', 3);
    const freezer = {};
    expect(fz.freezeOne(plan, freezer, 0)).toBe(true);
    expect(fz.freezeDinner(plan, freezer, 0)).toBe(2);
    expect(freezer).toEqual({ 'Chicken salad': 3 });
    expect(plan[0].dinner.extra).toBe(0);
  });

  it('freezes a surplus batch mixing dinner and lunch sources', () => {
    const plan = emptyPlan();
    plan[5].dinner = note('Soup', 1);
    const manual = { 6: { name: 'Soup', extra: 1 } };
    const { weekSurplus } = allocate(plan, {}, manual);
    const [batch] = groupSurplus(weekSurplus[0]);
    expect(batch.froms).toEqual([5, 'L6']);
    const freezer = {};
    expect(fz.freezeSurplus(plan, freezer, 'Soup', batch.froms, manual)).toBe(2);
    expect(freezer).toEqual({ Soup: 2 });
    expect(manual[6].extra).toBe(0);
    expect(plan[5].dinner.extra).toBe(0);
  });
});
