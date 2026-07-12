/**
 * REMOTE SYNC — a layer on top of adapter.js, never a replacement for it.
 *
 * Local storage stays the on-device source of truth; the Worker at staldex.com/api/lrmp
 * (see worker-lrmp/ at the repo root) holds a single shared snapshot so the same plan
 * follows you across devices. No accounts, no passphrase — the planner is unlisted and
 * the URL itself is the only gate. Everyone who opens the app shares the one household
 * slot; that's the intended use.
 *
 * Strategy — last-write-wins on one blob:
 *   - boot: pull; if the server copy is newer than what this device last synced, adopt it,
 *     otherwise push local state up.
 *   - every commit: debounced push of the full snapshot.
 * That's the right amount of machinery for one household. It is not a CRDT and doesn't
 * merge concurrent edits from two devices — last writer wins, whole-blob.
 *
 * If the Worker is unreachable the app silently degrades to the old fully-client-side
 * behaviour: local persistence never depends on the network.
 */

import * as store from './adapter.js';

// The Vite dev server has no /api/lrmp route, so point dev builds at production.
const API =
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'https://staldex.com/api/lrmp'
    : '/api/lrmp';

const TS_KEY = 'sync:ts'; // updatedAt of the last server state this device has seen

const PUSH_DEBOUNCE_MS = 1500;

let status = 'off'; // 'off' (not yet reconciled) | 'ok' | 'error'
let notify = () => {};
let pushTimer = null;

export function syncStatus() {
  return status;
}

function setStatus(next) {
  if (next === status) return;
  status = next;
  notify(status);
}

async function call(method, body) {
  const res = await fetch(`${API}/state`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`sync http ${res.status}`);
  return res.json();
}

async function push(snapshot) {
  try {
    const out = await call('PUT', { data: snapshot });
    await store.set(TS_KEY, out.updatedAt);
    setStatus('ok');
  } catch {
    // Offline or Worker not deployed — local persistence already happened, so nothing is
    // lost. The next successful push carries the full state anyway.
    setStatus('error');
  }
}

/** Debounced full-state push; called from state.js on every persisted commit. */
export function schedulePush(snapshot) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(snapshot), PUSH_DEBOUNCE_MS);
}

/**
 * Boot-time sync. `apply(data)` adopts a newer server state into the store;
 * `snapshot()` reads the current local state for the initial push.
 * Runs after first render — a slow network never blocks the UI.
 */
export async function initSync({ apply, snapshot, onStatus }) {
  notify = onStatus || (() => {});
  try {
    const remote = await call('GET');
    const lastSeen = await store.get(TS_KEY, 0);
    if (remote.updatedAt && remote.updatedAt > lastSeen) {
      apply(remote.data);
      await store.set(TS_KEY, remote.updatedAt);
      setStatus('ok');
    } else {
      // Server is empty or this device is ahead — establish/refresh the server copy.
      await push(snapshot()); // push sets ok/error itself
    }
  } catch {
    setStatus('error');
  }
  notify(status);
}
