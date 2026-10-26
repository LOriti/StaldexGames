// Brain viewer preview: screenshots of the real page with synthetic data. Not a test.
//
//   node tests/brain-preview.mjs [--url https://staldexgames.pages.dev] [--out <dir>]
//
// Without --url it serves `site/` from this checkout on 127.0.0.1, so a change can be seen
// before it merges. With --url it opens the deployed site instead, to confirm a deploy is
// live. Either way the Worker API (/api/brain/*) is answered here with made-up data, so
// no Brain content, token or sign-in is involved. Needs Playwright with Chromium.
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
    entry('WORK-SYS-60101.01', { section: 'hot', hot: ['due tomorrow'], context: 'emails', area: '1' }),
    entry('WORK-COMP-60101.02', { area: '2' }),
    entry('PROJ-TT-60101.03', { source: 'card', home: 'project:alpha', lens: 'ventures', section: 'hot', hot: ['blocks PROJ-TT-60101.04'] }),
    entry('PA-ADMIN-60101.05', { lens: 'personal', context: 'errands' }),
    entry('DEV-60101.06', { source: 'card', home: 'project:beta', lens: 'brain', section: 'hot', hot: ['flagged hot'] }),
    entry('D-1', { home: 'project:beta', lens: 'brain', kind: 'decision' }),
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
  gaps: ['Synthetic preview data.'],
};
const filler = (n) => Array.from({ length: n }, (_, i) => `Filler paragraph ${i + 1} so the jump has somewhere to scroll.`).join('\n\n');
const item = (id, title, home) => `### ${title}\n\`id: ${id}\` \`home: ${home}\` \`kind: action\` \`state: open\` \`owner: leon\` \`due: unknown\` \`review: unknown\`\n\nSource: synthetic\nNext: Next step for ${id}.\n`;
const card = (id, title) => `### ${title}\n\n\`id: ${id}\` \`priority: P2\` \`effort: S\` \`risk: low\` \`burnable: no\` \`blocked-by: none\`\n\nOutcome: Synthetic outcome.\n`;
const FILES = {
  'INDEX.md': '# Portfolio\n\n| Project | Status |\n|---|---|\n| alpha | active |\n| beta | active |\n',
  'views/command-centre.json': JSON.stringify(VIEW),
  'register/open-items.md': `# Open items\n\n${filler(20)}\n\n${['WORK-SYS-60101.01', 'WORK-COMP-60101.02', 'PA-ADMIN-60101.05']
    .map((id) => `${item(id, `Synthetic task ${id}`, 'project:alpha')}\n${filler(6)}`).join('\n')}`,
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

function answer(url) {
  const u = new URL(url);
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
await page.route('**/api/brain/**', (route) => {
  const body = answer(route.request().url());
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
await page.goto(`${base}/brain/#allocation`); await settle(); await shot('allocation');
await page.goto(`${base}/brain/#focus`); await settle();
await page.locator('[data-cc-lens="work"]').click(); await settle();
const focal = page.locator('a.cc-focal');
if (await focal.count()) {
  await focal.click(); await page.waitForSelector('.doc h3', { timeout: 10_000 }).catch(() => {}); await settle();
  const target = await page.evaluate(() => document.querySelector('.doc h3.target')?.textContent || null);
  if (!target) problems.push('tapping the focal item did not land on its heading');
  await shot('tap-focal');
}

await browser.close();
server?.close();
console.log(shots.map((s) => `  ${s}`).join('\n'));
console.log(problems.length ? `Problems:\n${problems.map((p) => `  - ${p}`).join('\n')}` : 'No problems found.');
process.exitCode = problems.length ? 1 : 0;
