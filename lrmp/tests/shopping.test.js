import { describe, it, expect } from 'vitest';
import {
  weekCooked, buildList, remainingCount, listText, clearWeek, dishKey, ingKey,
} from '../src/core/shopping.js';
import { emptyPlan } from '../src/core/plan.js';

/** Build a 28-day plan from a sparse spec: { dayIndex: [dish, extra?, src?] } */
function planWith(spec) {
  const plan = emptyPlan();
  for (const [idx, [dish, extra = 0, src = 'cook']] of Object.entries(spec)) {
    plan[Number(idx)].dinner = { cat: 'curry', dish, src, extra };
  }
  return plan;
}

const empty = () => ({ excluded: {}, have: {} });

describe('weekCooked — which dishes need shopping', () => {
  it('lists only src:cook dinners; freezer and empty days shop nothing', () => {
    const plan = planWith({ 0: ['Butter chicken'], 2: ['Beef keema', 0, 'freezer'] });
    const dishes = weekCooked(plan, 0);
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({ dish: 'Butter chicken', count: 1, serves: 1 });
  });

  it('dedupes a dish cooked twice in one week and counts it', () => {
    const plan = planWith({ 0: ['Beef keema'], 4: ['Beef keema'] });
    expect(weekCooked(plan, 0)).toEqual([{ dish: 'Beef keema', cat: 'curry', count: 2, serves: 2 }]);
  });

  it('leftover portions add half a serve each (1 serve = 2 portions)', () => {
    const plan = planWith({ 0: ['Beef keema', 2], 3: ['Beef keema', 1] });
    // (1 + 2/2) + (1 + 1/2) = 3.5 serves
    expect(weekCooked(plan, 0)[0].serves).toBe(3.5);
  });

  it('is scoped to the requested week only', () => {
    const plan = planWith({ 0: ['Beef keema'], 7: ['Butter chicken'] });
    expect(weekCooked(plan, 0)).toHaveLength(1);
    expect(weekCooked(plan, 1)[0].dish).toBe('Butter chicken');
  });
});

describe('buildList / remainingCount — tick state and scaling', () => {
  it('pulls real ingredients from the recipe data', () => {
    const plan = planWith({ 0: ['Butter chicken'] });
    const [d] = buildList(plan, 0, empty());
    expect(d.ing.length).toBeGreaterThan(3);
    expect(d.ing[0]).toMatchObject({ i: 0, have: false, text: '700g chicken thigh, chunked' });
  });

  it('scales leading quantities by serves; staple lines stay as written', () => {
    const plan = planWith({ 0: ['Beef keema', 2] }); // 2 serves
    const [d] = buildList(plan, 0, empty());
    expect(d.ing[0].text).toBe('1000g beef mince');       // 500g × 2
    expect(d.ing[1].text).toBe('2 onion, diced');         // 1 × 2
    const staple = d.ing.find((x) => x.text.startsWith('Ghee'));
    expect(staple.text).toBe('Ghee, salt, coriander');    // no leading number — untouched
  });

  it('uses edited ingredient lists when recipeEdits has an override', () => {
    const plan = planWith({ 0: ['Beef keema'] });
    const edits = { 'Beef keema': ['600g beef mince', 'Frozen veg'] };
    const [d] = buildList(plan, 0, empty(), edits);
    expect(d.ing).toHaveLength(2);
    expect(d.ing[0].text).toBe('600g beef mince');
  });

  it('a recipe written at 2 serves, cooked for 2 serves, shops at the written amounts', () => {
    const plan = planWith({ 0: ['Beef keema', 2] }); // 4 portions needed = 2 serves
    const edits = { 'Beef keema': { serves: 2 } };   // quantities as written ARE 2 serves
    const [d] = buildList(plan, 0, empty(), edits);
    expect(d.serves).toBe(2);
    expect(d.ing[0].text).toBe('500g beef mince'); // factor 2/2 = 1 — no scaling
  });

  it('needing more than the recipe makes scales up from the written base', () => {
    const plan = planWith({ 0: ['Beef keema', 2], 3: ['Beef keema', 2] }); // 4 serves needed
    const edits = { 'Beef keema': { serves: 2 } };
    const [d] = buildList(plan, 0, empty(), edits);
    expect(d.ing[0].text).toBe('1000g beef mince'); // factor 4/2 = 2
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

  it('shows total serves and scales quantities when a dish repeats or has leftovers', () => {
    const plan = planWith({ 0: ['Beef keema', 2], 3: ['Beef keema'] }); // 2 + 1 = 3 serves
    const txt = listText(plan, 0, empty());
    expect(txt).toContain('Beef keema — 3 serves');
    expect(txt).toContain('- 1500g beef mince');
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
