// Run: node --test tests/brain-register.test.mjs
// Synthetic register only: no Brain content in this public repository.
import test from 'node:test';
import assert from 'node:assert/strict';

const { QueueError } = await import('../worker-brain/src/queue.js');
const { confirmFlag, rejectFlag, settleAll, REGISTER_ID } = await import('../worker-brain/src/register.js');

const TODAY = '2030-01-15';
const REGISTER = '---\ntype: register\nupdated: 2030-01-01\n---\n\n# Open items\n\nIntro.\n\n' +
  '### Settled item\n`id: DEV-01010.01` `home: project:demo` `kind: action` `state: open` `owner: unknown` `due: unknown` `review: unknown`\n\n' +
  'Source: synthetic, 2030-01-01\nNext: do it.\n\n' +
  '### New item\n`id: P-DEV-01014.02` `alias: OLD-02` `home: project:demo` `kind: action` `state: open` `owner: unknown` `due: unknown` `review: unknown` `unconfirmed: 2030-01-14`\n\n' +
  'Source: synthetic, 2030-01-14\nNext: answer it.\n\n' +
  '### Probably done\n`id: PA-HOME-01012.03` `home: project:demo` `kind: verify` `state: open` `owner: unknown` `due: unknown` `review: unknown` `close-proposed: 2030-01-14`\n\n' +
  'Source: synthetic, 2030-01-12\nNext: check it.\nCorrection: 2030-01-12 owner unclear.\nEvidence: a sent reply.\n\n' +
  '### New and done\n`id: P-?-01014.04` `home: project:demo` `kind: action` `state: open` `owner: unknown` `due: unknown` `review: unknown` `unconfirmed: 2030-01-14` `close-proposed: 2030-01-14`\n\n' +
  'Source: synthetic, 2030-01-14\nNext: x.\nEvidence: a receipt\n';

const item = (text, title) => text.slice(text.indexOf(`### ${title}`)).split(/\n(?=### )/)[0];
const outside = (text, title) => text.replace(item(text, title), '').replace(/^updated: .*$/m, '');

test('register ids: dated, P- optional, nothing else', () => {
  for (const id of ['DEV-61025.14', 'P-DEV-61025.14', 'P-?-61020.02', '?-60828.08', 'WORK-PIPE-61016.03', 'P-PA-HOME-61026.123']) assert.ok(REGISTER_ID.test(id), id);
  for (const id of ['D-12', 'demo-001', 'dev-61025.14', 'P-P-DEV-61025.14x', 'DEV-6102.01', 'DEV-61025.1', ' DEV-61025.14', 'DEV-61025.14/x']) assert.ok(!REGISTER_ID.test(id), id);
});

test('confirm an unconfirmed item: flag and P- go, nothing else changes', () => {
  const out = confirmFlag(REGISTER, 'P-DEV-01014.02', 'unconfirmed', TODAY);
  assert.match(out, /^updated: 2030-01-15$/m);
  assert.equal(item(out, 'New item'), item(REGISTER, 'New item')
    .replace('`id: P-DEV-01014.02`', '`id: DEV-01014.02`').replace(' `unconfirmed: 2030-01-14`', ''));
  assert.equal(outside(out, 'New item'), outside(REGISTER, 'New item'));
});

test('reject an unconfirmed item: rejected, flag gone, P- kept, Correction added', () => {
  const out = rejectFlag(REGISTER, 'P-DEV-01014.02', 'unconfirmed', TODAY);
  const got = item(out, 'New item');
  assert.match(got, /^`id: P-DEV-01014\.02` `alias: OLD-02` .*`state: rejected` .*`review: unknown`$/m);
  assert.doesNotMatch(got, /unconfirmed/);
  assert.match(got, /Next: answer it\.\nCorrection: 2030-01-15: rejected in the viewer \(D-42\)\.\n$/);
  assert.equal(outside(out, 'New item'), outside(REGISTER, 'New item'));
});

test('confirm a proposed close: done, flag gone, Evidence kept', () => {
  const out = confirmFlag(REGISTER, 'PA-HOME-01012.03', 'close-proposed', TODAY);
  assert.equal(item(out, 'Probably done'), item(REGISTER, 'Probably done')
    .replace('`state: open`', '`state: done`').replace(' `close-proposed: 2030-01-14`', ''));
  assert.equal(outside(out, 'Probably done'), outside(REGISTER, 'Probably done'));
});

test('confirming a decision\'s proposed close records the outcome from its Evidence (Brain D-117 B)', () => {
  const text = REGISTER + '\n### Which venue\n`id: WORK-LEAD-01012.05` `home: project:demo` `kind: decision` `state: open` `owner: leon` `due: unknown` `review: unknown` `close-proposed: 2030-01-14`\n\n' +
    'Source: synthetic, 2030-01-12\nNext: pick one.\nCorrection: 2030-01-13 asked again.\nEvidence: Leon chose the cafe in his reply of 14 Jan.\n';
  const out = confirmFlag(text, 'WORK-LEAD-01012.05', 'close-proposed', TODAY);
  const got = item(out, 'Which venue');
  assert.match(got, /`kind: decision` `state: done` `owner: leon` `due: unknown` `review: unknown`\n/);
  assert.doesNotMatch(got, /close-proposed/);
  assert.match(got, /\nCorrection: Decided 2030-01-15: Leon chose the cafe in his reply of 14 Jan \(confirmed in the viewer\)\. Earlier: 2030-01-13 asked again\.\nEvidence: Leon chose the cafe in his reply of 14 Jan\.\n$/);
  assert.equal(outside(out, 'Which venue'), outside(text, 'Which venue'));
  // An action keeps only its Evidence, as before.
  assert.doesNotMatch(item(confirmFlag(REGISTER, 'PA-HOME-01012.03', 'close-proposed', TODAY), 'Probably done'), /Decided/);
  // A decision with no Evidence line still gets a Correction.
  const bare = confirmFlag(text.replace('Evidence: Leon chose the cafe in his reply of 14 Jan.\n', ''), 'WORK-LEAD-01012.05', 'close-proposed', TODAY);
  assert.match(item(bare, 'Which venue'), /Correction: Decided 2030-01-15: as the routine proposed \(confirmed in the viewer\)\./);
});

test('reject a proposed close: flag and Evidence go, Correction leads and keeps the earlier one', () => {
  const out = rejectFlag(REGISTER, 'PA-HOME-01012.03', 'close-proposed', TODAY);
  const got = item(out, 'Probably done');
  assert.match(got, /`state: open` `owner: unknown` `due: unknown` `review: unknown`\n/);
  assert.doesNotMatch(got, /close-proposed|^Evidence:/m);
  assert.match(got, /\nCorrection: 2030-01-15: proposed close rejected in the viewer \(D-42\); its evidence was: a sent reply\. Earlier: 2030-01-12 owner unclear\.\n$/);
  assert.equal(outside(out, 'Probably done'), outside(REGISTER, 'Probably done'));
});

test('an item with both flags closes in one tap, confirmed on the way (Brain D-112 A); rejecting it clears both', () => {
  const closed = item(confirmFlag(REGISTER, 'P-?-01014.04', 'close-proposed', TODAY), 'New and done');
  assert.match(closed, /^`id: \?-01014\.04` `home: project:demo` `kind: action` `state: done` `owner: unknown` `due: unknown` `review: unknown`\n/m);
  assert.doesNotMatch(closed, /unconfirmed|close-proposed/);
  assert.match(closed, /Evidence: a receipt\n$/);
  const rejected = item(rejectFlag(REGISTER, 'P-?-01014.04', 'unconfirmed', TODAY), 'New and done');
  assert.doesNotMatch(rejected, /unconfirmed|close-proposed|Evidence/);
  assert.match(rejected, /`state: rejected`[^\n]*\n\nSource: synthetic, 2030-01-14\nNext: x\.\nCorrection: 2030-01-15: rejected in the viewer \(D-42\)\.\n$/);
  const closeRejected = item(rejectFlag(REGISTER, 'P-?-01014.04', 'close-proposed', TODAY), 'New and done');
  assert.match(closeRejected, /`unconfirmed: 2030-01-14`\n/);
  assert.match(closeRejected, /Correction: 2030-01-15: proposed close rejected in the viewer \(D-42\); its evidence was: a receipt\.\n$/);
});

test('an item without the flag, an unknown id or a duplicate is refused', () => {
  const code = (fn, expected) => assert.throws(fn, (e) => e instanceof QueueError && e.code === expected);
  code(() => confirmFlag(REGISTER, 'DEV-01010.01', 'unconfirmed', TODAY), 'not-flagged');
  code(() => rejectFlag(REGISTER, 'DEV-01010.01', 'close-proposed', TODAY), 'not-flagged');
  code(() => confirmFlag(REGISTER, 'P-DEV-01014.02', 'close-proposed', TODAY), 'not-flagged');
  code(() => confirmFlag(REGISTER, 'DEV-01014.02', 'unconfirmed', TODAY), 'unknown-id'); // P- is part of the id
  code(() => confirmFlag(REGISTER, 'OLD-02', 'unconfirmed', TODAY), 'unknown-id'); // aliases are not ids
  code(() => confirmFlag(REGISTER, 'P-DEV-01014.02', 'done', TODAY), 'malformed');
  const twice = REGISTER + '\n### Copy\n`id: P-DEV-01014.02` `state: open` `unconfirmed: 2030-01-14`\n';
  code(() => confirmFlag(twice, 'P-DEV-01014.02', 'unconfirmed', TODAY), 'duplicate-id');
  const landed = REGISTER + '\n### Landed\n`id: DEV-01014.02` `state: open`\n';
  code(() => confirmFlag(landed, 'P-DEV-01014.02', 'unconfirmed', TODAY), 'duplicate-id');
  code(() => confirmFlag('# no frontmatter\n', 'P-DEV-01014.02', 'unconfirmed', TODAY), 'malformed');
});

test('Confirm all and Close all apply one edit, all or nothing, naming what changed (Brain D-112 A)', () => {
  const both = REGISTER + '\n### Second new\n`id: P-DEV-01014.05` `home: project:demo` `kind: action` `state: open` `owner: unknown` `due: unknown` `review: unknown` `unconfirmed: 2030-01-14`\n\nSource: s\nNext: n.\n';
  const out = settleAll(both, ['P-DEV-01014.02', 'P-DEV-01014.05'], 'unconfirmed', TODAY);
  assert.match(out, /`id: DEV-01014\.02` `alias: OLD-02`/);
  assert.match(out, /`id: DEV-01014\.05` `home/);
  assert.doesNotMatch(out, /unconfirmed: 2030-01-14`\n\nSource: s\nNext: n\./);
  assert.match(out, /^updated: 2030-01-15$/m);
  const closes = settleAll(REGISTER, ['PA-HOME-01012.03', 'P-?-01014.04'], 'close-proposed', TODAY);
  assert.match(item(closes, 'Probably done'), /`state: done`/);
  assert.match(item(closes, 'New and done'), /^`id: \?-01014\.04` .*`state: done`/m);
  // One id settled elsewhere refuses the whole batch and names it; nothing is half applied.
  const err = assert.throws(() => settleAll(REGISTER, ['P-DEV-01014.02', 'DEV-01010.01', 'DEV-09999.99'], 'unconfirmed', TODAY), (e) => e instanceof QueueError && e.code === 'not-flagged');
  let caught;
  try { settleAll(REGISTER, ['P-DEV-01014.02', 'DEV-01010.01', 'DEV-09999.99'], 'unconfirmed', TODAY); } catch (e) { caught = e; }
  assert.deepEqual(caught.ids, ['DEV-01010.01', 'DEV-09999.99']);
  assert.match(caught.message, /2 of 3 changed/);
  assert.throws(() => settleAll(REGISTER, [], 'unconfirmed', TODAY), (e) => e.code === 'invalid-text');
  void err;
});

test('a settled item is refused, and a second tap finds nothing to do', () => {
  const once = confirmFlag(REGISTER, 'PA-HOME-01012.03', 'close-proposed', TODAY);
  assert.throws(() => rejectFlag(once, 'PA-HOME-01012.03', 'close-proposed', TODAY), (e) => e.code === 'not-flagged');
  const rejected = rejectFlag(REGISTER, 'P-DEV-01014.02', 'unconfirmed', TODAY);
  assert.throws(() => rejectFlag(rejected, 'P-DEV-01014.02', 'unconfirmed', TODAY), /already rejected/);
});

test('an id or flag mentioned in another item, or in fenced code, is not that item', () => {
  const text = REGISTER.replace('Next: do it.', 'Next: see `id: P-DEV-01014.02` and `unconfirmed: 2030-01-14`.') +
    '\n```\n### Fenced\n`id: DEV-01010.09` `state: open` `unconfirmed: 2030-01-14`\n```\n';
  const out = confirmFlag(text, 'P-DEV-01014.02', 'unconfirmed', TODAY);
  assert.match(out, /Next: see `id: P-DEV-01014\.02` and `unconfirmed: 2030-01-14`\./);
  assert.throws(() => confirmFlag(text, 'DEV-01010.09', 'unconfirmed', TODAY), (e) => e.code === 'unknown-id');
});

test('CRLF files stay CRLF, including the added Correction', () => {
  const crlf = REGISTER.replace(/\n/g, '\r\n');
  const out = rejectFlag(crlf, 'P-DEV-01014.02', 'unconfirmed', TODAY);
  assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/);
  assert.equal(out.replace(/\r\n/g, '\n'), rejectFlag(REGISTER, 'P-DEV-01014.02', 'unconfirmed', TODAY));
});

test('a last item without a final newline gains a well-formed Correction', () => {
  const out = rejectFlag(REGISTER.replace(/\n$/, ''), 'P-?-01014.04', 'close-proposed', TODAY);
  assert.match(out, /Next: x\.\nCorrection: 2030-01-15: [^\n]+\n$/);
});
