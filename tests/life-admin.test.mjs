// Run: node --test tests/life-admin.test.mjs
// The site is deliberately static without a root "type": "module" package.
// Load the ES module source via a data URL to keep this test dependency-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../site/life/core.js', import.meta.url), 'utf8');
const core = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('local ISO dates do not use UTC day boundaries', () => {
  const d = new Date(2026, 9, 11, 23, 40);
  assert.equal(core.todayISO(d), '2026-10-11');
  assert.equal(core.addDays('2026-10-11', 7), '2026-10-18');
  assert.equal(core.parseDate('2026-02-30'), null);
});

test('recurrence advances missed dates, without drifting at month-end', () => {
  assert.equal(core.nextRecurrence('2026-10-01', 'fortnightly', '2026-10-31'), '2026-11-12');
  assert.equal(core.nextRecurrence('2028-01-31', 'monthly', '2028-01-31'), '2028-02-29');
  assert.equal(core.nextRecurrence('2028-01-31', 'monthly', '2028-03-01'), '2028-03-31');
  assert.equal(core.nextRecurrence('2026-12-01', 'monthly', '2026-10-11'), '2027-01-01');
  assert.equal(core.nextRecurrence('2026-10-01', 'none', '2026-10-11'), '');
});

test('import refuses unrelated or oversized backups', () => {
  assert.throws(() => core.normaliseState({ tasks: [] }), /version 1/);
  const raw = core.initialState();
  raw.tasks = Array.from({ length: 10001 }, (_, i) => ({ id: String(i), title: 'x' }));
  assert.throws(() => core.normaliseState(raw), /record limits/);
});

test('imports validate dates, IDs, URLs and unexpected fields', () => {
  const raw = core.initialState();
  raw.projects.push({ id: 'same', title: 'Make a move', area: 'home' });
  raw.tasks.push({ id: 'same', title: '<img onerror=attack>', due: '2026-02-30', repeat: 'weekly', projectId: 'same', hacker: true });
  raw.tasks.push({ id: 'same', title: 'Another step', due: '2026-11-01', projectId: 'no-such-outcome' });
  raw.records.push({ id: 'rec', title: 'Useful link', area: 'money', link: 'javascript:alert(1)' });
  const normal = core.normaliseState(raw);
  assert.equal(normal.tasks[0].due, '');
  assert.equal(normal.tasks[0].projectId, 'same');
  assert.equal(normal.tasks[1].projectId, '');
  assert.notEqual(normal.tasks[0].id, normal.tasks[1].id);
  assert.equal(normal.records[0].link, '');
  assert.equal('hacker' in normal.tasks[0], false);
  assert.equal(core.esc(normal.tasks[0].title), '&lt;img onerror=attack&gt;');
});

test('metrics exclude completed actions and classify open actions', () => {
  const raw = core.initialState();
  raw.tasks = [
    { title: 'Late', status: 'todo', due: '2026-10-10', projectId: '' },
    { title: 'Waiting', status: 'waiting', due: '2026-10-12', projectId: '' },
    { title: 'Done', status: 'done', due: '2026-10-11', projectId: '' }
  ];
  const metrics = core.metrics(raw, '2026-10-11');
  assert.equal(metrics.open, 2);
  assert.equal(metrics.overdue, 1);
  assert.equal(metrics.soon, 1);
  assert.equal(metrics.waiting, 1);
});

test('outcome progress counts linked completed tasks', () => {
  const raw = core.initialState();
  raw.tasks = [
    { projectId: 'p', status: 'done' },
    { projectId: 'p', status: 'todo' },
    { projectId: 'other', status: 'done' }
  ];
  assert.deepEqual(core.projectProgress(raw, 'p'), { done: 1, total: 2, pct: 50 });
});
