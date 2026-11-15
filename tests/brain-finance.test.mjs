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
  assert.deepEqual(fin.reviewRows(TXN, { month: '2026-08' }).map((r) => r.id), ['T8', 'T6']);
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
