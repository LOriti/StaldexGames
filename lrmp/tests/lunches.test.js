import { describe, it, expect } from 'vitest';
import { allocate } from '../src/core/allocate.js';
import { emptyPlan } from '../src/core/plan.js';
import { rollPlan } from '../src/core/timeline.js';
import {
  clearManualLunch, isValidManualLunches, manualAt, setFrozenLunch, setManualLunch,
} from '../src/core/lunches.js';

function planWith(spec) {
  const plan = emptyPlan();
  for (const [idx, [dish, extra]] of Object.entries(spec)) {
    plan[Number(idx)].dinner = { cat: 'curry', dish, src: 'cook', extra };
  }
  return plan;
}

describe('manual lunches — allocator', () => {
  it('fills a gap without touching the leftover queue', () => {
    const { lunch } = allocate(planWith({ 0: ['Keema', 1] }), {}, { 5: { name: 'Sandwich' } });
    expect(lunch[5]).toMatchObject({ dish: 'Sandwich', manual: true, from: -1 });
    expect(lunch[1]).toMatchObject({ dish: 'Keema', from: 0 });
  });

  it('pushes the leftover it displaces on to the next day', () => {
    const plan = planWith({ 0: ['Keema', 2] });
    const { lunch } = allocate(plan, {}, { 1: { name: 'Eating out' } });
    expect(lunch[1]).toMatchObject({ dish: 'Eating out', manual: true });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', from: 0 });
    expect(lunch[3]).toMatchObject({ dish: 'Keema', from: 0 });
    expect(lunch[4]).toBeNull();
  });

  it('carries displaced portions into the week surplus', () => {
    const plan = planWith({ 5: ['Keema', 1] });
    const { weekSurplus } = allocate(plan, {}, { 6: { name: 'Salad' } });
    expect(weekSurplus[0]).toEqual([{ dish: 'Keema', from: 5 }]);
  });

  it('beats a pin on the same day, and that pin reserves nothing', () => {
    const plan = planWith({ 0: ['Keema', 1], 1: ['Chilli', 1] });
    const { lunch } = allocate(plan, { 3: 'Chilli' }, { 3: { name: 'Soup' } });
    expect(lunch[3]).toMatchObject({ dish: 'Soup', manual: true });
    expect(lunch[1].dish).toBe('Keema');
    expect(lunch[2].dish).toBe('Chilli'); // not held back for day 3
  });

  it('flags a lunch taken from the freezer', () => {
    const { lunch } = allocate(emptyPlan(), {}, { 2: { name: 'Keema', frozen: true } });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', manual: true, frozen: true });
  });

  it('ignores blank entries', () => {
    const { lunch } = allocate(emptyPlan(), {}, { 2: { name: '  ' } });
    expect(lunch[2]).toBeNull();
  });
});

describe('manual lunches — helpers', () => {
  it('sets a trimmed name and drops that day\'s pin', () => {
    const manual = {};
    const pins = { 4: 'Keema' };
    expect(setManualLunch(manual, {}, pins, 4, '  Tuna salad ')).toBe(true);
    expect(manual[4]).toEqual({ name: 'Tuna salad' });
    expect(pins).toEqual({});
  });

  it('refuses an empty name', () => {
    const manual = {};
    expect(setManualLunch(manual, {}, {}, 4, '   ')).toBe(false);
    expect(manual).toEqual({});
  });

  it('takes a freezer portion and puts it back when cleared', () => {
    const manual = {};
    const freezer = { Keema: 2 };
    expect(setFrozenLunch(manual, freezer, {}, 3, 'Keema')).toBe(true);
    expect(freezer).toEqual({ Keema: 1 });
    expect(manualAt(manual, 3)).toEqual({ name: 'Keema', frozen: true });
    expect(clearManualLunch(manual, freezer, 3)).toBe(true);
    expect(freezer).toEqual({ Keema: 2 });
    expect(manual).toEqual({});
  });

  it('returns a frozen portion when the lunch is replaced', () => {
    const manual = {};
    const freezer = { Keema: 1, Chilli: 1 };
    setFrozenLunch(manual, freezer, {}, 3, 'Keema');
    setFrozenLunch(manual, freezer, {}, 3, 'Chilli');
    expect(freezer).toEqual({ Keema: 1 });
    setManualLunch(manual, freezer, {}, 3, 'Sandwich');
    expect(freezer).toEqual({ Keema: 1, Chilli: 1 });
  });

  it('will not take what the freezer does not have', () => {
    const manual = {};
    expect(setFrozenLunch(manual, {}, {}, 3, 'Keema')).toBe(false);
    expect(manual).toEqual({});
  });

  it('validates the stored shape', () => {
    expect(isValidManualLunches({ 1: { name: 'Soup' } })).toBe(true);
    expect(isValidManualLunches({})).toBe(true);
    expect(isValidManualLunches({ 1: 'Soup' })).toBe(false);
    expect(isValidManualLunches([])).toBe(false);
    expect(isValidManualLunches(null)).toBe(false);
  });
});

describe('manual lunches — rolling window', () => {
  it('moves with its date and drops off once it leaves the window', () => {
    const manual = { 0: { name: 'Old' }, 5: { name: 'Soup' } };
    const rolled = rollPlan(emptyPlan(), {}, '2026-08-24', '2026-08-25', manual);
    expect(rolled.manual).toEqual({ 4: { name: 'Soup' } });
  });

  it('keeps the old three-argument behaviour for pins', () => {
    const rolled = rollPlan(emptyPlan(), { 5: 'Keema' }, '2026-08-24', '2026-08-25');
    expect(rolled.pins).toEqual({ 4: 'Keema' });
    expect(rolled.manual).toEqual({});
  });
});
