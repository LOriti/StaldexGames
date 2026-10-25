// Run: node --test tests/brain-queue.test.mjs
// Pure QUEUE.md transforms behind the Brain viewer's write routes. Synthetic data only:
// this repo is public, so no real Brain content belongs in fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';

import { INBOX_MAX, QueueError, addInbox, cleanInboxText, markDone, perthDate } from '../worker-brain/src/queue.js';

const TODAY = '2030-01-15';

const QUEUE = `---
project: demo
type: queue
updated: 2030-01-01
---

# demo — queue

Groomed cards only. Raw ideas stay under \`## Inbox\` and are not dispatchable.

### First card

\`id: demo-001\` \`priority: P1\` \`effort: S\` \`risk: low\` \`burnable: yes\` \`blocked-by: none\`

Outcome: one.
Acceptance: one done.
Context: none.

### Second card

\`id: demo-002\` \`priority: P2\` \`effort: M\` \`risk: low\` \`burnable: no\` \`blocked-by: demo-001\`

Outcome: two.

### Last card

\`id: demo-003\` \`priority: P3\` \`effort: L\` \`risk: medium\` \`burnable: no\` \`blocked-by: none\`

Outcome: three.

## Inbox

- Raw idea one.
- Raw idea two,
  wrapped onto a second line.
`;

const error = (code) => (err) => err instanceof QueueError && err.code === code;

test('done moves a middle card under a new Done section with a stamp', () => {
  const out = markDone(QUEUE, 'demo-002', TODAY);
  assert.equal(out, QUEUE
    .replace('updated: 2030-01-01', `updated: ${TODAY}`)
    .replace(/### Second card\n\n.*\n\nOutcome: two.\n\n/, '')
    + '\n## Done\n\n### Second card\n\n'
    + '`id: demo-002` `priority: P2` `effort: M` `risk: low` `burnable: no` `blocked-by: demo-001` `done: 2030-01-15`\n\n'
    + 'Outcome: two.\n');
});

test('done on the last groomed card leaves the Inbox heading spaced as before', () => {
  const out = markDone(QUEUE, 'demo-003', TODAY);
  assert.match(out, /Outcome: two\.\n\n## Inbox\n/);
  assert.ok(!out.slice(0, out.indexOf('## Inbox')).includes('demo-003'));
  assert.match(out, /## Done\n\n### Last card\n\n`id: demo-003`.* `done: 2030-01-15`\n\nOutcome: three\.\n$/);
});

test('done on a card followed directly by ## Inbox', () => {
  const tight = QUEUE.replace('Outcome: three.\n\n## Inbox', 'Outcome: three.\n## Inbox');
  const out = markDone(tight, 'demo-003', TODAY);
  assert.match(out, /Outcome: two\.\n\n## Inbox\n\n- Raw idea one\./);
  assert.match(out, /### Last card\n\n`id: demo-003`.*`done: 2030-01-15`\n\nOutcome: three\.\n$/);
});

test('done appends to an existing Done section, after earlier done cards', () => {
  const once = markDone(QUEUE, 'demo-001', TODAY);
  const twice = markDone(once, 'demo-003', '2030-01-16');
  const done = twice.slice(twice.indexOf('## Done'));
  assert.ok(done.indexOf('### First card') < done.indexOf('### Last card'));
  assert.match(done, /Context: none\.\n\n### Last card\n/);
  assert.equal(twice.match(/^## Done$/gm).length, 1);
  assert.match(twice, /^updated: 2030-01-16$/m);
});

test('done keeps a section after Done intact', () => {
  const withTail = markDone(QUEUE, 'demo-001', TODAY) + '\n## Notes\n\nKept.\n';
  const out = markDone(withTail, 'demo-002', TODAY);
  assert.match(out, /Context: none\.\n\n### Second card\n[\s\S]*Outcome: two\.\n\n## Notes\n\nKept\.\n$/);
});

test('every byte outside the moved card and the updated line is preserved', () => {
  const out = markDone(QUEUE, 'demo-001', TODAY);
  const card = QUEUE.slice(QUEUE.indexOf('### First card'), QUEUE.indexOf('### Second card'));
  const rest = QUEUE.replace(card, '').replace('updated: 2030-01-01', `updated: ${TODAY}`);
  assert.equal(out.slice(0, rest.length), rest);
  assert.ok(out.length > rest.length);
});

test('CRLF files stay CRLF, including the new lines', () => {
  const crlf = QUEUE.replace(/\n/g, '\r\n');
  const done = markDone(crlf, 'demo-002', TODAY);
  assert.ok(!/[^\r]\n/.test(done), 'no bare LF');
  assert.equal(done.replace(/\r\n/g, '\n'), markDone(QUEUE, 'demo-002', TODAY));
  const inbox = addInbox(crlf, 'New thing', TODAY);
  assert.ok(!/[^\r]\n/.test(inbox), 'no bare LF');
  assert.equal(inbox.replace(/\r\n/g, '\n'), addInbox(QUEUE, 'New thing', TODAY));
});

test('a file without a final newline still gains well-formed sections', () => {
  const bare = QUEUE.replace(/\n$/, '');
  assert.match(markDone(bare, 'demo-001', TODAY), /wrapped onto a second line\.\n\n## Done\n\n### First card\n/);
  assert.match(addInbox(bare, 'x', TODAY), /wrapped onto a second line\.\n- x\n$/);
});

test('unknown, inbox-only and already-done ids are refused', () => {
  assert.throws(() => markDone(QUEUE, 'demo-999', TODAY), error('unknown-id'));
  assert.throws(() => markDone(QUEUE, 'demo-00', TODAY), error('unknown-id'));
  const inboxCard = QUEUE + '\n### Stray\n\n`id: demo-004`\n';
  assert.throws(() => markDone(inboxCard, 'demo-004', TODAY), error('unknown-id'));
  const once = markDone(QUEUE, 'demo-001', TODAY);
  assert.throws(() => markDone(once, 'demo-001', TODAY), error('unknown-id'));
});

test('duplicate ids are refused rather than guessed', () => {
  const dup = QUEUE.replace('`id: demo-003`', '`id: demo-002`');
  assert.throws(() => markDone(dup, 'demo-002', TODAY), error('duplicate-id'));
});

test('an id mentioned in another card body is not mistaken for its own', () => {
  const mention = QUEUE.replace('Context: none.', 'Context: see `id: demo-002` later.');
  assert.throws(() => markDone(mention, 'demo-002', TODAY), error('duplicate-id'));
  const prose = QUEUE.replace('Context: none.', 'Context: follows demo-002.');
  assert.match(markDone(prose, 'demo-002', TODAY), /follows demo-002\.\n\n### Last card/);
});

test('a missing Inbox section is an error for both actions', () => {
  const noInbox = QUEUE.replace(/^## Inbox$/m, '## Ideas');
  assert.throws(() => markDone(noInbox, 'demo-001', TODAY), error('malformed'));
  assert.throws(() => addInbox(noInbox, 'x', TODAY), error('malformed'));
  assert.throws(() => addInbox('no frontmatter\n## Inbox\n', 'x', TODAY), error('malformed'));
  assert.throws(() => addInbox('---\nproject: demo\n---\n## Inbox\n', 'x', TODAY), error('malformed'));
});

test('headings inside fenced code are ignored', () => {
  const fenced = QUEUE.replace('Outcome: two.', 'Outcome: two.\n\n```\n## Inbox\n### Fake\n```');
  const out = markDone(fenced, 'demo-002', TODAY);
  assert.match(out, /## Done\n\n### Second card[\s\S]*```\n## Inbox\n### Fake\n```\n$/);
});

test('inbox appends under the last bullet and bumps updated', () => {
  const out = addInbox(QUEUE, '  Call the  plumber \n about the tap  ', TODAY);
  assert.equal(out, QUEUE.replace('updated: 2030-01-01', `updated: ${TODAY}`) + '- Call the plumber about the tap\n');
});

test('inbox lands above an existing Done section', () => {
  const done = markDone(QUEUE, 'demo-001', TODAY);
  const out = addInbox(done, 'Later idea', TODAY);
  assert.match(out, /wrapped onto a second line\.\n- Later idea\n\n## Done\n/);
});

test('an empty Inbox gets its first bullet after a blank line', () => {
  const empty = QUEUE.slice(0, QUEUE.indexOf('\n## Inbox\n') + 1) + '## Inbox\n';
  assert.match(addInbox(empty, 'First', TODAY), /## Inbox\n\n- First\n$/);
  const prose = QUEUE.slice(0, QUEUE.indexOf('\n## Inbox\n') + 1) + '## Inbox\n\nNothing yet.\n';
  assert.match(addInbox(prose, 'First', TODAY), /Nothing yet\.\n\n- First\n$/);
});

test('inbox text is one trimmed line, capped, and never empty', () => {
  assert.equal(cleanInboxText(' a\r\nb\tc\u2028d '), 'a b c d');
  assert.equal(cleanInboxText('x'.repeat(INBOX_MAX)).length, INBOX_MAX);
  assert.throws(() => cleanInboxText('x'.repeat(INBOX_MAX + 1)), error('invalid-text'));
  for (const bad of ['', '   ', '\n\t', null, 42]) assert.throws(() => cleanInboxText(bad), error('invalid-text'));
  assert.throws(() => addInbox(QUEUE, ' \n ', TODAY), error('invalid-text'));
});

test('inbox text cannot open a heading or a new card', () => {
  const out = addInbox(QUEUE, '\n## Done\n### Injected', TODAY);
  assert.match(out, /- ## Done ### Injected\n$/);
  assert.equal(out.match(/^#{2,3} /gm).length, QUEUE.match(/^#{2,3} /gm).length);
});

test('perthDate is UTC+8 with no daylight saving', () => {
  assert.equal(perthDate(Date.UTC(2030, 0, 14, 15, 59)), '2030-01-14');
  assert.equal(perthDate(Date.UTC(2030, 0, 14, 16, 0)), '2030-01-15');
  assert.equal(perthDate(Date.UTC(2030, 6, 14, 16, 0)), '2030-07-15');
});
