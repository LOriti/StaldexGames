// Brain viewer — Cloudflare Worker
//
// Read-only window onto the private LOriti/brain repo for the page at staldex.com/brain.
// Nothing from Brain is ever committed to this (public) repo: the page is an empty shell
// and every byte of content is fetched here, at request time, from the GitHub API with a
// read-only token that lives only in the Worker's secrets.
//
// Two gates, both required:
//   1. Cloudflare Access in front of /brain and /api/brain (identity login at the edge).
//   2. This Worker re-verifying the Access JWT, so it fails closed if (1) is ever missing.
//
// Read-only by design: Brain is a single-writer control plane (see its AGENTS.md), so
// edits keep going through a normal session + handoff, never through this page.
//
// Routed at staldex.com/api/brain/* (see wrangler.toml). Endpoints:
//   GET /api/brain/tree             → { repo, ref, commit, viewer, files: [{ path, sha, size }] }
//   GET /api/brain/file?path=<path> → { path, sha, text }

import { accessConfig, readAccessToken, verifyAccessJwt } from './access.js';

const TREE_TTL_MS = 30 * 1000;
const BLOB_CACHE_MAX = 200;
const MAX_FILE_BYTES = 512 * 1024;

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

async function github(env, path, accept = 'application/vnd.github+json') {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: accept,
      'User-Agent': 'staldex-brain-viewer',
      'X-GitHub-Api-Version': '2022-11-28',
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
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);

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
      return await route(new URL(request.url), env, viewer);
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
