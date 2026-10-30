// Run: node --test tests/brain-time.test.mjs
// The viewer's task card writes (progress, close) and time writes (clock, hours) and the
// time read, with GitHub and the Access certs endpoint faked. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';

const worker = await import('../worker-brain/src/index.js');
const timelog = await import('../worker-brain/src/timelog.js');
const queue = await import('../worker-brain/src/queue.js');
const register = await import('../worker-brain/src/register.js');
const categorise = await import('../worker-brain/src/categorise.js');

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-tag';
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: 'ghp_test', BRAIN_REPO: 'LOriti/brain', BRAIN_REF: 'main' };
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function sign() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, email: 'owner@example.com' }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const TODAY = timelog.perthClock().date;
const QUEUE = '---\nproject: demo\ntype: queue\nupdated: 2030-01-01\n---\n\n# demo\n\n' +
  '### A card\n\n`id: DEV-01010.01` `priority: P1`\n\nOutcome: x.\n\n### Another\n\n`id: DEV-01010.02` `priority: P2`\n\nOutcome: y.\nProgress: 2030-01-01, old.\n\n## Inbox\n\n- Idea\n';
const REGISTER = '---\ntype: register\nupdated: 2030-01-01\n---\n\n# Open items\n\n' +
  '### New\n`id: P-DEV-01014.01` `kind: action` `state: open` `unconfirmed: 2030-01-14`\n\nSource: s\nNext: n.\n\n' +
  '### Open\n`id: DEV-01012.02` `kind: action` `state: open` `close-proposed: 2030-01-14`\n\nSource: s\nNext: n.\nEvidence: e.\n\n' +
  '### Choice\n`id: DEV-01012.03` `kind: decision` `state: open`\n\nSource: s\nNext: pick.\n';
const files = {
  'projects/demo/QUEUE.md': { ref: 'main', text: QUEUE, sha: 'q-sha', puts: [] },
  'register/open-items.md': { ref: 'main', text: REGISTER, sha: 'r-sha', puts: [] },
  [`logs/daily/${TODAY}.md`]: { ref: 'daily-log', text: null, sha: 'l-sha', puts: [] },
};
const LOG = `# Daily log ${TODAY}\n\n## 09:00 Brief\n\n| Kind | not a time table |\n\n## 10:00 Time\n\nFrom the command centre.\n\n` +
  '| Kind | Start | End | Minutes | Item | Area | Lens | Note |\n|---|---|---|---:|---|---|---|---|\n' +
  '| tracked | 09:00 | 09:45 | 45 | DEV-01010.01 | | brain | Card work |\n| planned | 11:00 | 12:00 | 60 | | 2 | work | Block |\n';

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const ok = (body, raw = false) => new Response(raw ? body : JSON.stringify(body), { status: 200 });
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return ok({ keys: [jwk] });
  if (url.endsWith('/repos/LOriti/brain/commits/daily-log')) return ok({ sha: 'd'.repeat(40), commit: { message: 'time', committer: { date: '2030-01-01T00:00:00Z' }, tree: { sha: 'logroot' } } });
  if (url.endsWith('/git/trees/logroot?recursive=1')) {
    return ok({ tree: [{ path: `logs/daily/${TODAY}.md`, type: 'blob', sha: 'log-blob', size: LOG.length }], truncated: false });
  }
  if (url.endsWith('/git/blobs/log-blob')) return ok(LOG, true);
  const match = url.match(/\/contents\/(.+?)\?ref=(.+)$/) || url.match(/\/contents\/(.+)$/);
  const file = match && files[decodeURIComponent(match[1])];
  if (file) {
    if ((init.method || 'GET') === 'GET') {
      if (match[2] && match[2] !== file.ref) return new Response('{}', { status: 404 });
      if (file.text === null) return new Response('{}', { status: 404 });
      return ok({ type: 'file', encoding: 'base64', size: file.text.length, sha: file.sha, content: Buffer.from(file.text).toString('base64') });
    }
    file.puts.push(JSON.parse(init.body));
    return ok({ content: { sha: 'new' }, commit: { sha: 'c'.repeat(40) } });
  }
  return new Response('nope', { status: 404 });
};

const HEADERS = { 'Content-Type': 'application/json', Origin: 'https://staldex.com', 'X-Brain-Write': '1' };
async function post(path, body) {
  worker._resetCaches();
  const res = await worker.default.fetch(new Request(`https://staldex.com${path}`, {
    method: 'POST', headers: { ...HEADERS, 'Cf-Access-Jwt-Assertion': await sign() }, body: JSON.stringify(body),
  }), ENV);
  return { status: res.status, body: await res.json() };
}
const written = (path) => Buffer.from(files[path].puts.at(-1).content, 'base64').toString('utf8');

// ---- pure transforms ---------------------------------------------------------------

test('card progress replaces the latest Progress line or adds one, and bumps updated', () => {
  const added = queue.cardProgress(QUEUE, 'DEV-01010.01', ' Drafted  it ', '2030-02-01');
  assert.match(added, /`id: DEV-01010\.01` `priority: P1`\n\nOutcome: x\.\nProgress: 2030-02-01, Drafted it\n\n### Another/);
  assert.match(added, /^updated: 2030-02-01$/m);
  const replaced = queue.cardProgress(QUEUE, 'DEV-01010.02', 'newer', '2030-02-01');
  assert.match(replaced, /Outcome: y\.\nProgress: 2030-02-01, newer\n\n## Inbox/);
  assert.doesNotMatch(replaced, /old\./);
  assert.throws(() => queue.cardProgress(QUEUE, 'DEV-09999.01', 'x', '2030-02-01'), { code: 'unknown-id' });
  assert.throws(() => queue.cardProgress(QUEUE, 'DEV-01010.01', '  ', '2030-02-01'), { code: 'invalid-text' });
});

test('item progress and close follow the register rules', () => {
  const progressed = register.itemProgress(REGISTER, 'DEV-01012.02', 'chased', '2030-02-01');
  assert.match(progressed, /Evidence: e\.\nProgress: 2030-02-01, chased\n\n### Choice/);
  const closed = register.closeItem(REGISTER, 'DEV-01012.02', 'Sent the reply.', '2030-02-01');
  assert.match(closed, /`id: DEV-01012\.02` `kind: action` `state: done`\n\nSource: s\nNext: n\.\nEvidence: Sent the reply \(Leon, in the viewer, 2030-02-01\)\.\n/);
  assert.throws(() => register.closeItem(REGISTER, 'P-DEV-01014.01', 'x', '2030-02-01'), { code: 'order' });
  assert.throws(() => register.closeItem(REGISTER, 'DEV-01012.03', 'x', '2030-02-01'), { code: 'decision' });
  assert.throws(() => register.closeItem(closed, 'DEV-01012.02', 'again', '2030-02-01'), { code: 'closed' });
});

test('time sections append like brain.py, and only Time tables are read back', () => {
  const row = { kind: 'entered', minutes: 90, area: '2', lens: 'work', note: 'a | b' };
  const fresh = timelog.appendTime('', '2030-01-02', '17:05', { ...row, note: timelog.cleanCell(row.note) });
  assert.match(fresh, /^# Daily log 2030-01-02\n\nAppend-only record/);
  assert.match(fresh, /\n\n## 17:05 Time\n\nFrom the viewer\.\n\n\| Kind \| Start .*\n\|---.*\n\| entered \|  \|  \| 90 \|  \| 2 \| work \| a \/ b \|\n$/);
  const appended = timelog.appendTime('# Daily log x\n\nbody\n\n\n', 'x', '18:00', { kind: 'tracked', minutes: 5 });
  assert.match(appended, /^# Daily log x\n\nbody\n\n## 18:00 Time\n/);
  const rows = timelog.parseTime(LOG, TODAY);
  assert.deepEqual(rows.map((r) => [r.kind, r.minutes, r.ref, r.area, r.lens]), [['tracked', 45, 'DEV-01010.01', '', 'brain'], ['planned', 60, '', '2', 'work']]);
});

test('clock and hours rows are validated', () => {
  const clock = timelog.perthClock(Date.parse('2030-01-02T10:30:00+08:00'));
  assert.deepEqual(clock, { date: '2030-01-02', hhmm: '10:30', ms: clock.ms });
  const base = { ref: 'DEV-01010.01', title: 'A card', area: '', lens: 'brain', start: '10:00' };
  assert.equal(timelog.clockRow({ ...base, action: 'start' }, clock).kind, 'started');
  const stop = timelog.clockRow({ ...base, action: 'stop', date: '2030-01-02' }, clock);
  assert.deepEqual([stop.kind, stop.start, stop.end, stop.minutes], ['tracked', '10:00', '10:30', 30]);
  const overnight = timelog.clockRow({ ...base, action: 'stop', date: '2030-01-01' }, clock);
  assert.equal(overnight.minutes, 720);
  assert.match(overnight.note, /started 2030-01-01, capped at 12 h/);
  assert.throws(() => timelog.clockRow({ ...base, action: 'start', start: '11:00' }, clock), /future/);
  assert.throws(() => timelog.clockRow({ ...base, action: 'start', ref: 'rm -rf' }, clock), /id/);
  assert.throws(() => timelog.clockRow({ ...base, action: 'start', area: '2', lens: 'brain' }, clock), /work only/);
  assert.equal(timelog.hoursRow({ minutes: 45, area: '3' }).lens, 'work');
  assert.throws(() => timelog.hoursRow({ minutes: 50, area: '3' }), /multiple of 15/);
  assert.throws(() => timelog.hoursRow({ minutes: 60 }), /area or lens/);
  const onTask = timelog.hoursRow({ minutes: 30, ref: 'DEV-01010.01', lens: 'brain', note: 'A card' });
  assert.deepEqual([onTask.ref, onTask.lens, onTask.note], ['DEV-01010.01', 'brain', 'A card']);
  assert.equal(timelog.hoursRow({ minutes: 30, ref: 'DEV-01010.01' }).ref, 'DEV-01010.01', 'a task with no lens still records');
  assert.throws(() => timelog.hoursRow({ minutes: 30, ref: 'x y' }), /id/);
});

// ---- endpoints -----------------------------------------------------------------------

test('progress writes a card (with project) or an item, as one web: commit on main', async () => {
  const card = await post('/api/brain/progress', { project: 'demo', id: 'DEV-01010.01', text: 'Half done' });
  assert.equal(card.status, 200);
  const put = files['projects/demo/QUEUE.md'].puts.at(-1);
  assert.deepEqual([put.message, put.sha, put.branch], ['web: progress DEV-01010.01', 'q-sha', 'main']);
  assert.match(written('projects/demo/QUEUE.md'), /Progress: \d{4}-\d{2}-\d{2}, Half done\n/);
  const item = await post('/api/brain/progress', { id: 'DEV-01012.02', text: 'Chased' });
  assert.equal(item.status, 200);
  assert.equal(files['register/open-items.md'].puts.at(-1).message, 'web: progress DEV-01012.02');
  assert.equal((await post('/api/brain/progress', { id: 'D-12', text: 'x' })).status, 400, 'decisions are not register items');
});

test('close settles an item with Evidence and refuses what a session must do', async () => {
  const res = await post('/api/brain/close', { id: 'DEV-01012.02', text: 'Replied' });
  assert.equal(res.status, 200);
  assert.equal(files['register/open-items.md'].puts.at(-1).message, 'web: close DEV-01012.02');
  assert.match(written('register/open-items.md'), /`id: DEV-01012\.02` `kind: action` `state: done`/);
  assert.deepEqual(await post('/api/brain/close', { id: 'P-DEV-01014.01', text: 'x' }), { status: 409, body: { error: 'confirm P-DEV-01014.01 itself first' } });
  assert.equal((await post('/api/brain/close', { id: 'DEV-01012.03', text: 'x' })).status, 409);
});

test('the clock creates today\'s log on daily-log, then appends to it', async () => {
  const path = `logs/daily/${TODAY}.md`;
  const start = await post('/api/brain/clock', { action: 'start', ref: 'DEV-01010.01', title: 'A card', lens: 'brain', start: '00:00' });
  assert.equal(start.status, 200);
  const created = files[path].puts.at(-1);
  assert.equal(created.branch, 'daily-log');
  assert.equal(created.sha, undefined, 'a new file is created without a sha');
  assert.match(created.message, /^time: \d{4}-\d{2}-\d{2} clock start DEV-01010\.01$/);
  assert.match(written(path), /^# Daily log .*\n[\s\S]*\| started \| 00:00 \|  \| 0 \| DEV-01010\.01 \|  \| brain \| A card \|\n$/);
  files[path].text = written(path);
  const stop = await post('/api/brain/clock', { action: 'stop', ref: 'DEV-01010.01', title: 'A card', lens: 'brain', start: '00:00', date: TODAY });
  assert.equal(stop.status, 200);
  assert.equal(files[path].puts.at(-1).sha, 'l-sha');
  assert.match(written(path), /\| started \|[\s\S]*\| tracked \| 00:00 \| \d{2}:\d{2} \| \d+ \| DEV-01010\.01 \|/);
  const hours = await post('/api/brain/hours', { minutes: 90, area: '2', note: 'Accounts' });
  assert.equal(hours.status, 200);
  assert.match(files[path].puts.at(-1).message, /hours 2$/);
  assert.equal((await post('/api/brain/hours', { minutes: 7, area: '2' })).status, 400);
  assert.equal(files['projects/demo/QUEUE.md'].puts.every((p) => p.branch === 'main'), true);
});

test('the one thing for today is a focal row on the daily log (Brain D-113 A)', async () => {
  const path = `logs/daily/${TODAY}.md`;
  files[path].text = written(path);
  const clock = timelog.perthClock(Date.parse('2030-01-02T10:30:00+08:00'));
  assert.deepEqual(timelog.focalRow({ ref: 'DEV-01010.01', lens: 'brain' }, clock), { kind: 'focal', start: '10:30', end: '', minutes: 0, ref: 'DEV-01010.01', area: '', lens: 'brain', note: '' });
  assert.equal(timelog.focalRow({ ref: '', lens: 'work' }, clock).ref, '', 'an empty item clears the pick');
  assert.throws(() => timelog.focalRow({ ref: 'rm -rf' }, clock), /id/);
  assert.throws(() => timelog.focalRow({ ref: 'DEV-01010.01', lens: 'nope' }, clock), /lens/);
  const set = await post('/api/brain/focal', { ref: 'DEV-01010.01', lens: 'brain' });
  assert.equal(set.status, 200);
  assert.match(files[path].puts.at(-1).message, /^time: \d{4}-\d{2}-\d{2} focal DEV-01010\.01$/);
  assert.equal(files[path].puts.at(-1).branch, 'daily-log');
  assert.match(written(path), /\| focal \| \d{2}:\d{2} \|  \| 0 \| DEV-01010\.01 \|  \| brain \|  \|\n$/);
  const rows = timelog.parseTime(written(path), TODAY);
  assert.equal(rows.at(-1).kind, 'focal');
  const clear = await post('/api/brain/focal', { ref: '', lens: 'brain' });
  assert.equal(clear.status, 200);
  assert.match(files[path].puts.at(-1).message, /focal cleared$/);
  assert.match(written(path), /\| focal \| \d{2}:\d{2} \|  \| 0 \|  \|  \| brain \|  \|\n$/);
  assert.equal((await post('/api/brain/focal', { ref: 42 })).status, 400);
  assert.equal((await post('/api/brain/focal', { ref: 'x y' })).status, 400);
});

test('time returns parsed rows from the daily-log branch only', async () => {
  worker._resetCaches();
  const res = await worker.default.fetch(new Request(`https://staldex.com/api/brain/time?from=${TODAY}`, {
    headers: { 'Cf-Access-Jwt-Assertion': await sign() },
  }), ENV);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.to, TODAY);
  assert.deepEqual(body.rows.map((r) => r.kind), ['tracked', 'planned']);
  assert.ok(!JSON.stringify(body).includes('Brief'), 'only rows leave the Worker');
  const bad = await worker.default.fetch(new Request('https://staldex.com/api/brain/time?from=2999-01-01', {
    headers: { 'Cf-Access-Jwt-Assertion': await sign() },
  }), ENV);
  assert.equal(bad.status, 400);
});

test('categorise: details are checked, then land on an Inbox line or a register item', async () => {
  assert.throws(() => categorise.cleanDetails({ next: 'x', family: 'work' }), /family/);
  assert.throws(() => categorise.cleanDetails({ next: 'x', family: 'WORK-SYS', minutes: 45 }), /half hours/);
  assert.throws(() => categorise.cleanDetails({ family: 'WORK-SYS' }), /next step/);
  const d = categorise.cleanDetails({ title: 'Ask `Bob`', next: 'Ring | him', family: 'DEV', priority: 'P2', minutes: '60', owner: 'Leon' });
  assert.deepEqual([d.title, d.next, d.minutes, d.owner], ["Ask 'Bob'", "Ring ' him", 60, 'leon']);
  const res = await post('/api/brain/categorise', { project: 'demo', line: 'Idea', details: { next: 'Write it up', family: 'DEV', priority: 'P2', minutes: 30 } });
  assert.equal(res.status, 200);
  assert.equal(files['projects/demo/QUEUE.md'].puts.at(-1).message, 'web: categorise inbox demo');
  assert.match(written('projects/demo/QUEUE.md'), /- Idea `categorised: \d{4}-\d{2}-\d{2}` `family: DEV` `priority: P2` `minutes: 30` `owner: leon` `next: Write it up`\n$/);
  assert.equal((await post('/api/brain/categorise', { project: 'demo', line: 'Gone', details: { next: 'x', family: 'DEV' } })).status, 404);
  const item = await post('/api/brain/categorise', { id: 'P-DEV-01014.01', details: { next: 'Do it', family: 'DEV', owner: 'leon', due: '2030-02-01', minutes: 90 } });
  assert.equal(item.status, 200);
  assert.match(written('register/open-items.md'), /`id: DEV-01014\.01` `kind: action` `state: open` `owner: leon` `due: 2030-02-01` `minutes: 90`\n\nSource: s\nNext: Do it\n/);
});

test('a register decision is decided with Leon\'s outcome (Brain D-111 A)', () => {
  const decided = register.decideItem(REGISTER, 'DEV-01012.03', 'Moved the lunch to Friday.', '2030-02-01');
  assert.match(decided, /`id: DEV-01012\.03` `kind: decision` `state: done`/);
  assert.match(decided, /\nCorrection: Decided 2030-02-01: Moved the lunch to Friday \(Leon, in the viewer\)\.\n/);
  assert.throws(() => register.decideItem(REGISTER, 'DEV-01012.02', 'x', '2030-02-01'), { code: 'decision' });
  assert.throws(() => register.decideItem(REGISTER, 'P-DEV-01014.01', 'x', '2030-02-01'), { code: 'order' });
  assert.throws(() => register.decideItem(decided, 'DEV-01012.03', 'again', '2030-02-01'), { code: 'closed' });
});
