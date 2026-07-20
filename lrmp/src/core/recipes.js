/**
 * Recipe resolution + serving maths.
 *
 * THE SERVING MODEL: recipe quantities as written are for ONE SERVE, and
 * 1 serve = 2 portions (dinner for two). A cooked dinner therefore consumes 1 serve
 * baseline; every leftover portion (+/- on the weekly board) adds half a serve. The
 * shopping list uses this to scale quantities: a dinner with 2 leftovers = 4 portions
 * = 2 serves = double the written amounts.
 *
 * EDITS: the user can rewrite a recipe's ingredient list (per serve) from the recipe
 * card. Edits live in the persisted `recipeEdits` slice — { dishName: [lines] } — and
 * always resolve through ingredientsOf() so the modal and the shopping list agree.
 * The built-in RECIPES data is never mutated; deleting an edit restores the original.
 */

import { RECIPES } from '../data/recipes.js';
import { customEntry } from '../data/dishes.js';

export const PORTIONS_PER_SERVE = 2;

/** Ingredient lines for one serve — user edit > built-in recipe > custom recipe. */
export function ingredientsOf(dish, edits = {}) {
  const override = edits?.[dish];
  if (Array.isArray(override)) return override;
  return RECIPES[dish]?.ing ?? customEntry(dish)?.ing ?? [];
}

/** Whether a dish's ingredients have been edited away from the built-in recipe. */
export function isEdited(dish, edits = {}) {
  return Array.isArray(edits?.[dish]);
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
