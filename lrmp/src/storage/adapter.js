/**
 * STORAGE ADAPTER — read this, it's the #1 gotcha in this codebase.
 *
 * The original prototype ran as a Claude.ai artifact and persisted via `window.storage`,
 * a sandbox-only API that DOES NOT EXIST in a normal browser. Ported as-is, the app would
 * appear to work and then silently lose everything on reload.
 *
 * So: never call window.storage or localStorage directly anywhere else in this codebase.
 * Go through this module. It picks the best available backend at load:
 *
 *   1. window.storage  — if running back inside a Claude artifact (async, k/v)
 *   2. localStorage    — the normal browser case (this is what `npm run dev` uses)
 *   3. in-memory Map   — SSR / tests / private-mode failures. Never throws.
 *
 * The interface is async in all three cases so callers don't branch.
 *
 * Values are JSON-encoded here, so callers pass and receive plain objects.
 */

const PREFIX = 'lrmp:';

function detect() {
  if (typeof window !== 'undefined' && window.storage?.get) return 'artifact';
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = PREFIX + '__probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return 'local';
    }
  } catch {
    /* private mode / blocked — fall through */
  }
  return 'memory';
}

const BACKEND = detect();
const mem = new Map();

/** @returns {'artifact'|'local'|'memory'} — surfaced so the UI can warn if nothing persists. */
export function backend() {
  return BACKEND;
}

export async function get(key, fallback = null) {
  const k = PREFIX + key;
  try {
    if (BACKEND === 'artifact') {
      const res = await window.storage.get(k);
      return res?.value ? JSON.parse(res.value) : fallback;
    }
    if (BACKEND === 'local') {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    }
    return mem.has(k) ? JSON.parse(mem.get(k)) : fallback;
  } catch {
    // Corrupt JSON, quota errors, missing keys — a bad read must never brick the app.
    return fallback;
  }
}

export async function set(key, value) {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    if (BACKEND === 'artifact') {
      await window.storage.set(k, raw);
      return true;
    }
    if (BACKEND === 'local') {
      localStorage.setItem(k, raw);
      return true;
    }
    mem.set(k, raw);
    return true;
  } catch {
    return false;
  }
}

export async function remove(key) {
  const k = PREFIX + key;
  try {
    if (BACKEND === 'artifact') await window.storage.delete(k);
    else if (BACKEND === 'local') localStorage.removeItem(k);
    else mem.delete(k);
    return true;
  } catch {
    return false;
  }
}

export const KEYS = {
  PLAN: 'plan',
  FREEZER: 'freezer',
  FAVOURITES: 'favourites',
  PINS: 'pins',
};
