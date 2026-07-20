/**
 * Tiny observable store. The UI subscribes; any mutation re-renders the active view.
 *
 * Deliberately dumb: every change re-renders the whole active view from scratch. At this
 * scale (28 days, ~40 dishes) that's imperceptible and it removes a whole class of
 * stale-DOM bugs. If the app grows a lot more interactive surface, that's the point to
 * reach for React (see docs/BACKLOG.md) — the core/ modules are already framework-free,
 * so a migration only touches src/ui/.
 */

import * as store from './storage/adapter.js';
import { schedulePush } from './storage/sync.js';
import { setCatalog } from './data/dishes.js';
import { seedPlan, isValidPlan } from './core/plan.js';

const state = {
  plan: null,
  freezer: {},
  favourites: new Set(),
  lunchPins: {}, // sparse { dayIndex: dishName } — lunch overrides, see core/allocate.js
  shopping: { excluded: {}, have: {} }, // week-scoped ticks, see core/shopping.js
  recipeEdits: {}, // { dishName: [ingredient lines, per serve] } — see core/recipes.js
  customRecipes: {}, // { name: {mode, p, t, l, e, ing, steps} } — user-added dishes
  removedDishes: [], // built-in dish names deleted from cards + pools (restorable)
  tab: 'weekly', // 'recipes' | 'month' | 'weekly' | 'shopping'
  week: 0, // 0-3, which week the Weekly view is showing
};

const listeners = new Set();

export function get() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

/** Mutate + persist + re-render. Pass which slices changed so we only write those. */
export function commit({ plan = false, freezer = false, favourites = false, pins = false, shopping = false, recipes = false, customs = false } = {}) {
  if (plan) store.set(store.KEYS.PLAN, state.plan);
  if (freezer) store.set(store.KEYS.FREEZER, state.freezer);
  if (favourites) store.set(store.KEYS.FAVOURITES, [...state.favourites]);
  if (pins) store.set(store.KEYS.PINS, state.lunchPins);
  if (shopping) store.set(store.KEYS.SHOPPING, state.shopping);
  if (recipes) store.set(store.KEYS.RECIPE_EDITS, state.recipeEdits);
  if (customs) {
    store.set(store.KEYS.CUSTOM_RECIPES, state.customRecipes);
    store.set(store.KEYS.REMOVED_DISHES, state.removedDishes);
    setCatalog(state.customRecipes, state.removedDishes); // refresh pools before re-render
  }
  if (plan || freezer || favourites || pins || shopping || recipes || customs) schedulePush(snapshot());
  emit();
}

/** The persisted slices as plain JSON — what remote sync stores and returns. */
export function snapshot() {
  return {
    plan: state.plan,
    freezer: state.freezer,
    favourites: [...state.favourites],
    pins: state.lunchPins,
    shopping: state.shopping,
    recipeEdits: state.recipeEdits,
    customRecipes: state.customRecipes,
    removedDishes: state.removedDishes,
  };
}

/**
 * Adopt a newer server-side snapshot (boot-time sync). Persists locally WITHOUT going
 * through commit() — committing would schedule a push of the state we just pulled.
 */
export function applyRemote(data) {
  if (!data || typeof data !== 'object') return;
  if (isValidPlan(data.plan)) state.plan = data.plan;
  if (data.freezer && typeof data.freezer === 'object') state.freezer = data.freezer;
  if (Array.isArray(data.favourites)) state.favourites = new Set(data.favourites);
  if (data.pins && typeof data.pins === 'object') state.lunchPins = data.pins;
  if (isValidShopping(data.shopping)) state.shopping = data.shopping;
  if (isValidEdits(data.recipeEdits)) state.recipeEdits = data.recipeEdits;
  if (isValidCustoms(data.customRecipes)) state.customRecipes = data.customRecipes;
  if (Array.isArray(data.removedDishes)) state.removedDishes = data.removedDishes;
  store.set(store.KEYS.PLAN, state.plan);
  store.set(store.KEYS.FREEZER, state.freezer);
  store.set(store.KEYS.FAVOURITES, [...state.favourites]);
  store.set(store.KEYS.PINS, state.lunchPins);
  store.set(store.KEYS.SHOPPING, state.shopping);
  store.set(store.KEYS.RECIPE_EDITS, state.recipeEdits);
  store.set(store.KEYS.CUSTOM_RECIPES, state.customRecipes);
  store.set(store.KEYS.REMOVED_DISHES, state.removedDishes);
  setCatalog(state.customRecipes, state.removedDishes);
  emit();
}

function isValidEdits(e) {
  return Boolean(e && typeof e === 'object' && Object.values(e).every(Array.isArray));
}

function isValidCustoms(c) {
  return Boolean(
    c && typeof c === 'object' &&
    Object.values(c).every((v) => v && typeof v === 'object' && typeof v.mode === 'string' && Array.isArray(v.ing))
  );
}

function isValidShopping(s) {
  return Boolean(
    s && typeof s === 'object' &&
    s.excluded && typeof s.excluded === 'object' &&
    s.have && typeof s.have === 'object'
  );
}

/** UI-only changes (tab, week) — no persistence needed. */
export function setUI(patch) {
  Object.assign(state, patch);
  emit();
}

export async function hydrate() {
  const [plan, freezer, favourites, pins, shopping, recipeEdits, customRecipes, removedDishes] = await Promise.all([
    store.get(store.KEYS.PLAN, null),
    store.get(store.KEYS.FREEZER, {}),
    store.get(store.KEYS.FAVOURITES, []),
    store.get(store.KEYS.PINS, {}),
    store.get(store.KEYS.SHOPPING, null),
    store.get(store.KEYS.RECIPE_EDITS, null),
    store.get(store.KEYS.CUSTOM_RECIPES, null),
    store.get(store.KEYS.REMOVED_DISHES, null),
  ]);

  state.plan = isValidPlan(plan) ? plan : seedPlan();
  state.freezer = freezer && typeof freezer === 'object' ? freezer : {};
  state.favourites = new Set(Array.isArray(favourites) ? favourites : []);
  state.lunchPins = pins && typeof pins === 'object' ? pins : {};
  state.shopping = isValidShopping(shopping) ? shopping : { excluded: {}, have: {} };
  state.recipeEdits = isValidEdits(recipeEdits) ? recipeEdits : {};
  state.customRecipes = isValidCustoms(customRecipes) ? customRecipes : {};
  state.removedDishes = Array.isArray(removedDishes) ? removedDishes : [];
  setCatalog(state.customRecipes, state.removedDishes);

  // First run (or recovered from corrupt state): persist the seed immediately.
  if (!isValidPlan(plan)) store.set(store.KEYS.PLAN, state.plan);

  return state;
}

export function resetPlan() {
  state.plan = seedPlan();
  state.lunchPins = {}; // pins reference the old plan's dishes — stale, drop them
  commit({ plan: true, pins: true });
}

export function toggleFavourite(dish) {
  if (state.favourites.has(dish)) state.favourites.delete(dish);
  else state.favourites.add(dish);
  commit({ favourites: true });
}
