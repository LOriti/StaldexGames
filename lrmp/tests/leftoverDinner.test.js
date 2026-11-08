import { describe, it, expect } from 'vitest';
import { allocate, leftoverOptions } from '../src/core/allocate.js';
import { emptyPlan, leftoverDinner } from '../src/core/plan.js';
import { weekCooked } from '../src/core/shopping.js';

function planWith(spec) {
  const plan = emptyPlan();
  for (const [idx, [dish, extra]] of Object.entries(spec)) {
    plan[Number(idx)].dinner = { cat: 'curry', dish, src: 'cook', extra };
  }
  return plan;
}

describe('leftover dinners', () => {
  it('lunch stays the default home for leftovers', () => {
    const { lunch, dinner } = allocate(planWith({ 0: ['Keema', 2] }));
    expect(lunch[1].dish).toBe('Keema');
    expect(lunch[2].dish).toBe('Keema');
    expect(dinner.every((d) => d === null)).toBe(true);
  });

  it('eats one portion for dinner and lets lunches move along', () => {
    const plan = planWith({ 0: ['Keema', 2] });
    plan[1].dinner = leftoverDinner('Keema', 'curry');
    const { lunch, dinner } = allocate(plan);
    expect(dinner[1]).toEqual({ dish: 'Keema', from: 0 });
    expect(lunch[1]).toMatchObject({ dish: 'Keema', from: 0 }); // the other portion
    expect(lunch[2]).toBeNull();
  });

  it('reserves its portion so earlier lunches cannot eat it', () => {
    const plan = planWith({ 0: ['Keema', 1] });
    plan[3].dinner = leftoverDinner('Keema', 'curry');
    const { lunch, dinner } = allocate(plan);
    expect(lunch[1]).toBeNull();
    expect(dinner[3]).toEqual({ dish: 'Keema', from: 0 });
  });

  it('is honest when no portion exists by then', () => {
    const plan = planWith({ 2: ['Keema', 2] });
    plan[2 - 1].dinner = leftoverDinner('Keema', 'curry'); // before it is cooked
    expect(allocate(plan).dinner[1]).toMatchObject({ unfulfilled: true, from: -1 });
  });

  it('never yields leftovers and never shops', () => {
    const plan = emptyPlan();
    plan[1].dinner = leftoverDinner('Keema', 'curry');
    const { lunch } = allocate(plan);
    expect(lunch.every((l) => l === null)).toBe(true);
    expect(weekCooked(plan, 0)).toHaveLength(0);
  });

  it('settles a same-day lunch pin before the dinner', () => {
    const plan = planWith({ 0: ['Keema', 1] });
    plan[2].dinner = leftoverDinner('Keema', 'curry');
    const { lunch, dinner } = allocate(plan, { 2: 'Keema' });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', pinned: true, from: 0 });
    expect(dinner[2]).toMatchObject({ unfulfilled: true });
  });

  it('offers only leftovers that really exist by that day', () => {
    const plan = planWith({ 0: ['Keema', 1], 3: ['Chilli', 2], 5: ['Soup', 0] });
    expect(leftoverOptions(plan, {}, {}, 2)).toEqual([{ dish: 'Keema', cat: 'curry' }]);
    expect(leftoverOptions(plan, {}, {}, 6).map((o) => o.dish)).toEqual(['Keema', 'Chilli']);
    plan[1].dinner = leftoverDinner('Keema', 'curry'); // the only Keema portion is taken
    expect(leftoverOptions(plan, {}, {}, 6).map((o) => o.dish)).toEqual(['Chilli']);
  });
});
