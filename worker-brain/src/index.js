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
// Reads cover the whole readable tree. Writes are exactly two narrow actions on one
// project's QUEUE.md (mark a card done, add an Inbox line); everything else in Brain
// still goes through a Claude session. Each write reads the file and its blob sha, applies
// a pure transform (queue.js) and PUTs it back with that sha, so a file that changed in
// the meantime is refused (409) rather than overwritten.
//
// Routed at staldex.com/api/brain/* (see wrangler.toml). Endpoints:
//   GET  /api/brain/tree             → { repo, ref, commit, viewer, files: [{ path, sha, size }] }
//   GET  /api/brain/file?path=<path> → { path, sha, text }
//   POST /api/brain/done   { project, id }   → { path, sha, commit }
//   POST /api/brain/inbox  { project, text } → { path, sha, commit }

import { accessConfig, readAccessToken, verifyAccessJwt } from './access.js';
import { QueueError, addInbox, markDone, perthDate } from './queue.js';

const TREE_TTL_MS = 30 * 1000;
const BLOB_CACHE_MAX = 200;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 4 * 1024;
const WRITE_ORIGIN = 'https://staldex.com';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/;

// Only readable text formats, never dotfile config, and never the machine-local paths file
// even though Brain's .gitignore should already keep it out of the repo.
const READABLE = /\.(md|json|jsonl)$/i;
const EXCLUDED = new Set(['context/local-paths.json']);

// Isolate-local caches. The tree is short-lived so new pushes show up quickly; blobs are
// keyed by content hash and therefore never stale.
let treeCache = null; // { key, at, value }
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

async function loadTree(env, now) {
  const ref = env.BRAIN_REF || 'main';
  const key = `${env.BRAIN_REPO}@${ref}`;
  if (treeCache && treeCache.key === key && now - treeCache.at < TREE_TTL_MS) return treeCache.value;

  const repo = repoPath(env);
  const commit = await (await github(env, `/repos/${repo}/commits/${encodeURIComponent(ref)}`)).json();
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
  treeCache = { key, at: now, value };
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

const WRITES = {
  '/api/brain/done': {
    valid: (body) => typeof body.id === 'string' && CARD_ID.test(body.id) && body.id.startsWith(`${body.project}-`),
    apply: (text, body, today) => markDone(text, body.id, today),
    message: (body) => `web: done ${body.id}`,
  },
  '/api/brain/inbox': {
    valid: (body) => typeof body.text === 'string',
    apply: (text, body, today) => addInbox(text, body.text, today),
    message: (body) => `web: inbox ${body.project}`,
  },
};

const QUEUE_STATUS = { 'unknown-id': 404, 'duplicate-id': 422, malformed: 422, 'invalid-text': 400 };

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
  if (!body || typeof body.project !== 'string' || !SLUG.test(body.project)) return json({ error: 'bad request' }, 400);
  const path = `projects/${body.project}/QUEUE.md`;
  if (!isReadable(path) || !action.valid(body)) return json({ error: 'bad request' }, 400);

  const ref = env.BRAIN_REF || 'main';
  const contents = `/repos/${repoPath(env)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  let current;
  try {
    current = await (await github(env, `${contents}?ref=${encodeURIComponent(ref)}`)).json();
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return json({ error: 'not found' }, 404);
    throw err;
  }
  if (current.type !== 'file' || current.encoding !== 'base64' || current.size > MAX_FILE_BYTES) {
    return json({ error: 'not editable' }, 422);
  }

  let next;
  try {
    next = action.apply(base64ToUtf8(current.content), body, perthDate());
  } catch (err) {
    if (err instanceof QueueError) return json({ error: err.message }, QUEUE_STATUS[err.code] || 422);
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
      body: JSON.stringify({ message: action.message(body), content: utf8ToBase64(next), sha: current.sha, branch: ref }),
    })).json();
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 409 || err.status === 422)) {
      return json({ error: 'changed elsewhere, refresh' }, 409);
    }
    throw err;
  }
  treeCache = null;
  return json({ path, sha: saved.content?.sha || null, commit: saved.commit?.sha || null });
}

// ---- reads ----------------------------------------------------------------------

async function route(url, env, viewer) {
  const now = Date.now();
  if (url.pathname === '/api/brain/tree') {
    const tree = await loadTree(env, now);
    return json({ ...tree, viewer: viewer.email || null });
  }

  if (url.pathname === '/api/brain/file') {
    const path = url.searchParams.get('path') || '';
    if (!isReadable(path)) return json({ error: 'not readable' }, 400);
    // Only paths present in the current tree resolve, so nothing outside the allowlist
    // (or a crafted sha) can be requested.
    const entry = (await loadTree(env, now)).files.find((f) => f.path === path);
    if (!entry) return json({ error: 'not found' }, 404);
    if (entry.size > MAX_FILE_BYTES) return json({ error: 'file too large' }, 413);
    return json({ path: entry.path, sha: entry.sha, text: await loadBlob(env, entry.sha) });
  }

  return json({ error: 'not found' }, 404);
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
  treeCache = null;
  blobCache.clear();
}
