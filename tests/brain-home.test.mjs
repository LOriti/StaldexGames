// Run: node --test tests/brain-home.test.mjs
// Loaded via a data URL like the other Brain viewer tests (no root package.json).
// Synthetic data only: no Brain content in this public repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/brain/home.js', import.meta.url), 'utf8');
const home = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const entry = (ref, extra = {}) => ({
  ref, title: `Task ${ref}`, source: 'item', home: 'project:alpha', lens: 'work', context: 'emails',
  area: null, hot: [], section: 'next', blocked_by: [], claude: null, no_owner: false, ...extra,
});
const slot = (extra = {}) => ({
  focal: null, hot: [], hot_total: 0, claude: [], claude_total: 0,
  quiet: { needs_review_date: [], no_owner: [], unconfirmed: [], close_proposed: [] },
  contexts: { emails: { count: 2, hot: true }, calls: { count: 0, hot: false } }, areas: {}, ...extra,
});
const VIEW = {
  schema: 'brain-command-centre/1', date: '2026-10-26',
  work_hours: { work_days: [0, 1, 2, 3, 4], work_start: '08:00', work_end: '17:00' },
  entries: [
    entry('A-1', { section: 'hot', hot: ['overdue 3 d'] }),
    entry('A-2', { title: '<img src=x onerror=alert(1)>' }),
    entry('alpha-001', { source: 'card', lens: 'ventures', context: 'computer', claude: 'ready' }),
    entry('D-9', { home: 'project:alpha', lens: 'ventures' }),
    entry('beta-001', { home: 'project:beta', lens: 'brain' }),
  ],
  lenses: {
    work: slot({ focal: { ref: 'A-1', reason: 'chosen by the morning brief' }, hot: [], hot_total: 1 }),
    ventures: slot({ claude: ['alpha-001'], claude_total: 1 }),
    personal: slot(),
    brain: slot(),
    all: slot({ focal: { ref: 'A-1', reason: 'hottest by rule' }, hot_total: 1, claude: ['alpha-001'], claude_total: 1 }),
  },
  allocation: { areas: { 1: { name: 'Systems', hours: 16 } }, float: 6, total: 40 },
  gaps: ['Read-only.'],
};

test('the lens follows Perth working hours, whatever the phone clock says', () => {
  const hours = VIEW.work_hours;
  assert.equal(home.defaultLens(hours, new Date('2026-10-26T02:00:00Z')), 'work'); // Mon 10:00 Perth
  assert.equal(home.defaultLens(hours, new Date('2026-10-26T11:00:00Z')), 'personal'); // Mon 19:00 Perth
  assert.equal(home.defaultLens(hours, new Date('2026-10-25T02:00:00Z')), 'personal'); // Sun 10:00 Perth
});

test('tapping an entry opens where it lives', () => {
  assert.equal(home.sourcePath(entry('alpha-001', { source: 'card' })), 'projects/alpha/QUEUE.md');
  assert.equal(home.sourcePath(entry('D-9')), 'register/decisions.md');
  assert.equal(home.sourcePath(entry('A-1')), 'register/open-items.md');
});

test('focus shows the focal item and its reason', () => {
  const html = home.homeHtml(VIEW, { lens: 'work', tab: 'focus' });
  assert.match(html, /The one thing/);
  assert.match(html, /Task A-1/);
  assert.match(html, /chosen by the morning brief/);
  assert.match(html, /overdue 3 d/);
});

test('a lens with nothing hot is calm and points to a door', () => {
  const html = home.homeHtml(VIEW, { lens: 'personal', tab: 'focus' });
  assert.match(html, /Nothing hot/);
  assert.match(html, /data-cc-context="emails"/);
});

test('priority filters by lens and door, and escapes Brain text', () => {
  const work = home.homeHtml(VIEW, { lens: 'work', tab: 'priority' });
  assert.doesNotMatch(work, /alpha-001/);
  assert.doesNotMatch(work, /<img/);
  assert.match(work, /&lt;img src=x/);
  const ventures = home.homeHtml(VIEW, { lens: 'ventures', tab: 'priority', filter: { type: 'context', value: 'computer' } });
  assert.match(ventures, /alpha-001/);
  assert.doesNotMatch(ventures, /D-9/);
});

test('allocation lists the areas and float', () => {
  const html = home.homeHtml(VIEW, { lens: 'work', tab: 'allocation' });
  assert.match(html, /1 Systems/);
  assert.match(html, /Float/);
});

test('the quiet line links what awaits confirmation to the register', () => {
  const quiet = { needs_review_date: [], no_owner: [], unconfirmed: ['P-X-1'], close_proposed: ['Y-2', 'Y-3'] };
  const view = { ...VIEW, lenses: { ...VIEW.lenses, work: { ...VIEW.lenses.work, quiet } } };
  assert.match(home.homeHtml(view, { lens: 'work', tab: 'focus' }),
    /<a href="#\/register\/open-items\.md">Clarify: 1 unconfirmed, 2 close proposed<\/a>/);
  assert.doesNotMatch(home.homeHtml(VIEW, { lens: 'work', tab: 'focus' }), /Clarify/);
});

test('Brain has its own lens, and an older view without it falls back to All', () => {
  const brain = home.homeHtml(VIEW, { lens: 'brain', tab: 'priority' });
  assert.match(brain, /data-cc-lens="brain" aria-pressed="true">Brain</);
  assert.match(brain, /beta-001/);
  assert.doesNotMatch(brain, /alpha-001/);
  const { brain: _drop, ...older } = VIEW.lenses;
  const html = home.homeHtml({ ...VIEW, lenses: older }, { lens: 'brain', tab: 'focus' });
  assert.doesNotMatch(html, /data-cc-lens="brain"/);
  assert.match(html, /data-cc-lens="all" aria-pressed="true"/);
});
