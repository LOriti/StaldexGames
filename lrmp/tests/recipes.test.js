import { describe, it, expect } from 'vitest';
import {
  ingredientsOf, isEdited, servesFor, scaleQty, formatServes, PORTIONS_PER_SERVE,
} from '../src/core/recipes.js';
import { RECIPES } from '../src/data/recipes.js';

describe('ingredientsOf — edit resolution', () => {
  it('falls back to the built-in recipe when there is no edit', () => {
    expect(ingredientsOf('Beef keema')).toEqual(RECIPES['Beef keema'].ing);
    expect(isEdited('Beef keema')).toBe(false);
  });

  it('returns the edited list when one exists, without touching RECIPES', () => {
    const edits = { 'Beef keema': ['600g beef mince'] };
    expect(ingredientsOf('Beef keema', edits)).toEqual(['600g beef mince']);
    expect(isEdited('Beef keema', edits)).toBe(true);
    expect(RECIPES['Beef keema'].ing[0]).toBe('500g beef mince'); // data untouched
  });

  it('unknown dishes resolve to an empty list, never throw', () => {
    expect(ingredientsOf('Bought lasagne')).toEqual([]);
  });
});

describe('servesFor — 1 serve = 2 portions', () => {
  it('a plain dinner is one serve; each leftover portion adds half', () => {
    expect(PORTIONS_PER_SERVE).toBe(2);
    expect(servesFor(0)).toBe(1);
    expect(servesFor(1)).toBe(1.5);
    expect(servesFor(2)).toBe(2);
    expect(servesFor(-3)).toBe(1); // corrupt negative extra never shrinks below a serve
  });
});

describe('scaleQty — leading-quantity scaling', () => {
  it('multiplies leading amounts and keeps the rest of the line', () => {
    expect(scaleQty('500g beef mince', 1.5)).toBe('750g beef mince');
    expect(scaleQty('2 tbsp garam masala', 2)).toBe('4 tbsp garam masala');
    expect(scaleQty('1 onion, diced', 1.5)).toBe('1.5 onion, diced');
    expect(scaleQty('400ml coconut cream', 3)).toBe('1200ml coconut cream');
  });

  it('handles leading fractions', () => {
    expect(scaleQty('1/2 cabbage, sliced', 2)).toBe('1 cabbage, sliced');
    expect(scaleQty('1/4 tsp xanthan gum', 2)).toBe('0.5 tsp xanthan gum');
  });

  it('leaves staple / to-taste lines exactly as written', () => {
    expect(scaleQty('Ghee, salt, coriander', 3)).toBe('Ghee, salt, coriander');
    expect(scaleQty('Handful Thai basil', 2)).toBe('Handful Thai basil');
  });

  it('is the identity at one serve', () => {
    expect(scaleQty('500g beef mince', 1)).toBe('500g beef mince');
  });
});

describe('formatServes', () => {
  it('compact strings, no float noise', () => {
    expect(formatServes(1)).toBe('1');
    expect(formatServes(1.5)).toBe('1.5');
    expect(formatServes(3.0000001)).toBe('3');
  });
});
