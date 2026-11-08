import { describe, it, expect } from 'vitest';
import { allocate } from '../src/core/allocate.js';
import { emptyPlan, leftoverDinner } from '../src/core/plan.js';
import { dinnerToLunch } from '../src/core/lunches.js';

function setup() {
  const plan = emptyPlan();
  plan[1].dinner = { cat: 'curry', dish: 'Keema', src: 'cook', extra: 2 };
  return { plan, pins: {}, manual: {}, freezer: {} };
}

describe('dragging a dinner onto a lunch', () => {
  it('pins a cooked dinner\'s leftovers to a later lunch', () => {
    const s = setup();
    const r = dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 1, 4);
    expect(r).toMatchObject({ ok: true, kind: 'pinned', dish: 'Keema' });
    expect(s.pins).toEqual({ 4: 'Keema' });
    const { lunch } = allocate(s.plan, s.pins, s.manual);
    expect(lunch[4]).toMatchObject({ dish: 'Keema', pinned: true, from: 1 });
    expect(lunch[2]).toMatchObject({ dish: 'Keema', from: 1 });
    expect(lunch[3]).toBeNull(); // the second portion is held for day 4
  });

  it('adds a portion when a cooked dinner had no leftovers', () => {
    const s = setup();
    s.plan[1].dinner.extra = 0;
    dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 1, 3);
    expect(s.plan[1].dinner.extra).toBe(1);
    expect(allocate(s.plan, s.pins, s.manual).lunch[3]).toMatchObject({ dish: 'Keema', from: 1 });
  });

  it('moves the meal to lunch on the same day', () => {
    const s = setup();
    s.pins[1] = 'Other';
    const r = dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 1, 1);
    expect(r).toMatchObject({ kind: 'moved', dish: 'Keema', dropped: 2 });
    expect(s.plan[1].dinner.dish).toBeNull();
    expect(s.manual[1]).toEqual({ name: 'Keema' });
    expect(s.pins).toEqual({});
  });

  it('moves the meal to an earlier day\'s lunch', () => {
    const s = setup();
    const r = dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 1, 0);
    expect(r.kind).toBe('moved');
    expect(s.manual[0]).toEqual({ name: 'Keema' });
  });

  it('turns a leftover dinner back into a pinned lunch', () => {
    const s = setup();
    s.plan[3].dinner = leftoverDinner('Keema', 'curry');
    const r = dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 3, 3);
    expect(r.kind).toBe('pinned');
    expect(s.plan[3].dinner.dish).toBeNull();
    expect(allocate(s.plan, s.pins, s.manual).lunch[3]).toMatchObject({ dish: 'Keema', pinned: true });
  });

  it('moves a freezer dinner\'s portion to lunch without touching the freezer', () => {
    const s = setup();
    s.freezer = { Soup: 1 };
    s.plan[5].dinner = { cat: 'soup', dish: 'Soup', src: 'freezer', extra: 0 };
    const r = dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 5, 5);
    expect(r.kind).toBe('frozen');
    expect(s.manual[5]).toEqual({ name: 'Soup', frozen: true });
    expect(s.freezer).toEqual({ Soup: 1 });
    expect(s.plan[5].dinner.dish).toBeNull();
  });

  it('replaces a hand-added lunch, returning a frozen portion', () => {
    const s = setup();
    s.freezer = {};
    s.manual[4] = { name: 'Soup', frozen: true };
    dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 1, 4);
    expect(s.freezer).toEqual({ Soup: 1 });
    expect(s.manual).toEqual({});
  });

  it('does nothing for an empty dinner', () => {
    const s = setup();
    expect(dinnerToLunch(s.plan, s.pins, s.manual, s.freezer, 6, 7).ok).toBe(false);
  });
});
