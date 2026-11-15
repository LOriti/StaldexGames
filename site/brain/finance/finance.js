// Finance tab (Brain DEV-61115.01, D-147 A): the Finance Desk drawn from the figures a
// monthly close publishes to a private Cloudflare store. This file is code only; every
// figure arrives from /api/brain/finance behind Cloudflare Access.
//
// The calculations are exported and free of the DOM so the tests can run them on
// synthetic data (tests/brain-finance.test.mjs). No imports.

// ---- calculations ----------------------------------------------------------------------

const DAY = 86400000;
const r2 = (v) => Math.round(v * 100) / 100 + 0; // + 0 turns −0 into 0
const sum = (rows, f) => rows.reduce((s, r) => s + (+f(r) || 0), 0);
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY) + 1;
export const daysInMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();

// Groups that are spending of one kind or another. Moves between own accounts, money in and
// loan proceeds are not money out.
export const HOUSING = ['Housing', 'Property deals'];
const NOT_OUT = ['Own accounts', 'Money in', 'Loan proceeds'];

export function monthsOf(txn) {
  return Array.from(new Set(txn.map((r) => r.month))).sort();
}

export function inView(r, p, skip = {}) {
  return (!p.month || r.month === p.month)
    && (!p.account || r.account === p.account)
    && (skip.group || !p.group || r.group === p.group)
    && (skip.category || !p.category || r.category === p.category);
}

// The dates shown, how many months that is, and how far through it the statements reach.
// For one month, `share` is the part of the month the statements cover (the pace line);
// for the whole year to date it is 1.
export function period(txn, p) {
  if (!txn.length) return null;
  const first = txn.reduce((m, r) => (r.date < m ? r.date : m), txn[0].date);
  const last = txn.reduce((m, r) => (r.date > m ? r.date : m), txn[0].date);
  let from = first, to = last, months, share = 1;
  if (p.month) {
    const start = `${p.month}-01`;
    const end = `${p.month}-${String(daysInMonth(p.month)).padStart(2, '0')}`;
    from = start;
    to = end > last ? last : end;
    const dim = daysInMonth(p.month);
    const covered = to < start ? 0 : daysBetween(start, to);
    months = 1;
    share = Math.min(1, covered / dim);
  } else {
    months = r2(daysBetween(from, to) / 30.4375);
  }
  return { from, to, days: Math.max(0, daysBetween(from, to)), months, share, complete: share >= 1 };
}

export function totals(txn, p) {
  const rows = txn.filter((r) => inView(r, p, { group: true, category: true }));
  const of = (gs) => sum(rows.filter((r) => gs.includes(r.group)), (r) => r.amount);
  const toSort = rows.filter((r) => r.group === 'To sort');
  return {
    money_in: r2(of(['Money in'])),
    living: r2(-of(['Living'])),
    housing: r2(-of(HOUSING)),
    to_sort: r2(-of(['To sort'])),
    to_sort_rows: toSort.length,
    flagged_rows: rows.filter((r) => r.note && r.group !== 'To sort').length,
  };
}

// Status follows the Finance Desk sheet's rule: over budget, or more than 10 points ahead
// of the share of the period gone.
export function status(budget, actual, share) {
  if (!actual) return '';
  if (!budget) return 'no budget';
  if (actual > budget) return 'over';
  if (actual / budget > share + 0.1) return 'ahead of pace';
  return 'ok';
}

export function budgetRows(txn, budget, p, per) {
  const months = per ? per.months : 1;
  const share = per ? per.share : 1;
  const rows = txn.filter((r) => r.group === 'Living' && inView(r, p, { group: true, category: true }));
  const spent = new Map();
  for (const r of rows) spent.set(r.category, (spent.get(r.category) || 0) - (+r.amount || 0));
  const cats = budget.map((b) => b.category);
  for (const c of spent.keys()) if (!cats.includes(c)) cats.push(c);
  const out = cats.map((c) => {
    const b = budget.find((x) => x.category === c);
    const monthly = b ? +b.monthly_budget || 0 : 0;
    const bud = r2(monthly * months);
    const actual = r2(spent.get(c) || 0);
    return { category: c, monthly_budget: monthly, budget: bud, actual, left: r2(bud - actual), used: bud ? actual / bud : null, status: status(bud, actual, share) };
  }).filter((r) => r.budget || r.actual).sort((a, b) => b.actual - a.actual);
  const tb = r2(sum(out, (r) => r.budget)), ta = r2(sum(out, (r) => r.actual));
  const total = { category: 'Living total', monthly_budget: r2(sum(out, (r) => r.monthly_budget)), budget: tb, actual: ta, left: r2(tb - ta), used: tb ? ta / tb : null, status: status(tb, ta, share), total: true };
  return { rows: out, total, share };
}

export function monthly(txn, p) {
  const rows = txn.filter((r) => !p.account || r.account === p.account);
  return monthsOf(txn).map((m) => {
    const rs = rows.filter((r) => r.month === m);
    const of = (gs) => sum(rs.filter((r) => gs.includes(r.group)), (r) => r.amount);
    return { month: m, money_in: r2(of(['Money in'])), living: r2(-of(['Living'])), housing: r2(-of(HOUSING)), to_sort: r2(-of(['To sort'])) };
  });
}

export function byCategory(txn, p) {
  const rows = txn.filter((r) => inView(r, p, { group: true, category: true })
    && (p.group ? r.group === p.group : !NOT_OUT.includes(r.group)));
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r.category) || { category: r.category, group: r.group, money_out: 0, transactions: 0 };
    g.money_out -= +r.amount || 0;
    g.transactions += 1;
    groups.set(r.category, g);
  }
  return Array.from(groups.values()).map((g) => ({ ...g, money_out: r2(g.money_out) }))
    .filter((g) => g.money_out > 0).sort((a, b) => b.money_out - a.money_out);
}

// Cash in everyday and bills accounts that offset no loan, and what it would save a year
// in an offset at the rate of the first open loan (the Finance Desk's "Loans and cash").
export function cashOffset(accounts, loans) {
  const cash = sum(accounts.filter((a) => a.type === 'Transaction' && a.offset === 'No' && +a.latest_balance > 0), (a) => a.latest_balance);
  const open = loans.filter((l) => l.status === 'Open');
  const loan = open[0] || loans[0] || null;
  const rate = loan ? +loan.rate || 0 : 0;
  return { cash: r2(cash), rate, loan: loan ? loan.loan : '', interest_a_year: r2((cash * rate) / 100) };
}

// ---- category codes and allocations (Brain D-152 A, D-155) ------------------------------
//
// Every category carries a code such as FOO-1: a group of up to three letters, a dash, and
// the category's rank inside the group. The groups and their order are published with the
// figures (`categories.groups`, Brain D-155); without them, codes are made up from the
// figures' own groups so the page still works.

export const DEFAULT_GROUPS = [
  { code: 'IN', name: 'Money in' }, { code: 'H', name: 'Houses' }, { code: 'L', name: 'Living' },
  { code: 'T', name: 'Between own accounts' }, { code: 'XXX', name: 'To sort' },
];
const FALLBACK = { 'Money in': 'IN', Housing: 'H', 'Property deals': 'H', Living: 'L', 'Own accounts': 'T', 'Loan proceeds': 'T', 'To sort': 'XXX' };
export const tierOf = (code) => String(code || '').split('-')[0];
const codeNum = (code) => +(String(code || '').split('-')[1]) || 0;

export function groupsOf(doc) {
  const g = doc.categories && Array.isArray(doc.categories.groups) ? doc.categories.groups.filter((x) => x && x.code) : [];
  return g.length ? g : DEFAULT_GROUPS;
}

export function sorter(groups) {
  const rank = (code) => {
    const i = groups.findIndex((g) => g.code === tierOf(code));
    return i < 0 ? groups.length : i;
  };
  return (a, b) => rank(a.code) - rank(b.code) || codeNum(a.code) - codeNum(b.code) || String(a.category).localeCompare(String(b.category));
}

export function registry(doc) {
  const published = doc.categories && Array.isArray(doc.categories.rows) ? doc.categories.rows.filter((r) => r && r.category) : [];
  const out = published.map((r) => ({ code: String(r.code || ''), category: r.category, group: r.group, tier: r.tier || '' }));
  const known = new Set(out.map((r) => r.category));
  // Anything the figures use that the list does not name gets a made-up code at the end of its tier.
  const extra = new Map();
  for (const r of [...doc.transactions.rows, ...doc.budget.rows.map((b) => ({ category: b.category, group: 'Living' }))]) {
    if (!known.has(r.category) && !extra.has(r.category)) extra.set(r.category, r.group || 'To sort');
  }
  for (const [category, group] of extra) {
    const tier = FALLBACK[group] || 'XXX';
    const used = out.filter((r) => tierOf(r.code) === tier).map((r) => codeNum(r.code));
    out.push({ code: `${tier}-${(used.length ? Math.max(...used) : 0) + 1}`, category, group, tier: '' });
  }
  return out.sort(sorter(groupsOf(doc)));
}

const sameFp = (r, fp) => Boolean(fp) && r.date === fp.date && r.amount === fp.amount && r.description === fp.description && r.account === fp.account;

// The figures with the tab's allocations laid over them; a ruling whose transaction no longer
// matches (a re-close) is left out rather than moving another row.
export function applyRulings(rows, rulings) {
  const items = rulings && rulings.items ? rulings.items : {};
  return rows.map((r) => {
    const k = items[r.id];
    if (!k || !sameFp(r, k.fp)) return r;
    return { ...r, category: k.category, group: k.group, ruled: { by: k.by, at: k.at, note: k.note, like: k.like, from: k.from } };
  });
}

export function viewOf(doc) {
  return { ...doc, transactions: { ...doc.transactions, rows: applyRulings(doc.transactions.rows, doc.rulings) } };
}

function ordered(b, codes, groups) {
  const by = sorter(groups);
  const rank = (c) => ({ code: codes.get(c) || 'ZZZ-0', category: c });
  return { ...b, rows: b.rows.slice().sort((x, y) => by(rank(x.category), rank(y.category))) };
}

// Everything the page draws, for one set of filters.
export function model(doc, p) {
  const txn = doc.transactions.rows;
  const reg = registry(doc);
  const codes = new Map(reg.map((r) => [r.category, r.code]));
  const per = period(txn, p);
  return {
    params: p,
    months: monthsOf(txn),
    accounts: Array.from(new Set(txn.map((r) => r.account))).sort(),
    period: per,
    totals: totals(txn, p),
    budget: ordered(budgetRows(txn, doc.budget.rows, p, per), codes, groupsOf(doc)),
    monthly: monthly(txn, p),
    byCategory: byCategory(txn, p),
    cash: cashOffset(doc.accounts.rows, doc.loans.rows),
    registry: reg,
    groups: groupsOf(doc),
    codes,
  };
}

// Filters live in the hash, so a link or a reload keeps them: #m=2026-11&a=…&g=…&c=…
export function readParams(hash, months) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const p = { month: q.get('m'), account: q.get('a') || null, group: q.get('g') || null, category: q.get('c') || null };
  if (p.month === 'all') p.month = null;
  else if (!p.month || !months.includes(p.month)) p.month = months[months.length - 1] || null;
  return p;
}

export function writeParams(p) {
  const q = new URLSearchParams();
  q.set('m', p.month || 'all');
  if (p.account) q.set('a', p.account);
  if (p.group) q.set('g', p.group);
  if (p.category) q.set('c', p.category);
  return `#${q.toString()}`;
}

// ---- formatting --------------------------------------------------------------------------

const AUD0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const AUD2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v) => (v < 0 ? '−' : '') + AUD0.format(Math.abs(v || 0));
export const money2 = (v) => (v < 0 ? '−' : '') + AUD2.format(Math.abs(v || 0));
export const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + AUD2.format(Math.abs(v || 0));
const compact = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${r2(a / 1e6)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}$${s}`;
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const monthShort = (m) => MONTHS[+m.slice(5, 7) - 1].slice(0, 3);
export const dayLabel = (s) => (s ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1].slice(0, 3)} ${s.slice(0, 4)}` : '');
const pct = (v) => (v == null ? '' : `${Math.round(v * 100)}%`);
const shortAcct = (a) => String(a || '').replace(/^CBA /, '').replace(/ Qantas Ultimate/, '');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STATUS_CLASS = { over: 'over', 'ahead of pace': 'ahead', ok: 'ok', 'no budget': 'none' };
const CHIP_TEXT = { 'ahead of pace': 'ahead', 'no budget': 'no line' };
const chip = (s) => (s ? `<span class="chip ${STATUS_CLASS[s] || 'none'}" title="${esc(s)}">${esc(CHIP_TEXT[s] || s)}</span>` : '');
const codeTag = (code) => (code ? `<span class="code">${esc(code)}</span>` : '');
const catCell = (codes, category) => `<span class="cn">${codeTag(codes.get(category))}<span>${esc(category)}</span></span>`;
const SERIES = [
  { key: 'money_in', name: 'Money in', color: '#12a37f' },
  { key: 'living', name: 'Living costs', color: '#4f46e5' },
  { key: 'housing', name: 'Houses', color: '#8b5cf6' },
  { key: 'to_sort', name: 'To sort', color: '#f5a524' },
];
const GROUP_COLOR = { Living: '#4f46e5', Housing: '#8b5cf6', 'Property deals': '#8b5cf6', 'To sort': '#f5a524', 'Money in': '#12a37f', 'Own accounts': '#9aa0b4' };
const GROUPS = [['', 'All'], ['Living', 'Living'], ['Housing', 'Housing'], ['Money in', 'Money in'], ['To sort', 'To sort'], ['Own accounts', 'Between own accounts']];

// ---- rendering (pure: model in, HTML out) ------------------------------------------------

function heroHtml(m, doc) {
  const p = m.params, per = m.period, b = m.budget, t = b.total;
  const title = p.month ? monthName(p.month) : 'Year to date';
  const sub = per ? `${dayLabel(per.from)} to ${dayLabel(per.to)}${p.month && !per.complete ? ` · day ${per.days} of ${daysInMonth(p.month)}, statements to ${dayLabel(per.to)}` : ''}` : '';
  const count = (s) => b.rows.filter((r) => r.status === s).length;
  const ahead = count('ahead of pace'), over = count('over');
  const usedW = t.used == null ? 0 : Math.min(100, t.used * 100);
  const daysLeft = p.month && per && !per.complete ? daysInMonth(p.month) - per.days : 0;
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  return `<header class="fin-hero"><div class="fin-wrap">
    <div class="fin-top"><span class="fin-brand"><i aria-hidden="true"></i>Finance</span><a href="../#focus">Brain ↗</a></div>
    <h1 id="fin-title">${esc(title)}</h1>
    <p class="fin-sub">${esc(sub)}</p>
    <div class="fin-filters" id="filters">
      <select id="f-month" aria-label="Month">${opt('all', 'All months (year to date)', !p.month)}${m.months.slice().reverse().map((x) => opt(x, monthName(x), p.month === x)).join('')}</select>
      <select id="f-account" aria-label="Account">${opt('', 'All accounts', !p.account)}${m.accounts.map((a) => opt(a, a, p.account === a)).join('')}</select>
    </div>
    <div class="fin-chips" role="group" aria-label="Group">${GROUPS.map(([g, label]) => `<button type="button" class="fin-chip" data-group="${esc(g)}" aria-pressed="${(p.group || '') === g}">${esc(label)}</button>`).join('')}${p.category ? `<button type="button" class="fin-chip clear" data-clear-category="1">${esc(p.category)} ✕</button>` : ''}</div>
    <section class="fin-tiles" id="tiles" aria-label="The month at a glance">
      <div class="fin-tile t1"><div class="l">Living spend</div><div class="v">${money(t.actual)}</div><div class="s">of ${money(t.budget)} · ${pct(t.used)} used</div><div class="bar"><i class="${t.actual > t.budget ? 'over' : ''}" style="width:${usedW}%"></i></div></div>
      <div class="fin-tile t2"><div class="l">${t.left < 0 ? 'Over budget by' : 'Budget left'}</div><div class="v">${money(Math.abs(t.left))}</div><div class="s">${t.left < 0 && daysLeft ? `with ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go` : daysLeft ? `for ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : p.month ? 'month closed' : 'for the period'}</div></div>
      <div class="fin-tile t3${ahead ? '' : ' zero'}"><div class="l">Ahead of pace</div><div class="v">${ahead}</div><div class="s">categor${ahead === 1 ? 'y' : 'ies'}</div></div>
      <div class="fin-tile t4${over ? '' : ' zero'}"><div class="l">Over budget</div><div class="v">${over}</div><div class="s">categor${over === 1 ? 'y' : 'ies'}</div></div>
    </section>
  </div></header>`;
}

function stripHtml(m) {
  const t = m.totals, c = m.cash;
  return `<section class="fin-strip" id="totals" aria-label="Totals">
    <div class="fin-mini"><div class="l">Money in</div><div class="v">${money(t.money_in)}</div><div class="s">Loans, wages, packaging, rebates</div></div>
    <div class="fin-mini"><div class="l">Houses</div><div class="v">${money(t.housing)}</div><div class="s">Loans, repairs, buy and sell costs</div></div>
    <div class="fin-mini"><div class="l">To sort</div><div class="v">${money(t.to_sort)}</div><div class="s">${t.to_sort_rows} transaction${t.to_sort_rows === 1 ? ' needs' : 's need'} a ruling</div></div>
    <div class="fin-mini"><div class="l">Cash outside an offset</div><div class="v">${money(c.cash)}</div><div class="s">≈ ${money(c.interest_a_year)} a year in interest</div></div>
  </section>`;
}

function budgetHtml(m) {
  const { rows, total, share } = m.budget, p = m.params;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.budget)));
  const pace = (r, scale) => {
    const w = Math.min(100, (r.actual / scale) * 100);
    const cls = r.status === 'over' ? 'over' : r.status === 'ahead of pace' ? 'ahead' : '';
    const tick = r.budget ? `<b style="left:${Math.min(100, ((r.budget * share) / scale) * 100)}%"></b>` : '';
    return `<div class="pace"><i class="${cls}" style="width:${w}%"></i>${tick}</div>`;
  };
  const row = (r) => `<tr class="${r.total ? 'total' : `pick${p.category === r.category ? ' on' : ''}`}"${r.total ? '' : ` data-category="${esc(r.category)}"`}>
    <td>${r.total ? esc(r.category) : catCell(m.codes, r.category)}</td><td class="n">${r.budget ? money(r.budget) : '—'}</td><td class="n">${money(r.actual)}</td>
    <td class="n hide-sm${r.left < 0 ? ' neg-over' : ''}">${money(r.left)}</td><td class="n hide-sm">${pct(r.used)}</td>
    <td>${chip(r.status)}</td><td class="hide-sm">${pace(r, r.total ? Math.max(1, r.budget, r.actual) : max)}</td></tr>`;
  const scope = p.month ? 'the month' : `${m.period ? m.period.months : ''} months`;
  return `<section class="fin-card" id="budget"><h2>Budget against actual</h2>
    <p class="hint">Living costs for ${esc(scope)} by category in order of importance (essentials first), against the budget. "Ahead" means more than 10 points ahead of the share of the month gone; the tick on each bar is where spending would sit on pace. Tap a row for its transactions.</p>
    <div class="fin-tw"><table><thead><tr><th>Category</th><th class="n">Budget</th><th class="n">Actual</th><th class="n hide-sm">Left</th><th class="n hide-sm">Used</th><th>Status</th><th class="hide-sm">Pace</th></tr></thead>
    <tbody>${rows.map(row).join('')}${row(total)}</tbody></table></div></section>`;
}

function monthlyChart(m, width) {
  const rows = m.monthly;
  if (!rows.length) return '<p class="fin-empty">No months yet.</p>';
  const W = Math.max(300, width), H = 240, mt = 10, mb = 24, ml = 44, mr = 4;
  const max = Math.max(1, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const min = Math.min(0, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const step = niceStep((max - min) / 4);
  const top = Math.ceil(max / step) * step, bot = Math.floor(min / step) * step;
  const y = (v) => mt + ((top - v) / (top - bot || 1)) * (H - mt - mb);
  const band = (W - ml - mr) / rows.length, inner = band * 0.78, bw = inner / SERIES.length;
  let svg = '';
  for (let v = bot; v <= top + 1e-9; v += step) svg += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 6}" y="${y(v)}" dy="0.32em" text-anchor="end">${compact(v)}</text>`;
  rows.forEach((r, i) => {
    const x0 = ml + i * band + (band - inner) / 2;
    const dim = m.params.month && m.params.month !== r.month ? ' opacity=".35"' : '';
    svg += `<g${dim}>`;
    SERIES.forEach((s, j) => {
      const v = r[s.key];
      svg += `<rect x="${x0 + j * bw + 1}" width="${Math.max(1, bw - 2)}" y="${Math.min(y(v), y(0))}" height="${Math.abs(y(0) - y(v))}" rx="3" fill="${s.color}"/>`;
    });
    svg += `</g><text x="${ml + i * band + band / 2}" y="${H - 6}" text-anchor="middle">${monthShort(r.month)}</text>`;
    svg += `<rect class="hit" data-month="${esc(r.month)}" x="${ml + i * band}" y="${mt}" width="${band}" height="${H - mt - mb}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money in, living costs, house costs and amounts to sort for each month">${svg}</svg>`;
}

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

function categoryChart(m, width) {
  const rows = m.byCategory;
  if (!rows.length) return '<p class="fin-empty">No money out for these filters.</p>';
  const W = Math.max(300, width), bh = 20, gap = 7, mr = 70;
  const lab = (r) => `${m.codes.get(r.category) || ''} ${r.category}`.trim();
  const longest = Math.max(...rows.map((r) => lab(r).length));
  const ml = Math.min(W * 0.45, longest * 6.6 + 14);
  const H = rows.length * (bh + gap);
  const max = Math.max(1, ...rows.map((r) => r.money_out));
  const x = (v) => (v / max) * (W - ml - mr);
  const p = m.params;
  const clip = (s) => (s.length > 26 && W < 520 ? `${s.slice(0, 24)}…` : s);
  let svg = '';
  rows.forEach((r, i) => {
    const yy = i * (bh + gap);
    const dim = p.category && p.category !== r.category ? ' opacity=".35"' : '';
    svg += `<g${dim}><text class="lab" x="${ml - 8}" y="${yy + bh / 2}" dy="0.35em" text-anchor="end">${esc(clip(lab(r)))}</text>`
      + `<rect x="${ml}" y="${yy}" width="${Math.max(2, x(r.money_out))}" height="${bh}" rx="4" fill="${GROUP_COLOR[r.group] || '#4f46e5'}"/>`
      + `<text class="val" x="${ml + x(r.money_out) + 6}" y="${yy + bh / 2}" dy="0.35em">${money(r.money_out)}</text></g>`
      + `<rect class="hit" data-cat="${i}" x="0" y="${yy - gap / 2}" width="${W}" height="${bh + gap}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Money out by category for the period shown">${svg}</svg>`;
}

function loansHtml(m, doc) {
  const c = m.cash;
  const rows = doc.loans.rows.map((r) => `<tr><td>${esc(r.loan)}</td><td class="m">${esc(r.status)}</td><td class="n">${money2(+r.balance)}</td><td class="n">${(+r.rate).toFixed(2)}%</td>
    <td class="n">${+r.repayment_now ? money(+r.repayment_now) : ''}</td><td class="n hide-sm">${+r.repayment_from_15_dec ? money(+r.repayment_from_15_dec) : ''}</td><td class="n">${money2(+r.last_interest)}</td><td class="m hide-sm">${esc(r.note)}</td></tr>`).join('');
  return `<section class="fin-card" id="loans"><h2>Loans and cash</h2><p class="hint">Balances as at each loan's last statement.</p>
    <div class="fin-callout"><b>${money(c.cash)}</b> sits in accounts that offset no loan. At the ${esc(c.loan)} rate of <b>${c.rate.toFixed(2)}%</b>, that much in a linked offset would save about <b>${money(c.interest_a_year)}</b> a year.</div>
    <div class="fin-tw"><table><thead><tr><th>Loan</th><th>Status</th><th class="n">Balance</th><th class="n">Rate</th><th class="n">Repayment</th><th class="n hide-sm">From 15 Dec</th><th class="n">Last interest</th><th class="hide-sm">Note</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

const newest = (a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.id > b.id ? -1 : 1);
function txnRow(r, cols, codes) {
  const ruled = r.ruled ? ` <span class="ruled" title="Allocated on the tab${r.ruled.by ? ` by ${esc(r.ruled.by)}` : ''}">✎</span>` : '';
  return `<tr class="pick" data-txn="${esc(r.id)}">${cols.map((c) => {
    if (c === 'category') return `<td>${catCell(codes, r.category)}${ruled}</td>`;
    if (c === 'date') return `<td class="d">${esc(dayLabel(r.date).slice(0, -5))}</td>`;
    if (c === 'account') return `<td class="m hide-sm">${esc(shortAcct(r.account))}</td>`;
    if (c === 'amount') return `<td class="n${r.amount > 0 ? ' pos' : ''}">${esc(signed(r.amount))}</td>`;
    if (c === 'note' || c === 'group') return `<td class="m${c === 'group' ? ' hide-sm' : ''}">${esc(r[c] || '')}</td>`;
    return `<td>${esc(r[c])}</td>`;
  }).join('')}</tr>`;
}

export const TXN_PAGE = 150;
export function reviewRows(txn, p) {
  return txn.filter((r) => inView(r, p, { group: true }) && (r.group === 'To sort' || r.note)).sort(newest);
}
export function txnRows(txn, p, q = '') {
  const needle = q.trim().toLowerCase();
  return txn.filter((r) => inView(r, p) && (!needle || `${r.description} ${r.category} ${r.account} ${r.amount}`.toLowerCase().includes(needle))).sort(newest);
}

function reviewHtml(doc, p, codes) {
  const rows = reviewRows(doc.transactions.rows, p);
  return `<section class="fin-card" id="review"><h2>To sort and flagged <span class="chip warn">${rows.length}</span></h2>
    <p class="hint">Transactions that need a ruling or carry a note, for the month and account shown. Tap one to allocate it.</p>
    ${rows.length ? `<div class="fin-tw tall"><table><thead><tr><th>Date</th><th class="hide-sm">Account</th><th>Description</th><th>Category</th><th class="n">Amount</th><th>Why it's here</th></tr></thead>
    <tbody>${rows.map((r) => txnRow(r, ['date', 'account', 'description', 'category', 'amount', 'note'], codes)).join('')}</tbody></table></div>` : '<p class="fin-empty">Nothing to sort here.</p>'}</section>`;
}

function txnHtml(doc, p, q, all, codes) {
  const rows = txnRows(doc.transactions.rows, p, q);
  const shown = all ? rows : rows.slice(0, TXN_PAGE);
  return `<div class="fin-tw tall"><table><thead><tr><th>Date</th><th class="hide-sm">Account</th><th>Description</th><th>Category</th><th class="hide-sm">Group</th><th class="n">Amount</th></tr></thead>
    <tbody>${shown.map((r) => txnRow(r, ['date', 'account', 'description', 'category', 'group', 'amount'], codes)).join('') || '<tr><td colspan="6" class="m">No transactions for these filters.</td></tr>'}</tbody></table></div>
    ${rows.length > shown.length ? `<button type="button" class="fin-more" id="txn-all">Show all ${rows.length}</button>` : ''}`;
}

function statementsHtml(doc) {
  const rows = doc.accounts.rows.map((r) => {
    const cls = r.status === 'Loaded' ? 'ok' : r.status === 'No activity' ? 'none' : 'ahead';
    return `<tr><td>${esc(r.account)}</td><td class="m hide-sm">${esc(r.owner)}</td><td><span class="chip ${cls}">${esc(r.status)}</span></td><td class="d hide-sm">${esc(dayLabel(r.loaded_to))}</td>
      <td class="n">${r.latest_balance == null ? '' : money2(+r.latest_balance)}</td><td class="m hide-sm">${esc(r.offset)}</td><td class="m hide-sm">${esc(r.note)}</td></tr>`;
  }).join('');
  return `<section class="fin-card" id="statements"><h2>Statements loaded</h2><p class="hint">What the tab can see, each account's last balance, and what is still to come.</p>
    <div class="fin-tw"><table><thead><tr><th>Account</th><th class="hide-sm">Owner</th><th>Status</th><th class="hide-sm">Loaded to</th><th class="n">Last balance</th><th class="hide-sm">Offset</th><th class="hide-sm">Note</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function codesHtml(m) {
  const tiers = m.groups.map((g) => {
    const rows = m.registry.filter((r) => tierOf(r.code) === g.code);
    if (!rows.length) return '';
    return `<div class="tier"><h3><span class="code">${esc(g.code)}</span>${esc(g.name)}</h3><ul>${rows.map((r) => `<li>${codeTag(r.code)}${esc(r.category)}</li>`).join('')}</ul></div>`;
  }).join('');
  return `<section class="fin-card" id="codes"><h2>Category codes</h2><p class="hint">Each code is its group, a dash, and its place in the group. Type a code or a group (FOO, ENT-2) to allocate a transaction quickly.</p><div class="tiers">${tiers}</div></section>`;
}

function sourcesHtml(doc) {
  const parts = [['transactions', 'Transactions'], ['budget', 'Budget'], ['accounts', 'Statements'], ['loans', 'Loans']];
  let html = '';
  for (const [k, label] of parts) {
    const meta = Array.isArray(doc[k].meta) ? doc[k].meta : [];
    const plain = meta.filter((x) => x.type !== 'code');
    const code = meta.filter((x) => x.type === 'code');
    html += `<h3 class="hint" style="margin:12px 0 4px;font-weight:700;color:var(--ink)">${label} · ${doc[k].rows.length} rows</h3>`;
    if (plain.length) html += `<dl>${plain.map((x) => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>`;
    html += code.map((x) => `<details><summary>${esc(x.label)}</summary><pre>${esc(x.value)}</pre></details>`).join('');
  }
  const n = doc.rulings && doc.rulings.items ? Object.keys(doc.rulings.items).length : 0;
  if (n) html = `<p class="hint"><b>${n} allocation${n === 1 ? '' : 's'}</b> made on the tab since this close; the next close turns them into categorising rules.</p>` + html;
  const when = doc.published ? new Date(doc.published) : null;
  return `<section class="fin-card" id="sources"><h2>Sources</h2><p class="hint">Published ${when && !isNaN(when) ? esc(when.toLocaleString('en-AU', { timeZone: 'Australia/Perth', dateStyle: 'medium', timeStyle: 'short' })) : esc(doc.published)} (Perth) by the monthly close. Transfers and card repayments between your own accounts are left out of the totals so nothing counts twice.</p>${html}</section>`;
}

export function pageHtml(doc, m, { width = 360, q = '', all = false } = {}) {
  return heroHtml(m, doc) + `<main class="fin-wrap fin-main">${stripHtml(m)}${budgetHtml(m)}
    <div class="fin-grid2">
      <section class="fin-card" id="by-month"><h2>Money in and out by month</h2><p class="hint">Tap a month to show it.</p>
        <div class="fin-legend" aria-hidden="true">${SERIES.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>
        <div class="fin-chart" id="chart-month">${monthlyChart(m, width)}</div></section>
      <section class="fin-card" id="by-category"><h2>Where the money went</h2><p class="hint">Money out by category, between-account moves left out. Tap a bar to filter the transactions.</p>
        <div class="fin-chart" id="chart-cat">${categoryChart(m, width)}</div></section>
    </div>
    ${loansHtml(m, doc)}${reviewHtml(doc, m.params, m.codes)}
    <section class="fin-card" id="transactions"><h2>Transactions</h2><p class="hint">Every row for the filters above, newest first.</p>
      <input type="search" class="fin-search" id="txn-q" placeholder="Search description, category or amount" value="${esc(q)}" autocomplete="off">
      <div id="txn-body">${txnHtml(doc, m.params, q, all, m.codes)}</div></section>
    ${codesHtml(m)}${statementsHtml(doc)}${sourcesHtml(doc)}
    <p class="fin-foot">Private: served from a Cloudflare store behind Access${doc.viewer ? ` · signed in as ${esc(doc.viewer)}` : ''}.</p></main>`;
}

// The allocation sheet: the transaction, a search that takes a code or a name, the categories
// by tier, a note, and whether the next close should treat its look-alikes the same way.
export function pickOptions(reg, q) {
  const needle = String(q || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!needle) return reg;
  const code = (r) => r.code.toLowerCase();
  const exact = reg.filter((r) => code(r) === needle);
  if (exact.length) return exact;
  // A group code shows that group (T, not XXX); "ent-" or "ent2" the codes it starts.
  const group = reg.filter((r) => tierOf(code(r)) === needle);
  if (group.length) return group;
  const dashed = needle.replace(/^([a-z]{1,3})(\d)/, '$1-$2');
  const prefix = reg.filter((r) => code(r).startsWith(dashed));
  if (prefix.length && /^[a-z]{1,3}(-\d*)?$/.test(dashed)) return prefix;
  return reg.filter((r) => code(r).startsWith(needle) || r.category.toLowerCase().includes(String(q).trim().toLowerCase()));
}

export function sheetHtml(row, reg, codes, { q = '', pick = null, note = '', like = false, busy = false, error = '', groups = DEFAULT_GROUPS } = {}) {
  const opts = pickOptions(reg, q);
  const chosen = pick || row.category;
  const known = new Set(groups.map((g) => g.code));
  const all = [...groups, ...Array.from(new Set(opts.map((r) => tierOf(r.code)).filter((c) => !known.has(c)))).map((c) => ({ code: c, name: c }))];
  const list = all.map(({ code: gc, name }) => {
    const rows = opts.filter((r) => tierOf(r.code) === gc);
    if (!rows.length) return '';
    return `<h4>${esc(name)}</h4>${rows.map((r) => `<button type="button" class="opt${r.category === chosen ? ' on' : ''}${r.category === row.category ? ' now' : ''}" data-pick="${esc(r.category)}">${codeTag(r.code)}<span class="name">${esc(r.category)}</span>${r.category === row.category ? '<em>now</em>' : ''}</button>`).join('')}`;
  }).join('') || '<p class="fin-empty">No category matches. Try a code such as FOO-1, a group such as ENT, or part of a name.</p>';
  const ruled = row.ruled ? `<p class="hint">Allocated on the tab${row.ruled.by ? ` by ${esc(row.ruled.by)}` : ''}${row.ruled.from ? `, was ${esc(row.ruled.from.category)}` : ''}.</p>` : '';
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head"><div><p class="hint" style="margin:0">${esc(dayLabel(row.date))} · ${esc(shortAcct(row.account))}</p>
      <h2 id="sheet-title">${esc(row.description)}</h2><p class="sheet-amt${row.amount > 0 ? ' pos' : ''}">${esc(signed(row.amount))}</p>
      <p class="hint" style="margin:0">Now: ${catCell(codes, row.category)}</p>${ruled}</div>
      <button type="button" class="sheet-x" data-sheet="close" aria-label="Close">✕</button></div>
    <input type="search" class="fin-search" id="sheet-q" placeholder="Code, group or name, e.g. FOO-1, ENT or groceries" value="${esc(q)}" autocomplete="off" enterkeyhint="done">
    <div class="sheet-list" id="sheet-list">${list}</div>
    <label class="sheet-note">Note (optional)<input type="text" id="sheet-note" maxlength="200" value="${esc(note)}" placeholder="Why, or who it was for"></label>
    <label class="sheet-like"><input type="checkbox" id="sheet-like"${like ? ' checked' : ''}> Treat other “${esc(row.description)}” transactions the same way from the next close</label>
    ${error ? `<p class="sheet-err" role="alert">${esc(error)}</p>` : ''}
    <div class="sheet-acts">${row.ruled ? `<button type="button" class="fin-more ghost" data-sheet="undo"${busy ? ' disabled' : ''}>Undo allocation</button>` : ''}
      <button type="button" class="fin-save" data-sheet="save"${busy || chosen === row.category ? ' disabled' : ''}>${busy ? 'Saving…' : `Allocate to ${esc(codes.get(chosen) || '')} ${esc(chosen)}`}</button></div>
  </div>`;
}

// ---- the page ----------------------------------------------------------------------------

const ERRORS = {
  401: 'Signed out. Reload the page to sign in again.',
  404: 'Nothing published yet. The first monthly close puts the figures here.',
  503: 'Finance is not set up yet: the store is not bound to the Worker.',
};

async function start(root) {
  let doc;
  try {
    const res = await fetch('/api/brain/finance', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(ERRORS[res.status] || (body && body.error) || `HTTP ${res.status}`);
    doc = body;
  } catch (err) {
    root.innerHTML = `<header class="fin-hero"><div class="fin-wrap"><div class="fin-top"><span class="fin-brand"><i aria-hidden="true"></i>Finance</span><a href="../#focus">Brain ↗</a></div><div class="fin-err">${esc(err.message)}</div></div></header>`;
    return;
  }
  const months = monthsOf(doc.transactions.rows);
  let q = '', all = false, last = null, cur = viewOf(doc);
  const draw = () => {
    const p = readParams(location.hash, months);
    cur = viewOf(doc);
    const m = model(cur, p);
    const scrollY = window.scrollY;
    const width = Math.min(root.clientWidth || 360, 1180) < 900 ? Math.max(300, (root.clientWidth || 360) - 56) : 520;
    root.innerHTML = pageHtml(cur, m, { width, q, all });
    window.scrollTo(0, scrollY);
    last = m;
    wire(m);
  };
  const go = (patch) => {
    const p = { ...readParams(location.hash, months), ...patch };
    all = false;
    const next = writeParams(p);
    if (next === location.hash) draw(); else location.hash = next;
  };
  const tip = (host, ev, lines) => {
    let t = host.querySelector('.fin-tip');
    if (!t) { t = document.createElement('div'); t.className = 'fin-tip'; host.appendChild(t); }
    t.replaceChildren(...lines.map((ln, i) => { const el = document.createElement(i ? 'span' : 'b'); el.textContent = ln; if (i) { const d = document.createElement('div'); d.appendChild(el); return d; } return el; }));
    const box = host.getBoundingClientRect();
    t.style.left = `${Math.max(0, Math.min(box.width - t.offsetWidth, ev.clientX - box.left + 12))}px`;
    t.style.top = `${Math.max(0, ev.clientY - box.top - t.offsetHeight - 10)}px`;
  };
  function wire(m) {
    const p = m.params;
    root.querySelector('#f-month').onchange = (e) => go({ month: e.target.value === 'all' ? 'all' : e.target.value, category: null });
    root.querySelector('#f-account').onchange = (e) => go({ account: e.target.value || null });
    root.querySelectorAll('[data-group]').forEach((b) => { b.onclick = () => go({ group: b.dataset.group || null, category: null }); });
    root.querySelectorAll('[data-clear-category]').forEach((b) => { b.onclick = () => go({ category: null }); });
    root.querySelectorAll('tr[data-category]').forEach((tr) => {
      tr.onclick = () => { go({ category: p.category === tr.dataset.category ? null : tr.dataset.category, group: null }); document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' }); };
    });
    const cm = root.querySelector('#chart-month');
    cm.querySelectorAll('[data-month]').forEach((r) => {
      const row = m.monthly.find((x) => x.month === r.dataset.month);
      r.addEventListener('pointermove', (ev) => tip(cm, ev, [monthName(row.month), ...SERIES.map((s) => `${s.name}: ${money(row[s.key])}`)]));
      r.addEventListener('pointerleave', () => cm.querySelector('.fin-tip')?.remove());
      r.addEventListener('click', () => go({ month: p.month === row.month ? 'all' : row.month, category: null }));
    });
    const cc = root.querySelector('#chart-cat');
    cc.querySelectorAll('[data-cat]').forEach((r) => {
      const row = m.byCategory[+r.dataset.cat];
      r.addEventListener('pointermove', (ev) => tip(cc, ev, [row.category, `${money2(row.money_out)} out`, `${row.transactions} transaction${row.transactions === 1 ? '' : 's'}`, row.group]));
      r.addEventListener('pointerleave', () => cc.querySelector('.fin-tip')?.remove());
      r.addEventListener('click', () => go({ category: p.category === row.category ? null : row.category }));
    });
    const qEl = root.querySelector('#txn-q');
    const body = root.querySelector('#txn-body');
    const redrawTxn = () => {
      body.innerHTML = txnHtml(cur, last.params, q, all, last.codes);
      const more = body.querySelector('#txn-all');
      if (more) more.onclick = () => { all = true; redrawTxn(); };
    };
    qEl.oninput = () => { q = qEl.value; redrawTxn(); };
    redrawTxn();
  }
  // Tapping any transaction row opens the allocation sheet (Brain D-152 A).
  root.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-txn]');
    if (tr && !e.target.closest('a')) openSheet(tr.dataset.txn);
  });
  let sheet = null;
  function openSheet(id) {
    const row = cur.transactions.rows.find((r) => r.id === id);
    if (!row) return;
    sheet = { row, q: '', pick: null, note: row.ruled ? row.ruled.note || '' : '', like: row.ruled ? Boolean(row.ruled.like) : false, busy: false, error: '' };
    const host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.id = 'sheet-wrap';
    document.body.appendChild(host);
    document.body.classList.add('sheet-open');
    renderSheet();
    host.querySelector('#sheet-q')?.focus({ preventScroll: true });
  }
  function closeSheet() {
    document.getElementById('sheet-wrap')?.remove();
    document.body.classList.remove('sheet-open');
    sheet = null;
  }
  function renderSheet(keepList = false) {
    const host = document.getElementById('sheet-wrap');
    if (!host || !sheet) return;
    const reg = registry(cur);
    const codes = new Map(reg.map((r) => [r.category, r.code]));
    const scroll = host.querySelector('#sheet-list')?.scrollTop || 0;
    const focusQ = document.activeElement && document.activeElement.id === 'sheet-q';
    host.innerHTML = sheetHtml(sheet.row, reg, codes, { ...sheet, groups: groupsOf(cur) });
    if (keepList) host.querySelector('#sheet-list').scrollTop = scroll;
    const qEl = host.querySelector('#sheet-q');
    if (focusQ) { qEl.focus(); qEl.setSelectionRange(qEl.value.length, qEl.value.length); }
    qEl.oninput = () => {
      sheet.q = qEl.value;
      const only = pickOptions(reg, sheet.q);
      if (only.length === 1) sheet.pick = only[0].category;
      renderSheet();
    };
    qEl.onkeydown = (ev) => { if (ev.key === 'Enter') { const only = pickOptions(reg, sheet.q); if (only.length) { sheet.pick = only[0].category; renderSheet(); } } };
    host.querySelector('#sheet-note').oninput = (ev) => { sheet.note = ev.target.value; };
    host.querySelector('#sheet-like').onchange = (ev) => { sheet.like = ev.target.checked; };
    host.onclick = (ev) => {
      if (ev.target === host) return closeSheet();
      const b = ev.target.closest('[data-pick], [data-sheet]');
      if (!b) return;
      if (b.dataset.pick) { sheet.pick = b.dataset.pick; sheet.error = ''; return renderSheet(true); }
      if (b.dataset.sheet === 'close') return closeSheet();
      if (b.dataset.sheet === 'save') return save(false);
      if (b.dataset.sheet === 'undo') return save(true);
    };
  }
  async function save(clear) {
    const r = sheet.row;
    sheet.busy = true; sheet.error = ''; renderSheet(true);
    try {
      const base = doc.transactions.rows.find((x) => x.id === r.id);
      const res = await fetch('/api/brain/finance/allocate', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Brain-Write': '1', Accept: 'application/json' },
        body: JSON.stringify({ id: r.id, fp: { date: base.date, amount: base.amount, description: base.description, account: base.account },
          ...(clear ? { clear: true } : { category: sheet.pick || r.category, note: sheet.note, like: sheet.like }) }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(res.status === 401 ? 'Signed out. Reload the page to sign in again.' : (out && out.error) || `HTTP ${res.status}`);
      doc.rulings = out.rulings;
      closeSheet();
      draw();
    } catch (err) {
      if (!sheet) return;
      sheet.busy = false; sheet.error = `Not saved: ${err.message}`; renderSheet(true);
    }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet) closeSheet(); });
  window.addEventListener('hashchange', draw);
  let rw = root.clientWidth;
  window.addEventListener('resize', () => { if (Math.abs(root.clientWidth - rw) > 40) { rw = root.clientWidth; draw(); } });
  draw();
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('fin');
  if (root) start(root);
}
