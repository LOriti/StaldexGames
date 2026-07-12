import { describe, it, expect } from 'vitest';
import * as fz from '../src/core/freezer.js';
import { emptyPlan } from '../src/core/plan.js';
import { ALL_DISH_NAMES } from '../src/data/dishes.js';

const DISH = ALL_DISH_NAMES[0]; // a real dish, so metaOf() resolves

function planWithDinner(idx, extra, src = 'cook', dish = DISH) {
  const plan = emptyPlan();
  plan[idx].dinner = { cat: 'curry', dish, src, extra };
  return plan;
}

describe('freezer — conservation of portions', () => {
  it('freezeOne moves exactly one portion out of the dinner', () => {
    const plan = planWithDinner(0, 2);
    const freezer = {};
    expect(fz.freezeOne(plan, freezer, 0)).toBe(true);
    expect(plan[0].dinner.extra).toBe(1);
    expect(freezer[DISH]).toBe(1);
  });

  it('freezeDinner banks ALL leftovers and zeroes the dinner', () => {
    const plan = planWithDinner(0, 3);
    const freezer = {};
    expect(fz.freezeDinner(plan, freezer, 0)).toBe(3);
    expect(plan[0].dinner.extra).toBe(0);
    expect(freezer[DISH]).toBe(3);
    expect(plan[0].dinner.dish).toBe(DISH); // the dinner itself still happens
  });

  it('will not freeze from a dinner with no leftovers', () => {
    const plan = planWithDinner(0, 0);
    const freezer = {};
    expect(fz.freezeDinner(plan, freezer, 0)).toBe(0);
    expect(fz.totalPortions(freezer)).toBe(0);
  });

  it('will not freeze a meal that came OUT of the freezer', () => {
    const plan = planWithDinner(0, 2, 'freezer');
    const freezer = {};
    expect(fz.freezeDinner(plan, freezer, 0)).toBe(0);
  });

  it('freezeSurplus decrements each source dinner it claims from', () => {
    const plan = emptyPlan();
    plan[0].dinner = { cat: 'curry', dish: DISH, src: 'cook', extra: 2 };
    plan[3].dinner = { cat: 'curry', dish: DISH, src: 'cook', extra: 1 };
    const freezer = {};

    const banked = fz.freezeSurplus(plan, freezer, DISH, [0, 0, 3]);
    expect(banked).toBe(3);
    expect(plan[0].dinner.extra).toBe(0);
    expect(plan[3].dinner.extra).toBe(0);
    expect(freezer[DISH]).toBe(3);
  });

  it('freezeSurplus cannot over-claim from a dinner', () => {
    const plan = planWithDinner(0, 1);
    const freezer = {};
    const banked = fz.freezeSurplus(plan, freezer, DISH, [0, 0, 0]); // asks for 3, only 1 exists
    expect(banked).toBe(1);
    expect(plan[0].dinner.extra).toBe(0);
    expect(freezer[DISH]).toBe(1);
  });
});

describe('freezer — taking meals back out', () => {
  it('fills the first empty dinner slot in the target week', () => {
    const plan = emptyPlan();
    plan[7].dinner = { cat: 'curry', dish: DISH, src: 'cook', extra: 0 }; // Mon of wk1 taken
    const freezer = { [DISH]: 1 };

    const res = fz.useFromFreezer(plan, freezer, DISH, { week: 1 });
    expect(res.ok).toBe(true);
    expect(res.idx).toBe(8); // Tue of wk1
    expect(plan[8].dinner.src).toBe('freezer');
    expect(freezer[DISH]).toBeUndefined(); // last portion -> key removed
  });

  it('a frozen meal yields no leftovers (it does not breed)', () => {
    const plan = emptyPlan();
    const freezer = { [DISH]: 1 };
    fz.useFromFreezer(plan, freezer, DISH, { week: 0 });
    expect(plan[0].dinner.extra).toBe(0);
  });

  it('fails cleanly when the week is full', () => {
    const plan = emptyPlan();
    for (let d = 0; d < 7; d++) plan[d].dinner = { cat: 'curry', dish: DISH, src: 'cook', extra: 0 };
    const freezer = { [DISH]: 1 };

    const res = fz.useFromFreezer(plan, freezer, DISH, { week: 0 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no-empty-slot');
    expect(freezer[DISH]).toBe(1); // nothing consumed on failure
  });

  it('zero-count entries are deleted, not left at 0', () => {
    const freezer = { [DISH]: 1 };
    fz.take(freezer, DISH, 1);
    expect(Object.keys(freezer)).toHaveLength(0);
  });
});
