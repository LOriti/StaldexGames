/**
 * Recipe resolution + serving maths.
 *
 * THE SERVING MODEL: 1 serve = 2 portions (dinner for two). A cooked dinner consumes
 * 1 serve baseline; every leftover portion (+/- on the weekly board) adds half a serve.
 *
 * Each recipe additionally declares how many serves its written quantities MAKE
 * (`recipeServes`, default 1). "I'd never do this with less than 2 tins of everything"
 * = a recipe written at 2 serves: planning it defaults to (2-1)×2 = 2 leftovers, and
 * the shopping list scales by servesNeeded / servesWritten — so cooking it as written
 * shops at exactly the written amounts, no doubling.
 *
 * EDITS: the user can rewrite a recipe's ingredient list and its makes-serves from the
 * recipe card. Edits live in the persisted `recipeEdits` slice; historical shape was
 * { dish: [lines] }, current shape is { dish: { ing?: [lines], serves?: n } } — editOf()
 * normalizes on read so old synced data keeps working. The built-in RECIPES data is
 * never mutated; deleting an edit restores the original.
 */

import { RECIPES } from '../data/recipes.js';
import { customEntry } from '../data/dishes.js';

export const PORTIONS_PER_SERVE = 2;

/** Normalize one dish's edit: legacy bare array → { ing }. Null if no edit. */
export function editOf(edits, dish) {
  const e = edits?.[dish];
  if (!e) return null;
  return Array.isArray(e) ? { ing: e } : e;
}

/** Ingredient lines as written — user edit > built-in recipe > custom recipe. */
export function ingredientsOf(dish, edits = {}) {
  const e = editOf(edits, dish);
  if (Array.isArray(e?.ing)) return e.ing;
  return RECIPES[dish]?.ing ?? customEntry(dish)?.ing ?? [];
}

/** Whether a dish's ingredients have been edited away from the built-in recipe. */
export function isEdited(dish, edits = {}) {
  return Array.isArray(editOf(edits, dish)?.ing);
}

/** How many serves the written quantities make — edit > custom entry > 1. */
export function recipeServes(dish, edits = {}) {
  const s = editOf(edits, dish)?.serves ?? customEntry(dish)?.serves;
  return Number.isFinite(s) && s >= 1 ? s : 1;
}

/** Serves needed for one cooked dinner given its leftover count. */
export function servesFor(extra) {
  return 1 + Math.max(0, extra) / PORTIONS_PER_SERVE;
}

/** "2", "1.5" — serves as a compact string. */
export function formatServes(n) {
  return String(Math.round(n * 100) / 100);
}

/**
 * Scale an ingredient line's leading quantity: "500g beef mince" ×1.5 → "750g beef mince",
 * "1/2 cabbage, sliced" ×2 → "1 cabbage, sliced". Lines with no leading number
 * ("Ghee, salt", "Handful Thai basil") are staples/to-taste — left as written on purpose;
 * they don't scale linearly and a "×1.5" suffix is just noise.
 */
export function scaleQty(text, serves) {
  if (serves === 1) return text;
  const m = String(text).match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)(.*)$/s);
  if (!m) return text;
  let value;
  if (m[1].includes('/')) {
    const [a, b] = m[1].split('/').map((x) => Number(x.trim()));
    value = b ? a / b : NaN;
  } else {
    value = Number(m[1]);
  }
  if (!Number.isFinite(value)) return text;
  const scaled = Math.round(value * serves * 100) / 100;
  return `${scaled}${m[2]}`;
}
