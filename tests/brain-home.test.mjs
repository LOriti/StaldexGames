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
  assert.equal(home.entryHref(entry('P-X-1.01')), '#/register/open-items.md?item=P-X-1.01');
  assert.match(home.homeHtml(VIEW, { lens: 'work' }), /href="#\/register\/open-items\.md\?item=A-1"/);
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

test('what is not prioritised lives on the Clarify tab, with a count and a link from Focus', () => {
  const quiet = { needs_review_date: ['A-2'], no_owner: [], unconfirmed: ['A-1'], close_proposed: [] };
  const view = { ...VIEW, lenses: { ...VIEW.lenses, work: { ...VIEW.lenses.work, quiet } } };
  const focus = home.homeHtml(view, { lens: 'work', tab: 'focus' });
  assert.match(focus, /<a href="#clarify">\d+ to clarify/);
  assert.match(focus, /href="#clarify">Clarify <span class="cc-n">\d+<\/span>/);
  const clarify = home.homeHtml(view, { lens: 'work', tab: 'clarify' });
  assert.match(clarify, /New items to confirm <em>1<\/em>[\s\S]*data-cc-ref="A-1"/);
  assert.match(clarify, /Parked without a review date <em>1<\/em>[\s\S]*data-cc-ref="A-2"/);
  assert.match(clarify, /No estimate yet/);
  const sorted = { ...VIEW, entries: VIEW.entries.map((e) => ({ ...e, minutes: '30' })) };
  assert.match(home.homeHtml(sorted, { lens: 'personal', tab: 'clarify' }), /Nothing to clarify in this lens/);
});

test('a view from an earlier Perth day says so', () => {
  assert.match(home.homeHtml(VIEW, { lens: 'work', today: '2026-10-27' }), /class="cc-stale"[^>]*>This view was made for 2026-10-26/);
  assert.doesNotMatch(home.homeHtml(VIEW, { lens: 'work', today: '2026-10-26' }), /cc-stale/);
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

test('the inbox sits under Also hot, filtered by lens, capped, with an add box', () => {
  const inbox = Array.from({ length: 10 }, (_, i) => ({ kind: i ? 'line' : 'unconfirmed', text: `Idea ${i}`, home: 'project:alpha',
    date: '2030-01-01', path: i ? 'projects/alpha/QUEUE.md' : 'register/open-items.md', ref: i ? null : 'P-X-1.01', lens: 'work' }));
  const view = { ...VIEW, inbox: [...inbox, { kind: 'capture', text: '<b>x</b>', home: 'area:y', date: '2030-01-02', path: 'inbox/a.md', ref: null, lens: 'personal' }] };
  const html = home.homeHtml(view, { lens: 'work', projects: ['alpha'] });
  assert.ok(html.indexOf('cc-inbox') > html.indexOf('Also hot'), 'inbox sits under Also hot');
  assert.equal((html.match(/class="cc-row cc-in"/g) || []).length, 8);
  assert.match(html, /Show all 10/);
  assert.match(html, /href="#\/register\/open-items\.md\?item=P-X-1\.01"/);
  const known = { ...view, entries: [...view.entries, entry('P-X-1.01')] };
  assert.match(home.homeHtml(known, { lens: 'work' }), /item=P-X-1\.01" data-cc-sort="P-X-1\.01"/);
  assert.match(html, /<form class="cc-inbox-add">[\s\S]*<option value="alpha"( selected)?>/);
  assert.doesNotMatch(html, /&lt;b&gt;x/, 'personal capture hidden in Work');
  assert.match(home.homeHtml(view, { lens: 'all', inboxAll: true }), /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(home.homeHtml({ ...VIEW, inbox: [] }, { lens: 'work' }), /Inbox empty in this lens/);
});

test('one clock across screens: the latest start with no matching stop', () => {
  const rows = [
    { date: '2030-01-01', kind: 'started', start: '09:00', ref: 'A-1' },
    { date: '2030-01-01', kind: 'tracked', start: '09:00', ref: 'A-1', minutes: 30 },
    { date: '2030-01-01', kind: 'started', start: '10:00', ref: 'B-1' },
    { date: '2030-01-02', kind: 'started', start: '08:00', ref: 'C-1' },
  ];
  assert.equal(home.openClock(rows).ref, 'C-1');
  assert.equal(home.openClock(rows.slice(0, 2)), null);
  assert.equal(home.clockMinutes({ date: '2030-01-01', start: '09:00' }, Date.parse('2030-01-01T09:45:00+08:00')), 45);
});

test('actuals count time spent, not plans or running clocks', () => {
  const rows = [
    { date: '2030-01-06', kind: 'tracked', minutes: 90, area: '1', lens: 'work' },
    { date: '2030-01-07', kind: 'entered', minutes: 60, area: '1', lens: 'work' },
    { date: '2030-01-07', kind: 'planned', minutes: 120, area: '2', lens: 'work' },
    { date: '2030-01-07', kind: 'started', minutes: 0, area: '2', lens: 'work' },
    { date: '2030-01-07', kind: 'tracked', minutes: 30, area: '', lens: 'brain' },
    { date: '2030-01-05', kind: 'tracked', minutes: 999, area: '1', lens: 'work' },
  ];
  const a = home.weekActuals(rows, '2030-01-06');
  assert.deepEqual(a.byArea, { 1: 150 });
  assert.deepEqual(a.byLens, { work: 150, brain: 30 });
  assert.equal(a.days, 2);
  const tab = home.homeHtml(VIEW, { lens: 'work', tab: 'allocation', time: { rows, monday: '2030-01-06' } });
  assert.match(tab, /2 h 30 min of 16 h a week/);
  assert.match(tab, /<form class="cc-hours">/);
  assert.match(home.homeHtml(VIEW, { lens: 'work', tab: 'allocation', time: { rows: [], monday: '2030-01-06' } }), /Nothing recorded this week yet/);
});

test('the task card: estimate, clock and what closing means', () => {
  const card = entry('alpha-001', { source: 'card', effort: 'M', next: 'Do it' });
  const clock = { ref: 'alpha-001', date: '2030-01-01', start: '09:00', startMs: Date.parse('2030-01-01T09:00:00+08:00'), written: true };
  const html = home.taskHtml(card, { clock, now: Date.parse('2030-01-01T09:05:07+08:00') });
  assert.match(html, /5:07/);
  assert.match(html, /M · up to 4 h/);
  assert.match(html, /data-tk="done-ask"/);
  assert.match(home.taskHtml(card, { clock: { ...clock, ref: 'B-1' } }), /data-tk="switch"/);
  assert.equal(home.closeKind(entry('D-4')), 'decision');
  assert.equal(home.closeKind(entry('P-X-1.01')), 'unconfirmed');
  assert.equal(home.closeKind(entry('X-1.01')), 'item');
  assert.doesNotMatch(home.taskHtml(entry('D-4')), /data-tk="done-ask"/);
  assert.match(home.taskPanel('done', card), /data-tk="done"/);
  assert.match(home.taskHtml(entry('P-X-1.01')), /data-tk="confirm"[\s\S]*data-tk="reject-ask"/);
  assert.doesNotMatch(home.taskHtml(entry('P-X-1.01')), /data-tk="reject"/, 'Reject asks first');
  assert.match(home.taskPanel('reject', entry('P-X-1.01')), /Reject P-X-1\.01\?[\s\S]*data-tk="reject">Yes, reject[\s\S]*data-tk="cancel"/);
  assert.match(home.homeHtml({ ...VIEW, inbox: [] }, { lens: 'ventures', projects: ['aaa', 'alpha'] }), /<option value="alpha" selected>/);
  assert.match(home.taskPanel('done', entry('X-1.01')), /data-tk-form="close"/);
  assert.match(home.homeHtml(VIEW, { lens: 'work' }), /data-cc-ref="A-1"/);
});

test('the clock starts only by hand, and time can be added by hand', () => {
  const card = entry('alpha-001', { source: 'card' });
  const idle = home.taskHtml(card);
  assert.match(idle, /data-tk="start">Start clock/);
  assert.match(idle, /data-tk="time-ask">Add time/);
  assert.match(home.taskPanel('time', card), /data-tk-form="time"[\s\S]*name="minutes"[\s\S]*step="15"/);
  const proposed = home.taskHtml(entry('X-1.02', { flags: ['close-proposed'] }));
  assert.match(proposed, /data-tk="confirm-close"[\s\S]*data-tk="reject-close"/);
  assert.equal(home.closeKind(entry('X-1.03', { flags: ['unconfirmed'] })), 'unconfirmed');
});

test('finishing a task rewards it and moves the next hot item into focus', () => {
  const view = JSON.parse(JSON.stringify({ ...VIEW, entries: [...VIEW.entries, entry('A-3', { section: 'hot', hot: ['due today'] }), entry('A-4', { section: 'hot' })] }));
  view.lenses.work.hot = ['A-3', 'A-4'];
  home.promoteNext(view, 'A-1');
  assert.deepEqual(view.lenses.work.focal, { ref: 'A-3', reason: 'next hot, after the last one was done' });
  assert.deepEqual(view.lenses.work.hot, ['A-4']);
  assert.equal(view.lenses.work.hot_total, 2);
  assert.ok(!view.entries.some((e) => e.ref === 'A-1'));
  const html = home.rewardHtml({ title: 'Send <it>', ref: 'A-1', minutes: 45, today: 3, next: { ref: 'A-3', title: 'Next one' } }, () => 0);
  assert.match(html, /Task completed/);
  assert.match(html, /Send &lt;it&gt;/);
  assert.match(html, /45 min on it today · 3 done today/);
  assert.match(html, /data-tk="next" data-ref="A-3">Next: Next one/);
});

test('contexts and areas filter Priority, not Focus (Brain D-101 B)', () => {
  assert.doesNotMatch(home.homeHtml(VIEW, { lens: 'work', tab: 'focus' }), /class="cc-doors"/);
  assert.match(home.homeHtml(VIEW, { lens: 'work', tab: 'priority' }), /class="cc-doors"><span class="cc-lbl">Contexts/);
});

test('inbox lines and new items open the categorisation card', () => {
  const view = { ...VIEW, inbox: [
    { kind: 'line', text: 'Buy milk', raw: 'Buy milk', details: {}, family: '?', home: 'project:alpha', date: '2030-01-01', path: 'projects/alpha/QUEUE.md', ref: null, lens: 'work' },
    { kind: 'line', text: 'Done one', raw: 'Done one `categorised: 2030-01-01`', details: { categorised: '2030-01-01' }, family: 'DEV', home: 'project:alpha', date: '2030-01-01', path: 'projects/alpha/QUEUE.md', ref: null, lens: 'work' },
    { kind: 'unconfirmed', text: 'New', home: 'project:alpha', date: '2030-01-01', path: 'register/open-items.md', ref: 'A-2', lens: 'work' },
  ] };
  const html = home.homeHtml(view, { lens: 'work' });
  assert.match(html, /data-cc-line="Buy milk" data-cc-project="alpha"/);
  assert.match(html, /data-cc-sort="A-2"/);
  assert.match(html, /categorised · becomes a card/);
  const fams = home.parseFamilies('| Family | Covers |\n|---|---|\n| WORK-SYS | Systems |\n| `?` | Awaiting |');
  assert.deepEqual(fams.map((f) => f.code), ['WORK-SYS', '?']);
  const card = home.categoriseHtml({ kind: 'line', text: 'Buy <milk>', details: {}, family: 'WORK-SYS', home: 'project:alpha' }, { families: fams });
  assert.match(card, /value="Buy &lt;milk&gt;"/);
  assert.match(card, /<option value="WORK-SYS" selected>/);
  assert.match(card, /name="priority"/);
  assert.match(card, /Save for grooming/);
  const item = home.categoriseHtml({ kind: 'item', entry: entry('P-WORK-COMP-60101.07', { flags: ['unconfirmed'] }) }, { families: fams });
  assert.match(item, /Save and confirm/);
  assert.doesNotMatch(item, /name="priority"/);
});

test('a categorisation card opened from a task goes back to it', () => {
  const target = { kind: 'item', entry: entry('X-1.01') };
  const from = home.categoriseHtml(target, { back: true });
  assert.match(from, /data-tk="back">‹ Back/);
  assert.match(from, /data-tk="back">Cancel/);
  const direct = home.categoriseHtml(target);
  assert.doesNotMatch(direct, /data-tk="back"/);
  assert.match(direct, /data-tk="hide">Cancel/);
});

test('adding to the inbox opens a card to sort it, do it or leave it (Brain D-110 A)', () => {
  const row = { kind: 'line', text: 'Buy <milk>', home: 'project:alpha' };
  const html = home.addedHtml(row);
  assert.match(html, /Added to the inbox/);
  assert.match(html, /Buy &lt;milk&gt;/);
  assert.match(html, /data-tk="sort-added"/);
  assert.match(html, /data-tk="do-added"/);
  assert.match(html, /data-tk="hide"[^>]*><b>Leave for later/);
  const doing = home.addedHtml(row, { doing: true, message: 'Not saved: offline.' });
  assert.match(doing, /data-tk="handled"/);
  assert.match(doing, /data-tk="added"/);
  assert.match(doing, /write-msg bad/);
});
