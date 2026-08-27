import { describe, expect, it } from 'vitest';
import { emptyPlan } from '../src/core/plan.js';
import {
  CONTEXT_DAYS, dateForIndex, dayContext, localDateKey, rollPlan, timelineAnchor,
} from '../src/core/timeline.js';

describe('rolling timeline', () => {
  it('starts three days before today and puts today at index 3', () => {
    const now = new Date(2026, 7, 27, 18, 30);
    const anchor = timelineAnchor(now);
    expect(anchor).toBe('2026-08-24');
    expect(localDateKey(dateForIndex(CONTEXT_DAYS, anchor))).toBe('2026-08-27');
    expect(dayContext(0)).toBe('3d ago');
    expect(dayContext(3)).toBe('Today');
  });

  it('advances meals and pins with their dates', () => {
    const plan = emptyPlan();
    plan[4].dinner = { cat: 'bake', dish: 'Dinner tomorrow', src: 'cook', extra: 1 };
    const rolled = rollPlan(plan, { 4: 'Dinner tomorrow' }, '2026-08-24', '2026-08-25');
    expect(rolled.plan[3].dinner.dish).toBe('Dinner tomorrow');
    expect(rolled.pins).toEqual({ 3: 'Dinner tomorrow' });
    expect(rolled.plan).toHaveLength(28);
    expect(rolled.plan[27].dinner.dish).toBeNull();
  });

  it('can move backward without losing the visible plan shape', () => {
    const plan = emptyPlan();
    plan[3].dinner = { cat: 'fry', dish: 'Today meal', src: 'cook', extra: 0 };
    const rolled = rollPlan(plan, {}, '2026-08-24', '2026-08-23');
    expect(rolled.plan[4].dinner.dish).toBe('Today meal');
    expect(rolled.plan[0].dinner.dish).toBeNull();
  });
});
