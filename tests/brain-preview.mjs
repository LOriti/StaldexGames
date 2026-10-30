// Brain viewer preview: screenshots of the real page with synthetic data. Not a test.
//
//   node tests/brain-preview.mjs [--url https://staldexgames.pages.dev] [--out <dir>] [--wide]
//
// Without --url it serves `site/` from this checkout on 127.0.0.1, so a change can be seen
// before it merges. With --url it opens the deployed site instead, to confirm a deploy is
// live. --wide uses a desktop window instead of a phone. Either way the Worker API
// (/api/brain/*) is answered here with made-up data, so no Brain content, token or
// sign-in is involved. Needs Playwright with Chromium.
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = opt('--out') || 'brain-preview';

// ---- synthetic Brain -------------------------------------------------------------

const entry = (ref, extra = {}) => ({
  ref, title: `Synthetic task ${ref}`, source: 'item', home: 'project:alpha', lens: 'work', context: 'computer',
  area: null, hot: [], section: 'next', blocked_by: [], claude: null, no_owner: false, priority: null,
  due: 'unknown', review: 'unknown', owner: 'leon', state: 'open', kind: 'action', minutes: null, ai: null,
  next: `Next step for ${ref}.`, ...extra,
});
const slot = (extra = {}) => ({
  focal: null, hot: [], hot_total: 0, claude: [], claude_total: 0,
  quiet: { needs_review_date: [], no_owner: [], unconfirmed: [], close_proposed: [] },
  contexts: { emails: { count: 1, hot: true }, calls: { count: 0, hot: false }, computer: { count: 2, hot: false },
    errands: { count: 0, hot: false }, agendas: { count: 0, hot: false }, waiting: { count: 0, hot: false },
    claude: { count: 0, hot: false } },
  areas: {}, ...extra,
});
const VIEW = {
  schema: 'brain-command-centre/1', date: new Date().toISOString().slice(0, 10),
  work_hours: { work_days: [0, 1, 2, 3, 4], work_start: '08:00', work_end: '17:00' },
  entries: [
    entry('WORK-SYS-60101.01', { section: 'hot', hot: ['due tomorrow'], context: 'emails', area: '1', minutes: '60', due: '2026-01-02', priority: 'P1' }),
    entry('WORK-COMP-60101.02', { area: '2' }),
    entry('PROJ-TT-60101.03', { source: 'card', home: 'project:alpha', lens: 'ventures', section: 'hot', hot: ['blocks PROJ-TT-60101.04'] }),
    entry('PA-ADMIN-60101.05', { lens: 'personal', context: 'errands' }),
    entry('DEV-60101.06', { source: 'card', home: 'project:beta', lens: 'brain', section: 'hot', hot: ['flagged hot'] }),
    entry('D-1', { home: 'project:beta', lens: 'brain', kind: 'decision' }),
    entry('P-WORK-COMP-60101.07', { area: '2', flags: ['unconfirmed'], title: 'A new item the brief found' }),
    entry('WORK-LEAD-60101.08', { area: '1', kind: 'decision', title: 'Pick which of two clashing meetings moves', due: '2026-01-03' }),
    entry('WORK-LEAD-60101.09', { area: '1', kind: 'decision', title: 'Which venue for the planning day', flags: ['close-proposed'], evidence: 'Leon chose the cafe in his reply of 2 Jan.' }),
    entry('WORK-SYS-60101.10', { area: '1', section: 'hot', hot: ['due today'], title: 'Chase the signed variation', flags: ['close-proposed'], evidence: 'Reply sent 1 Jan 16:02.' }),
  ],
  lenses: {
    work: slot({ focal: { ref: 'WORK-SYS-60101.01', reason: 'chosen by the morning brief' }, hot: ['WORK-SYS-60101.10'], hot_total: 2,
      areas: { 1: { name: 'Systems', hours: 16, count: 1, hot: true }, 2: { name: 'Compliance', hours: 8, count: 1, hot: false } } }),
    ventures: slot({ focal: { ref: 'PROJ-TT-60101.03', reason: 'hottest by rule' }, hot_total: 1 }),
    personal: slot(),
    brain: slot({ focal: { ref: 'DEV-60101.06', reason: 'hottest by rule' }, hot_total: 1 }),
    all: slot({ focal: { ref: 'WORK-SYS-60101.01', reason: 'chosen by the morning brief' },
      hot: ['PROJ-TT-60101.03', 'DEV-60101.06'], hot_total: 3 }),
  },
  allocation: { areas: { 1: { name: 'Systems', hours: 16 }, 2: { name: 'Compliance', hours: 8 } }, float: 6, total: 40 },
  inbox: [
    { kind: 'line', raw: 'A raw idea typed on the phone', details: {}, family: 'PROJ-TT', text: 'A raw idea typed on the phone', home: 'project:alpha', date: new Date().toISOString().slice(0, 10), path: 'projects/alpha/QUEUE.md', ref: null, lens: 'ventures' },
    { kind: 'unconfirmed', text: 'A new item the brief found', home: 'project:alpha', date: '2026-01-02', path: 'register/open-items.md', ref: 'P-WORK-COMP-60101.07', lens: 'work' },
    { kind: 'close', text: 'An item the debrief thinks is done', home: 'project:alpha', date: '2026-01-01', path: 'register/open-items.md', ref: 'WORK-SYS-60101.01', lens: 'work' },
    { kind: 'close', text: 'Chase the signed variation', home: 'project:alpha', date: '2026-01-01', path: 'register/open-items.md', ref: 'WORK-SYS-60101.10', lens: 'work' },
    { kind: 'close', text: 'Which venue for the planning day', home: 'project:alpha', date: '2026-01-01', path: 'register/open-items.md', ref: 'WORK-LEAD-60101.09', lens: 'work' },
  ],
  gaps: ['Synthetic preview data.'],
};
const filler = (n) => Array.from({ length: n }, (_, i) => `Filler paragraph ${i + 1} so the jump has somewhere to scroll.`).join('\n\n');
const item = (id, title, home) => `### ${title}\n\`id: ${id}\` \`home: ${home}\` \`kind: action\` \`state: open\` \`owner: leon\` \`due: unknown\` \`review: unknown\`\n\nSource: synthetic\nNext: Next step for ${id}.\n`;
const card = (id, title) => `### ${title}\n\n\`id: ${id}\` \`priority: P2\` \`effort: S\` \`risk: low\` \`burnable: no\` \`blocked-by: none\`\n\nOutcome: Synthetic outcome.\n`;
const FILES = {
  'INDEX.md': '# Portfolio\n\n| Project | Status |\n|---|---|\n| alpha | active |\n| beta | active |\n',
  'views/command-centre.json': JSON.stringify(VIEW),
  'register/open-items.md': `# Open items\n\n${filler(20)}\n\n${['WORK-SYS-60101.01', 'WORK-COMP-60101.02', 'PA-ADMIN-60101.05']
    .map((id) => `${item(id, `Synthetic task ${id}`, 'project:alpha')}\n${filler(6)}`).join('\n')}\n${filler(2)}\n\n` +
    item('P-WORK-COMP-60101.07', 'A new item the brief found', 'project:alpha').replace('`review: unknown`', '`review: unknown` `unconfirmed: 2026-01-02`'),
  'register/decisions.md': `# Decisions\n\n${filler(10)}\n\n${item('D-1', 'Synthetic decision D-1', 'project:beta').replace('kind: action', 'kind: decision')}`,
  'projects/alpha/QUEUE.md': `---\nproject: alpha\ntype: queue\nupdated: 2026-01-01\n---\n\n# alpha — queue\n\n${filler(12)}\n\n${card('PROJ-TT-60101.03', 'Synthetic task PROJ-TT-60101.03')}\n## Inbox\n\n- A raw idea\n`,
  'projects/beta/QUEUE.md': `---\nproject: beta\ntype: queue\nupdated: 2026-01-01\n---\n\n# beta — queue\n\n${filler(12)}\n\n${card('DEV-60101.06', 'Synthetic task DEV-60101.06')}\n## Inbox\n`,
};
const sha = (path) => Buffer.from(path).toString('hex').slice(0, 40).padEnd(40, '0');
const TREE = {
  repo: 'synthetic/brain', ref: 'main', truncated: false, viewer: null,
  commit: { sha: 'f'.repeat(40), date: new Date().toISOString(), message: 'synthetic' },
  files: Object.entries(FILES).map(([path, text]) => ({ path, sha: sha(path), size: text.length })),
};

const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const TIME = [
  { date: today, kind: 'tracked', start: '08:30', end: '10:00', minutes: 90, ref: 'WORK-SYS-60101.01', area: '1', lens: 'work', note: 'Synthetic' },
  { date: today, kind: 'entered', start: '', end: '', minutes: 120, ref: '', area: 'vol', lens: 'work', note: 'entered on the viewer' },
  { date: today, kind: 'tracked', start: '19:00', end: '20:00', minutes: 60, ref: 'DEV-60101.06', area: '', lens: 'brain', note: 'Synthetic' },
];
const writes = [];

function answer(url, method = 'GET', body = null) {
  const u = new URL(url);
  if (method === 'POST') {
    writes.push([u.pathname, body]);
    // The daily log keeps a focal row, so a reload reads the pick back (Brain D-113 A).
    if (u.pathname === '/api/brain/focal') {
      const b = JSON.parse(body || '{}');
      TIME.push({ date: today, kind: 'focal', start: '12:00', end: '', minutes: 0, ref: b.ref || '', area: '', lens: b.lens || '', note: '' });
    }
    return { path: 'synthetic', sha: 'x', commit: null };
  }
  if (u.pathname === '/api/brain/time') return { from: u.searchParams.get('from'), to: today, rows: TIME };
  if (u.pathname === '/api/brain/tree') return TREE;
  const path = u.searchParams.get('path');
  return path in FILES ? { path, sha: sha(path), text: FILES[path] } : null;
}

// ---- local static server ---------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveSite() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (path.startsWith('..')) { res.writeHead(403).end(); return; }
    if (!extname(path)) path = join(path, 'index.html');
    try {
      const body = await readFile(join(SITE, path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---- screenshots -------------------------------------------------------------------

const server = opt('--url') ? null : await serveSite();
const base = (opt('--url') || `http://127.0.0.1:${server.address().port}`).replace(/\/$/, '');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const wide = args.includes('--wide');
const page = await browser.newPage(wide ? { viewport: { width: 1400, height: 900 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// Fake timers, so the clock's first minute (Brain D-114 A) can be skipped rather than waited.
await page.clock.install({ time: Date.now() });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
await page.route('**/api/brain/**', (route) => {
  const req = route.request();
  const body = answer(req.url(), req.method(), req.postData());
  return route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body || { error: 'not found' }) });
});

const shots = [];
async function shot(name) {
  const file = join(OUT, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
}
const settle = () => page.waitForTimeout(400);

const response = await page.goto(`${base}/brain/#focus`, { waitUntil: 'networkidle' });
console.log(`Opened ${base}/brain/ (${response?.status()}), app ${await page.evaluate(() =>
  document.querySelector('script[type=module]')?.getAttribute('src') || 'no module script')}`);
await page.waitForSelector('.cc', { timeout: 10_000 }).catch(() => problems.push('the command centre home never rendered'));
for (const lens of ['work', 'brain', 'all']) {
  const button = page.locator(`[data-cc-lens="${lens}"]`);
  if (await button.count()) { await button.click(); await settle(); await shot(`focus-${lens}`); }
  else problems.push(`no ${lens} lens button`);
}
// Each item once, with its flag (Brain D-115 A): the hot close-proposed item is not repeated
// in the inbox panel, its row says "close proposed", and the Inbox count means captures.
await page.locator('[data-cc-lens="work"]').click(); await settle();
if ((await page.locator('a[data-cc-ref="WORK-SYS-60101.10"], a.cc-in[href*="WORK-SYS-60101.10"]').count()) !== 1) problems.push('a hot flagged item shows more than once on Focus');
if (!(await page.locator('a[data-cc-ref="WORK-SYS-60101.10"] .cc-chip.flag').count())) problems.push('the hot row carries no flag chip');
if (!(await page.locator('.cc-flags').count())) problems.push('register flags have no line of their own under Inbox');
await page.goto(`${base}/brain/#priority`); await settle(); await shot('priority');
// The Inbox tab (Brain DEV-61026.33): add box first, lines to clarify, then what the routines found.
await page.goto(`${base}/brain/#inbox`); await settle(); await shot('inbox');
if (!(await page.locator('.cc-inbox').count())) problems.push('the Inbox tab is empty');
if (!(await page.locator('.cc-inbox-add').count())) problems.push('the Inbox tab has no add box');
if (await page.locator('.cc-tabs a[href="#clarify"]').count()) problems.push('the Clarify tab is still there');
await page.goto(`${base}/brain/#clarify`); await settle();
if (!(await page.locator('.cc-tabs a[href="#inbox"][aria-current="page"]').count())) problems.push('#clarify no longer lands on the Inbox tab');
// A raw line walks the GTD questions: actionable, the next action, two minutes, delegate, details.
await page.locator('[data-cc-lens="all"]').click(); await settle();
const line = page.locator('a[data-cc-line]').first();
if (!(await line.count())) problems.push('no raw line to clarify on the Inbox tab');
else {
  await line.click(); await settle();
  if (!(await page.locator('[data-wk="yes"]').count())) problems.push('an inbox line did not open the question walk');
  await shot('walk-actionable');
  await page.locator('[data-wk="yes"]').click(); await settle();
  await page.locator('#wk-next').fill('The report');
  await page.locator('[data-wk-form="action"] button[type="submit"]').click(); await settle();
  if (!(await page.locator('.tk .write-msg.bad').count())) problems.push('an action without a verb was not flagged');
  await page.locator('#wk-next').fill('Write it up');
  await shot('walk-action');
  await page.locator('[data-wk-form="action"] button[type="submit"]').click(); await settle();
  if (!(await page.locator('[data-wk="two-no"]').count())) problems.push('the walk did not reach the two-minute question');
  await page.locator('[data-wk="two-no"]').click(); await settle();
  await page.locator('[data-wk="deleg-person"]').click(); await settle();
  await page.locator('#wk-owner').fill('sam');
  await page.locator('#wk-follow').fill('2030-02-01');
  await shot('walk-delegate');
  await page.locator('[data-wk-form="person"] button[type="submit"]').click(); await settle();
  if (!(await page.locator('[data-wk-form="details"]').count())) problems.push('the walk did not reach priority, estimate and date');
  await page.locator('#wk-minutes').selectOption('60');
  await shot('walk-details');
  await page.locator('[data-wk-form="details"] button[type="submit"]').click(); await settle();
  const saved = writes.find(([path]) => path === '/api/brain/categorise');
  if (!saved) problems.push('saving the walk wrote nothing');
  else if (!/"owner":"sam"/.test(saved[1]) || !/"next":"Write it up"/.test(saved[1])) problems.push(`the walk saved the wrong details: ${saved[1]}`);
}
// Adding a line opens the walk at once (Brain D-110 A folded in); Someday parks it.
await page.goto(`${base}/brain/#focus`); await settle();
await page.locator('[data-cc-lens="all"]').click(); await settle();
const addBox = page.locator('.cc-inbox-add input[name="text"]');
if (await addBox.count()) {
  await addBox.fill('Synthetic capture from the phone');
  await page.locator('.cc-inbox-add button[type="submit"]').click(); await settle();
  if (!(await page.locator('.tk-wrap:not([hidden]) [data-wk="someday"]').count())) problems.push('adding to the inbox opened no walk');
  if (!(await page.locator('a[data-cc-line="Synthetic capture from the phone"]').count())) problems.push('the added line is not on the home');
  await shot('inbox-added');
  await page.locator('[data-wk="someday"]').click(); await settle();
  if (!writes.some(([path]) => path === '/api/brain/someday')) problems.push('Someday wrote nothing');
  if (await page.locator('a[data-cc-line="Synthetic capture from the phone"]').count()) problems.push('a Someday line stayed on the home');
  // Under two minutes: the countdown, then the time recorded and the line handled.
  await addBox.fill('Ring the plumber back');
  await page.locator('.cc-inbox-add button[type="submit"]').click(); await settle();
  await page.locator('[data-wk="yes"]').click(); await settle();
  await page.locator('#wk-next').fill('Ring the plumber back');
  await page.locator('[data-wk-form="action"] button[type="submit"]').click(); await settle();
  await page.locator('[data-wk="two-yes"]').click(); await settle();
  if (!(await page.locator('[data-wk-count]').count())) problems.push('the two-minute clock did not start');
  await shot('walk-two-minutes');
  await page.locator('[data-wk-form="done"] button[type="submit"]').click(); await settle();
  if (!writes.some(([path]) => path === '/api/brain/hours') || !writes.some(([path]) => path === '/api/brain/handled')) problems.push('finishing in two minutes did not record the time and handle the line');
  if (!(await page.locator('.tk-reward').count())) problems.push('finishing in two minutes showed no reward');
  await shot('inbox-handled');
  await page.locator('.tk button[data-tk="hide"]').first().click(); await settle();
}
// A register decision closes with Leon's outcome (Brain D-111 A).
await page.goto(`${base}/brain/#priority`); await settle();
const choice = page.locator('a[data-cc-ref="WORK-LEAD-60101.08"]');
if (await choice.count()) {
  await choice.click(); await settle();
  await page.locator('[data-tk="done-ask"]').click(); await settle();
  await page.locator('[data-tk-form="decide"] textarea').fill('Moved the second meeting to Friday.');
  await shot('decide');
  await page.locator('[data-tk-form="decide"] button[type="submit"]').click();
  await page.waitForTimeout(1000);
  if (!writes.some(([path]) => path === '/api/brain/decide')) problems.push('Decided wrote nothing');
  if (!(await page.locator('.tk-reward').count())) problems.push('deciding showed no reward');
  await page.locator('.tk button[data-tk="hide"]').first().click(); await settle();
} else problems.push('the register decision is not on Priority');
// A close-proposed decision: the proposed close first, Decided as the alternative (Brain D-117 B).
await page.goto(`${base}/brain/#priority`); await settle();
await page.locator('[data-cc-lens="work"]').click(); await settle();
const venue = page.locator('a[data-cc-ref="WORK-LEAD-60101.09"]');
if (await venue.count()) {
  await venue.click(); await settle();
  const order = await page.evaluate(() => { const h = document.querySelector('.tk').innerHTML; return [h.indexOf('confirm-close'), h.indexOf('done-ask')]; });
  if (!(order[0] > -1 && order[0] < order[1])) problems.push('the decision does not put the proposed close first');
  if (!(await page.locator('.tk-proposed q').count())) problems.push('the proposed close hides the routine’s evidence');
  await shot('decision-close-proposed');
  await page.locator('[data-tk="hide"].tk-x').click(); await settle();
} else problems.push('the close-proposed decision is not on Priority');
// What Leon just did survives a reload until Brain renders a new view (Brain DEV-61030.12).
await page.goto(`${base}/brain/#focus`); await settle();
if (await page.locator('a[data-cc-line="Synthetic capture from the phone"]').count()) problems.push('a handled line came back before the reload');
await page.reload({ waitUntil: 'networkidle' }); await settle();
await page.locator('[data-cc-lens="work"]').click(); await settle();
if (!(await page.locator('.cc').count())) problems.push('the home did not render after a reload');
if (await page.locator('a[data-cc-line="Synthetic capture from the phone"]').count()) problems.push('a handled line came back after a reload');
// Reject asks first, from the task card and on the register; nothing is written until Yes.
const rejects = () => writes.filter(([path]) => path === '/api/brain/reject').length;
await page.goto(`${base}/brain/#priority`); await settle();
await page.locator('[data-cc-lens="work"]').click(); await settle();
const fresh = page.locator('a[data-cc-ref="P-WORK-COMP-60101.07"]');
if (await fresh.count()) {
  await fresh.click(); await settle();
  await page.locator('[data-tk="reject-ask"]').click(); await settle();
  if (!(await page.locator('.tk-panel [data-tk="reject"]').count())) problems.push('Reject on the task card did not ask first');
  if (rejects()) problems.push('Reject on the task card wrote before Yes');
  await shot('task-reject');
  await page.locator('.tk-panel [data-tk="cancel"]').click(); await settle();
  if (rejects()) problems.push('Cancel on the task card still rejected');
  await page.locator('[data-tk="hide"].tk-x').click(); await settle();
} else problems.push('no Priority row for the unconfirmed item');
await page.goto(`${base}/brain/#/register/open-items.md`);
await page.waitForSelector('.card-act[data-flag="unconfirmed"]', { timeout: 10_000 }).catch(() => problems.push('the register shows no Confirm and Reject'));
await page.locator('.card-act[data-flag="unconfirmed"] [data-act="reject-ask"]').click(); await settle();
if (rejects()) problems.push('Reject on the register wrote before Yes');
await page.locator('.card-act[data-flag="unconfirmed"]').scrollIntoViewIfNeeded(); await shot('register-reject');
await page.locator('.card-act[data-flag="unconfirmed"] [data-act="reject"]').click(); await settle();
if (rejects() !== 1) problems.push('Yes on the register did not reject');

await page.goto(`${base}/brain/#allocation`); await settle(); await page.waitForTimeout(600); await shot('allocation');
if (!(await page.locator('.cc-meter').count())) problems.push('the Allocation tab shows no actuals');
await page.goto(`${base}/brain/#focus`); await settle();
await page.locator('[data-cc-lens="all"]').click(); await settle();
if (!(await page.locator('.cc-inbox .cc-row').count())) problems.push('no inbox rows on the home');
await page.locator('[data-cc-lens="work"]').click(); await settle();
if (!(await page.locator('.cc-inbox .cc-flags').count())) problems.push('no flags line under the inbox (D-115 C)');
const focal = page.locator('a.cc-focal');
if (await focal.count()) {
  await focal.click(); await settle();
  if (await page.locator('.tk-wrap:not([hidden]) [data-tk="start"]').count()) await shot('task-card');
  else problems.push('tapping the focal item did not open its card, clock not started');
  // A clock stopped inside its first minute writes nothing (Brain D-114 A).
  const clocks = () => writes.filter(([path]) => path === '/api/brain/clock').length;
  await page.locator('[data-tk="start"]').click(); await settle();
  if (!(await page.locator('.tk-wrap:not([hidden]) .tk-time').count())) problems.push('Start did not start the clock');
  await page.locator('[data-tk="stop"]').click(); await settle();
  if (clocks()) problems.push('a clock stopped under a minute still wrote a row');
  if (!(await page.locator('.tk-wrap:not([hidden]) .write-msg', { hasText: 'Under a minute' }).count())) problems.push('an under-a-minute stop did not say nothing was recorded');
  await shot('task-under-a-minute');
  await page.locator('[data-tk="start"]').click(); await settle();
  await page.clock.fastForward(61_000); await settle();
  if (clocks() !== 1) problems.push('the start row was not written once the first minute passed');
  await shot('task-clock');
  // The one thing can be set from the card (Brain D-113 A): Also hot's item takes the slot.
  await page.locator('[data-tk="hide"].tk-x').click(); await settle();
  const alsoHot = page.locator('a.cc-row[data-cc-ref="WORK-SYS-60101.10"]');
  if (await alsoHot.count()) {
    await alsoHot.click(); await settle();
    if (!(await page.locator('[data-tk="focal-set"]').count())) problems.push('the task card offers no Make this the one thing');
    await page.locator('[data-tk="focal-set"]').click(); await settle();
    if (!writes.some(([path]) => path === '/api/brain/focal')) problems.push('Make this the one thing wrote no focal row');
    if (!(await page.locator('[data-tk="focal-clear"]').count())) problems.push('the new pick offers no way back to the brief’s pick');
    await shot('task-one-thing');
    await page.locator('[data-tk="hide"].tk-x').click(); await settle();
    if (!(await page.locator('a.cc-focal[data-cc-ref="WORK-SYS-60101.10"]').count())) problems.push('the pick did not take the focal slot');
    if (!(await page.locator('a.cc-focal', { hasText: 'your pick for today' }).count())) problems.push('the focal slot does not say it is Leon’s pick');
    await shot('focus-one-thing');
  } else problems.push('no Also hot row to make the one thing');
  await page.locator('[data-cb="open"]').click(); await settle();
  await page.locator('[data-tk="progress-ask"]').click(); await settle(); await shot('task-progress');
  await page.locator('[data-tk="cancel"]').click();
  // Categorise from the task's card, then Back returns to the card rather than closing it.
  if (await page.locator('[data-tk="categorise"]').count()) {
    await page.locator('[data-tk="categorise"]').click(); await settle(); await shot('categorise-from-task');
    await page.locator('[data-tk="back"].tk-back').click(); await settle();
    if (!(await page.locator('.tk-wrap:not([hidden]) [data-tk="start"], .tk-wrap:not([hidden]) .tk-time').count())) problems.push('Back from Categorise did not return to the task card');
  }
  await page.locator('[data-tk="hide"].tk-x').click(); await settle();
  if (await page.locator('.clock-bar:not([hidden])').count()) await shot('clock-bar');
  else problems.push('closing the card did not leave the clock bar');
  await page.locator('[data-cb="open"]').click(); await settle();
  await page.locator('[data-tk="file"]').click(); await page.waitForSelector('.doc h3', { timeout: 10_000 }).catch(() => {}); await settle();
  const target = await page.evaluate(() => document.querySelector('.doc h3.target')?.textContent || null);
  if (!target) problems.push('Open in file did not land on the item');
  await shot('open-in-file');
  await page.locator('[data-cb="open"]').click(); await settle();
  await page.locator('[data-tk="done-ask"]').click(); await settle();
  await page.locator('#tk-text').fill('Sent it.');
  await page.locator('[data-tk-form="close"] button[type="submit"]').click();
  await page.waitForSelector('.tk-reward', { timeout: 10_000 }).catch(() => problems.push('closing a task showed no reward'));
  await page.waitForTimeout(1000); await shot('reward');
  if (await page.locator('.clock-bar:not([hidden])').count()) problems.push('finishing the task left its clock running');
  if (!writes.some(([path]) => path === '/api/brain/clock') || !writes.some(([path]) => path === '/api/brain/close')) problems.push('expected clock and close writes');
  await page.locator('.tk button[data-tk="hide"]').first().click(); await settle();
}
// Allocation: an area with no rows reads "not recorded", never 0 (Brain D-114 A).
await page.goto(`${base}/brain/#allocation`); await settle(); await page.waitForTimeout(600);
if (!(await page.locator('.cc-lane', { hasText: 'not recorded' }).count())) problems.push('an area with no rows does not read not recorded');
if (await page.locator('.cc-lane', { hasText: /\b0 min of/ }).count()) problems.push('Allocation shows a false zero');
// The pick made above is read back from the daily log after a reload (Brain D-113 A).
await page.goto(`${base}/brain/#focus`); await page.reload({ waitUntil: 'networkidle' }); await settle(); await page.waitForTimeout(600);
await page.locator('[data-cc-lens="work"]').click(); await settle();
if (!(await page.locator('a.cc-focal[data-cc-ref="WORK-SYS-60101.10"]').count())) problems.push('the pick did not survive a reload');
// What the routines found is settled from the row (Brain D-112 A): Reject asks first, Confirm is
// one tap and the row leaves the group; Close all is one commit.
await page.goto(`${base}/brain/#inbox`); await settle();
await page.locator('[data-cc-lens="work"]').click(); await settle();
const freshRow = page.locator('.cc-acts[data-cc-acts="P-WORK-COMP-60101.07"]');
if (await freshRow.count()) {
  if (!(await page.locator('.cc-batch[data-cc-batch="close-proposed"]').count())) problems.push('no Close all button for the proposed closes');
  await freshRow.locator('[data-cc-act="reject-ask"]').click(); await settle();
  if (!(await page.locator('.cc-acts[data-cc-acts="P-WORK-COMP-60101.07"] [data-cc-act="reject"]').count())) problems.push('Reject on the row did not ask first');
  await shot('inbox-row-reject');
  await page.locator('.cc-acts[data-cc-acts="P-WORK-COMP-60101.07"] [data-cc-act="cancel"]').click(); await settle();
  const confirms = () => writes.filter(([path]) => path === '/api/brain/confirm').length;
  const before = confirms();
  await page.locator('.cc-acts[data-cc-acts="P-WORK-COMP-60101.07"] [data-cc-act="confirm"]').click(); await settle();
  if (confirms() !== before + 1) problems.push('Confirm on the row did not write');
  if (await page.locator('.cc-acts[data-cc-acts="P-WORK-COMP-60101.07"]').count()) problems.push('a confirmed row stayed in the group');
  await page.locator('.cc-batch[data-cc-batch="close-proposed"]').click(); await settle();
  if (!writes.some(([path]) => path === '/api/brain/confirm-all')) problems.push('Close all wrote nothing');
  if (await page.locator('.cc-acts[data-cc-acts="WORK-LEAD-60101.09"]').count()) problems.push('Close all left a closed row behind');
  await shot('inbox-after-close-all');
} else problems.push('the new item has no row acts on the Inbox tab');

await browser.close();
server?.close();
console.log(shots.map((s) => `  ${s}`).join('\n'));
console.log(problems.length ? `Problems:\n${problems.map((p) => `  - ${p}`).join('\n')}` : 'No problems found.');
process.exitCode = problems.length ? 1 : 0;
