import { describe, it, expect } from 'vitest';
import { allocate, groupSurplus } from '../src/core/allocate.js';
import { emptyPlan } from '../src/core/plan.js';

/** Build a 28-day plan from a sparse spec: { dayIndex: [dish, extra, src?] } */
function planWith(spec) {
  const plan = emptyPlan();
  for (const [idx, [dish, extra, src = 'cook']] of Object.entries(spec)) {
    plan[Number(idx)].dinner = { cat: 'curry', dish, src, extra };
  }
  return plan;
}

describe('allocate — FIFO leftovers to lunches', () => {
  it('makes leftovers available the NEXT day, never same-day', () => {
    const { lunch } = allocate(planWith({ 0: ['Keema', 2] }));
    expect(lunch[0]).toBeNull();                 // you ate it for dinner
    expect(lunch[1]).toMatchObject({ dish: 'Keema', from: 0 });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', from: 0 });
    expect(lunch[3]).toBeNull();                 // only 2 portions existed
  });

  it('eats earliest-cooked first (FIFO), not most-recent', () => {
    const { lunch } = allocate(planWith({ 0: ['Keema', 1], 1: ['Chilli', 1] }));
    expect(lunch[1].dish).toBe('Keema');   // Monday's, even though Tuesday also cooked
    expect(lunch[2].dish).toBe('Chilli');
  });

  it('leaves real gaps when there are not enough portions', () => {
    const { lunch } = allocate(planWith({ 0: ['Steak', 0] }));
    expect(lunch.every((l) => l === null)).toBe(true);
  });

  it('never borrows from a dinner that has not been cooked yet', () => {
    const { lunch } = allocate(planWith({ 5: ['Late', 3] }));
    for (let d = 0; d <= 5; d++) expect(lunch[d]).toBeNull();
    expect(lunch[6]).toMatchObject({ dish: 'Late', from: 5 });
  });

  it('freezer dinners produce NO leftovers', () => {
    const { lunch } = allocate(planWith({ 0: ['Frozen', 3, 'freezer'] }));
    expect(lunch.every((l) => l === null)).toBe(true);
  });
});

describe('allocate — rolling surplus across week boundaries', () => {
  it('rolls unconsumed portions into the next week rather than dropping them', () => {
    // Sunday of week 0 (day 6) cooks 3 extra. Only some can be eaten in week 0.
    const { lunch, weekSurplus } = allocate(planWith({ 6: ['Sunday roast', 3] }));
    expect(weekSurplus[0]).toHaveLength(3);      // nothing eaten yet at the boundary
    expect(lunch[7].dish).toBe('Sunday roast');  // it feeds Monday of week 1
    expect(lunch[8].dish).toBe('Sunday roast');
    expect(lunch[9].dish).toBe('Sunday roast');
    expect(lunch[10]).toBeNull();
  });

  it('reports surplus rolling OUT of each week', () => {
    const { weekSurplus } = allocate(planWith({ 0: ['Keema', 6] }));
    // 6 portions, days 1-6 eat 6 of them -> nothing left at the week 0/1 boundary
    expect(weekSurplus[0]).toHaveLength(0);
  });

  it('week 3 surplus is terminal — it has nowhere to roll', () => {
    const { weekSurplus } = allocate(planWith({ 27: ['Last supper', 4] }));
    expect(weekSurplus[3]).toHaveLength(4);
    expect(weekSurplus[3][0]).toMatchObject({ dish: 'Last supper', from: 27 });
  });

  it('conserves portions: produced === eaten + terminal surplus', () => {
    const spec = {};
    for (let w = 0; w < 4; w++) for (let d = 0; d < 5; d++) spec[w * 7 + d] = ['D' + w + d, 2];
    const plan = planWith(spec);
    const { lunch, weekSurplus } = allocate(plan);

    const produced = plan.reduce((a, day) => a + (day.dinner.src === 'cook' ? day.dinner.extra : 0), 0);
    const eaten = lunch.filter(Boolean).length;
    const leftAtEnd = weekSurplus[3].length;

    expect(produced).toBe(40);
    expect(eaten + leftAtEnd).toBe(produced); // nothing vanishes, nothing is invented
  });

  it('is pure — does not mutate the plan', () => {
    const plan = planWith({ 0: ['Keema', 2] });
    const before = JSON.stringify(plan);
    allocate(plan);
    expect(JSON.stringify(plan)).toBe(before);
  });
});

describe('allocate — lunch pins', () => {
  it('a pin moves a portion to the pinned day and marks it pinned', () => {
    const { lunch } = allocate(planWith({ 0: ['Keema', 1] }), { 3: 'Keema' });
    expect(lunch[3]).toMatchObject({ dish: 'Keema', from: 0, pinned: true });
    expect(lunch[1]).toBeNull(); // the portion is reserved — FIFO can't eat it on Tuesday
  });

  it('reserves the pinned portion even when other dishes fill earlier days', () => {
    const { lunch } = allocate(
      planWith({ 0: ['Keema', 1], 1: ['Chilli', 2] }),
      { 4: 'Keema' }
    );
    expect(lunch[1]).toBeNull(); // Keema reserved; Chilli isn't cooked yet
    expect(lunch[2].dish).toBe('Chilli');
    expect(lunch[3].dish).toBe('Chilli');
    expect(lunch[4]).toMatchObject({ dish: 'Keema', pinned: true });
  });

  it('reports a pin unfulfilled when the dish is not cooked by that day', () => {
    const { lunch } = allocate(planWith({ 5: ['Late', 2] }), { 2: 'Late' });
    expect(lunch[2]).toMatchObject({ dish: 'Late', pinned: true, unfulfilled: true });
    // and the real portions still flow normally afterwards
    expect(lunch[6].dish).toBe('Late');
  });

  it('reports a pin unfulfilled when every portion is already claimed', () => {
    const { lunch } = allocate(planWith({ 0: ['Keema', 1] }), { 2: 'Keema', 3: 'Keema' });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', pinned: true });
    expect(lunch[2].unfulfilled).toBeUndefined();
    expect(lunch[3]).toMatchObject({ dish: 'Keema', pinned: true, unfulfilled: true });
  });

  it('conserves portions with pins: produced === eaten + terminal surplus', () => {
    const plan = planWith({ 0: ['Keema', 2], 1: ['Chilli', 2], 8: ['Soup', 2] });
    const { lunch, weekSurplus } = allocate(plan, { 6: 'Keema', 10: 'Chilli' });
    const eaten = lunch.filter((l) => l && !l.unfulfilled).length;
    expect(eaten + weekSurplus[3].length).toBe(6);
  });

  it('with no pins, behaves exactly as before', () => {
    const plan = planWith({ 0: ['Keema', 2], 3: ['Chilli', 1] });
    expect(allocate(plan)).toEqual(allocate(plan, {}));
  });

  it('does not mutate the pins object', () => {
    const pins = { 3: 'Keema' };
    allocate(planWith({ 0: ['Keema', 2] }), pins);
    expect(pins).toEqual({ 3: 'Keema' });
  });

  it('a reserved portion still shows in the surplus it rolls through', () => {
    // Cooked Sunday wk0, pinned to Tuesday wk1 — at the week boundary it exists and rolls.
    const { weekSurplus, lunch } = allocate(planWith({ 6: ['Roast', 1] }), { 9: 'Roast' });
    expect(weekSurplus[0]).toHaveLength(1);
    expect(lunch[7]).toBeNull(); // reserved — Monday can't eat it
    expect(lunch[9]).toMatchObject({ dish: 'Roast', pinned: true });
  });
});

describe('groupSurplus', () => {
  it('groups tokens into per-dish batches, keeping source days', () => {
    const batches = groupSurplus([
      { dish: 'Keema', from: 0 },
      { dish: 'Chilli', from: 2 },
      { dish: 'Keema', from: 0 },
    ]);
    expect(batches).toHaveLength(2);
    const keema = batches.find((b) => b.dish === 'Keema');
    expect(keema.count).toBe(2);
    expect(keema.froms).toEqual([0, 0]);
  });
});
