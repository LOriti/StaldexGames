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

test('outside working hours the page opens on the lens last used (Brain D-116 A)', () => {
  const hours = VIEW.work_hours;
  const work = new Date('2026-10-26T02:00:00Z'); const evening = new Date('2026-10-26T11:00:00Z'); const sunday = new Date('2026-10-25T02:00:00Z');
  assert.equal(home.openingLens(hours, 'brain', work), 'work', 'working hours still open on Work');
  assert.equal(home.openingLens(hours, 'brain', evening), 'brain');
  assert.equal(home.openingLens(hours, 'ventures', sunday), 'ventures');
  assert.equal(home.openingLens(hours, null, evening), 'personal');
  assert.equal(home.openingLens(hours, 'nope', evening), 'personal');
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

test('what is not clarified lives on the Inbox tab, with a count and a link from Focus (Clarify folded in)', () => {
  const quiet = { needs_review_date: ['A-2'], no_owner: [], unconfirmed: ['A-1'], close_proposed: [] };
  const view = { ...VIEW, lenses: { ...VIEW.lenses, work: { ...VIEW.lenses.work, quiet } } };
  const focus = home.homeHtml(view, { lens: 'work', tab: 'focus' });
  assert.match(focus, /<a href="#inbox">\d+ to clarify/);
  assert.match(focus, /href="#inbox">Inbox <span class="cc-n">\d+<\/span>/);
  assert.doesNotMatch(focus, /href="#clarify"/);
  const inbox = home.homeHtml(view, { lens: 'work', tab: 'inbox', projects: ['alpha'] });
  assert.match(inbox, /New items to confirm <em>1<\/em>[\s\S]*data-cc-ref="A-1"/);
  assert.match(inbox, /Parked without a review date <em>1<\/em>[\s\S]*data-cc-ref="A-2"/);
  assert.match(inbox, /No estimate yet/);
  assert.ok(inbox.indexOf('cc-inbox-add') < inbox.indexOf('New items to confirm'), 'the add box comes first');
  assert.equal(home.homeHtml(view, { lens: 'work', tab: 'clarify', projects: ['alpha'] }), inbox, 'the old #clarify still lands on the Inbox tab');
  const sorted = { ...VIEW, entries: VIEW.entries.map((e) => ({ ...e, minutes: '30' })) };
  assert.match(home.homeHtml(sorted, { lens: 'personal', tab: 'inbox' }), /Nothing to clarify in this lens/);
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
  assert.match(html, /Show all 9/);
  // Register flags are not in Focus's panel any more (Brain D-115 C): the flags line opens the Inbox tab.
  assert.doesNotMatch(html, /item=P-X-1\.01"/);
  assert.match(html, /<a class="cc-flags" href="#inbox">1 to confirm →<\/a>/);
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
  assert.match(tab, /Recorded on 2 days this week/);
  assert.match(tab, /<form class="cc-hours">/);
  assert.match(home.homeHtml(VIEW, { lens: 'work', tab: 'allocation', time: { rows: [], monday: '2030-01-06' } }), /Nothing recorded this week yet/);
});

test('no false zero on Allocation (Brain D-114 A): one minute is not a recorded week, and an area with no rows is not 0', () => {
  const view = { ...VIEW, allocation: { areas: { 1: { name: 'Systems', hours: 16 }, 2: { name: 'Compliance', hours: 8 } }, float: 6, total: 40 } };
  // The 26 October case: a single 1-minute clock test.
  const minute = [{ date: '2030-01-06', kind: 'tracked', minutes: 1, area: '', lens: 'work' }];
  assert.equal(home.weekActuals(minute, '2030-01-06').days, 0);
  const tab1 = home.homeHtml(view, { lens: 'work', tab: 'allocation', time: { rows: minute, monday: '2030-01-06' } });
  assert.match(tab1, /Nothing recorded this week yet/);
  assert.doesNotMatch(tab1, /0 min of/);
  // An empty week.
  assert.doesNotMatch(home.homeHtml(view, { lens: 'work', tab: 'allocation', time: { rows: [], monday: '2030-01-06' } }), /0 min|not recorded ·/);
  // A week with one area recorded: the other reads "not recorded", lenses with no rows too.
  const one = [{ date: '2030-01-06', kind: 'entered', minutes: 120, area: '1', lens: 'work' }, { date: '2030-01-07', kind: 'tracked', minutes: 10, area: '1', lens: 'work' }];
  const a = home.weekActuals(one, '2030-01-06');
  assert.equal(a.days, 1, 'a day with under 15 minutes is not a recorded day');
  const tab = home.homeHtml(view, { lens: 'work', tab: 'allocation', time: { rows: one, monday: '2030-01-06' } });
  assert.match(tab, /2 h 10 min of 16 h a week/);
  assert.match(tab, /2 Compliance<small>not recorded · 8 h a week/);
  assert.match(tab, /Volunteering not recorded · Ventures not recorded · Personal not recorded · Brain not recorded/);
  assert.doesNotMatch(tab, /\b0 min/);
  assert.equal((tab.match(/class="cc-meter/g) || []).length, 1, 'a meter only where time is known');
  // The clock's first minute is a grace period: stopped inside it, nothing is written.
  const clock = { startMs: Date.parse('2030-01-06T09:00:00+08:00') };
  assert.equal(home.clockRecords(clock, clock.startMs + 29_000), false);
  assert.equal(home.clockRecords(clock, clock.startMs + home.CLOCK_GRACE_MS), true);
  // Focal rows carry no time.
  assert.equal(home.weekActuals([{ date: '2030-01-06', kind: 'focal', minutes: 0, ref: 'A-1', lens: 'work' }], '2030-01-06').days, 0);
});

test('the one thing can be Leon\'s pick from the daily log, ahead of the brief\'s (Brain D-113 A)', () => {
  const rows = [
    { date: '2030-01-06', kind: 'focal', start: '08:00', minutes: 0, ref: 'A-2', lens: 'work' },
    { date: '2030-01-07', kind: 'focal', start: '08:00', minutes: 0, ref: 'A-1', lens: 'work' },
    { date: '2030-01-07', kind: 'focal', start: '09:00', minutes: 0, ref: 'A-2', lens: 'work' },
  ];
  assert.deepEqual(home.latestFocal(rows, '2030-01-07'), { ref: 'A-2' });
  assert.deepEqual(home.latestFocal(rows, '2030-01-06'), { ref: 'A-2' });
  assert.equal(home.latestFocal(rows, '2030-01-08'), null, 'yesterday\'s pick does not carry over');
  assert.deepEqual(home.latestFocal([...rows, { date: '2030-01-07', kind: 'focal', start: '10:00', minutes: 0, ref: '', lens: 'work' }], '2030-01-07'), { ref: '' }, 'an empty item clears the pick');
  const view = JSON.parse(JSON.stringify({ ...VIEW, entries: [...VIEW.entries, entry('A-3', { section: 'hot', hot: ['due today'] })] }));
  view.lenses.work.hot = ['A-3'];
  view.lenses.work.hot_total = 2;
  // The brief's pick stands until Leon picks.
  assert.equal(home.focalChoice(view, 'work', null).entry.ref, 'A-1');
  assert.equal(home.focalChoice(view, 'work', { ref: '' }).entry.ref, 'A-1');
  assert.equal(home.focalChoice(view, 'work', { ref: '' }).mine, false);
  // Leon's pick wins, with its reason; the displaced hot item goes back to Also hot.
  const pick = home.focalChoice(view, 'work', { ref: 'A-2' });
  assert.deepEqual([pick.entry.ref, pick.reason, pick.mine], ['A-2', 'your pick for today', true]);
  const html = home.homeHtml(view, { lens: 'work', focal: { ref: 'A-2' } });
  assert.match(html, /class="cc-focal" href="#\/register\/open-items\.md\?item=A-2"[\s\S]*your pick for today/);
  assert.match(html, /Also hot[\s\S]*data-cc-ref="A-1"[\s\S]*data-cc-ref="A-3"/);
  // A pick outside the lens, or not actionable, falls back to the view's.
  assert.equal(home.focalChoice(view, 'work', { ref: 'alpha-001' }).entry.ref, 'A-1');
  assert.equal(home.focalChoice(view, 'ventures', { ref: 'alpha-001' }).entry.ref, 'alpha-001');
  assert.equal(home.focalChoice(view, 'personal', { ref: 'A-9' }), null);
  // The card: any hot or next item offers the slot; the current pick offers the way back.
  assert.match(home.taskHtml(entry('A-2'), { focal: { ref: 'A-1', mine: false } }), /data-tk="focal-set">Make this the one thing/);
  const own = home.taskHtml(entry('A-2'), { focal: { ref: 'A-2', mine: true } });
  assert.match(own, /This is the one thing today, your pick/);
  assert.match(own, /data-tk="focal-clear">Back to the brief’s pick/);
  assert.doesNotMatch(own, /focal-set/);
  const theirs = home.taskHtml(entry('A-1'), { focal: { ref: 'A-1', mine: false } });
  assert.match(theirs, /This is the one thing today\./);
  assert.doesNotMatch(theirs, /focal-clear|focal-set/);
  assert.doesNotMatch(home.taskHtml(entry('A-5', { section: 'waiting' }), { focal: { ref: 'A-1', mine: false } }), /focal-set/);
});

test('every row carries its flag, nothing repeats on Focus, and the inbox count means captures (Brain D-115 A)', () => {
  const view = JSON.parse(JSON.stringify({ ...VIEW, entries: [...VIEW.entries,
    entry('P-A-6', { section: 'hot', hot: ['due today'], flags: ['unconfirmed'] }),
    entry('A-7', { flags: ['close-proposed'], evidence: 'a sent reply' })] }));
  view.lenses.work.hot = ['P-A-6'];
  view.lenses.work.hot_total = 2;
  view.inbox = [
    { kind: 'unconfirmed', text: 'Task P-A-6', home: 'project:alpha', date: '2030-01-02', path: 'register/open-items.md', ref: 'P-A-6', lens: 'work' },
    { kind: 'close', text: 'Task A-7', home: 'project:alpha', date: '2030-01-02', path: 'register/open-items.md', ref: 'A-7', lens: 'work' },
    { kind: 'close', text: 'Task A-1', home: 'project:alpha', date: '2030-01-01', path: 'register/open-items.md', ref: 'A-1', lens: 'work' },
    { kind: 'line', text: 'Buy milk', raw: 'Buy milk', details: {}, family: '?', home: 'project:alpha', date: '2030-01-01', path: 'projects/alpha/QUEUE.md', ref: null, lens: 'work' },
  ];
  const focus = home.homeHtml(view, { lens: 'work' });
  assert.match(focus, /Also hot[\s\S]*data-cc-ref="P-A-6"[\s\S]*<span class="cc-chip flag">new, confirm\?<\/span>/);
  assert.equal((focus.match(/item=P-A-6"/g) || []).length, 1, 'the hot new item is not repeated in the inbox panel');
  assert.equal((focus.match(/item=A-1"/g) || []).length, 1, 'the focal item\'s proposed close is not repeated');
  assert.doesNotMatch(focus, /item=A-7"/, 'register flags left the Focus panel for the Inbox tab (D-115 C)');
  assert.match(focus, /<h2 class="cc-gh">Inbox <em>1<\/em><\/h2><a class="cc-flags" href="#inbox">1 to confirm, 2 closes proposed →<\/a>/);
  const priority = home.homeHtml(view, { lens: 'work', tab: 'priority' });
  assert.match(priority, /data-cc-ref="A-7"[\s\S]*?<span class="cc-chip flag">close proposed<\/span>/);
  const inbox = home.homeHtml(view, { lens: 'work', tab: 'inbox' });
  assert.match(inbox, /To clarify <em>1<\/em>/);
  assert.match(inbox, /Proposed closes <em>2<\/em>[\s\S]*data-cc-ref="A-7"/);
  assert.match(home.taskHtml(view.entries.find((e) => e.ref === 'A-7')), /A routine thinks this is done: <q>a sent reply<\/q>/);
  assert.deepEqual(home.flagChips(entry('X', { flags: ['unconfirmed', 'close-proposed', 'other'] })).length, 2);
});

test('a close-proposed decision shows one close first, Decided as the alternative (Brain D-117 B)', () => {
  const choice = entry('X-1.06', { kind: 'decision', flags: ['close-proposed'], evidence: 'Leon chose Friday in the thread.' });
  const html = home.taskHtml(choice);
  assert.ok(html.indexOf('data-tk="confirm-close"') < html.indexOf('data-tk="done-ask"'), 'the proposed close comes first');
  assert.match(html, /<button type="button" class="mini-btn primary" data-tk="confirm-close">Yes, it’s done/);
  assert.match(html, /<button type="button" class="mini-btn" data-tk="done-ask">Decided otherwise…/);
  assert.match(html, /Confirm it to record that as the outcome/);
  assert.equal((html.match(/class="mini-btn primary"/g) || []).length, 2, 'the clock\'s Start and the proposed close');
  const action = home.taskHtml(entry('X-1.07', { flags: ['close-proposed'] }));
  assert.match(action, /class="mini-btn" data-tk="done-ask">Done…/);
});

test('due chips are recomputed against today\'s Perth date when the view is from an earlier day', () => {
  assert.equal(home.dueChip('2030-01-05', '2030-01-07'), 'overdue 2 d');
  assert.equal(home.dueChip('2030-01-07', '2030-01-07'), 'due today');
  assert.equal(home.dueChip('2030-01-08', '2030-01-07'), 'due tomorrow');
  assert.equal(home.dueChip('2030-01-09', '2030-01-07'), 'due Wed 09 Jan');
  assert.equal(home.dueChip('2030-01-10', '2030-01-07'), null);
  assert.equal(home.dueChip('unknown', '2030-01-07'), null);
  const view = JSON.parse(JSON.stringify({ ...VIEW, date: '2030-01-06', entries: [
    entry('A-1', { section: 'hot', hot: ['due tomorrow', 'flagged hot'], due: '2030-01-07' }),
    entry('A-2', { due: '2030-01-07' }),
    entry('A-3', { due: '2030-02-07' }),
  ] }));
  view.lenses.work.hot = []; view.lenses.work.hot_total = 1; view.lenses.all.hot_total = 1;
  home.refreshDue(view, '2030-01-07');
  const by = Object.fromEntries(view.entries.map((e) => [e.ref, e]));
  assert.deepEqual(by['A-1'].hot, ['due today', 'flagged hot']);
  assert.deepEqual([by['A-2'].section, by['A-2'].hot], ['hot', ['due today']]);
  assert.deepEqual(view.lenses.work.hot, ['A-2']);
  assert.equal(view.lenses.work.hot_total, 2);
  assert.deepEqual([by['A-3'].section, by['A-3'].hot], ['next', []]);
  const same = JSON.parse(JSON.stringify(view));
  home.refreshDue(same, '2030-01-07');
  assert.deepEqual(same, view, 'a view from today is left alone');
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
  assert.equal(home.closeKind(entry('P-X-1.01')), 'item', 'a P- item closes in one go (D-112 A)');
  assert.equal(home.isUnconfirmed(entry('P-X-1.01')), true);
  assert.match(home.taskHtml(entry('P-X-1.01')), /data-tk="done-ask">Done…/);
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
  assert.equal(home.isUnconfirmed(entry('X-1.03', { flags: ['unconfirmed'] })), true);
  assert.equal(home.closeKind(entry('X-1.03', { flags: ['unconfirmed'] })), 'item');
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
  assert.doesNotMatch(html, /data-cc-sort="A-2"/, 'a new item is settled from its row on the Inbox tab, not a form');
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

test('a register decision shows Decided and asks for the outcome (Brain D-111 A)', () => {
  const choice = entry('X-1.05', { kind: 'decision' });
  assert.equal(home.closeKind(choice), 'decide');
  const html = home.taskHtml(choice);
  assert.match(html, /data-tk="done-ask">Decided…/);
  assert.doesNotMatch(html, /settled by replying to it in a session/);
  assert.match(home.taskPanel('done', choice), /data-tk-form="decide".*What did you decide\?/);
  assert.match(home.taskHtml(entry('D-4')), /settled by replying to it in a session/);
});

test('every flagged row carries one-tap Confirm and Reject, with Next and Evidence (Brain D-112 A)', () => {
  const fresh = entry('P-A-8', { flags: ['unconfirmed'], next: 'Answer it.' });
  const acts = home.rowActs(fresh);
  assert.match(acts, /<div class="cc-acts" data-cc-acts="P-A-8"><button type="button" class="mini-btn primary" data-cc-act="confirm" data-ref="P-A-8">Confirm<\/button><button type="button" class="mini-btn" data-cc-act="reject-ask" data-ref="P-A-8">Reject…<\/button><\/div>/);
  assert.match(home.rowActs(fresh, 'reject'), /Reject P-A-8\?[\s\S]*data-cc-act="reject"[\s\S]*data-cc-act="cancel"/);
  const closing = entry('A-9', { flags: ['close-proposed'], next: 'Send it.', evidence: 'Sent 2 Jan.' });
  assert.match(home.rowActs(closing), /data-cc-act="close"[^>]*>Yes, it’s done<\/button><button type="button" class="mini-btn" data-cc-act="keep-ask"/);
  assert.doesNotMatch(home.rowActs(closing), /data-cc-act="confirm"|reject-ask/);
  assert.match(home.rowActs(closing, 'keep'), /Keep A-9 open\?[\s\S]*data-cc-act="keep"/);
  const both = entry('P-A-10', { flags: ['unconfirmed', 'close-proposed'] });
  assert.match(home.rowActs(both), /data-cc-act="close"[\s\S]*data-cc-act="confirm"[^>]*>Confirm, keep open[\s\S]*keep-ask[\s\S]*reject-ask/);
  assert.equal(home.rowActs(entry('A-11')), '');
  const view = JSON.parse(JSON.stringify({ ...VIEW, entries: [...VIEW.entries, fresh, closing, both] }));
  view.lenses.work.hot = ['P-A-8'];
  view.lenses.work.quiet = { needs_review_date: [], no_owner: [], unconfirmed: ['P-A-8', 'P-A-10'], close_proposed: ['A-9', 'P-A-10'] };
  const focus = home.homeHtml(view, { lens: 'work' });
  assert.match(focus, /<div class="cc-item"><a class="cc-row" href="[^"]+" data-cc-ref="P-A-8">[\s\S]*<span class="cc-next"><b>Next<\/b> Answer it\.<\/span>[\s\S]*<\/a><div class="cc-acts" data-cc-acts="P-A-8">/);
  const inbox = home.homeHtml(view, { lens: 'work', tab: 'inbox' });
  assert.match(inbox, /New items to confirm <em>2<\/em><\/h2><p class="cc-batch-row"><button type="button" class="mini-btn primary cc-batch" data-cc-batch="unconfirmed" data-ids="P-A-8,P-A-10">Confirm all 2<\/button>/);
  assert.match(inbox, /Proposed closes <em>2<\/em><\/h2><p class="cc-batch-row"><button[^>]*data-cc-batch="close-proposed" data-ids="A-9,P-A-10">Close all 2<\/button>/);
  assert.match(inbox, /data-cc-ref="A-9"[\s\S]*<span class="cc-ev"><b>Evidence<\/b> Sent 2 Jan\.<\/span>/);
  view.lenses.work.quiet.close_proposed = ['A-9'];
  view.entries.find((e) => e.ref === 'P-A-10').flags = ['unconfirmed'];
  assert.doesNotMatch(home.homeHtml(view, { lens: 'work', tab: 'inbox' }), /Close all/, 'one item needs no batch button');
});

test('the Inbox tab walks a raw line through the GTD questions (Brain DEV-61026.33)', () => {
  const row = { kind: 'line', text: 'Insurance <renewal>', raw: 'Insurance <renewal>', details: {}, family: 'PA-FIN', home: 'project:alpha', lens: 'personal' };
  const walk = { row, step: 'actionable', a: {}, history: [] };
  const first = home.walkHtml(walk);
  assert.match(first, /Is it actionable\?/);
  assert.match(first, /Insurance &lt;renewal&gt;/);
  for (const act of ['yes', 'someday', 'reference', 'trash-ask']) assert.match(first, new RegExp(`data-wk="${act}"`));
  assert.doesNotMatch(first, /data-wk="trash"/, 'Trash asks first');
  assert.match(home.walkHtml({ ...walk, asking: 'trash' }), /data-wk="trash">Yes, trash it/);
  // (1) The next physical action, checked (D-106 C), and one or several (D-108 A).
  assert.deepEqual(home.actionCheck('Ring Sam about the quote'), { ok: true, note: '' });
  assert.equal(home.actionCheck('The quote').ok, false);
  assert.equal(home.actionCheck('Insurance').ok, false);
  assert.equal(home.actionCheck('Think about the quote').ok, true);
  assert.match(home.actionCheck('Think about the quote').note, /“think about” is not an action/);
  const action = home.walkHtml({ ...walk, step: 'action', a: { next: 'Look into it' } });
  assert.match(action, /data-wk-form="action"[\s\S]*name="next"[\s\S]*“look into” is not an action/);
  assert.match(action, /name="kind" value="project"/);
  // (2) Two minutes: the countdown and the record.
  const now = Date.parse('2030-01-06T09:00:00+08:00');
  const doing = home.walkHtml({ ...walk, step: 'doing', a: { next: 'Ring Sam' }, startedMs: now - 30_000 }, { now });
  assert.match(doing, /data-wk-count="1">1:30</);
  assert.match(doing, /data-wk-form="done"[\s\S]*name="minutes"[^>]*value="15"/);
  assert.equal(home.fmtCountdown(-12_000), '+0:12 over');
  assert.match(home.walkHtml({ ...walk, step: 'two' }), /data-wk="two-yes"[\s\S]*data-wk="two-no"/);
  // (3) Delegate: a person (waiting, follow-up date, the handover as Leon's step, D-105 C) or Claude.
  const delegate = home.walkHtml({ ...walk, step: 'delegate', asking: 'person' });
  assert.match(delegate, /data-wk="deleg-none"[\s\S]*data-wk="deleg-person"[\s\S]*data-wk="deleg-claude"/);
  assert.match(delegate, /data-wk-form="person"[\s\S]*name="owner"[\s\S]*name="due" type="date"[\s\S]*name="handover"/);
  // (4) Priority, estimate, deadline or float; what the save carries (categorise.js reads it).
  const details = home.walkHtml({ ...walk, step: 'details', a: { next: 'Ring Sam', owner: 'sam' } }, { families: [{ code: 'PA-FIN', covers: 'Finance' }] });
  assert.match(details, /sam owns it/);
  assert.match(details, /<option value="PA-FIN" selected>/);
  assert.match(details, /name="priority"[\s\S]*name="minutes"[\s\S]*name="due" type="date"/);
  const saved = home.walkDetails({ row, a: { next: 'Ring Sam', kind: 'project', outcome: 'Cover renewed', owner: 'sam', due: '2030-02-01', handover: true, priority: 'P1', minutes: '60', family: 'PA-FIN' } }, row.text);
  assert.deepEqual(saved, { title: 'Insurance <renewal>', next: 'Ring Sam', family: 'PA-FIN', priority: 'P1', minutes: 60, due: '2030-02-01', owner: 'sam',
    kind: 'project', outcome: 'Cover renewed', ai: '', handover: 'Hand Ring Sam to sam' });
  assert.equal(home.walkDetails({ row, a: { next: 'Ring Sam', ai: 'prepare' } }, row.text).ai, 'prepare');
  assert.equal(home.walkDetails({ row, a: { next: 'Ring Sam', kind: 'action', outcome: 'ignored' } }, row.text).outcome, '');
});
