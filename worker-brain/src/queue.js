// Pure QUEUE.md transforms for the Brain viewer's two write actions. No I/O.
//
// Format (Brain's context/schema.md): frontmatter with `updated:`, groomed `### Title`
// cards above `## Inbox`, raw `- ` bullets under `## Inbox`, and an optional `## Done`
// section after the Inbox holding finished cards.
//
// Every edit works on lines with their original terminators, so CRLF, LF and anything
// else outside the lines being changed come back byte for byte. New lines use the
// file's own line ending.

export const INBOX_MAX = 500;

export class QueueError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'unknown-id' | 'duplicate-id' | 'malformed' | 'invalid-text'
  }
}

// Perth is UTC+08:00 year-round (no DST), matching brain.py's perth_today().
export function perthDate(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

const content = (line) => line.replace(/\r?\n$/, '');
const terminated = (line, eol) => (/\n$/.test(line) ? line : line + eol);
const isBlank = (line) => content(line).trim() === '';

function parse(text) {
  if (typeof text !== 'string') throw new QueueError('malformed', 'queue is not text');
  const lines = splitLines(text);
  const eol = /\r\n/.test(lines[0] || '') ? '\r\n' : '\n';
  if (content(lines[0] || '') !== '---') throw new QueueError('malformed', 'queue has no frontmatter');
  let close = -1;
  for (let i = 1; i < lines.length; i++) if (content(lines[i]) === '---') { close = i; break; }
  if (close === -1) throw new QueueError('malformed', 'queue frontmatter is not closed');
  let updated = -1;
  for (let i = 1; i < close; i++) if (/^updated:/.test(content(lines[i]))) { updated = i; break; }
  if (updated === -1) throw new QueueError('malformed', 'queue frontmatter has no updated field');

  // Headings outside fenced code, from the end of the frontmatter.
  const headings = [];
  let fence = false;
  for (let i = close + 1; i < lines.length; i++) {
    const c = content(lines[i]);
    if (/^\s*(```|~~~)/.test(c)) { fence = !fence; continue; }
    if (fence) continue;
    const m = c.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (m) headings.push({ index: i, level: m[1].length, title: m[2] });
  }
  const inbox = headings.find((h) => h.level === 2 && h.title === 'Inbox');
  if (!inbox) throw new QueueError('malformed', 'queue has no ## Inbox section');
  return { lines, eol, updated, headings, inbox };
}

function bumpUpdated(q, today) {
  const line = q.lines[q.updated];
  q.lines[q.updated] = `updated: ${today}` + line.slice(content(line).length);
}

// End (exclusive) of the section starting at heading h: the next heading of level <= h's.
function sectionEnd(q, h) {
  const next = q.headings.find((x) => x.index > h.index && x.level <= h.level);
  return next ? next.index : q.lines.length;
}

// Index just after the last non-blank line in (start, end], never before start + 1.
function lastContent(q, start, end) {
  let at = end;
  while (at > start + 1 && isBlank(q.lines[at - 1])) at--;
  return at;
}

// Insert `block` lines at `at`, separated from what is above by one blank line.
function insertAfterBlank(q, at, block) {
  if (at > 0) q.lines[at - 1] = terminated(q.lines[at - 1], q.eol);
  q.lines.splice(at, 0, q.eol, ...block);
}

const ID_TOKEN = (id) => new RegExp('`id:\\s*' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*`');

// The groomed card (above `## Inbox`) carrying this id: its first and past-last line.
function findCard(q, id) {
  if (typeof id !== 'string' || !id) throw new QueueError('unknown-id', 'no card id given');
  const cards = q.headings.filter((h) => h.level === 3 && h.index < q.inbox.index);
  const blocks = cards.map((h) => {
    const next = q.headings.find((x) => x.index > h.index && x.level <= 3);
    const end = Math.min(next ? next.index : q.lines.length, q.inbox.index);
    return { start: h.index, end };
  });
  const token = ID_TOKEN(id);
  const matches = blocks.filter((b) => q.lines.slice(b.start + 1, b.end).some((l) => token.test(content(l))));
  if (!matches.length) throw new QueueError('unknown-id', `no groomed card ${id}`);
  if (matches.length > 1) throw new QueueError('duplicate-id', `more than one card has id ${id}`);
  return matches[0];
}

// Sets the card's `Progress:` line, the latest movement only (Brain D-37), replacing an
// earlier one or adding it after the card's last line.
export function cardProgress(text, id, raw, today) {
  const note = cleanInboxText(raw);
  const q = parse(text);
  const { start, end } = findCard(q, id);
  const line = `Progress: ${today}, ${note}`;
  const at = q.lines.findIndex((l, i) => i > start && i < end && content(l).startsWith('Progress:'));
  if (at !== -1) {
    q.lines[at] = line + (q.lines[at].slice(content(q.lines[at]).length) || q.eol);
  } else {
    const last = lastContent(q, start, end);
    q.lines[last - 1] = terminated(q.lines[last - 1], q.eol);
    q.lines.splice(last, 0, `${line}${q.eol}`);
  }
  bumpUpdated(q, today);
  return q.lines.join('');
}

// Moves the groomed card with this id under `## Done` with a `done:` stamp.
export function markDone(text, id, today) {
  const q = parse(text);
  const token = ID_TOKEN(id);
  const { start, end } = findCard(q, id);
  const block = q.lines.slice(start, lastContent(q, start, end));
  const attr = block.findIndex((l, i) => i > 0 && token.test(content(l)));
  const attrLine = block[attr];
  block[attr] = content(attrLine) + ` \`done: ${today}\`` + attrLine.slice(content(attrLine).length);
  block[block.length - 1] = terminated(block[block.length - 1], q.eol);

  bumpUpdated(q, today);
  // Find (or create) the Done section on the edited copy. Removing the card first keeps
  // every index after it valid once shifted by the block's length.
  const removed = end - start;
  q.lines.splice(start, removed);
  const shift = (h) => ({ ...h, index: h.index > start ? h.index - removed : h.index });
  q.headings = q.headings.filter((h) => h.index < start || h.index >= end).map(shift);
  q.inbox = shift(q.inbox);

  const done = q.headings.find((h) => h.level === 2 && h.title === 'Done' && h.index > q.inbox.index);
  if (done) {
    insertAfterBlank(q, lastContent(q, done.index, sectionEnd(q, done)), block);
  } else {
    const at = lastContent(q, q.inbox.index, q.lines.length);
    insertAfterBlank(q, at, [`## Done${q.eol}`, q.eol, ...block]);
  }
  return q.lines.join('');
}

// One line, trimmed, at most INBOX_MAX characters, no control characters.
export function cleanInboxText(raw) {
  if (typeof raw !== 'string') throw new QueueError('invalid-text', 'text is required');
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); // \s covers U+2028/9
  if (!text) throw new QueueError('invalid-text', 'text is empty');
  if ([...text].length > INBOX_MAX) throw new QueueError('invalid-text', `text is over ${INBOX_MAX} characters`);
  return text;
}

// Appends `- <text>` as the last item of `## Inbox`.
export function addInbox(text, raw, today) {
  const item = cleanInboxText(raw);
  const q = parse(text);
  bumpUpdated(q, today);
  const at = lastContent(q, q.inbox.index, sectionEnd(q, q.inbox));
  const line = `- ${item}${q.eol}`;
  const hasList = q.lines.slice(q.inbox.index + 1, at).some((l) => /^[-*] /.test(content(l)));
  if (hasList && /^([-*] |\s+\S)/.test(content(q.lines[at - 1]))) {
    // Directly under the last bullet (or its wrapped continuation), so it stays one list.
    q.lines[at - 1] = terminated(q.lines[at - 1], q.eol);
    q.lines.splice(at, 0, line);
  } else {
    insertAfterBlank(q, at, [line]);
  }
  return q.lines.join('');
}

// Leon's details on an Inbox line, for the scheduled groom to turn into a card (Brain
// D-100 B, D-102 A). The line is found by its text (continuation lines joined, earlier
// details ignored) and rewritten as one line: the title, then the details as code spans.
const plainBullet = (t) => t.replace(/^[-*] (\[[ x]\] )?/, '').replace(/\s*`[^`]*`/g, '').replace(/\s+/g, ' ').trim();

export function categoriseLine(text, raw, details, attrs, today) {
  if (typeof raw !== 'string' || !raw.trim()) throw new QueueError('unknown-id', 'no inbox line given');
  const q = parse(text);
  const end = sectionEnd(q, q.inbox);
  const bullets = [];
  for (let i = q.inbox.index + 1; i < end; i++) {
    if (/^[-*] /.test(content(q.lines[i]))) bullets.push({ start: i, end: i + 1 });
    else if (bullets.length && /^\s+\S/.test(content(q.lines[i])) && bullets.at(-1).end === i) bullets.at(-1).end = i + 1;
  }
  const want = plainBullet(raw);
  const matches = bullets.filter((b) => plainBullet(q.lines.slice(b.start, b.end).map(content).join(' ')) === want);
  if (!matches.length) throw new QueueError('unknown-id', 'that inbox line is no longer there');
  if (matches.length > 1) throw new QueueError('duplicate-id', 'more than one inbox line reads the same');
  const { start, end: stop } = matches[0];
  const title = details.title || want;
  const ending = q.lines[stop - 1].slice(content(q.lines[stop - 1]).length) || q.eol;
  q.lines.splice(start, stop - start, `- ${title} ${attrs}${ending}`);
  bumpUpdated(q, today);
  return q.lines.join('');
}
