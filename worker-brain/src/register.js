// Pure register/open-items.md transforms for the Brain viewer's Confirm and Reject. No I/O.
//
// Format (Brain's context/schema.md, "Open-items register"): frontmatter with `updated:`,
// then items, each an `### Title`, one attribute line of `key: value` code spans and
// labelled lines (`Source:`, `Next:`, `Correction:`, `Evidence:` …). A daily routine flags
// what it adds or finds done, for the owner to settle (Brain D-42):
//   `unconfirmed: <date>`     a new item not yet confirmed; its id carries `P-`
//   `close-proposed: <date>`  evidence the item is done, given in an `Evidence:` line
// The edits are Brain's (routines/README.md, "Keeping the register current"):
//   confirm unconfirmed      remove the flag and the id's `P-`
//   reject unconfirmed       `state: rejected`, remove the flag (and any close proposal),
//                            add a Correction; the `P-` stays, as the item never landed
//   confirm close-proposed   `state: done`, remove the flag, keep the Evidence
//   reject close-proposed    remove the flag and its Evidence, add a Correction
//
// As in queue.js, lines keep their own terminators, so everything outside the item and
// the `updated:` line comes back byte for byte.

import { QueueError } from './queue.js';

export const REGISTER_PATH = 'register/open-items.md';
export const FLAGS = ['unconfirmed', 'close-proposed'];
// Register ids (Brain brain-021): FAMILY-YMMDD.XX, `P-` in front until the item lands.
export const REGISTER_ID = /^(?:P-)?(?:\?|[A-Z]+(?:-[A-Z]+)?)-\d{5}\.\d{2,3}$/;

const CLOSED = new Set(['done', 'rejected']);

function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

const content = (line) => line.replace(/\r?\n$/, '');
const ending = (line) => line.slice(content(line).length);
const isBlank = (line) => content(line).trim() === '';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function attrsOf(line) {
  const attrs = {};
  for (const m of content(line).matchAll(/`([a-z][a-z-]*):\s*([^`]*?)\s*`/g)) attrs[m[1]] = m[2];
  return attrs;
}

function parse(text) {
  if (typeof text !== 'string') throw new QueueError('malformed', 'register is not text');
  const lines = splitLines(text);
  const eol = /\r\n/.test(lines[0] || '') ? '\r\n' : '\n';
  if (content(lines[0] || '') !== '---') throw new QueueError('malformed', 'register has no frontmatter');
  let close = -1;
  for (let i = 1; i < lines.length; i++) if (content(lines[i]) === '---') { close = i; break; }
  if (close === -1) throw new QueueError('malformed', 'register frontmatter is not closed');
  let updated = -1;
  for (let i = 1; i < close; i++) if (/^updated:/.test(content(lines[i]))) { updated = i; break; }
  if (updated === -1) throw new QueueError('malformed', 'register frontmatter has no updated field');

  // Headings outside fenced code; an item runs from its H3 to the next H1 to H3.
  const heads = [];
  let fence = false;
  for (let i = close + 1; i < lines.length; i++) {
    const c = content(lines[i]);
    if (/^\s*(```|~~~)/.test(c)) { fence = !fence; continue; }
    if (!fence && /^#{1,3}\s/.test(c)) heads.push({ index: i, item: /^###\s/.test(c) });
  }
  const items = [];
  heads.forEach((h, n) => {
    if (!h.item) return;
    const end = n + 1 < heads.length ? heads[n + 1].index : lines.length;
    let attr = h.index + 1;
    while (attr < end && isBlank(lines[attr])) attr++;
    if (attr < end && /^`/.test(content(lines[attr]))) items.push({ start: h.index, attr, end, attrs: attrsOf(lines[attr]) });
  });
  return { lines, eol, updated, items };
}

function find(r, id) {
  const matches = r.items.filter((item) => item.attrs.id === id);
  if (!matches.length) throw new QueueError('unknown-id', `no register item ${id}`);
  if (matches.length > 1) throw new QueueError('duplicate-id', `more than one item has id ${id}`);
  return matches[0];
}

// Attribute-line edits, on the line's content; the terminator is put back by the caller.
const dropAttr = (line, key) => line.replace(new RegExp(' ?`' + escapeRe(key) + ':[^`]*`'), '');
function setAttr(line, key, value) {
  const re = new RegExp('`' + escapeRe(key) + ':[^`]*`');
  if (!re.test(line)) throw new QueueError('malformed', `item has no ${key} attribute`);
  return line.replace(re, `\`${key}: ${value}\``);
}

// Labelled lines of the item block, below its attribute line.
const fieldIndex = (block, attr, label) => block.findIndex((l, i) => i > attr && content(l).startsWith(`${label}:`));
function dropField(block, attr, label) {
  const values = [];
  for (let i = block.length - 1; i > attr; i--) {
    if (content(block[i]).startsWith(`${label}:`)) {
      values.unshift(content(block[i]).slice(label.length + 1).trim());
      block.splice(i, 1);
    }
  }
  return values.join(' ');
}

// One Correction per item ("latest correction and its date"): the new note goes first and
// any earlier correction is kept after it rather than dropped.
function addCorrection(block, attr, note, today, eol) {
  const text = `${today}: ${note}`;
  const at = fieldIndex(block, attr, 'Correction');
  if (at !== -1) {
    const earlier = content(block[at]).slice('Correction:'.length).trim();
    block[at] = `Correction: ${text}${earlier ? ` Earlier: ${earlier}` : ''}` + ending(block[at]);
    return;
  }
  let last = block.length;
  while (last > attr + 1 && isBlank(block[last - 1])) last--;
  if (!ending(block[last - 1])) block[last - 1] += eol;
  block.splice(last, 0, `Correction: ${text}${eol}`);
}

function settle(text, id, flag, today, edit) {
  if (!FLAGS.includes(flag)) throw new QueueError('malformed', `unknown flag ${flag}`);
  const r = parse(text);
  const item = find(r, id);
  if (CLOSED.has(item.attrs.state)) throw new QueueError('not-flagged', `${id} is already ${item.attrs.state}`);
  if (!Object.hasOwn(item.attrs, flag)) throw new QueueError('not-flagged', `${id} is no longer ${flag}`);

  const block = r.lines.slice(item.start, item.end);
  const attr = item.attr - item.start;
  const line = (fn) => { block[attr] = fn(content(block[attr])) + ending(block[attr]); };
  edit({ block, attr, line, item, r });

  r.lines[r.updated] = `updated: ${today}` + ending(r.lines[r.updated]);
  r.lines.splice(item.start, item.end - item.start, ...block);
  return r.lines.join('');
}

export function confirmFlag(text, id, flag, today) {
  return settle(text, id, flag, today, ({ line, item, r }) => {
    if (flag === 'unconfirmed') {
      let landed = id;
      if (id.startsWith('P-')) {
        landed = id.slice(2);
        if (r.items.some((other) => other.attrs.id === landed)) {
          throw new QueueError('duplicate-id', `another item already has id ${landed}`);
        }
      }
      line((l) => dropAttr(l, 'unconfirmed').replace(new RegExp('`id:\\s*' + escapeRe(id) + '\\s*`'), `\`id: ${landed}\``));
    } else {
      // Done with the flag still on would leave an unconfirmed item closed.
      if (Object.hasOwn(item.attrs, 'unconfirmed')) throw new QueueError('order', `confirm ${id} itself first`);
      line((l) => setAttr(dropAttr(l, 'close-proposed'), 'state', 'done'));
    }
  });
}

export function rejectFlag(text, id, flag, today) {
  return settle(text, id, flag, today, ({ block, attr, line, item, r }) => {
    if (flag === 'unconfirmed') {
      // A rejected item is closed, so neither flag may stay on it.
      line((l) => setAttr(dropAttr(dropAttr(l, 'unconfirmed'), 'close-proposed'), 'state', 'rejected'));
      if (Object.hasOwn(item.attrs, 'close-proposed')) dropField(block, attr, 'Evidence');
      addCorrection(block, attr, 'rejected in the viewer (D-42).', today, r.eol);
    } else {
      line((l) => dropAttr(l, 'close-proposed'));
      const evidence = dropField(block, attr, 'Evidence').replace(/\.$/, '');
      const note = `proposed close rejected in the viewer (D-42)${evidence ? `; its evidence was: ${evidence}` : ''}.`;
      addCorrection(block, attr, note, today, r.eol);
    }
  });
}

// An open item's block, for edits that are not flag settlements: progress and close.
function edit(text, id, today, fn) {
  const r = parse(text);
  const item = find(r, id);
  if (CLOSED.has(item.attrs.state)) throw new QueueError('closed', `${id} is already ${item.attrs.state}`);
  const block = r.lines.slice(item.start, item.end);
  const attr = item.attr - item.start;
  fn({ block, attr, item, r, line: (f) => { block[attr] = f(content(block[attr])) + ending(block[attr]); } });
  r.lines[r.updated] = `updated: ${today}` + ending(r.lines[r.updated]);
  r.lines.splice(item.start, item.end - item.start, ...block);
  return r.lines.join('');
}

// Replaces the labelled line, or adds it after the item's last line.
function setField(block, attr, label, value, eol) {
  const at = fieldIndex(block, attr, label);
  if (at !== -1) {
    for (let i = block.length - 1; i > at; i--) if (content(block[i]).startsWith(`${label}:`)) block.splice(i, 1);
    block[at] = `${label}: ${value}` + (ending(block[at]) || eol);
    return;
  }
  let last = block.length;
  while (last > attr + 1 && isBlank(block[last - 1])) last--;
  if (!ending(block[last - 1])) block[last - 1] += eol;
  block.splice(last, 0, `${label}: ${value}${eol}`);
}

// `Progress: <date>, <what moved>`, the latest movement only (Brain D-37).
export function itemProgress(text, id, raw, today) {
  const note = cleanNote(raw);
  return edit(text, id, today, ({ block, attr, r }) => setField(block, attr, 'Progress', `${today}, ${note}`, r.eol));
}

// Leon closes an item from its card (Brain D-98 A): `state: done` with his one-line
// Evidence. An unconfirmed item is confirmed first, and a decision is settled in a session,
// where its outcome goes in a Correction.
export function closeItem(text, id, raw, today) {
  const note = cleanNote(raw);
  return edit(text, id, today, ({ block, attr, item, line, r }) => {
    if (Object.hasOwn(item.attrs, 'unconfirmed')) throw new QueueError('order', `confirm ${id} itself first`);
    if (item.attrs.kind === 'decision') throw new QueueError('decision', 'decisions are settled in a session');
    line((l) => setAttr(dropAttr(l, 'close-proposed'), 'state', 'done'));
    setField(block, attr, 'Evidence', `${note} (Leon, in the viewer, ${today}).`, r.eol);
  });
}

const NOTE_MAX = 500;
function cleanNote(raw) {
  if (typeof raw !== 'string') throw new QueueError('invalid-text', 'text is required');
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!text) throw new QueueError('invalid-text', 'text is empty');
  if ([...text].length > NOTE_MAX) throw new QueueError('invalid-text', `text is over ${NOTE_MAX} characters`);
  return text;
}
