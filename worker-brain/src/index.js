// Brain viewer — Cloudflare Worker
//
// Window onto the private LOriti/brain repo for the page at staldex.com/brain.
// Nothing from Brain is ever committed to this (public) repo: the page is an empty shell
// and every byte of content is fetched here, at request time, from the GitHub API with a
// token that lives only in the Worker's secrets.
//
// Two gates, both required, for reads and writes alike:
//   1. Cloudflare Access in front of /brain and /api/brain (identity login at the edge).
//   2. This Worker re-verifying the Access JWT, so it fails closed if (1) is ever missing.
//
// Reads cover the whole readable tree, plus the time rows of the `daily-log` branch.
// Writes are narrow actions (Brain D-42, D-96 C, D-97 A, D-98 A): on one project's
// QUEUE.md, mark a card done, add an Inbox line or set its Progress; on the open-items
// register, confirm or reject what a daily routine flagged, set an item's Progress or
// close it with Evidence; and on the daily log, a task clock's start and stop rows and
// hours entered by hand. Everything else in Brain still goes through a Claude session.
// Each write reads the file and its blob sha, applies a pure transform (queue.js,
// register.js, timelog.js) and PUTs it back with that sha, so a file that changed in the
// meantime is refused (409) rather than overwritten.
//
// Routed at staldex.com/api/brain/* (see wrangler.toml). Endpoints:
//   GET  /api/brain/tree[?fresh=1 | ?commit=<sha>]   → { repo, ref, commit, viewer, files: [{ path, sha, size }] }
//   GET  /api/brain/file?path=<path>[&commit=<sha>]  → { path, sha, text }
//   POST /api/brain/done   { project, id }   → { path, sha, commit }
//   POST /api/brain/inbox  { project, text } → { path, sha, commit }
//   POST /api/brain/handled  { project, line } → { path, sha, commit }
//   POST /api/brain/confirm { id, flag }    → { path, sha, commit }   flag: unconfirmed | close-proposed
//   POST /api/brain/confirm-all { ids, flag } → { path, sha, commit }  one commit; 409 { error, ids } if any changed
//   POST /api/brain/reject  { id, flag }    → { path, sha, commit }
//   POST /api/brain/someday { project, line } → { path, sha, commit }   the line moves to ## Someday
//   POST /api/brain/reference { project, line } → { path, sha, commit } tagged for the groom to file
//   POST /api/brain/trash   { project, line } → { path, sha, commit }   the line is removed
//   POST /api/brain/progress { id, text[, project] } → { path, sha, commit }   project: a card's
//   POST /api/brain/close   { id, text }    → { path, sha, commit }   register items only
//   POST /api/brain/decide  { id, text }    → { path, sha, commit }   register decisions only
//   POST /api/brain/clock   { action, ref, start[, date], title, area, lens } → on daily-log
//   POST /api/brain/hours   { minutes, area | lens | ref, note } → on daily-log
//   POST /api/brain/focal   { ref | '', lens } → a `focal` row on daily-log (the one thing today)
//   POST /api/brain/categorise { project, line, details } | { id, details } → an Inbox line or an open item
//   GET  /api/brain/time?from=<date>        → { from, to, rows: [{ date, kind, start, end, minutes, ref, area, lens, note }] }

import { accessConfig, readAccessToken, verifyAccessJwt } from './access.js';
import { QueueError, addInbox, cardProgress, categoriseLine, handledLine, markDone, perthDate, referenceLine, somedayLine } from './queue.js';
import { FLAGS, REGISTER_ID, REGISTER_PATH, categoriseItem, closeItem, confirmFlag, decideItem, itemProgress, rejectFlag, settleAll } from './register.js';
import { cleanDetails, lineAttrs } from './categorise.js';
import { DATE, LOG_BRANCH, appendTime, clockRow, focalRow, hoursRow, logPath, parseTime, perthClock } from './timelog.js';

const TREE_TTL_MS = 30 * 1000;
const BLOB_CACHE_MAX = 200;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 8 * 1024;
const BATCH_MAX = 100;
const WRITE_ORIGIN = 'https://staldex.com';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/;
// Brain's date-based ids (brain-021): FAMILY-YMMDD.XX, such as DEV-61025.14 or ?-60828.08.
const DATED_ID = /^(?:\?|[A-Z]+(?:-[A-Z]+)?)-\d{5}\.\d{2,3}$/;
export const isCardId = (id, project) =>
  typeof id === 'string' && (DATED_ID.test(id) || (CARD_ID.test(id) && id.startsWith(`${project}-`)));
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const COMMIT_CACHE_MAX = 20;
const TIME_DAYS_MAX = 14;

// Only readable text formats, never dotfile config, and never the machine-local paths file
// even though Brain's .gitignore should already keep it out of the repo.
const READABLE = /\.(md|json|jsonl)$/i;
const EXCLUDED = new Set(['context/local-paths.json']);

// Isolate-local caches. The branch tree is short-lived so new pushes show up quickly;
// trees pinned to a commit and blobs are keyed by hash and therefore never stale.
const treeCache = new Map(); // repo@ref → { at, value }
const commitTrees = new Map(); // commit sha → tree value
const blobCache = new Map();

class UpstreamError extends Error {
  constructor(status) {
    super(`github ${status}`);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function isReadable(path) {
  if (typeof path !== 'string' || !READABLE.test(path) || EXCLUDED.has(path)) return false;
  return !path.split('/').some((seg) => seg === '' || seg.startsWith('.'));
}

async function github(env, path, accept = 'application/vnd.github+json', init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: accept,
      'User-Agent': 'staldex-brain-viewer',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new UpstreamError(res.status);
  return res;
}

function repoPath(env) {
  return (env.BRAIN_REPO || 'LOriti/brain').split('/').map(encodeURIComponent).join('/');
}

// The tree at the branch head, or at one exact commit. A write answers with the commit it
// made, and the page reloads pinned to it: GitHub can briefly serve the branch head from
// before a commit it has just accepted, and a commit's tree never changes.
async function loadTree(env, now, { fresh = false, commit: pinned = null, ref = env.BRAIN_REF || 'main' } = {}) {
  const key = `${env.BRAIN_REPO}@${ref}`;
  if (pinned && commitTrees.has(pinned)) return commitTrees.get(pinned);
  const cached = treeCache.get(key);
  if (!pinned && !fresh && cached && now - cached.at < TREE_TTL_MS) return cached.value;

  const repo = repoPath(env);
  const commit = await (await github(env, `/repos/${repo}/commits/${encodeURIComponent(pinned || ref)}`)).json();
  const tree = await (await github(env, `/repos/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`)).json();

  const files = tree.tree
    .filter((entry) => entry.type === 'blob' && isReadable(entry.path))
    .map(({ path, sha, size }) => ({ path, sha, size }));

  const value = {
    repo: env.BRAIN_REPO || 'LOriti/brain',
    ref,
    truncated: Boolean(tree.truncated),
    commit: {
      sha: commit.sha,
      date: commit.commit.committer?.date || commit.commit.author?.date || null,
      message: (commit.commit.message || '').split('\n')[0],
    },
    files,
  };
  if (!pinned) treeCache.set(key, { at: now, value });
  if (commitTrees.size >= COMMIT_CACHE_MAX) commitTrees.delete(commitTrees.keys().next().value);
  commitTrees.set(commit.sha, value);
  return value;
}

async function loadBlob(env, sha) {
  if (blobCache.has(sha)) return blobCache.get(sha);
  const res = await github(env, `/repos/${repoPath(env)}/git/blobs/${sha}`, 'application/vnd.github.raw');
  const text = await res.text();
  if (blobCache.size >= BLOB_CACHE_MAX) blobCache.delete(blobCache.keys().next().value);
  blobCache.set(sha, text);
  return text;
}

// ---- writes ---------------------------------------------------------------------

const queuePath = (body) => (typeof body.project === 'string' && SLUG.test(body.project) ? `projects/${body.project}/QUEUE.md` : null);
const isRegisterItem = (body) => typeof body.id === 'string' && REGISTER_ID.test(body.id);
const todaysLog = () => logPath(perthClock().date);
const flagged = (body) => typeof body.id === 'string' && REGISTER_ID.test(body.id) && FLAGS.includes(body.flag);
const flagWord = (body) => (body.flag === 'close-proposed' ? 'close ' : '');

const WRITES = {
  '/api/brain/done': {
    path: queuePath,
    valid: (body) => isCardId(body.id, body.project),
    apply: (text, body, today) => markDone(text, body.id, today),
    message: (body) => `web: done ${body.id}`,
  },
  '/api/brain/inbox': {
    path: queuePath,
    valid: (body) => typeof body.text === 'string',
    apply: (text, body, today) => addInbox(text, body.text, today),
    message: (body) => `web: inbox ${body.project}`,
  },
  // An Inbox line Leon did on the spot leaves the inbox (Brain D-110 A).
  '/api/brain/handled': {
    path: queuePath,
    valid: (body) => typeof body.line === 'string',
    apply: (text, body, today) => handledLine(text, body.line, today),
    message: (body) => `web: handled inbox ${body.project}`,
  },
  // The Inbox tab's first question (Brain DEV-61026.33, D-104 C): Someday/Maybe parks the
  // line in `## Someday`, Reference tags it for the groom to file, Trash removes it.
  '/api/brain/someday': {
    path: queuePath,
    valid: (body) => typeof body.line === 'string',
    apply: (text, body, today) => somedayLine(text, body.line, today),
    message: (body) => `web: someday inbox ${body.project}`,
  },
  '/api/brain/reference': {
    path: queuePath,
    valid: (body) => typeof body.line === 'string',
    apply: (text, body, today) => referenceLine(text, body.line, today),
    message: (body) => `web: reference inbox ${body.project}`,
  },
  '/api/brain/trash': {
    path: queuePath,
    valid: (body) => typeof body.line === 'string',
    apply: (text, body, today) => handledLine(text, body.line, today),
    message: (body) => `web: trash inbox ${body.project}`,
  },
  '/api/brain/confirm': {
    path: () => REGISTER_PATH,
    valid: flagged,
    apply: (text, body, today) => confirmFlag(text, body.id, body.flag, today),
    message: (body) => `web: confirm ${flagWord(body)}${body.id}`,
  },
  // "Confirm all N" and "Close all N" on the Inbox tab (Brain D-112 A): one commit per batch,
  // refused whole with the ids that changed since the page loaded.
  '/api/brain/confirm-all': {
    path: () => REGISTER_PATH,
    valid: (body) => Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= BATCH_MAX
      && body.ids.every((id) => typeof id === 'string' && REGISTER_ID.test(id)) && new Set(body.ids).size === body.ids.length
      && FLAGS.includes(body.flag),
    apply: (text, body, today) => settleAll(text, body.ids, body.flag, today),
    message: (body) => `web: ${body.flag === 'close-proposed' ? 'close' : 'confirm'} all ${body.ids.length}`,
  },
  '/api/brain/reject': {
    path: () => REGISTER_PATH,
    valid: flagged,
    apply: (text, body, today) => rejectFlag(text, body.id, body.flag, today),
    message: (body) => `web: reject ${flagWord(body)}${body.id}`,
  },
  // A card's (with `project`) or an open item's latest movement (Brain D-98 A).
  '/api/brain/progress': {
    path: (body) => (body.project !== undefined ? queuePath(body) : REGISTER_PATH),
    valid: (body) => typeof body.text === 'string' && (body.project !== undefined ? isCardId(body.id, body.project) : isRegisterItem(body)),
    apply: (text, body, today) => (body.project !== undefined ? cardProgress : itemProgress)(text, body.id, body.text, today),
    message: (body) => `web: progress ${body.id}`,
  },
  // Close an open item with Leon's Evidence; a card closes through /done.
  '/api/brain/close': {
    path: () => REGISTER_PATH,
    valid: (body) => typeof body.text === 'string' && isRegisterItem(body),
    apply: (text, body, today) => closeItem(text, body.id, body.text, today),
    message: (body) => `web: close ${body.id}`,
  },
  // Settle a register decision with Leon's outcome (Brain D-111 A).
  '/api/brain/decide': {
    path: () => REGISTER_PATH,
    valid: (body) => typeof body.text === 'string' && isRegisterItem(body),
    apply: (text, body, today) => decideItem(text, body.id, body.text, today),
    message: (body) => `web: decide ${body.id}`,
  },
  // Leon's details for an Inbox line (kept on the line for the scheduled groom) or an open
  // register item (set, and a new item confirmed): Brain D-100 B.
  '/api/brain/categorise': {
    path: (body) => (body.id !== undefined ? REGISTER_PATH : queuePath(body)),
    valid: (body) => (body.id !== undefined ? isRegisterItem(body) : typeof body.line === 'string') && typeof body.details === 'object',
    apply: (text, body, today) => {
      const d = cleanDetails(body.details);
      return body.id !== undefined ? categoriseItem(text, body.id, d, today) : categoriseLine(text, body.line, d, lineAttrs(d, today), today);
    },
    message: (body) => `web: categorise ${body.id || `inbox ${body.project}`}`,
  },
  // Task clock rows (Brain D-97 A) and hours typed in (D-96 C), appended to today's log
  // on the daily-log branch, which may not have today's file yet.
  '/api/brain/clock': {
    branch: LOG_BRANCH,
    create: true,
    path: todaysLog,
    valid: (body) => body.action === 'start' || body.action === 'stop',
    apply: (text, body, today, clock) => appendTime(text, clock.date, clock.hhmm, clockRow(body, clock)),
    message: (body) => `time: ${perthClock().date} clock ${body.action} ${body.ref}`,
  },
  '/api/brain/hours': {
    branch: LOG_BRANCH,
    create: true,
    path: todaysLog,
    valid: (body) => Number.isInteger(body.minutes),
    apply: (text, body, today, clock) => appendTime(text, clock.date, clock.hhmm, hoursRow(body)),
    message: (body) => `time: ${perthClock().date} hours ${body.ref || body.area || body.lens}`,
  },
  // Leon's one thing for today (Brain D-113 A), read live by the viewer and the desk; an
  // empty ref goes back to the brief's pick.
  '/api/brain/focal': {
    branch: LOG_BRANCH,
    create: true,
    path: todaysLog,
    valid: (body) => body.ref === '' || body.ref === null || typeof body.ref === 'string',
    apply: (text, body, today, clock) => appendTime(text, clock.date, clock.hhmm, focalRow(body, clock)),
    message: (body) => `time: ${perthClock().date} focal ${body.ref || 'cleared'}`,
  },
};

// 'not-flagged': someone settled the item since the page loaded; 'order': confirm the
// item before its proposed close.
const WRITE_STATUS = {
  'unknown-id': 404, 'duplicate-id': 422, malformed: 422, 'invalid-text': 400, 'not-flagged': 409, order: 409,
  closed: 409, decision: 409,
};

// Forged-request guard on top of Access. A cross-site page can't send a JSON body with a
// custom header without a CORS preflight, which this Worker never grants, and the Origin
// has to be the site itself.
export function writeAllowed(request) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  return type === 'application/json'
    && request.headers.get('Origin') === WRITE_ORIGIN
    && request.headers.get('X-Brain-Write') === '1';
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

async function write(request, url, env) {
  const action = WRITES[url.pathname];
  const body = await readBody(request);
  const path = body && action.path(body);
  if (!path || !isReadable(path) || !action.valid(body)) return json({ error: 'bad request' }, 400);

  const ref = action.branch || env.BRAIN_REF || 'main';
  const contents = `/repos/${repoPath(env)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  let current = null;
  try {
    current = await (await github(env, `${contents}?ref=${encodeURIComponent(ref)}`)).json();
  } catch (err) {
    if (!(err instanceof UpstreamError && err.status === 404)) throw err;
    if (!action.create) return json({ error: 'not found' }, 404);
  }
  if (current && (current.type !== 'file' || current.encoding !== 'base64' || current.size > MAX_FILE_BYTES)) {
    return json({ error: 'not editable' }, 422);
  }

  let next;
  try {
    next = action.apply(current ? base64ToUtf8(current.content) : '', body, perthDate(), perthClock());
  } catch (err) {
    if (err instanceof QueueError) return json({ error: err.message, ...(err.ids ? { ids: err.ids } : {}) }, WRITE_STATUS[err.code] || 422);
    if (err instanceof TypeError) return json({ error: 'not editable' }, 422); // not UTF-8
    throw err;
  }

  // Passing the sha makes this a compare-and-swap: GitHub refuses it if the file moved on
  // since the read. That is reported, never retried or forced. No committer is sent
  // (GitHub requires an email with one), so the commit is the token owner's; the `web:`
  // prefix marks where it came from.
  let saved;
  try {
    saved = await (await github(env, contents, 'application/vnd.github+json', {
      method: 'PUT',
      body: JSON.stringify({ message: action.message(body), content: utf8ToBase64(next), ...(current ? { sha: current.sha } : {}), branch: ref }),
    })).json();
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 409 || err.status === 422)) {
      return json({ error: 'changed elsewhere, refresh' }, 409);
    }
    throw err;
  }
  treeCache.clear();
  return json({ path, sha: saved.content?.sha || null, commit: saved.commit?.sha || null });
}

// ---- reads ----------------------------------------------------------------------

// Time rows from `from` to today (Perth), at most TIME_DAYS_MAX days, read from the
// daily-log branch. Only the parsed rows leave the Worker, not the rest of each log.
async function timeRows(url, env) {
  const today = perthClock().date;
  const from = url.searchParams.get('from') || today;
  if (!DATE.test(from) || from > today) return json({ error: 'bad from' }, 400);
  const dates = [];
  for (let d = new Date(`${today}T00:00:00Z`); dates.length < TIME_DAYS_MAX; d.setUTCDate(d.getUTCDate() - 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date < from) break;
    dates.unshift(date);
  }
  let tree;
  try {
    tree = await loadTree(env, Date.now(), { ref: LOG_BRANCH });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 404 || err.status === 422)) return json({ from: dates[0], to: today, rows: [] });
    throw err;
  }
  const rows = [];
  for (const date of dates) {
    const entry = tree.files.find((f) => f.path === logPath(date));
    if (entry && entry.size <= MAX_FILE_BYTES) rows.push(...parseTime(await loadBlob(env, entry.sha), date));
  }
  return json({ from: dates[0], to: today, rows });
}

async function route(url, env, viewer) {
  if (url.pathname === '/api/brain/time') return timeRows(url, env);
  const isTree = url.pathname === '/api/brain/tree';
  const path = url.searchParams.get('path') || '';
  if (!isTree && url.pathname !== '/api/brain/file') return json({ error: 'not found' }, 404);
  if (!isTree && !isReadable(path)) return json({ error: 'not readable' }, 400);

  // Optional pin to one commit, so the page reads exactly the tree it was shown.
  const commit = url.searchParams.get('commit');
  if (commit !== null && !COMMIT_SHA.test(commit)) return json({ error: 'bad commit' }, 400);
  let tree;
  try {
    tree = await loadTree(env, Date.now(), { fresh: url.searchParams.get('fresh') === '1', commit });
  } catch (err) {
    if (commit && err instanceof UpstreamError && (err.status === 404 || err.status === 422)) {
      return json({ error: 'not found' }, 404);
    }
    throw err;
  }
  if (isTree) return json({ ...tree, viewer: viewer.email || null });

  // Only paths present in the tree resolve, so nothing outside the allowlist (or a crafted
  // blob sha) can be requested.
  const entry = tree.files.find((f) => f.path === path);
  if (!entry) return json({ error: 'not found' }, 404);
  if (entry.size > MAX_FILE_BYTES) return json({ error: 'file too large' }, 413);
  return json({ path: entry.path, sha: entry.sha, text: await loadBlob(env, entry.sha) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const writing = Object.hasOwn(WRITES, url.pathname);
    if (request.method !== (writing ? 'POST' : 'GET')) return json({ error: 'method not allowed' }, 405);
    if (writing && !writeAllowed(request)) return json({ error: 'forbidden' }, 403);

    const cfg = accessConfig(env);
    if (!cfg || !env.GITHUB_TOKEN) return json({ error: 'not configured' }, 503);

    let viewer;
    try {
      viewer = await verifyAccessJwt(readAccessToken(request), cfg);
    } catch {
      return json({ error: 'access unavailable' }, 503);
    }
    if (!viewer) return json({ error: 'unauthorised' }, 401);

    try {
      return writing ? await write(request, url, env) : await route(url, env, viewer);
    } catch (err) {
      if (err instanceof UpstreamError) return json({ error: err.message }, 502);
      return json({ error: 'internal error' }, 500);
    }
  },
};

// Test hook: drop isolate-local caches between cases.
export function _resetCaches() {
  treeCache.clear();
  commitTrees.clear();
  blobCache.clear();
}
