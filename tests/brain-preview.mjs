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
  ],
  lenses: {
    work: slot({ focal: { ref: 'WORK-SYS-60101.01', reason: 'chosen by the morning brief' }, hot_total: 1,
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
  { date: today, kind: 'entered', start: '', end: '', minutes: 120, ref: '', area: '2', lens: 'work', note: 'entered on the viewer' },
  { date: today, kind: 'tracked', start: '19:00', end: '20:00', minutes: 60, ref: 'DEV-60101.06', area: '', lens: 'brain', note: 'Synthetic' },
];
const writes = [];

function answer(url, method = 'GET', body = null) {
  const u = new URL(url);
  if (method === 'POST') { writes.push([u.pathname, body]); return { path: 'synthetic', sha: 'x', commit: null }; }
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
await page.goto(`${base}/brain/#priority`); await settle(); await shot('priority');
await page.goto(`${base}/brain/#clarify`); await settle(); await shot('clarify');
if (!(await page.locator('.cc-inbox').count())) problems.push('the Clarify tab is empty');
await page.goto(`${base}/brain/#clarify`); await settle();
const line = page.locator('a[data-cc-line]').first();
if (await line.count()) {
  await line.click(); await settle();
  if (!(await page.locator('[data-tk-form="categorise"]').count())) problems.push('an inbox line did not open its categorisation card');
  await page.locator('#cg-next').fill('Write it up');
  await page.locator('#cg-minutes').selectOption('60');
  await shot('categorise');
  await page.locator('[data-tk-form="categorise"] button[type="submit"]').click(); await settle();
  if (!writes.some(([path]) => path === '/api/brain/categorise')) problems.push('saving the categorisation card wrote nothing');
}
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
await page.locator('[data-cc-lens="work"]').click(); await settle();
if (!(await page.locator('.cc-inbox .cc-row').count())) problems.push('no inbox rows on the home');
const focal = page.locator('a.cc-focal');
if (await focal.count()) {
  await focal.click(); await settle();
  if (await page.locator('.tk-wrap:not([hidden]) [data-tk="start"]').count()) await shot('task-card');
  else problems.push('tapping the focal item did not open its card, clock not started');
  await page.locator('[data-tk="start"]').click(); await settle();
  if (!(await page.locator('.tk-wrap:not([hidden]) .tk-time').count())) problems.push('Start did not start the clock');
  await shot('task-clock');
  await page.locator('[data-tk="progress-ask"]').click(); await settle(); await shot('task-progress');
  await page.locator('[data-tk="cancel"]').click();
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
}

await browser.close();
server?.close();
console.log(shots.map((s) => `  ${s}`).join('\n'));
console.log(problems.length ? `Problems:\n${problems.map((p) => `  - ${p}`).join('\n')}` : 'No problems found.');
process.exitCode = problems.length ? 1 : 0;
