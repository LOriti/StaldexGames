import { describe, it, expect } from 'vitest';
import { allocate } from '../src/core/allocate.js';
import { carryLeftovers } from '../src/core/carry.js';
import { deferDinner, emptyPlan, emptyDinner, leftoverDinner, swapDinners } from '../src/core/plan.js';
import { dinnerToLunch, lunchToDinner, moveManualLunch } from '../src/core/lunches.js';

const cook = (dish, extra = 2) => ({ cat: 'curry', dish, src: 'cook', extra });

function swap(plan, pins, manual, a, b) {
  return carryLeftovers(plan, pins, manual, [{ day: a }, { day: b }], () => {
    swapDinners(plan, a, b);
    return { to: [b, a] };
  });
}

describe('moving a dish moves its leftovers', () => {
  it('a pinned lunch follows the dish', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    const pins = { 3: 'Keema' };
    const { carried } = swap(plan, pins, {}, 1, 4);
    expect(carried).toBe(1);
    expect(pins).toEqual({ 6: 'Keema' });
    expect(allocate(plan, pins).lunch[6]).toMatchObject({ dish: 'Keema', pinned: true, from: 4 });
  });

  it('a leftover dinner follows the dish', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    plan[2].dinner = leftoverDinner('Keema', 'curry');
    swap(plan, {}, {}, 1, 5);
    expect(plan[2].dinner.dish).toBeNull();
    expect(plan[6].dinner).toMatchObject({ dish: 'Keema', src: 'leftover' });
    expect(allocate(plan).dinner[6]).toEqual({ dish: 'Keema', from: 5 });
  });

  it('two dishes swapping days each take their own leftovers', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    plan[3].dinner = cook('Chilli');
    const pins = { 2: 'Keema', 5: 'Chilli' };
    swap(plan, pins, {}, 1, 3);
    expect(pins).toEqual({ 4: 'Keema', 3: 'Chilli' });
    const { lunch } = allocate(plan, pins);
    expect(lunch[4]).toMatchObject({ dish: 'Keema', pinned: true, from: 3 });
    expect(lunch[3]).toMatchObject({ dish: 'Chilli', pinned: true, from: 1 });
  });

  it('leaves alone what other meals feed', () => {
    const plan = emptyPlan();
    plan[0].dinner = cook('Keema', 1);
    plan[1].dinner = cook('Chilli', 1);
    const pins = { 3: 'Keema' };
    swap(plan, pins, {}, 1, 6);
    expect(pins).toEqual({ 3: 'Keema' });
  });

  it('a leftover dinner that cannot land stays put', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    plan[2].dinner = leftoverDinner('Keema', 'curry');
    plan[6].dinner = { ...emptyDinner(), note: 'Dinner out' };
    swap(plan, {}, {}, 1, 5);
    expect(plan[2].dinner).toMatchObject({ dish: 'Keema', src: 'leftover' });
    expect(plan[6].dinner.note).toBe('Dinner out');
  });

  it('a pin pushed off the end of the plan is dropped', () => {
    const plan = emptyPlan();
    plan[20].dinner = cook('Keema');
    const pins = { 26: 'Keema' };
    swap(plan, pins, {}, 20, 25);
    expect(pins).toEqual({});
  });

  it('follows a dinner pushed to next week', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    const pins = { 3: 'Keema' };
    carryLeftovers(plan, pins, {}, [{ day: 1 }], () => {
      const res = deferDinner(plan, 1);
      return { to: [res.ok ? res.idx : null] };
    });
    expect(plan[8].dinner.dish).toBe('Keema');
    expect(pins).toEqual({ 10: 'Keema' });
  });

  it('follows a dinner moved to an earlier lunch, and a lunch moved to a dinner', () => {
    const plan = emptyPlan();
    plan[4].dinner = cook('Keema', 1);
    const pins = { 6: 'Keema' };
    const manual = {};
    carryLeftovers(plan, pins, manual, [{ day: 4 }], () => {
      const r = dinnerToLunch(plan, pins, manual, {}, 4, 2);
      return { to: [r.kind === 'moved' ? 2 : null] };
    });
    expect(manual[2]).toEqual({ name: 'Keema', extra: 1 });
    expect(pins).toEqual({ 4: 'Keema' });
    expect(allocate(plan, pins, manual).lunch[4]).toMatchObject({ dish: 'Keema', pinned: true, meal: 'lunch' });

    carryLeftovers(plan, pins, manual, [{ day: 2, meal: 'lunch' }], () => {
      const r = lunchToDinner(plan, manual, 2, 3);
      return { to: [r.ok ? 3 : null] };
    });
    expect(plan[3].dinner).toMatchObject({ note: 'Keema', extra: 1 }); // not a real recipe name, so a note
    expect(pins).toEqual({ 5: 'Keema' });
  });

  it('follows a hand-added lunch moved to another day', () => {
    const plan = emptyPlan();
    const manual = { 1: { name: 'Soup', extra: 1 } };
    plan[3].dinner = leftoverDinner('Soup');
    carryLeftovers(plan, {}, manual, [{ day: 1, meal: 'lunch' }], () => (
      { to: [moveManualLunch(manual, {}, 1, 4) ? 4 : null] }
    ));
    expect(manual).toEqual({ 4: { name: 'Soup', extra: 1 } });
    expect(plan[6].dinner).toMatchObject({ dish: 'Soup', src: 'leftover' });
  });

  it('changes nothing when the meal does not move', () => {
    const plan = emptyPlan();
    plan[1].dinner = cook('Keema');
    const pins = { 3: 'Keema' };
    const { carried } = carryLeftovers(plan, pins, {}, [{ day: 1 }], () => ({ to: [null] }));
    expect(carried).toBe(0);
    expect(pins).toEqual({ 3: 'Keema' });
  });
});
