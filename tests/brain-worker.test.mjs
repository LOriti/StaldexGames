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
const BLOBS = { 's-index': '# Portfolio', 's-state': '# State', 's-state2': '# State, newer' };
const PINNED = '0123456789abcdef0123456789abcdef01234567';

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
  // A newer commit than the (lagging) branch head, as just made by a write.
  if (url.endsWith(`/repos/LOriti/brain/commits/${PINNED}`)) {
    return ok({ sha: PINNED, commit: { message: 'web: inbox demo', committer: { date: '2026-10-17T00:00:00Z' }, tree: { sha: 'root2' } } });
  }
  if (url.endsWith('/repos/LOriti/brain/git/trees/root2?recursive=1')) {
    return ok({ tree: TREE.map((e) => (e.sha === 's-state' ? { ...e, sha: 's-state2' } : e)), truncated: false });
  }
  if (/\/repos\/LOriti\/brain\/commits\/[0-9a-f]{40}$/.test(url)) return new Response('{}', { status: 422 });
  const blob = url.match(/\/git\/blobs\/(.+)$/);
  if (blob && BLOBS[blob[1]]) return ok(BLOBS[blob[1]], true);
  const file = [repo, register].find((f) => url.startsWith(`https://api.github.com/repos/LOriti/brain/contents/${f.path}`));
  if (file) {
    if ((init.method || 'GET') === 'GET') {
      return ok({ type: 'file', encoding: 'base64', size: file.text.length, sha: file.sha, content: Buffer.from(file.text).toString('base64') });
    }
    const put = JSON.parse(init.body);
    file.puts.push(put);
    if (file.putStatus !== 200) return new Response('{}', { status: file.putStatus });
    return ok({ content: { sha: 'new-sha' }, commit: { sha: 'commit-sha' } });
  }
  return new Response('nope', { status: 404 });
};

// Synthetic queue the contents API serves for project `demo`.
const QUEUE = '---\nproject: demo\ntype: queue\nupdated: 2030-01-01\n---\n\n# demo\n\n' +
  '### A card\n\n`id: demo-001` `priority: P1`\n\nOutcome: x.\n\n## Inbox\n\n- Idea, with ünïcode.\n';
const repo = { path: 'projects/demo/QUEUE.md', text: QUEUE, sha: 'old-sha', puts: [], putStatus: 200 };

// Synthetic open-items register: one item awaiting confirmation, one proposed close.
const REGISTER = '---\ntype: register\nupdated: 2030-01-01\n---\n\n# Open items\n\n' +
  '### New\n`id: P-DEV-01014.01` `kind: action` `state: open` `unconfirmed: 2030-01-14`\n\nSource: s, 2030-01-14\nNext: n.\n\n' +
  '### Closing\n`id: DEV-01012.02` `kind: action` `state: open` `close-proposed: 2030-01-14`\n\nSource: s, 2030-01-12\nNext: n.\nEvidence: e.\n';
const register = { path: 'register/open-items.md', text: REGISTER, sha: 'reg-sha', puts: [], putStatus: 200 };

const WRITE_HEADERS = { 'Content-Type': 'application/json', Origin: 'https://staldex.com', 'X-Brain-Write': '1' };

async function post(path, body, { token, headers = WRITE_HEADERS, env = ENV } = {}) {
  worker._resetCaches();
  const all = { ...headers, ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}) };
  const res = await worker.default.fetch(new Request(`https://staldex.com${path}`, {
    method: 'POST', headers: all, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  return { status: res.status, body: await res.json() };
}

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

test('read routes take GET only and write routes POST only, before auth', async () => {
  const token = await sign({});
  assert.equal((await call('/api/brain/tree', { method: 'PUT', token })).status, 405);
  assert.equal((await call('/api/brain/tree', { method: 'POST', token })).status, 405);
  assert.equal((await call('/api/brain/done', { token })).status, 405);
  assert.equal((await call('/api/brain/inbox', { method: 'PUT', token })).status, 405);
  assert.equal((await call('/api/brain/confirm', { token })).status, 405);
  assert.equal((await call('/api/brain/reject', { token })).status, 405);
});

test('writes need JSON, the site origin and the custom header', async () => {
  const token = await sign({});
  repo.puts.length = 0;
  const body = { project: 'demo', text: 'x' };
  const without = (key) => Object.fromEntries(Object.entries(WRITE_HEADERS).filter(([k]) => k !== key));
  for (const headers of [
    without('Content-Type'),
    { ...WRITE_HEADERS, 'Content-Type': 'text/plain' },
    { ...WRITE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    without('Origin'),
    { ...WRITE_HEADERS, Origin: 'https://evil.example' },
    { ...WRITE_HEADERS, Origin: 'https://staldex.com.evil.example' },
    { ...WRITE_HEADERS, Origin: 'http://staldex.com' },
    { ...WRITE_HEADERS, Origin: 'https://staldex.pages.dev' },
    without('X-Brain-Write'),
    { ...WRITE_HEADERS, 'X-Brain-Write': 'yes' },
  ]) {
    assert.equal((await post('/api/brain/inbox', body, { token, headers })).status, 403, JSON.stringify(headers));
    assert.equal((await post('/api/brain/confirm', { id: 'P-DEV-01014.01', flag: 'unconfirmed' }, { token, headers })).status, 403);
  }
  assert.equal(register.puts.length, 0);
  assert.equal((await post('/api/brain/inbox', body, { token, headers: { ...WRITE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } })).status, 200);
  assert.equal(repo.puts.length, 1);
});

test('writes fail closed exactly like reads', async () => {
  repo.puts.length = 0;
  const body = { project: 'demo', text: 'x' };
  assert.equal((await post('/api/brain/inbox', body)).status, 401);
  assert.equal((await post('/api/brain/inbox', body, { token: await sign({ aud: ['other'] }) })).status, 401);
  assert.equal((await post('/api/brain/inbox', body, { token: await sign({}), env: { ...ENV, ACCESS_AUD: 'REPLACE_ME' } })).status, 503);
  assert.equal((await post('/api/brain/inbox', body, { token: await sign({}), env: { ...ENV, GITHUB_TOKEN: '' } })).status, 503);
  assert.equal((await post('/api/brain/inbox', body, { token: await sign({}), env: { ...ENV, ALLOWED_EMAILS: 'x@y.z' } })).status, 401);
  assert.equal(repo.puts.length, 0);
  const flag = { id: 'P-DEV-01014.01', flag: 'unconfirmed' };
  assert.equal((await post('/api/brain/reject', flag)).status, 401);
  assert.equal((await post('/api/brain/reject', flag, { token: await sign({ aud: ['other'] }) })).status, 401);
  assert.equal((await post('/api/brain/reject', flag, { token: await sign({}), env: { ...ENV, GITHUB_TOKEN: '' } })).status, 503);
  assert.equal(register.puts.length, 0);
});

test('write bodies are validated against the path-safety rules', async () => {
  const token = await sign({});
  repo.puts.length = 0;
  const bad = [
    'not json', '[]', '{}',
    { project: '../x', text: 'a' }, { project: 'demo/../other', text: 'a' }, { project: '.github', text: 'a' },
    { project: '_template', text: 'a' }, { project: 'Demo', text: 'a' }, { project: 'demo', text: 42 },
    { project: 'demo', text: 'a'.repeat(5000) },
  ];
  for (const body of bad) assert.equal((await post('/api/brain/inbox', body, { token })).status, 400, JSON.stringify(body));
  for (const id of [undefined, 'other-001', 'demo-1', 'demo-001/x', '../demo-001', 'DEV-6102.01', 'dev-61025.14', 'DEV-61025.14/x', 'P DEV-61025.14']) {
    assert.equal((await post('/api/brain/done', { project: 'demo', id }, { token })).status, 400, String(id));
  }
  assert.equal((await post('/api/brain/inbox', { project: 'demo', text: '   ' }, { token })).status, 400);
  assert.equal((await post('/api/brain/done', { project: 'demo', id: 'demo-009' }, { token })).status, 404);
  assert.equal((await post('/api/brain/done', { project: 'demo', id: 'DEV-61025.99' }, { token })).status, 404);
  assert.equal((await post('/api/brain/inbox', { project: 'nope', text: 'a' }, { token })).status, 404);
  assert.equal(repo.puts.length, 0);
  for (const route of ['/api/brain/confirm', '/api/brain/reject']) {
    for (const body of [
      {}, { id: 'P-DEV-01014.01' }, { id: 'P-DEV-01014.01', flag: 'done' }, { id: 'P-DEV-01014.01', flag: ['unconfirmed'] },
      { id: 'D-12', flag: 'unconfirmed' }, { id: 'demo-001', flag: 'unconfirmed' }, { id: '../P-DEV-01014.01', flag: 'unconfirmed' },
      { id: 'P-DEV-01014.01 ', flag: 'unconfirmed' }, { id: 42, flag: 'unconfirmed' },
    ]) assert.equal((await post(route, body, { token })).status, 400, `${route} ${JSON.stringify(body)}`);
    assert.equal((await post(route, { id: 'DEV-01099.01', flag: 'unconfirmed' }, { token })).status, 404);
  }
  // Settled already, or out of order: refused as a conflict, nothing written.
  assert.deepEqual(await post('/api/brain/confirm', { id: 'DEV-01012.02', flag: 'unconfirmed' }, { token }),
    { status: 409, body: { error: 'DEV-01012.02 is no longer unconfirmed' } });
  assert.equal((await post('/api/brain/reject', { id: 'P-DEV-01014.01', flag: 'close-proposed' }, { token })).status, 409);
  assert.equal(register.puts.length, 0);
});

test('confirm and reject each commit one register edit with the read sha', async () => {
  const token = await sign({});
  const cases = [
    ['/api/brain/confirm', 'P-DEV-01014.01', 'unconfirmed', 'web: confirm P-DEV-01014.01', /`id: DEV-01014\.01` `kind: action` `state: open`\n/],
    ['/api/brain/reject', 'P-DEV-01014.01', 'unconfirmed', 'web: reject P-DEV-01014.01',
      /`id: P-DEV-01014\.01` `kind: action` `state: rejected`\n\nSource: s, 2030-01-14\nNext: n\.\nCorrection: \d{4}-\d{2}-\d{2}: rejected in the viewer/],
    ['/api/brain/confirm', 'DEV-01012.02', 'close-proposed', 'web: confirm close DEV-01012.02', /`id: DEV-01012\.02` `kind: action` `state: done`\n\nSource: s, 2030-01-12\nNext: n\.\nEvidence: e\.\n$/],
    ['/api/brain/reject', 'DEV-01012.02', 'close-proposed', 'web: reject close DEV-01012.02',
      /`id: DEV-01012\.02` `kind: action` `state: open`\n\nSource: s, 2030-01-12\nNext: n\.\nCorrection: \d{4}-\d{2}-\d{2}: proposed close rejected in the viewer \(D-42\); its evidence was: e\.\n$/],
  ];
  for (const [route, id, flag, message, expected] of cases) {
    register.puts.length = 0;
    const res = await post(route, { id, flag }, { token });
    assert.equal(res.status, 200, message);
    assert.deepEqual(res.body, { path: 'register/open-items.md', sha: 'new-sha', commit: 'commit-sha' });
    assert.equal(register.puts.length, 1);
    const [put] = register.puts;
    assert.equal(put.message, message);
    assert.equal(put.sha, 'reg-sha');
    assert.equal(put.branch, 'main');
    const text = Buffer.from(put.content, 'base64').toString('utf8');
    assert.match(text, expected, message);
    assert.match(text, /^updated: \d{4}-\d{2}-\d{2}$/m);
    assert.doesNotMatch(text, /updated: 2030-01-01/);
  }
  assert.equal(repo.puts.length, 0, 'queues untouched');
});

test('a register edit racing another change is a 409, never retried', async () => {
  register.puts.length = 0;
  register.putStatus = 409;
  const res = await post('/api/brain/confirm', { id: 'P-DEV-01014.01', flag: 'unconfirmed' }, { token: await sign({}) });
  assert.deepEqual(res, { status: 409, body: { error: 'changed elsewhere, refresh' } });
  assert.equal(register.puts.length, 1);
  register.putStatus = 200;
});

test('done commits one transformed file with the read sha', async () => {
  repo.puts.length = 0;
  const res = await post('/api/brain/done', { project: 'demo', id: 'demo-001' }, { token: await sign({}) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { path: 'projects/demo/QUEUE.md', sha: 'new-sha', commit: 'commit-sha' });
  assert.equal(repo.puts.length, 1);
  const [put] = repo.puts;
  assert.equal(put.message, 'web: done demo-001');
  assert.equal(put.sha, 'old-sha');
  assert.equal(put.branch, 'main');
  assert.equal(put.committer, undefined);
  const text = Buffer.from(put.content, 'base64').toString('utf8');
  assert.match(text, /^updated: \d{4}-\d{2}-\d{2}$/m);
  assert.match(text, /## Inbox\n\n- Idea, with ünïcode\.\n\n## Done\n\n### A card\n\n`id: demo-001` `priority: P1` `done: \d{4}-\d{2}-\d{2}`\n/);
});

test('inbox commits one line', async () => {
  repo.puts.length = 0;
  const res = await post('/api/brain/inbox', { project: 'demo', text: ' Buy  milk\n' }, { token: await sign({}) });
  assert.equal(res.status, 200);
  assert.equal(repo.puts[0].message, 'web: inbox demo');
  assert.match(Buffer.from(repo.puts[0].content, 'base64').toString('utf8'), /- Idea, with ünïcode\.\n- Buy milk\n$/);
});

test('tree and file can be pinned to one commit, ahead of a lagging branch head', async () => {
  const token = await sign({});
  const get = async (path) => {
    const res = await worker.default.fetch(new Request(`https://staldex.com${path}`, { headers: { 'Cf-Access-Jwt-Assertion': token } }), ENV);
    return { status: res.status, body: await res.json() };
  };
  worker._resetCaches();
  assert.equal((await get('/api/brain/tree')).body.commit.sha, 'abc1234def'); // head cached for 30 s
  const pinned = await get(`/api/brain/tree?commit=${PINNED}`);
  assert.equal(pinned.status, 200);
  assert.equal(pinned.body.commit.sha, PINNED);
  assert.equal(pinned.body.files.find((f) => f.path === 'projects/brain/STATE.md').sha, 's-state2');
  assert.deepEqual((await get(`/api/brain/file?path=projects/brain/STATE.md&commit=${PINNED}`)).body,
    { path: 'projects/brain/STATE.md', sha: 's-state2', text: '# State, newer' });
  assert.equal((await get('/api/brain/file?path=projects/brain/STATE.md')).body.text, '# State', 'unpinned reads the head');
  // The pinned commit applies the same readable-file allowlist.
  assert.equal((await get(`/api/brain/file?path=scripts/brain.py&commit=${PINNED}`)).status, 400);
  assert.equal((await get(`/api/brain/file?path=context/local-paths.json&commit=${PINNED}`)).status, 400);
  for (const bad of ['main', 'abc', PINNED.toUpperCase(), `${PINNED}0`, '../x']) {
    assert.equal((await get(`/api/brain/tree?commit=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
  assert.equal((await get(`/api/brain/tree?commit=${'f'.repeat(40)}`)).status, 404);
});

test('a pinned commit tree is fetched once and kept', async () => {
  const token = await sign({});
  worker._resetCaches();
  const get = (path) => worker.default.fetch(new Request(`https://staldex.com${path}`, { headers: { 'Cf-Access-Jwt-Assertion': token } }), ENV);
  const pinnedCalls = () => calls.filter((c) => c.url.endsWith(`/commits/${PINNED}`)).length;
  await get(`/api/brain/tree?commit=${PINNED}`);
  const before = pinnedCalls();
  await get(`/api/brain/file?path=projects/brain/STATE.md&commit=${PINNED}`);
  await get(`/api/brain/tree?commit=${PINNED}&fresh=1`);
  assert.equal(pinnedCalls(), before);
});

test('tree?fresh=1 skips the isolate cache', async () => {
  const token = await sign({});
  worker._resetCaches();
  const tree = (path) => worker.default.fetch(new Request(`https://staldex.com${path}`, { headers: { 'Cf-Access-Jwt-Assertion': token } }), ENV);
  const commitCalls = () => calls.filter((c) => c.url.endsWith('/commits/main')).length;
  await tree('/api/brain/tree');
  const before = commitCalls();
  await tree('/api/brain/tree');
  assert.equal(commitCalls(), before, 'cached');
  await tree('/api/brain/tree?fresh=1');
  assert.equal(commitCalls(), before + 1, 'refetched');
});

test('a stale sha is reported as 409 and never retried', async () => {
  for (const status of [409, 422]) {
    repo.puts.length = 0;
    repo.putStatus = status;
    const res = await post('/api/brain/inbox', { project: 'demo', text: 'x' }, { token: await sign({}) });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: 'changed elsewhere, refresh' });
    assert.equal(repo.puts.length, 1, 'exactly one attempt');
  }
  repo.putStatus = 500;
  assert.equal((await post('/api/brain/inbox', { project: 'demo', text: 'x' }, { token: await sign({}) })).status, 502);
  repo.putStatus = 200;
});
