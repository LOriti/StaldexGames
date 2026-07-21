import { describe, it, expect, afterEach } from 'vitest';
import {
  setCatalog, dishPool, allDishNames, metaOf, customEntry, isRemoved, removedIn, DISHES,
} from '../src/data/dishes.js';
import { pickDish, defaultExtraFor, DEFAULT_EXTRA } from '../src/core/plan.js';
import { ingredientsOf } from '../src/core/recipes.js';

const SOUP_CUSTOM = {
  "Nan's chicken soup": { mode: 'soup', p: 'Chicken', t: '30 min', l: 'keeps', e: '', ing: ['1 whole chicken', '2L stock'], steps: ['Simmer.'] },
};

afterEach(() => setCatalog({}, [])); // never leak overlay state between tests

describe('catalog overlay — custom recipes and removals', () => {
  it('with nothing registered, pools are exactly the built-ins', () => {
    expect(dishPool('soup')).toEqual(DISHES.soup);
  });

  it('customs join their mode pool and the global name list', () => {
    setCatalog(SOUP_CUSTOM, []);
    const pool = dishPool('soup');
    expect(pool.map((d) => d.n)).toContain("Nan's chicken soup");
    expect(dishPool('curry').map((d) => d.n)).not.toContain("Nan's chicken soup");
    expect(allDishNames()).toContain("Nan's chicken soup");
  });

  it('metaOf resolves customs with their mode (drives colour + freezer cat)', () => {
    setCatalog(SOUP_CUSTOM, []);
    expect(metaOf("Nan's chicken soup")).toMatchObject({ mode: 'soup' });
    expect(customEntry("Nan's chicken soup").ing).toHaveLength(2);
  });

  it('removed built-ins leave the pool but still resolve via metaOf', () => {
    setCatalog({}, ['Tom kha gai']);
    expect(isRemoved('Tom kha gai')).toBe(true);
    expect(removedIn('soup')).toEqual(['Tom kha gai']);
    expect(dishPool('soup').map((d) => d.n)).not.toContain('Tom kha gai');
    expect(allDishNames()).not.toContain('Tom kha gai');
    // A day already planned with it keeps its identity:
    expect(metaOf('Tom kha gai')).toMatchObject({ mode: 'soup' });
  });

  it('pickDish draws customs and never draws removed dishes', () => {
    setCatalog(SOUP_CUSTOM, ['Tom kha gai']);
    const pool = dishPool('soup');
    const last = pool[pool.length - 1].n;
    expect(last).toBe("Nan's chicken soup");
    expect(pickDish('soup', new Set(), () => 0.999)).toBe("Nan's chicken soup");
    for (let i = 0; i < 20; i++) {
      expect(pickDish('soup', new Set(), () => i / 20)).not.toBe('Tom kha gai');
    }
  });

  it('ingredientsOf falls back to the custom recipe (shopping list path)', () => {
    setCatalog(SOUP_CUSTOM, []);
    expect(ingredientsOf("Nan's chicken soup")).toEqual(['1 whole chicken', '2L stock']);
    expect(ingredientsOf("Nan's chicken soup", { "Nan's chicken soup": ['edited line'] }))
      .toEqual(['edited line']);
  });
});

describe('defaultExtraFor — makes-serves drives planning defaults', () => {
  it('a recipe declared to make 2 serves defaults to 2 leftovers (dinner eats one serve)', () => {
    setCatalog({}, [], { 'Tom kha gai': { serves: 2 } });
    expect(defaultExtraFor('Tom kha gai')).toBe(2);
    setCatalog({}, [], { 'Tom kha gai': { serves: 3 } });
    expect(defaultExtraFor('Tom kha gai')).toBe(4);
  });

  it('a custom recipe carries its own makes-serves', () => {
    setCatalog({ 'Chickpea curry': { mode: 'curry', ing: ['2 tins'], steps: [], serves: 2 } }, [], {});
    expect(defaultExtraFor('Chickpea curry')).toBe(2);
  });

  it('with no serves declared, the leftover-class heuristic still applies', () => {
    expect(defaultExtraFor('Tom kha gai')).toBe(DEFAULT_EXTRA.keeps);
    expect(defaultExtraFor('Steak + charred greens')).toBe(DEFAULT_EXTRA.fresh);
  });
});
