// Run: node --test tests/brain-finance.test.mjs
// The Finance tab (Brain DEV-61115.01): its calculations on synthetic figures, and the
// Worker route that serves the published figures from KV behind Access. No real data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';

const fin = await import('../site/brain/finance/finance.js');
const worker = await import('../worker-brain/src/index.js');

// ---- synthetic figures ----------------------------------------------------------------

const t = (id, date, group, category, amount, extra = {}) => ({
  id, date, month: date.slice(0, 7), account: extra.account || 'Bank A ••0001', owner: 'Owner', description: `Shop ${id}`,
  amount, balance: null, category, group, note: '', ...extra,
});
const TXN = [
  t('T1', '2026-07-03', 'Living', 'Food', -500),
  t('T2', '2026-07-20', 'Money in', 'Wages', 4000),
  t('T3', '2026-08-02', 'Living', 'Food', -700),
  t('T4', '2026-08-05', 'Living', 'Fun', -100, { account: 'Card B ••0002' }),
  t('T5', '2026-08-09', 'Housing', 'Repairs', -1200),
  t('T6', '2026-08-10', 'To sort', 'To sort', -80, { note: 'Who is this?' }),
  t('T7', '2026-08-11', 'Own accounts', 'Transfer', -900),
  t('T8', '2026-08-15', 'Living', 'Clothes', -50, { note: 'Refund due' }),
  t('T9', '2026-08-15', 'Living', 'Food', 20),
];
const DOC = {
  schema: 'brain-finance/1', published: '2026-08-16T02:00:00Z',
  transactions: { rows: TXN, meta: [{ label: 'categorise.py', value: 'RULES = []', type: 'code', lang: 'python' }] },
  budget: { rows: [{ category: 'Food', monthly_budget: 1000 }, { category: 'Fun', monthly_budget: 100 }], meta: [] },
  accounts: { rows: [
    { account: 'Bank A ••0001', owner: 'Owner', type: 'Transaction', status: 'Loaded', loaded_to: '2026-08-15', latest_balance: 10000, offset: 'No', note: '' },
    { account: 'Offset ••0003', owner: 'Owner', type: 'Transaction', status: 'Loaded', loaded_to: '2026-08-15', latest_balance: 5000, offset: 'Yes', note: '' },
  ], meta: [] },
  loans: { rows: [{ loan: 'Home ••0009', status: 'Open', balance: 500000, rate: 6, repayment_now: 3000, repayment_from_15_dec: 3100, last_interest: 2500, note: '' }], meta: [] },
};

// ---- calculations ---------------------------------------------------------------------

test('the latest month is shown unless the hash says otherwise', () => {
  const months = fin.monthsOf(TXN);
  assert.deepEqual(months, ['2026-07', '2026-08']);
  assert.equal(fin.readParams('', months).month, '2026-08');
  assert.equal(fin.readParams('#m=all', months).month, null);
  assert.equal(fin.readParams('#m=2026-07&a=Card%20B&c=Food', months).month, '2026-07');
  assert.equal(fin.readParams('#m=1999-01', months).month, '2026-08', 'an unknown month falls back to the latest');
  assert.equal(fin.writeParams({ month: null, account: 'X Y', group: null, category: 'Food' }), '#m=all&a=X+Y&c=Food');
});

test('a part month carries the share of the month the statements cover', () => {
  const p = fin.period(TXN, { month: '2026-08' });
  assert.equal(p.from, '2026-08-01');
  assert.equal(p.to, '2026-08-15');
  assert.equal(p.months, 1);
  assert.ok(Math.abs(p.share - 15 / 31) < 1e-9);
  assert.equal(p.complete, false);
  assert.equal(fin.period(TXN, { month: '2026-07' }).complete, true);
  const all = fin.period(TXN, {});
  assert.equal(all.share, 1);
  assert.equal(all.from, '2026-07-03');
});

test('totals leave moves between own accounts out', () => {
  const tot = fin.totals(TXN, { month: '2026-08' });
  assert.deepEqual(tot, { money_in: 0, living: 830, housing: 1200, to_sort: 80, to_sort_rows: 1, flagged_rows: 1 });
  assert.equal(fin.totals(TXN, { month: '2026-08', account: 'Card B ••0002' }).living, 100);
});

test('budget against actual: refunds net off, over and ahead of pace flagged, a total row', () => {
  const p = { month: '2026-08' };
  const b = fin.budgetRows(TXN, DOC.budget.rows, p, fin.period(TXN, p));
  const food = b.rows.find((r) => r.category === 'Food');
  assert.equal(food.actual, 680, 'a refund nets off the spend');
  assert.equal(food.status, 'ahead of pace', '68% used with 48% of the month gone');
  assert.equal(b.rows.find((r) => r.category === 'Fun').status, 'ahead of pace');
  assert.equal(b.rows.find((r) => r.category === 'Clothes').status, 'no budget');
  assert.equal(b.total.budget, 1100);
  assert.equal(b.total.actual, 830);
  assert.equal(fin.status(100, 120, 0.5), 'over');
  assert.equal(fin.status(100, 55, 0.5), 'ok');
  assert.equal(fin.status(100, 0, 0.5), '');
  const all = fin.budgetRows(TXN, DOC.budget.rows, {}, fin.period(TXN, {}));
  assert.ok(all.rows.find((r) => r.category === 'Food').budget > 1000, 'the year to date budgets every month in it');
});

test('by month and by category', () => {
  const m = fin.monthly(TXN, {});
  assert.deepEqual(m.map((r) => r.month), ['2026-07', '2026-08']);
  assert.deepEqual(m[0], { month: '2026-07', money_in: 4000, living: 500, housing: 0, to_sort: 0 });
  const c = fin.byCategory(TXN, { month: '2026-08' });
  assert.deepEqual(c.map((r) => r.category), ['Repairs', 'Food', 'Fun', 'To sort', 'Clothes']);
  assert.ok(!c.some((r) => r.category === 'Transfer'), 'own-account moves are not money out');
  assert.deepEqual(fin.byCategory(TXN, { group: 'Own accounts' }).map((r) => r.category), ['Transfer']);
});

test('cash outside an offset and what it costs', () => {
  assert.deepEqual(fin.cashOffset(DOC.accounts.rows, DOC.loans.rows), { cash: 10000, rate: 6, loan: 'Home ••0009', interest_a_year: 600 });
});

test('the review list and the transaction search', () => {
  assert.deepEqual(fin.reviewRows(TXN, { month: '2026-08' }).map((r) => r.id), ['T6', 'T8'], 'to sort first, then flagged');
  assert.deepEqual(fin.waiting(TXN), { to_sort: 1, flagged: 1 });
  // Kept or allocated on the tab: the row is settled and leaves the list.
  const t8 = TXN.find((r) => r.id === 'T8');
  const kept = fin.applyRulings(TXN, { items: { T8: { id: 'T8', fp: { date: t8.date, amount: t8.amount, description: t8.description, account: t8.account }, category: 'Clothes', group: 'Living' } } });
  assert.deepEqual(fin.reviewRows(kept, { month: '2026-08' }).map((r) => r.id), ['T6']);
  assert.equal(fin.settledRows(kept, { month: '2026-08' }).length, 1);
  assert.deepEqual(fin.waiting(kept), { to_sort: 1, flagged: 0 });
  assert.deepEqual(fin.txnRows(TXN, {}, 'refund due').map((r) => r.id), ['T8'], 'the search reads the note');
  assert.deepEqual(fin.txnRows(TXN, { month: '2026-08' }, 'shop t4').map((r) => r.id), ['T4']);
  assert.equal(fin.txnRows(TXN, {}).length, TXN.length);
});

test('the page escapes what the data says', () => {
  const doc = { ...DOC, transactions: { ...DOC.transactions, rows: [...TXN, t('T10', '2026-08-15', 'Living', '<img src=x onerror=alert(1)>', -5)] } };
  const html = fin.pageHtml(doc, fin.model(doc, { month: '2026-08' }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.match(html, /id="tiles"/);
  assert.match(html, /id="budget"/);
  assert.match(html, /categorise\.py/);
});

// ---- the Worker route -----------------------------------------------------------------

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'brain-aud';
const FIN_AUD = 'finance-aud';
const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function sign(claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64url(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, email: 'owner@example.com', ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const github = [];
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }));
  github.push(url);
  return new Response('{}', { status: 404 });
};
const kv = (value) => ({ get: async (key, type) => (key === 'finance' && value != null ? (type === 'json' ? value : JSON.stringify(value)) : null) });
const BASE = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: 'ghp_test', BRAIN_REPO: 'LOriti/brain' };
const call = async (path, env, token) => worker.default.fetch(new Request(`https://staldex.com${path}`, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} }), env);

test('Finance serves the published figures to a signed-in viewer, never cached', async () => {
  const res = await call('/api/brain/finance', { ...BASE, FINANCE: kv(DOC) }, await sign({}));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.transactions.rows.length, TXN.length);
  assert.equal(body.viewer, 'owner@example.com');
  assert.equal(github.length, 0, 'Finance never reads GitHub');
});

test('Finance fails closed', async () => {
  assert.equal((await call('/api/brain/finance', { ...BASE, FINANCE: kv(DOC) })).status, 401, 'no token');
  assert.equal((await call('/api/brain/finance', { ...BASE, FINANCE: kv(DOC) }, await sign({ aud: ['other'] }))).status, 401);
  assert.equal((await call('/api/brain/finance', { ...BASE, ACCESS_AUD: '', FINANCE: kv(DOC) }, await sign({}))).status, 503, 'Access not set up');
  assert.equal((await call('/api/brain/finance', BASE, await sign({}))).status, 503, 'no store bound');
  assert.equal((await call('/api/brain/finance', { ...BASE, FINANCE: kv(null) }, await sign({}))).status, 404, 'nothing published');
  assert.equal((await call('/api/brain/finance', { ...BASE, FINANCE: kv({ schema: 'x' }) }, await sign({}))).status, 502, 'malformed');
  const { GITHUB_TOKEN, ...noGithub } = BASE;
  assert.equal((await call('/api/brain/finance', { ...noGithub, FINANCE: kv(DOC) }, await sign({}))).status, 200, 'no GitHub token needed');
  const post = await worker.default.fetch(new Request('https://staldex.com/api/brain/finance', { method: 'POST', body: '{}' }), { ...BASE, FINANCE: kv(DOC) });
  assert.equal(post.status, 405, 'read only');
});

test('a Finance-only sign-in reaches Finance and nothing else (Brain D-148 A)', async () => {
  const env = { ...BASE, FINANCE: kv(DOC), FINANCE_ACCESS_AUD: FIN_AUD, FINANCE_ALLOWED_EMAILS: 'partner@example.com' };
  const partner = await sign({ aud: [FIN_AUD], email: 'partner@example.com' });
  assert.equal((await call('/api/brain/finance', env, partner)).status, 200);
  assert.equal((await call('/api/brain/tree', env, partner)).status, 401, 'Brain itself stays closed to her');
  assert.equal((await call('/api/brain/file?path=INDEX.md', env, partner)).status, 401);
  const stranger = await sign({ aud: [FIN_AUD], email: 'someone@example.com' });
  assert.equal((await call('/api/brain/finance', env, stranger)).status, 401, 'the Finance allowlist applies');
  const { FINANCE_ACCESS_AUD, ...unset } = env;
  assert.equal((await call('/api/brain/finance', unset, partner)).status, 401, 'no Finance app configured: only Brain tokens');
});

// ---- category codes and allocations (Brain D-152 A, D-155) ---------------------------------

const fw = await import('../worker-brain/src/finance.js');
const CATS = { rows: [
  { code: 'IN-1', category: 'Wages', group: 'Money in' },
  { code: 'H-1', category: 'Repairs', group: 'Housing' },
  { code: 'FOO-1', category: 'Food', group: 'Living' },
  { code: 'ENT-2', category: 'Clothes', group: 'Living' },
  { code: 'ENT-1', category: 'Fun', group: 'Living' },
  { code: 'T-1', category: 'Transfer', group: 'Own accounts' },
  { code: 'XXX-1', category: 'To sort', group: 'To sort' },
], groups: [
  { code: 'IN', name: 'Money in' }, { code: 'H', name: 'House' }, { code: 'FOO', name: 'Food' },
  { code: 'ENT', name: 'Entertainment' }, { code: 'T', name: 'Between own accounts' }, { code: 'XXX', name: 'To sort' },
], meta: [] };

test('codes come from the published list, ordered by tier then rank; gaps get a made-up code', () => {
  const reg = fin.registry({ ...DOC, categories: CATS });
  assert.deepEqual(reg.map((r) => r.code), ['IN-1', 'H-1', 'FOO-1', 'ENT-1', 'ENT-2', 'T-1', 'XXX-1'], 'in the published group order');
  const bare = fin.registry(DOC);
  assert.equal(fin.tierOf(bare.find((r) => r.category === 'Food').code), 'L', 'without a list, living costs fall under L');
  assert.equal(bare.find((r) => r.category === 'Wages').code, 'IN-1');
  assert.equal(bare.find((r) => r.category === 'Transfer').code, 'T-1');
  const m = fin.model({ ...DOC, categories: CATS }, { month: '2026-08' });
  assert.deepEqual(m.budget.rows.map((r) => r.category), ['Food', 'Fun', 'Clothes'], 'budget rows run in order of importance');
});

test('a code or part of a name finds a category', () => {
  const reg = fin.registry({ ...DOC, categories: CATS });
  assert.deepEqual(fin.pickOptions(reg, 'ent-1').map((r) => r.category), ['Fun']);
  assert.deepEqual(fin.pickOptions(reg, 'ENT1').map((r) => r.category), ['Fun'], 'the dash is optional');
  assert.deepEqual(fin.pickOptions(reg, 'ent').map((r) => r.code), ['ENT-1', 'ENT-2']);
  assert.deepEqual(fin.pickOptions(reg, 't').map((r) => r.code), ['T-1'], 'a group code shows that group alone');
  assert.deepEqual(fin.pickOptions(reg, 'xxx').map((r) => r.code), ['XXX-1']);
  assert.deepEqual(fin.pickOptions(reg, 'cloth').map((r) => r.code), ['ENT-2']);
  assert.equal(fin.pickOptions(reg, '').length, reg.length);
});

test('an allocation moves the row, carries who made it, and is undone cleanly', () => {
  const doc = { ...DOC, categories: CATS };
  const t6 = TXN.find((r) => r.id === 'T6');
  let rulings = fw.allocate(doc, null, { id: 'T6', fp: fw.fingerprint(t6), category: 'Fun', note: ' a  gift ', like: true }, { email: 'partner@example.com' }, new Date('2026-11-16T00:00:00Z'));
  assert.deepEqual(rulings.items.T6, { id: 'T6', fp: fw.fingerprint(t6), from: { category: 'To sort', group: 'To sort' }, category: 'Fun', group: 'Living', code: 'ENT-1', note: 'a gift', like: true, by: 'partner@example.com', at: '2026-11-16T00:00:00.000Z' });
  const view = fin.viewOf({ ...doc, rulings });
  const moved = view.transactions.rows.find((r) => r.id === 'T6');
  assert.equal(moved.group, 'Living');
  assert.equal(moved.ruled.by, 'partner@example.com');
  assert.equal(fin.totals(view.transactions.rows, { month: '2026-08' }).to_sort, 0);
  rulings = fw.allocate(doc, rulings, { id: 'T6', fp: fw.fingerprint(t6), clear: true }, { email: 'owner@example.com' });
  assert.deepEqual(rulings.items, {});
});

test('an allocation is refused for a changed row, an unknown category or a bad id; a stale one is ignored', () => {
  const doc = { ...DOC, categories: CATS };
  const t6 = TXN.find((r) => r.id === 'T6');
  const err = (body) => { try { fw.allocate(doc, null, body, {}); return null; } catch (e) { return e.status; } };
  assert.equal(err({ id: 'T6', fp: { ...fw.fingerprint(t6), amount: 1 }, category: 'Fun' }), 409);
  assert.equal(err({ id: 'T6', fp: fw.fingerprint(t6), category: 'Nope' }), 400);
  assert.equal(err({ id: '../x', fp: {}, category: 'Fun' }), 400);
  assert.equal(err({ id: 'T99', fp: {}, category: 'Fun' }), 404);
  assert.equal(err({ id: 'T6', fp: fw.fingerprint(t6), category: 'Fun', note: 'x'.repeat(201) }), 400);
  const stale = { items: { T6: { id: 'T6', fp: { ...fw.fingerprint(t6), description: 'other' }, category: 'Fun', group: 'Living' } } };
  assert.equal(fin.applyRulings(TXN, stale).find((r) => r.id === 'T6').category, 'To sort', 'a ruling for a renumbered row moves nothing');
});

test('spending on lines with no budget is named beside the total', () => {
  const b = fin.budgetRows(TXN, DOC.budget.rows, { month: '2026-08' }, fin.period(TXN, { month: '2026-08' }));
  assert.equal(b.total.unbudgeted, 50);
  assert.equal(b.total.unbudgeted_rows, 1);
  const html = fin.pageHtml(DOC, fin.model(DOC, { month: '2026-08' }));
  assert.match(html, /1 category with no budget line/);
});

test('a flagged row can be kept as it is; an unflagged one cannot be saved unchanged', () => {
  const doc = { ...DOC, categories: CATS };
  const reg = fin.registry(doc);
  const codes = new Map(reg.map((r) => [r.category, r.code]));
  const save = (row) => fin.sheetHtml(row, reg, codes).match(/<button[^>]*data-sheet="save"[^>]*>[^<]*/)[0];
  assert.match(save(TXN.find((r) => r.id === 'T8')), /Keep in/);
  assert.doesNotMatch(save(TXN.find((r) => r.id === 'T8')), /disabled/);
  assert.match(save(TXN.find((r) => r.id === 'T1')), /disabled/);
  assert.match(save(TXN.find((r) => r.id === 'T6')), /disabled/, 'a to-sort row needs a category');
});

test('the Brain link shows only to someone who can open Brain', () => {
  const m = fin.model(DOC, { month: '2026-08' });
  assert.match(fin.pageHtml({ ...DOC, brain: true }, m), /Brain ↗/);
  assert.doesNotMatch(fin.pageHtml({ ...DOC, brain: false }, m), /Brain ↗/);
});

test('the sheet escapes what the data says', () => {
  const doc = { ...DOC, categories: CATS };
  const reg = fin.registry(doc);
  const row = { ...TXN[0], description: '<script>x</script>' };
  const html = fin.sheetHtml(row, reg, new Map(reg.map((r) => [r.category, r.code])), { q: '"><b>' });
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('"><b>'));
});

const kvRw = (doc) => {
  const store = new Map([['finance', JSON.stringify(doc)]]);
  return { store, get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null), put: async (k, v) => { store.set(k, v); } };
};
const post = (path, env, token, body, headers = {}) => worker.default.fetch(new Request(`https://staldex.com${path}`, {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', Origin: 'https://staldex.com', 'X-Brain-Write': '1', ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers },
}), env);

test('the allocate route saves for Brain and Finance-only sign-ins and serves the rulings back', async () => {
  const FINANCE = kvRw({ ...DOC, categories: CATS });
  const env = { ...BASE, FINANCE, FINANCE_ACCESS_AUD: FIN_AUD };
  const t6 = TXN.find((r) => r.id === 'T6');
  const partner = await sign({ aud: [FIN_AUD], email: 'partner@example.com' });
  const res = await post('/api/brain/finance/allocate', env, partner, { id: 'T6', fp: fw.fingerprint(t6), category: 'Fun' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).rulings.items.T6.by, 'partner@example.com');
  const got = await (await call('/api/brain/finance', env, await sign({}))).json();
  assert.equal(got.rulings.items.T6.category, 'Fun');
  assert.equal(got.brain, true);
  assert.equal((await (await call('/api/brain/finance', env, partner)).json()).brain, false, 'a Finance-only sign-in is told it has no Brain');
  // Keeping a flagged row where it is is a ruling too.
  const t8 = TXN.find((r) => r.id === 'T8');
  const keep = await post('/api/brain/finance/allocate', env, partner, { id: 'T8', fp: fw.fingerprint(t8), category: 'Clothes' });
  assert.equal(keep.status, 200);
  assert.equal((await keep.json()).rulings.items.T8.from.category, 'Clothes');
  assert.equal(JSON.parse(FINANCE.store.get('finance')).transactions.rows.find((r) => r.id === 'T6').category, 'To sort', 'the published figures are untouched');
  assert.equal((await post('/api/brain/finance/allocate', env, partner, { id: 'T6', fp: fw.fingerprint(t6), category: 'Fun' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/brain/finance/allocate', env, null, { id: 'T6', fp: fw.fingerprint(t6), category: 'Fun' })).status, 401);
  assert.equal((await post('/api/brain/done', env, partner, { project: 'x', id: 'DEV-61115.01' })).status, 401, 'a Finance-only sign-in still writes nothing else');
  assert.equal((await post('/api/brain/finance/allocate', env, partner, { id: 'T6', fp: fw.fingerprint(t6), category: 'Nope' })).status, 400);
  const get = await worker.default.fetch(new Request('https://staldex.com/api/brain/finance/allocate'), env);
  assert.equal(get.status, 405);
});

// ---- the Business group (Brain DEV-61121.01) ----------------------------------------------

const BUS_CATS = { ...CATS, rows: [...CATS.rows,
  { code: 'BUS-1', category: 'Acme expenses to forward', group: 'Business' },
  { code: 'BUS-2', category: 'Beta expenses to forward', group: 'Business' },
  { code: 'BUS-3', category: 'Gamma expenses to forward', group: 'Business' },
  { code: 'BUS-4', category: 'Business - personal', group: 'Business' },
], groups: [...CATS.groups.slice(0, -2), { code: 'BUS', name: 'Business' }, ...CATS.groups.slice(-2)] };
const BUS_TXN = [...TXN,
  t('B1', '2026-08-03', 'Business', 'Acme expenses to forward', -300),
  t('B2', '2026-08-04', 'Business', 'Acme expenses to forward', -45.5),
  t('B3', '2026-08-06', 'Business', 'Acme expenses to forward', 100),
  t('B4', '2026-08-07', 'Business', 'Beta expenses to forward', -60),
  t('B5', '2026-08-08', 'Business', 'Business - personal', -25),
  t('B6', '2026-07-08', 'Business', 'Beta expenses to forward', -999),
];
const BUS_DOC = { ...DOC, transactions: { ...DOC.transactions, rows: BUS_TXN }, categories: BUS_CATS };

test('Business shows the period total owed back per business; Business - personal is shown but not to forward', () => {
  const m = fin.model(BUS_DOC, { month: '2026-08' });
  const b = m.business;
  assert.deepEqual(b.rows.map((r) => [r.code, r.out, r.back, r.owed, r.forward]), [
    ['BUS-1', 345.5, 100, 245.5, true], ['BUS-2', 60, 0, 60, true], ['BUS-3', 0, 0, 0, true], ['BUS-4', 25, 0, 25, false],
  ], 'every listed business shows, in code order, with only August counted');
  assert.equal(b.to_forward, 305.5);
  assert.equal(b.personal, 25);
  assert.equal(fin.model(BUS_DOC, { month: null }).business.to_forward, 1304.5, 'the year to date takes July too');
  const html = fin.pageHtml(BUS_DOC, m);
  assert.match(html, /id="business"/);
  assert.match(html, /\$306 to forward/);
  assert.match(html, /Not to forward/);
  assert.match(html, /data-jump="business"/, 'the section bar links to it');
  assert.match(html, /data-group="Business"/, 'and it has a chip of its own');
});

test('Business stays out of living costs, the budget, houses and where the money went', () => {
  const p = { month: '2026-08' };
  const before = fin.model({ ...DOC, categories: CATS }, p), after = fin.model(BUS_DOC, p);
  assert.deepEqual(after.totals, before.totals);
  assert.deepEqual(after.budget.total, before.budget.total);
  assert.deepEqual(after.byCategory, before.byCategory);
  assert.deepEqual(after.monthly, before.monthly);
  assert.deepEqual(fin.byCategory(BUS_TXN, { ...p, group: 'Business' }).map((r) => r.category), ['Acme expenses to forward', 'Beta expenses to forward', 'Business - personal'], 'the chip shows them');
  assert.equal(fin.pageHtml({ ...DOC, categories: CATS }, before).includes('id="business"'), false, 'no Business section when there are no Business categories');
});

test('allocating from the tab offers the BUS categories under Business, and an older allocation follows its category to Business', () => {
  const reg = fin.registry(BUS_DOC);
  assert.deepEqual(fin.pickOptions(reg, 'bus').map((r) => r.code), ['BUS-1', 'BUS-2', 'BUS-3', 'BUS-4']);
  const t6 = TXN.find((r) => r.id === 'T6');
  const sheet = fin.sheetHtml(t6, reg, new Map(reg.map((r) => [r.category, r.code])), { groups: fin.groupsOf(BUS_DOC) });
  assert.match(sheet, /<h4>Business<\/h4><button[^>]*data-pick="Acme expenses to forward"/);
  const rulings = fw.allocate(BUS_DOC, null, { id: 'T6', fp: fw.fingerprint(t6), category: 'Gamma expenses to forward' }, { email: 'owner@example.com' });
  assert.equal(rulings.items.T6.group, 'Business', 'the Worker files it under Business');
  // Allocated while the category still sat in another group: it shows under the group it has now.
  const old = { items: { T6: { ...rulings.items.T6, group: 'Own accounts' } } };
  const view = fin.viewOf({ ...BUS_DOC, rulings: old });
  assert.equal(view.transactions.rows.find((r) => r.id === 'T6').group, 'Business');
  assert.equal(fin.model(view, { month: '2026-08' }).business.rows.find((r) => r.code === 'BUS-3').owed, 80);
  assert.equal(fin.registry({ ...DOC, transactions: { ...DOC.transactions, rows: BUS_TXN } }).find((r) => r.category === 'Business - personal').code.startsWith('BUS-'), true, 'without a list, Business falls under BUS');
});
