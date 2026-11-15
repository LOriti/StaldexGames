// The Finance tab's data (Brain DEV-61115.01, D-147 A, D-148 A).
//
// The figures never touch a git repository. Each monthly close publishes one JSON document
// into the private Workers KV namespace bound as FINANCE (key `finance`), and this route
// serves it back behind Cloudflare Access. The page draws it; nothing is cached anywhere.
//
// Access: Leon's Brain application (ACCESS_AUD) reaches Finance as it reaches the rest of
// Brain. A second application for the Finance tab alone (FINANCE_ACCESS_AUD, optionally
// narrowed by FINANCE_ALLOWED_EMAILS) lets someone see Finance and nothing else: its tokens
// are accepted on this route only, never on Brain's own reads and writes.

export const FINANCE_KEY = 'finance';
export const FINANCE_SCHEMA = 'brain-finance/1';
export const FINANCE_PARTS = ['transactions', 'budget', 'accounts', 'loans'];

function configured(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'REPLACE_ME';
}

// The Access configurations whose tokens may read Finance: Brain's own, then Finance's own.
export function financeConfigs(brainCfg, env) {
  const out = brainCfg ? [brainCfg] : [];
  if (brainCfg && configured(env.FINANCE_ACCESS_AUD)) {
    const allowed = (env.FINANCE_ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    out.push({ teamDomain: brainCfg.teamDomain, aud: env.FINANCE_ACCESS_AUD.trim(), allowed });
  }
  return out;
}

// A published document is served only if it has the expected shape, so a bad publish
// shows as an error on the page rather than as a half-drawn tab.
export function validFinance(doc) {
  return Boolean(doc) && doc.schema === FINANCE_SCHEMA && typeof doc.published === 'string'
    && FINANCE_PARTS.every((p) => doc[p] && Array.isArray(doc[p].rows));
}

// ---- allocations made on the tab (Brain D-152 A) -----------------------------------------
//
// Leon and Rahana can move any transaction to another category from the tab. Each move is
// kept in a second KV key, `finance-rulings`, beside the published document, and the page
// lays it over the figures at once. The next monthly close turns them into categoriser rules
// and clears them. A ruling carries the transaction's date, amount, description and
// account, and is applied only while they still match, so a re-close that renumbers ids
// never moves the wrong row.

export const RULINGS_KEY = 'finance-rulings';
export const RULINGS_SCHEMA = 'brain-finance-rulings/1';
const TXN_ID = /^[A-Za-z0-9_-]{1,24}$/;
const NOTE_MAX = 200;

export class FinanceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const emptyRulings = () => ({ schema: RULINGS_SCHEMA, items: {} });

export const fingerprint = (r) => ({ date: r.date, amount: r.amount, description: r.description, account: r.account });
const sameFp = (a, b) => Boolean(a && b) && a.date === b.date && a.amount === b.amount && a.description === b.description && a.account === b.account;

// The categories a row may move to: the published list, else every category the figures use.
export function categoryList(doc) {
  const rows = doc.categories && Array.isArray(doc.categories.rows) ? doc.categories.rows : null;
  if (rows && rows.length) return rows.map((r) => ({ code: r.code || '', category: r.category, group: r.group }));
  const seen = new Map();
  for (const r of doc.transactions.rows) if (!seen.has(r.category)) seen.set(r.category, { code: '', category: r.category, group: r.group });
  return Array.from(seen.values());
}

// Pure: the rulings after one allocation (or its undo). Throws FinanceError for bad input.
export function allocate(doc, rulings, body, viewer, now = new Date()) {
  if (!body || typeof body !== 'object' || !TXN_ID.test(String(body.id || ''))) throw new FinanceError(400, 'bad id');
  const row = doc.transactions.rows.find((r) => r.id === body.id);
  if (!row) throw new FinanceError(404, 'no such transaction');
  if (!sameFp(fingerprint(row), body.fp)) throw new FinanceError(409, 'changed elsewhere, refresh');
  const out = { schema: RULINGS_SCHEMA, items: { ...(rulings && rulings.items) } };
  if (body.clear === true) {
    delete out.items[body.id];
    return out;
  }
  const cat = categoryList(doc).find((c) => c.category === body.category);
  if (!cat) throw new FinanceError(400, 'unknown category');
  const note = typeof body.note === 'string' ? body.note.replace(/\s+/g, ' ').trim() : '';
  if (note.length > NOTE_MAX) throw new FinanceError(400, 'note too long');
  out.items[body.id] = {
    id: row.id, fp: fingerprint(row), from: { category: row.category, group: row.group },
    category: cat.category, group: cat.group, code: cat.code, note, like: body.like === true,
    by: viewer && viewer.email ? viewer.email : '', at: now.toISOString(),
  };
  return out;
}
