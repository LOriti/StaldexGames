// Run: node --test tests/brain-worker.test.mjs
// worker-brain/ has its own "type": "module" package.json, so it imports directly.
// GitHub and the Access certs endpoint are faked; tokens are signed with a throwaway key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';

const worker = await import('../worker-brain/src/index.js');

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-tag';
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: 'ghp_test', BRAIN_REPO: 'LOriti/brain', BRAIN_REF: 'main' };

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function sign(claims, kid = 'k1', key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, email: 'Owner@Example.com', ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const TREE = [
  { path: 'INDEX.md', type: 'blob', sha: 's-index', size: 20 },
  { path: 'projects/brain/STATE.md', type: 'blob', sha: 's-state', size: 20 },
  { path: '.claude/settings.json', type: 'blob', sha: 's-dot', size: 20 },
  { path: 'context/local-paths.json', type: 'blob', sha: 's-local', size: 20 },
  { path: 'scripts/brain.py', type: 'blob', sha: 's-py', size: 20 },
  { path: 'projects', type: 'tree', sha: 't1' },
];
const BLOBS = { 's-index': '# Portfolio', 's-state': '# State' };

const calls = [];
const extraKeys = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, headers: init.headers || {} });
  const ok = (body, raw = false) => new Response(raw ? body : JSON.stringify(body), { status: 200 });
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return ok({ keys: [jwk, ...extraKeys] });
  if (url.endsWith('/repos/LOriti/brain/commits/main')) {
    return ok({ sha: 'abc1234def', commit: { message: 'state(brain): x\n\nbody', committer: { date: '2026-10-16T00:00:00Z' }, tree: { sha: 'root' } } });
  }
  if (url.endsWith('/repos/LOriti/brain/git/trees/root?recursive=1')) return ok({ tree: TREE, truncated: false });
  const blob = url.match(/\/git\/blobs\/(.+)$/);
  if (blob && BLOBS[blob[1]]) return ok(BLOBS[blob[1]], true);
  return new Response('nope', { status: 404 });
};

async function call(path, { token, env = ENV, method = 'GET' } = {}) {
  worker._resetCaches();
  const headers = token ? { 'Cf-Access-Jwt-Assertion': token } : {};
  const res = await worker.default.fetch(new Request(`https://staldex.com${path}`, { method, headers }), env);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('fails closed until Access and the GitHub token are configured', async () => {
  const token = await sign({});
  assert.equal((await call('/api/brain/tree', { token, env: { ...ENV, ACCESS_AUD: 'REPLACE_ME' } })).status, 503);
  assert.equal((await call('/api/brain/tree', { token, env: { ...ENV, ACCESS_TEAM_DOMAIN: '' } })).status, 503);
  assert.equal((await call('/api/brain/tree', { token, env: { ...ENV, GITHUB_TOKEN: '' } })).status, 503);
});

test('rejects missing, forged, expired, wrong-audience and wrong-issuer tokens', async () => {
  const other = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  const bad = [
    undefined,
    'not.a.jwt',
    await sign({}, 'k1', other.privateKey),
    await sign({ exp: Math.floor(Date.now() / 1000) - 3600 }),
    await sign({ aud: ['someone-else'] }),
    await sign({ iss: 'https://evil.cloudflareaccess.com' }),
    await sign({}, 'unknown-kid'),
  ];
  for (const token of bad) {
    const res = await call('/api/brain/tree', { token });
    assert.equal(res.status, 401, `token ${token} should be rejected`);
  }
  assert.ok(!calls.some((c) => c.url.includes('api.github.com') && !c.headers.Authorization), 'never calls GitHub unauthenticated');
});

test('optional email allowlist narrows the Access policy', async () => {
  const token = await sign({});
  assert.equal((await call('/api/brain/tree', { token, env: { ...ENV, ALLOWED_EMAILS: 'someone@else.com' } })).status, 401);
  assert.equal((await call('/api/brain/tree', { token, env: { ...ENV, ALLOWED_EMAILS: ' owner@example.com , x@y.z' } })).status, 200);
});

test('tree lists readable files only, with commit and viewer', async () => {
  calls.length = 0;
  const res = await call('/api/brain/tree', { token: await sign({}) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.files.map((f) => f.path), ['INDEX.md', 'projects/brain/STATE.md']);
  assert.equal(res.body.commit.message, 'state(brain): x');
  assert.equal(res.body.viewer, 'owner@example.com');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const gh = calls.find((c) => c.url.includes('api.github.com'));
  assert.equal(gh.headers.Authorization, 'Bearer ghp_test');
});

test('file reads are limited to paths in the readable tree', async () => {
  const token = await sign({});
  const ok = await call('/api/brain/file?path=projects/brain/STATE.md', { token });
  assert.deepEqual(ok.body, { path: 'projects/brain/STATE.md', sha: 's-state', text: '# State' });
  for (const path of ['.claude/settings.json', 'context/local-paths.json', 'scripts/brain.py', '../x.md', 'missing.md']) {
    const res = await call(`/api/brain/file?path=${encodeURIComponent(path)}`, { token });
    assert.ok([400, 404].includes(res.status), `${path} → ${res.status}`);
  }
});

test('a rotated signing key is picked up without waiting for the cert cache', async () => {
  assert.equal((await call('/api/brain/tree', { token: await sign({}) })).status, 200); // certs now cached
  const next = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  extraKeys.push({ ...(await crypto.subtle.exportKey('jwk', next.publicKey)), kid: 'k2' });
  assert.equal((await call('/api/brain/tree', { token: await sign({}, 'k2', next.privateKey) })).status, 200);
});

test('read-only: anything but GET is refused before auth', async () => {
  assert.equal((await call('/api/brain/tree', { method: 'PUT', token: await sign({}) })).status, 405);
});
