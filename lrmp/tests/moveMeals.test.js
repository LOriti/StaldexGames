import { describe, it, expect } from 'vitest';
import { allocate } from '../src/core/allocate.js';
import { emptyPlan, emptyDinner } from '../src/core/plan.js';
import { ALL_DISH_NAMES } from '../src/data/dishes.js';
import { dinnerToLunch, freezeManualLunch, lunchToDinner, moveManualLunch } from '../src/core/lunches.js';

const DISH = ALL_DISH_NAMES[0]; // a real dish with a recipe
const note = (text, extra = 0) => ({ ...emptyDinner(), note: text, extra });

describe('moving a hand-added lunch to another lunch', () => {
  it('moves it with its leftovers', () => {
    const manual = { 2: { name: 'Soup', extra: 1 } };
    expect(moveManualLunch(manual, {}, 2, 5)).toBe(true);
    expect(manual).toEqual({ 5: { name: 'Soup', extra: 1 } });
  });

  it('swaps with a hand-added lunch already there', () => {
    const manual = { 2: { name: 'Soup' }, 5: { name: 'Salad' } };
    moveManualLunch(manual, {}, 2, 5);
    expect(manual).toEqual({ 2: { name: 'Salad' }, 5: { name: 'Soup' } });
  });

  it('drops a pin on the target day', () => {
    const pins = { 5: 'Keema' };
    moveManualLunch({ 2: { name: 'Soup' } }, pins, 2, 5);
    expect(pins).toEqual({});
  });

  it('does nothing onto itself or from an empty day', () => {
    expect(moveManualLunch({ 2: { name: 'Soup' } }, {}, 2, 2)).toBe(false);
    expect(moveManualLunch({}, {}, 2, 3)).toBe(false);
  });
});

describe('moving a hand-added lunch to dinner', () => {
  it('a dish with a recipe becomes a cooked dinner that keeps its leftovers', () => {
    const plan = emptyPlan();
    const manual = { 2: { name: DISH, extra: 2 } };
    const r = lunchToDinner(plan, manual, 2, 4);
    expect(r).toMatchObject({ ok: true, kind: 'cook' });
    expect(plan[4].dinner).toMatchObject({ dish: DISH, src: 'cook', extra: 2 });
    expect(manual).toEqual({});
    expect(allocate(plan).lunch[5]).toMatchObject({ dish: DISH, from: 4 });
  });

  it('typed text becomes a note day', () => {
    const plan = emptyPlan();
    lunchToDinner(plan, { 2: { name: 'Chicken salad', extra: 1 } }, 2, 2);
    expect(plan[2].dinner).toMatchObject({ dish: null, note: 'Chicken salad', extra: 1 });
  });

  it('a freezer lunch becomes a freezer dinner, the same portion', () => {
    const plan = emptyPlan();
    lunchToDinner(plan, { 2: { name: DISH, frozen: true } }, 2, 3);
    expect(plan[3].dinner).toMatchObject({ dish: DISH, src: 'freezer', extra: 0 });
  });

  it('refuses a day that already has a dinner', () => {
    const plan = emptyPlan();
    plan[4].dinner = note('Dinner out');
    const manual = { 2: { name: 'Soup' } };
    expect(lunchToDinner(plan, manual, 2, 4)).toMatchObject({ ok: false, kind: 'occupied' });
    expect(manual[2]).toEqual({ name: 'Soup' });
  });
});

describe('dragging a note day onto a lunch', () => {
  it('a later day pins its leftovers, adding one if it had none', () => {
    const plan = emptyPlan();
    plan[1].dinner = note('Chicken salad');
    const pins = {};
    const r = dinnerToLunch(plan, pins, {}, {}, 1, 3);
    expect(r).toMatchObject({ ok: true, kind: 'pinned', dish: 'Chicken salad' });
    expect(plan[1].dinner.extra).toBe(1);
    expect(allocate(plan, pins).lunch[3]).toMatchObject({ dish: 'Chicken salad', pinned: true });
  });

  it('the same day moves the meal to lunch', () => {
    const plan = emptyPlan();
    plan[1].dinner = note('Chicken salad', 2);
    const manual = {};
    expect(dinnerToLunch(plan, {}, manual, {}, 1, 1).kind).toBe('moved');
    expect(manual[1]).toEqual({ name: 'Chicken salad', extra: 2 });
    expect(plan[1].dinner.note).toBeUndefined();
  });
});

describe('dragging a hand-added lunch onto the freezer', () => {
  it('a freezer lunch goes back', () => {
    const manual = { 2: { name: 'Soup', frozen: true } };
    const freezer = {};
    expect(freezeManualLunch(manual, freezer, 2)).toBe(1);
    expect(freezer).toEqual({ Soup: 1 });
    expect(manual).toEqual({});
  });

  it('a typed lunch banks its leftovers and stays', () => {
    const manual = { 2: { name: 'Soup', extra: 2 } };
    const freezer = {};
    expect(freezeManualLunch(manual, freezer, 2)).toBe(2);
    expect(freezer).toEqual({ Soup: 2 });
    expect(manual[2]).toEqual({ name: 'Soup', extra: 0 });
  });
});
