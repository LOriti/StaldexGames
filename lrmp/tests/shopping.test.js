import { describe, it, expect } from 'vitest';
import {
  weekCooked, buildList, remainingCount, listText, clearWeek, dishKey, ingKey,
} from '../src/core/shopping.js';
import { emptyPlan } from '../src/core/plan.js';

/** Build a 28-day plan from a sparse spec: { dayIndex: [dish, src?] } */
function planWith(spec) {
  const plan = emptyPlan();
  for (const [idx, [dish, src = 'cook']] of Object.entries(spec)) {
    plan[Number(idx)].dinner = { cat: 'curry', dish, src, extra: 2 };
  }
  return plan;
}

const empty = () => ({ excluded: {}, have: {} });

describe('weekCooked — which dishes need shopping', () => {
  it('lists only src:cook dinners; freezer and empty days shop nothing', () => {
    const plan = planWith({ 0: ['Butter chicken'], 2: ['Beef keema', 'freezer'] });
    const dishes = weekCooked(plan, 0);
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({ dish: 'Butter chicken', count: 1 });
  });

  it('dedupes a dish cooked twice in one week and counts it', () => {
    const plan = planWith({ 0: ['Beef keema'], 4: ['Beef keema'] });
    expect(weekCooked(plan, 0)).toEqual([{ dish: 'Beef keema', cat: 'curry', count: 2 }]);
  });

  it('is scoped to the requested week only', () => {
    const plan = planWith({ 0: ['Beef keema'], 7: ['Butter chicken'] });
    expect(weekCooked(plan, 0)).toHaveLength(1);
    expect(weekCooked(plan, 1)[0].dish).toBe('Butter chicken');
  });
});

describe('buildList / remainingCount — tick state', () => {
  it('pulls real ingredients from the recipe data', () => {
    const plan = planWith({ 0: ['Butter chicken'] });
    const [d] = buildList(plan, 0, empty());
    expect(d.ing.length).toBeGreaterThan(3);
    expect(d.ing[0]).toMatchObject({ i: 0, have: false });
  });

  it('marks ticked ingredients and excluded dishes', () => {
    const plan = planWith({ 0: ['Butter chicken'], 1: ['Beef keema'] });
    const shopping = empty();
    shopping.have[ingKey(0, 'Butter chicken', 0)] = 1;
    shopping.excluded[dishKey(0, 'Beef keema')] = 1;

    const list = buildList(plan, 0, shopping);
    expect(list.find((d) => d.dish === 'Butter chicken').ing[0].have).toBe(true);
    expect(list.find((d) => d.dish === 'Beef keema').excluded).toBe(true);
  });

  it('remainingCount ignores excluded dishes and ticked items', () => {
    const plan = planWith({ 0: ['Butter chicken'], 1: ['Beef keema'] });
    const all = remainingCount(plan, 0, empty());

    const shopping = empty();
    shopping.excluded[dishKey(0, 'Beef keema')] = 1;
    shopping.have[ingKey(0, 'Butter chicken', 0)] = 1;

    const keemaIngs = buildList(plan, 0, empty()).find((d) => d.dish === 'Beef keema').ing.length;
    expect(remainingCount(plan, 0, shopping)).toBe(all - keemaIngs - 1);
  });

  it('ticks are week-scoped — Wk 1 ticks do not leak into Wk 2', () => {
    const plan = planWith({ 0: ['Beef keema'], 7: ['Beef keema'] });
    const shopping = empty();
    shopping.have[ingKey(0, 'Beef keema', 0)] = 1;
    expect(buildList(plan, 1, shopping)[0].ing[0].have).toBe(false);
  });
});

describe('listText — the paste-anywhere export', () => {
  it('groups by dish, drops ticked items and excluded dishes entirely', () => {
    const plan = planWith({ 0: ['Butter chicken'], 1: ['Beef keema'] });
    const shopping = empty();
    shopping.excluded[dishKey(0, 'Beef keema')] = 1;
    shopping.have[ingKey(0, 'Butter chicken', 0)] = 1;

    const txt = listText(plan, 0, shopping);
    expect(txt).toContain('Shopping — Wk 1');
    expect(txt).toContain('Butter chicken');
    expect(txt).not.toContain('Beef keema');
    expect(txt).not.toContain('700g chicken thigh'); // first ingredient, ticked off
    expect(txt).toContain('- 2 tbsp garam masala');
  });

  it('shows ×N when a dish is cooked twice', () => {
    const plan = planWith({ 0: ['Beef keema'], 3: ['Beef keema'] });
    expect(listText(plan, 0, empty())).toContain('Beef keema ×2');
  });

  it('a fully-shopped week exports just the header', () => {
    const plan = planWith({ 0: ['Beef keema'] });
    const shopping = empty();
    shopping.excluded[dishKey(0, 'Beef keema')] = 1;
    expect(listText(plan, 0, shopping)).toBe('Shopping — Wk 1');
  });
});

describe('clearWeek — fresh-shop reset', () => {
  it('drops only the given week, and cleans stale keys from repainted plans', () => {
    const shopping = empty();
    shopping.have[ingKey(0, 'Beef keema', 0)] = 1;
    shopping.have[ingKey(0, 'Gone dish', 2)] = 1; // stale — dish no longer planned
    shopping.have[ingKey(1, 'Beef keema', 0)] = 1;
    shopping.excluded[dishKey(0, 'Beef keema')] = 1;

    clearWeek(shopping, 0);
    expect(Object.keys(shopping.have)).toEqual([ingKey(1, 'Beef keema', 0)]);
    expect(Object.keys(shopping.excluded)).toEqual([]);
  });
});
