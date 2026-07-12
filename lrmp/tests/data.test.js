import { describe, it, expect } from 'vitest';
import { DISHES, DISH_INDEX, ALL_DISH_NAMES } from '../src/data/dishes.js';
import { RECIPES } from '../src/data/recipes.js';
import { MODES } from '../src/data/modes.js';

/**
 * Data integrity. These are the tests that break loudly when someone adds a dish and
 * forgets the recipe (or vice versa) — the single most likely way to break this app.
 */
describe('data integrity', () => {
  it('every dish has a recipe', () => {
    const missing = ALL_DISH_NAMES.filter((n) => !RECIPES[n]);
    expect(missing).toEqual([]);
  });

  it('every recipe belongs to a dish (no orphans)', () => {
    const orphans = Object.keys(RECIPES).filter((n) => !DISH_INDEX[n]);
    expect(orphans).toEqual([]);
  });

  it('dish names are unique', () => {
    const all = Object.values(DISHES).flat().map((d) => d.n);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every mode has a dish pool', () => {
    for (const m of MODES) expect(DISHES[m.key]?.length ?? 0).toBeGreaterThan(0);
  });

  it('every dish has a valid leftover class', () => {
    for (const d of Object.values(DISHES).flat()) {
      expect(['keeps', 'parts', 'fresh']).toContain(d.l);
    }
  });

  it('every recipe has ingredients and method', () => {
    for (const [name, r] of Object.entries(RECIPES)) {
      expect(r.ing?.length, `${name} ingredients`).toBeGreaterThan(0);
      expect(r.steps?.length, `${name} steps`).toBeGreaterThan(0);
    }
  });
});
