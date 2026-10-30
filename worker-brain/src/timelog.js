// Pure daily-log transforms for the viewer's time writes. No I/O.
//
// Brain keeps one append-only log per Perth day, `logs/daily/<date>.md` on its
// `daily-log` branch (Brain D-30). Time goes in as `## HH:MM Time` sections holding one
// table, the same format the desk command centre sends (Brain D-74 A), so the evening
// debrief reads both alike. The viewer adds three kinds of row:
//   started   a task clock began (Brain D-97 A: one clock shared by every screen)
//   tracked   a task clock stopped; minutes are the time it ran
//   entered   hours Leon typed in on the Allocation tab (Brain D-96 C)
//   focal     Leon's pick of the one thing for today, or an empty item to go back to the
//             brief's pick (Brain D-113 A); no time, both screens read the latest one
//   today     a placement in Next up today (Brain D-109 A): the note is the position, or
//             `out`; only today's rows count, so Today starts fresh each morning
//   next-week a placement in Next week (D-109 A): the note is the position, `keep` (the
//             weekly review kept it) or `out`; the latest row per item carries forward
// The desk also writes planned, unplanned and distraction rows; all are read back here.
// A clock stopped under a minute is never written (Brain D-114 A): the page holds the
// `started` row back for the first minute, so an accidental open leaves no row at all.

import { QueueError } from './queue.js';

export const LOG_BRANCH = 'daily-log';
export const logPath = (date) => `logs/daily/${date}.md`;
export const AREAS = ['1', '2', '3', '4', '5', 'vol'];
export const LENSES = ['work', 'ventures', 'personal', 'brain'];
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Card and item ids: date-based (Brain brain-021), `P-` until landed, decisions, and the
// older `<slug>-NNN` cards.
const REF = /^(?:(?:P-)?(?:\?|[A-Z]+(?:-[A-Z]+)?)-\d{5}\.\d{2,3}|D-\d+|[a-z0-9]+(?:-[a-z0-9]+)*-\d{3})$/;
const MAX_MINUTES = 12 * 60;
const HEADER = (date) => `# Daily log ${date}\n\nAppend-only record of the daily brief, debrief and changes (D-30). Times are Perth.\n`;

// Perth is UTC+08:00 year-round.
export function perthClock(now = Date.now()) {
  const iso = new Date(now + 8 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16), ms: now };
}

// Minutes from `date start` (Perth) until `now`, whole minutes.
export function minutesSince(date, start, now = Date.now()) {
  const began = Date.parse(`${date}T${start}:00+08:00`);
  return Math.floor((now - began) / 60000);
}

export function cleanRef(ref) {
  if (typeof ref !== 'string' || !REF.test(ref)) throw new QueueError('invalid-text', 'not a card or item id');
  return ref;
}

// A table cell: one line, no pipe, at most `max` characters.
export function cleanCell(raw, max = 120) {
  if (raw == null) return '';
  if (typeof raw !== 'string') throw new QueueError('invalid-text', 'text must be a string');
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return [...text].slice(0, max).join('');
}

export function cleanPlace(area, lens) {
  const a = area == null || area === '' ? '' : String(area);
  if (a && !AREAS.includes(a)) throw new QueueError('invalid-text', 'unknown area');
  const l = lens == null || lens === '' ? (a ? 'work' : '') : String(lens);
  if (l && !LENSES.includes(l)) throw new QueueError('invalid-text', 'unknown lens');
  if (a && l !== 'work') throw new QueueError('invalid-text', 'areas are work only');
  return { area: a, lens: l };
}

export const timeRow = (r) =>
  `| ${r.kind} | ${r.start || ''} | ${r.end || ''} | ${r.minutes} | ${r.ref || ''} | ${r.area || ''} | ${r.lens || ''} | ${r.note || ''} |`;

// Appends one `## HH:MM Time` section with one row (or several, one placement batch), as
// brain.py's log_append does: the earlier text is kept byte for byte; a missing day file
// starts with the usual header.
export function appendTime(text, date, hhmm, rows) {
  const base = typeof text === 'string' && text.trim() ? text : HEADER(date);
  const list = Array.isArray(rows) ? rows : [rows];
  const section = [`## ${hhmm} Time`, '', 'From the viewer.', '',
    '| Kind | Start | End | Minutes | Item | Area | Lens | Note |', '|---|---|---|---:|---|---|---|---|', ...list.map(timeRow)].join('\n');
  return `${base.replace(/\n+$/, '')}\n\n${section}\n`;
}

// The clock writes (Brain D-97 A). `start` opens a clock at `body.start` today; `stop`
// closes the one opened at `body.date body.start`, counting the minutes until now.
export function clockRow(body, clock) {
  const ref = cleanRef(body.ref);
  const { area, lens } = cleanPlace(body.area, body.lens);
  const note = cleanCell(body.title);
  if (!HHMM.test(body.start || '')) throw new QueueError('invalid-text', 'start must be HH:MM');
  if (body.action === 'start') {
    if (minutesSince(clock.date, body.start, clock.ms) < 0) throw new QueueError('invalid-text', 'start is in the future');
    return { kind: 'started', start: body.start, end: '', minutes: 0, ref, area, lens, note };
  }
  if (body.action === 'stop') {
    const date = body.date || clock.date;
    if (!DATE.test(date)) throw new QueueError('invalid-text', 'date must be YYYY-MM-DD');
    const ran = minutesSince(date, body.start, clock.ms);
    if (ran < 0) throw new QueueError('invalid-text', 'start is in the future');
    const capped = ran > MAX_MINUTES;
    const extra = [date !== clock.date ? `started ${date}` : '', capped ? 'capped at 12 h' : ''].filter(Boolean).join(', ');
    return {
      kind: 'tracked', start: body.start, end: clock.hhmm, minutes: Math.min(ran, MAX_MINUTES), ref, area, lens,
      note: extra ? cleanCell(`${note} (${extra})`) : note,
    };
  }
  throw new QueueError('invalid-text', 'action must be start or stop');
}

// Hours typed in on the Allocation tab or a task's card (Brain D-96 C), in quarter hours
// up to 12 h; from a card they carry the task's id.
export function hoursRow(body) {
  const { area, lens } = cleanPlace(body.area, body.lens);
  const ref = body.ref ? cleanRef(body.ref) : '';
  if (!lens && !ref) throw new QueueError('invalid-text', 'an area or lens is required');
  const minutes = body.minutes;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_MINUTES || minutes % 15) {
    throw new QueueError('invalid-text', 'minutes must be a positive multiple of 15, at most 720');
  }
  return { kind: 'entered', start: '', end: '', minutes, ref, area, lens, note: cleanCell(body.note) || 'entered on the viewer' };
}

// The one thing for today (Brain D-113 A): `| focal | HH:MM | | 0 | <id> | | <lens> | |`,
// the item empty to clear Leon's pick.
export function focalRow(body, clock) {
  const ref = body.ref ? cleanRef(body.ref) : '';
  const { lens } = cleanPlace('', body.lens);
  return { kind: 'focal', start: clock.hhmm, end: '', minutes: 0, ref, area: '', lens, note: '' };
}

// Placements for the Next actions tab (Brain D-109 A): one row per item in the batch,
// `| today | HH:MM | | 0 | <id> | | <lens> | <position|out> |` or the same with
// `next-week` and `keep`. A drag reorders by writing the whole list's positions at once.
export const PLACE_KINDS = ['today', 'next-week'];
const PLACE_NOTE = /^(?:\d{1,3}|out|keep)$/;
export const PLACE_MAX = 100;
export function placeRows(body, clock) {
  if (!PLACE_KINDS.includes(body.kind)) throw new QueueError('invalid-text', 'kind must be today or next-week');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > PLACE_MAX) throw new QueueError('invalid-text', `1 to ${PLACE_MAX} items`);
  const { lens } = cleanPlace('', body.lens);
  return body.items.map((item) => {
    const ref = cleanRef(item && item.ref);
    const note = String(item.note ?? '');
    // An item may name its own kind, so one commit moves it from one list to the other.
    const kind = item.kind ? String(item.kind) : body.kind;
    if (!PLACE_KINDS.includes(kind)) throw new QueueError('invalid-text', 'kind must be today or next-week');
    if (!PLACE_NOTE.test(note)) throw new QueueError('invalid-text', 'a placement is a position, out or keep');
    if (kind === 'today' && note === 'keep') throw new QueueError('invalid-text', 'keep is for next week');
    return { kind, start: clock.hhmm, end: '', minutes: 0, ref, area: '', lens, note };
  });
}

// Every row of every `## HH:MM Time` table in one day's log.
export function parseTime(text, date) {
  const rows = [];
  let inTime = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const heading = raw.match(/^##\s+(\d{2}:\d{2})\s+(.*)$/);
    if (heading) { inTime = /^time\b/i.test(heading[2].trim()); continue; }
    if (/^#{1,2}\s/.test(raw)) { inTime = false; continue; }
    if (!inTime || !/^\|/.test(raw.trim())) continue;
    const cells = raw.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 8 || /^kind$/i.test(cells[0]) || /^-+$/.test(cells[0].replace(/:/g, ''))) continue;
    const minutes = Number.parseInt(cells[3], 10);
    if (!Number.isFinite(minutes)) continue;
    rows.push({
      date, kind: cells[0].toLowerCase(), start: cells[1], end: cells[2], minutes,
      ref: cells[4], area: cells[5], lens: cells[6], note: cells.slice(7).join('|'),
    });
  }
  return rows;
}
