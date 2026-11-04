// Brain viewer — the command centre home (Brain card brain-032).
// Renders the view Brain generates into views/command-centre.json: the inbox, the one
// focal item, what else is hot, where Claude can help, the quiet line and the doors, with
// Priority and Allocation tabs; plus the task card a tap opens, its clock, and this week's
// time against the allocation (Brain D-96 C, D-97 A, D-98 A). No imports, so the tests can
// load it on its own; every string from Brain goes through esc().

export const VIEW_PATH = 'views/command-centre.json';
export const LENSES = ['work', 'ventures', 'personal', 'brain', 'all'];
// The Inbox tab holds everything not yet clarified (Brain DEV-61026.33); Clarify folded into
// it. Next actions replaced Priority (DEV-61026.34) and holds four lists (Brain D-120 A):
// Today in Leon's order, Next (his short list after Today), Floating (every other clarified
// action, by rule) and Next week; it opens on All, every list on one page (D-123 A).
export const TABS = ['focus', 'inbox', 'next', 'allocation'];
export const TAB_NAMES = { focus: 'Focus', inbox: 'Inbox', next: 'Next actions', allocation: 'Allocation' };
export const SUBS = ['all', 'today', 'next', 'week', 'later'];
const SUB_NAMES = { all: 'All', today: 'Today', next: 'Next', week: 'Floating', later: 'Next week' };
const LENS_NAMES = { work: 'Work', ventures: 'Ventures', personal: 'Personal', brain: 'Brain', all: 'All' };
const CONTEXT_NAMES = {
  emails: 'Emails', calls: 'Calls', computer: 'Computer', errands: 'Errands',
  agendas: 'Agendas', waiting: 'Waiting for', claude: 'Claude',
};
const SECTION_NAMES = {
  hot: 'Hot', next: 'Next', review: 'Parked without a review date', waiting: 'Waiting for',
  parked: 'Parked', blocked: 'Blocked',
};

// What each priority means (Brain D-125 A): a timeframe, so it lines up with Today, Next
// and Next week.
export const PRIORITIES = {
  P0: ['Urgent', 'today'], P1: ['High', 'this week'], P2: ['Normal', 'when it fits'], P3: ['Low', 'if time allows'],
};
export const priorityText = (p, full = false) => (PRIORITIES[p] ? `${p} · ${PRIORITIES[p][0]}${full ? `, ${PRIORITIES[p][1]}` : ''}` : (p || ''));

// The mode of the work (Brain D-127 A, D-55 C): `via` on a card or line, else Brain's guess
// from the wording, with the same words as command_centre.py. Like work groups by it.
export const MODES = [['call', 'Call', 'calls'], ['email', 'Email', 'emails'], ['computer', 'Computer', 'computer'],
  ['errand', 'Errand', 'errands'], ['agenda', 'Agenda', 'agendas'], ['ai', 'Claude', 'claude']];
const CALL_WORDS = /\b(call|calls|ring|phone|callback|yarn)\b/i;
const EMAIL_WORDS = /\b(e-?mail|reply|respond|send|draft|chase|feedback|enquiry|rsvp|accept or decline)\b/i;
const ERRAND_WORDS = /\b(buy|order|pick up|collect|drop off|errand)\b/i;
export function guessVia(text) {
  const t = String(text || '');
  if (ERRAND_WORDS.test(t)) return 'errand';
  if (CALL_WORDS.test(t)) return 'call';
  if (EMAIL_WORDS.test(t)) return 'email';
  if (/\b((at|in) the [^.;]{0,40}meeting|agenda|1:1|one-on-one|discuss|raise (it )?with|agree [^.;]{0,40} with)\b/i.test(t) || /\b[Aa]sk [A-Z][a-z]+\b/.test(t)) return 'agenda';
  return 'computer';
}
export const viaOfContext = (context) => (MODES.find((m) => m[2] === context) || MODES[2])[0];
export const contextOfVia = (via) => (MODES.find((m) => m[0] === via) || MODES[2])[2];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Perth wall-clock parts for a Date, whatever the phone's own time zone is.
export function perthParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Perth', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Today's Perth date (YYYY-MM-DD), Perth clock time (HH:MM) and the week's Monday.
export function perthDay(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`;
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - perthParts(date).weekday);
  return { today, hhmm: `${p.hour}:${p.minute}`, monday: monday.toISOString().slice(0, 10) };
}

export function fmtMinutes(total) {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

// A card's or item's estimate: `minutes` when set, else its groomed effort (Brain DEV-61026.08).
const EFFORT = { S: 'S · under 1 h', M: 'M · up to 4 h', L: 'L · over 4 h' };
export function estimateText(e) {
  const minutes = Number.parseInt(e?.minutes, 10);
  if (minutes > 0) return fmtMinutes(minutes);
  return EFFORT[e?.effort] || '';
}

// The clock still running across every screen (Brain D-97 A): the latest `started` row
// with no later `tracked` row for the same item and start.
export function openClock(rows) {
  const open = new Map();
  for (const r of rows || []) {
    const key = `${r.ref}|${r.start}`;
    if (r.kind === 'started' && r.ref) open.set(key, r);
    else if (r.kind === 'tracked' && open.has(key) && open.get(key).date <= r.date) open.delete(key);
  }
  const all = [...open.values()].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return all.length ? all[all.length - 1] : null;
}

// Minutes since a clock started, from its Perth date and HH:MM.
export function clockMinutes(clock, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(`${clock.date}T${clock.start}:00+08:00`)) / 60000));
}

// This week's recorded time: every kind but plans, still-running clocks and focal picks.
// An area or lens with no rows is absent, never 0 (Brain D-114 A), and a day counts as
// recorded only with at least RECORDED_DAY_MINUTES on it.
export const RECORDED_DAY_MINUTES = 15;
// A clock stopped inside its first minute records nothing (Brain D-114 A): its start row
// is held back this long, so an accidental open leaves no row at all.
export const CLOCK_GRACE_MS = 60 * 1000;
export const clockRecords = (clock, now = Date.now()) => now - clock.startMs >= CLOCK_GRACE_MS;

export function weekActuals(rows, monday) {
  const byArea = {}; const byLens = {}; const byDay = {}; const sources = new Set();
  for (const r of rows || []) {
    if (r.date < monday || r.kind === 'planned' || r.kind === 'started' || r.kind === 'focal' || !(r.minutes > 0)) continue;
    byDay[r.date] = (byDay[r.date] || 0) + r.minutes;
    sources.add(r.kind === 'entered' ? 'entered' : 'timed');
    const lens = r.lens || 'unknown';
    byLens[lens] = (byLens[lens] || 0) + r.minutes;
    if (lens === 'work') byArea[r.area || 'unassigned'] = (byArea[r.area || 'unassigned'] || 0) + r.minutes;
  }
  const days = Object.values(byDay).filter((m) => m >= RECORDED_DAY_MINUTES).length;
  return { byArea, byLens, days, sources: [...sources] };
}

// The Next actions placements from the daily log (Brain D-109 A, D-120 A, D-121 B), read as
// one stream of rows per item in time order, its latest row deciding where it sits:
//   today      a position in today's Today list, or `out`. A row from an earlier day means
//              the item was left in Today unfinished: it sits at the top of Next (D-121 B),
//              so Today still starts empty each morning.
//   next       a position in Next, or `out`; it carries forward until moved.
//   next-week  a position in Next week, `keep` (the weekly review kept it) or `out`.
// An `out` clears only the list it names, so one batch can move an item between lists.
// Returns { today: [ref], next: [{ ref, since, carried }], week: [{ ref, since, position, kept }] }.
export const PLACE_ROWS = ['today', 'next', 'next-week'];
export function placements(rows, today) {
  const byTime = (a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`);
  const num = (n) => Number.parseInt(n, 10) || 0;
  const at = new Map();
  for (const r of (rows || []).filter((r) => PLACE_ROWS.includes(r.kind) && r.ref && r.date <= today).sort(byTime)) {
    const cur = at.get(r.ref) || null;
    const where = cur ? cur.where : null;
    if (r.kind === 'today') {
      if (r.note === 'out') { if (where === 'today' || where === 'carried') at.delete(r.ref); continue; }
      at.set(r.ref, r.date === today ? { where: 'today', pos: num(r.note), start: r.start } : { where: 'carried', pos: num(r.note), since: r.date });
    } else if (r.kind === 'next') {
      if (r.note === 'out') { if (where === 'next' || where === 'carried') at.delete(r.ref); continue; }
      at.set(r.ref, { where: 'next', pos: num(r.note), since: where === 'next' || where === 'carried' ? cur.since : r.date });
    } else {
      if (r.note === 'out') { if (where === 'later') at.delete(r.ref); continue; }
      const kept = where === 'later';
      at.set(r.ref, {
        where: 'later', since: kept ? cur.since : r.date,
        pos: r.note === 'keep' ? (kept ? cur.pos : 0) : num(r.note),
        kept: r.note === 'keep' ? r.date : (kept ? cur.kept : null),
      });
    }
  }
  const list = (w) => [...at.entries()].filter(([, v]) => v.where === w).map(([ref, v]) => ({ ref, ...v }));
  const todayList = list('today').sort((a, b) => (a.pos - b.pos) || a.start.localeCompare(b.start)).map((t) => t.ref);
  // Yesterday's leftovers first, the latest day first, each day in its Today order; then Next.
  const carried = list('carried').sort((a, b) => b.since.localeCompare(a.since) || (a.pos - b.pos));
  const next = [...carried.map((c) => ({ ref: c.ref, since: c.since, carried: true })),
    ...list('next').sort((a, b) => a.pos - b.pos).map((n) => ({ ref: n.ref, since: n.since, carried: false }))];
  const week = list('later').map((w) => ({ ref: w.ref, since: w.since, position: w.pos, kept: w.kept }))
    .sort((a, b) => (a.position - b.position) || ((raisedDate(b.ref) || '').localeCompare(raisedDate(a.ref) || '')));
  return { today: todayList, next, week };
}

// Placements name items by the id they had when placed; a card groomed from an Inbox line
// answers to the line's `L-` id as an alias (Brain D-122 A), so its place carries over.
export function resolvePlaces(places, view) {
  if (!places || !view) return places;
  const to = new Map();
  for (const e of view.entries || []) for (const a of e.aliases || []) to.set(a, e.ref);
  const map = (r) => to.get(r) || r;
  const seen = new Set();
  const once = (r) => (seen.has(r) ? false : (seen.add(r), true));
  return {
    today: places.today.map(map).filter(once),
    next: places.next.map((n) => ({ ...n, ref: map(n.ref) })).filter((n) => once(n.ref)),
    week: places.week.map((w) => ({ ...w, ref: map(w.ref) })).filter((w) => once(w.ref)),
  };
}

// An Inbox line's stable id until the groom makes its card (Brain D-122 A): `L-` and the
// FNV-1a hash of its home and text, the same as `brain.py line-ref`.
export function lineRef(home, text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${home}\n${text}`)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `L-${h.toString(16).padStart(8, '0')}`;
}

const PRI_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
// A line Leon has categorised is a next action at once (Brain D-122 A): it joins the view's
// entries, sorted into Floating by its priority, until the groom turns it into a card.
export function withLines(view) {
  if (!view || !Array.isArray(view.entries)) return view;
  const entries = view.entries.filter((e) => e.source !== 'line');
  const known = new Set(entries.flatMap((e) => [e.ref, ...(e.aliases || [])]));
  for (const r of view.inbox || []) {
    const d = r.details || {};
    if (r.kind !== 'line' || !d.categorised || d.reference) continue;
    const ref = lineRef(r.home, r.text);
    if (known.has(ref)) continue;
    const owner = d.owner || 'leon';
    const line = {
      ref, title: r.text, source: 'line', home: r.home, lens: r.lens || null, area: d.area || null,
      context: d.ai ? 'claude' : owner !== 'leon' ? 'waiting' : contextOfVia(d.via || guessVia(`${r.text} ${d.next || ''}`)),
      hot: [], section: owner === 'leon' ? 'next' : 'waiting', blocked_by: [], claude: null, no_owner: false,
      priority: d.priority || null, due: d.due || null, review: null, owner, state: null, kind: null,
      minutes: d.minutes || null, effort: null, ai: d.ai || null, next: d.next || '', evidence: '', prepared: '',
      place: null, flags: [], aliases: [], line: { text: r.raw || r.text, project: String(r.home || '').replace(/^project:/, '') },
    };
    const rank = PRI_RANK[line.priority] ?? 9;
    let i = entries.findIndex((e) => e.section !== 'hot' && (e.section !== 'next' || (PRI_RANK[e.priority] ?? 9) > rank));
    if (line.section === 'waiting') i = entries.findIndex((e) => !['hot', 'next'].includes(e.section));
    entries.splice(i < 0 ? entries.length : i, 0, line);
    known.add(ref);
  }
  view.entries = entries;
  return view;
}

// The day an item was raised, from its date-based id (Brain brain-021): `WORK-SYS-61016.05`
// is 2026-10-16. Null for a D-n or an older slug id.
export function raisedDate(ref) {
  const m = /-(\d)(\d\d)(\d\d)\.\d{2,3}$/.exec(ref || '');
  return m ? `202${m[1]}-${m[2]}-${m[3]}` : null;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// Leon's pick of the one thing for today (Brain D-113 A): today's latest `focal` row, its
// `ref` empty when he went back to the brief's pick; null when he picked nothing today.
export function latestFocal(rows, today) {
  const picks = (rows || []).filter((r) => r.kind === 'focal' && r.date === today);
  return picks.length ? { ref: picks[picks.length - 1].ref || '' } : null;
}

// The Claude session each handed item got (Brain D-132 C): its latest `session` row's link.
export function sessionsFrom(rows) {
  const out = {};
  for (const r of rows || []) if (r.kind === 'session' && /^https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+$/.test(r.note || '')) out[r.ref] = { link: r.note, date: r.date };
  return out;
}

// Puts a session link from the log on a handed item whose `Prepared:` does not carry one yet.
export function withSession(entry, sessions) {
  const s = sessions && sessions[entry.ref];
  if (!s || !['prepare', 'complete'].includes(entry.ai) || /\bsession https:/.test(entry.prepared || '')) return entry;
  const runup = /\brun-up ([A-Za-z0-9_./-]+\.md)/.exec(entry.prepared || '');
  return { ...entry, prepared: `${s.date}, session ${s.link}${runup ? `, run-up ${runup[1]}` : ''}`, claude: 'back' };
}

// Working hours open on Work, the rest on Personal (Brain D-53 A).
export function defaultLens(hours, date = new Date()) {
  return workingHours(hours, date) ? 'work' : 'personal';
}

export function workingHours(hours, date = new Date()) {
  const { weekday, minutes } = perthParts(date);
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const days = hours?.work_days ?? [0, 1, 2, 3, 4];
  return days.includes(weekday) && minutes >= toMin(hours?.work_start ?? '08:00') && minutes < toMin(hours?.work_end ?? '17:00');
}

// Which lens the page opens on (Brain D-116 A): Work in working hours, otherwise the lens
// Leon last used, remembered across days; the one-tap override stays.
export function openingLens(hours, stored, date = new Date()) {
  if (workingHours(hours, date)) return 'work';
  return LENSES.includes(stored) ? stored : 'personal';
}

// "overdue", "due today" and "due tomorrow" against today's Perth date (Brain D-61 A), so a
// view made on an earlier day still reads right; an item whose date has now arrived joins
// the hot lists. Dates only come closer, so nothing leaves hot here.
const DATE_CHIP = /^(overdue \d+ d|due today|due tomorrow|due \w{3} \d{2} \w{3})$/;
const HOT_DAYS = 2;
export function dueChip(due, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || '') || !today) return null;
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0) return `overdue ${-days} d`;
  if (days > HOT_DAYS) return null;
  if (days < 2) return days === 0 ? 'due today' : 'due tomorrow';
  const d = new Date(`${due}T00:00:00Z`);
  const name = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `due ${name} ${String(d.getUTCDate()).padStart(2, '0')} ${month}`;
}

export function refreshDue(view, today) {
  if (!today || !view.date || view.date >= today) return view;
  for (const e of view.entries) {
    if (!['hot', 'next'].includes(e.section)) continue;
    const kept = (e.hot || []).filter((h) => !DATE_CHIP.test(h));
    const chip = dueChip(e.due, today);
    e.hot = chip ? [chip, ...kept] : kept;
    if (e.hot.length && e.section === 'next') {
      e.section = 'hot';
      for (const slot of Object.values(view.lenses)) {
        if (slot.hot.includes(e.ref) || (slot.focal && slot.focal.ref === e.ref)) continue;
        if (view.entries.some((o) => o.ref === e.ref && (o.lens === lensKey(slot, view) || lensKey(slot, view) === 'all'))) {
          slot.hot_total += 1;
          if (slot.hot.length < 3) slot.hot.push(e.ref);
        }
      }
    }
  }
  return view;
}
const lensKey = (slot, view) => Object.keys(view.lenses).find((k) => view.lenses[k] === slot);

// Where tapping an entry goes: its card's queue, or the register file it lives in.
export function sourcePath(entry) {
  const project = /^project:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(entry.home || '');
  if ((entry.source === 'card' || entry.source === 'line') && project) return `projects/${project[1]}/QUEUE.md`;
  return /^D-\d+$/.test(entry.ref) ? 'register/decisions.md' : 'register/open-items.md';
}

// The link for an entry: its file, with `?item=` so the viewer scrolls to that card or item.
export function entryHref(entry) {
  return `#/${encodeURI(sourcePath(entry))}?item=${encodeURIComponent(entry.ref)}`;
}

export function lensEntries(view, lens) {
  return view.entries.filter((e) => lens === 'all' || e.lens === lens);
}

// Every row says what state its item is in (Brain D-115 A).
export const FLAG_CHIPS = { unconfirmed: 'new, confirm?', 'close-proposed': 'close proposed' };
export function flagChips(e) {
  return (e.flags || []).filter((f) => FLAG_CHIPS[f]).map((f) => `<span class="cc-chip flag">${FLAG_CHIPS[f]}</span>`);
}

// The Claude lane's two states on the phone (Brain D-119 A, P6): ready to hand over, and
// back for review once the brief wrote `Prepared:`; "running" is the desk's own.
export function laneChip(e) {
  const handed = ['prepare', 'complete'].includes(e.ai);
  // A run-up and its own session (Brain D-131 A, D-132 C): waiting on Leon's answers there.
  if (handed && sessionOf(e.prepared)) return '<span class="cc-chip clock">Claude session waiting</span>';
  if (handed && runupOf(e.prepared)) return '<span class="cc-chip clock">run-up ready</span>';
  if (e.claude === 'back' || (e.prepared && handed)) return '<span class="cc-chip ok">back for review</span>';
  if (e.claude === 'ready' || ['prepare', 'complete'].includes(e.ai)) return '<span class="cc-chip clock">ready for Claude</span>';
  return '';
}

function chips(e) {
  const out = [...flagChips(e), ...(e.hot || []).map((h) => `<span class="cc-chip hot">${esc(h)}</span>`)];
  if (e.no_owner) out.push('<span class="cc-chip warn">no owner: yours?</span>');
  const lane = laneChip(e);
  if (lane) out.push(lane);
  return out.join(' ');
}

// A hand-over's pointer (Brain D-131 A, D-132 C): `session <link>, run-up <note>`. Sessions a
// scheduled task starts are not in the Claude app's list or search, so the card is the way in.
export function sessionOf(prepared) {
  const m = /\bsession (https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+)/.exec(String(prepared || ''));
  return m ? m[1] : null;
}
export function runupOf(prepared) {
  const m = /\brun-up ([A-Za-z0-9_./-]+\.md)/.exec(String(prepared || ''));
  return m ? m[1] : null;
}

// What the brief prepared, as a link when it points at a page or a Brain file.
export function preparedHtml(e, paths = null) {
  const text = String(e.prepared || '');
  if (!text) return '';
  const session = sessionOf(text);
  const runup = runupOf(text);
  if (session || runup) {
    const note = runup && (!paths || paths.has(runup)) ? `<a class="mini-btn" href="#/${encodeURI(runup)}">Open run-up</a>` : '';
    const open = session ? `<a class="mini-btn primary" href="${esc(session)}" target="_blank" rel="noopener noreferrer">Open Claude session</a>` : '';
    const say = session ? 'Claude is on it: its questions are waiting in the session.' : 'The run-up is ready: start its session from the note.';
    return `<div class="tk-prepared tk-handover"><p><b>${session ? 'Claude session' : 'Run-up ready'}</b> ${say}</p><span class="tk-acts">${open}${note}</span></div>`;
  }
  const m = /(https?:\/\/\S+|[A-Za-z0-9_./-]+\.md)/.exec(text);
  const target = m && (/^https?:/.test(m[1]) ? m[1] : (!paths || paths.has(m[1].replace(/^\.\//, ''))) ? m[1] : null);
  const link = target ? (/^https?:/.test(target) ? `<a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${esc(target)}</a>` : `<a href="#/${encodeURI(target)}">${esc(target)}</a>`) : '';
  return `<p class="tk-prepared"><b>Back for review</b> ${link ? esc(text).replace(esc(target), link) : esc(text)}</p>`;
}

// What a routine flagged can be settled from the row itself (Brain D-112 A): Confirm is one
// tap, Reject and Keep open ask first; a new item with a close proposed closes in one tap.
// `asking` is 'reject' or 'keep' while the question is open.
// Someday and Trash on a stale Inbox row (DEV-61105.04); Trash asks first.
export function lineActsHtml(line, project, asking = null) {
  const l = esc(line); const p = esc(project);
  if (asking === 'trash') {
    return `<span class="cc-ask">Remove this line? Git keeps it.</span><button type="button" class="mini-btn primary" data-cc-line-act="trash" data-cc-line="${l}" data-cc-project="${p}">Yes, trash it</button>` +
      `<button type="button" class="mini-btn" data-cc-line-act="cancel" data-cc-line="${l}" data-cc-project="${p}">Cancel</button>`;
  }
  return `<button type="button" class="mini-btn" data-cc-line-act="someday" data-cc-line="${l}" data-cc-project="${p}">Someday</button>` +
    `<button type="button" class="mini-btn" data-cc-line-act="trash-ask" data-cc-line="${l}" data-cc-project="${p}">Trash…</button>`;
}

export function rowActs(e, asking = null) {
  const flags = e.flags || [];
  const fresh = flags.includes('unconfirmed');
  const closing = flags.includes('close-proposed');
  if (!fresh && !closing) return '';
  const ref = esc(e.ref);
  let inner;
  if (asking === 'reject') {
    inner = `<span class="cc-ask">Reject ${ref}? It leaves your lists; only a session brings it back.</span>` +
      `<button type="button" class="mini-btn primary" data-cc-act="reject" data-ref="${ref}">Yes, reject</button><button type="button" class="mini-btn" data-cc-act="cancel" data-ref="${ref}">Cancel</button>`;
  } else if (asking === 'keep') {
    inner = `<span class="cc-ask">Keep ${ref} open? The routine's evidence is dropped and noted.</span>` +
      `<button type="button" class="mini-btn primary" data-cc-act="keep" data-ref="${ref}">Yes, keep it open</button><button type="button" class="mini-btn" data-cc-act="cancel" data-ref="${ref}">Cancel</button>`;
  } else if (closing) {
    inner = `<button type="button" class="mini-btn primary" data-cc-act="close" data-ref="${ref}">Yes, it’s done</button>` +
      (fresh ? `<button type="button" class="mini-btn" data-cc-act="confirm" data-ref="${ref}">Confirm, keep open</button>` : '') +
      `<button type="button" class="mini-btn" data-cc-act="keep-ask" data-ref="${ref}">Keep open…</button>` +
      (fresh ? `<button type="button" class="mini-btn" data-cc-act="reject-ask" data-ref="${ref}">Reject…</button>` : '');
  } else {
    inner = `<button type="button" class="mini-btn primary" data-cc-act="confirm" data-ref="${ref}">Confirm</button>` +
      `<button type="button" class="mini-btn" data-cc-act="reject-ask" data-ref="${ref}">Reject…</button>`;
  }
  return `<div class="cc-acts" data-cc-acts="${ref}">${inner}</div>`;
}

// The Next step and, for a proposed close, the routine's Evidence, on the row (D-112 A).
function flagDetail(e) {
  const flags = e.flags || [];
  if (!flags.length) return '';
  let html = e.next ? `<span class="cc-next"><b>Next</b> ${esc(e.next)}</span>` : '';
  if (flags.includes('close-proposed')) html += `<span class="cc-ev"><b>Evidence</b> ${esc(e.evidence || 'on the item in the register')}</span>`;
  return html;
}

// A row's link: a card or item opens its task card; a categorised Inbox line not yet groomed
// opens its walk again (Brain D-122 A).
export function rowLink(e, body, cls = 'cc-row') {
  if (e.source === 'line' && e.line) {
    return `<a class="${cls}" href="${entryHref(e)}" data-cc-line="${esc(e.line.text)}" data-cc-project="${esc(e.line.project)}">${body}</a>`;
  }
  return `<a class="${cls}" href="${entryHref(e)}" data-cc-ref="${esc(e.ref)}">${body}</a>`;
}
const lineChip = (e) => (e.source === 'line' ? '<span class="cc-chip flag">card at the next groom</span>' : '');
const idText = (e) => (e.source === 'line' ? 'Inbox line' : e.ref);
// The home without its `project:` prefix: the slug is the name Leon knows.
export const homeName = (home) => String(home || '').replace(/^project:/, '');
// The small line under a title: id, project, priority, area and estimate (DEV-61105.03).
function factsLine(e, { area = true } = {}) {
  const est = estimateText(e);
  return `<span class="cc-id">${esc(idText(e))} · ${esc(homeName(e.home))}${e.priority ? ` · ${esc(priorityText(e.priority))}` : ''}${area && e.area ? ` · area ${esc(e.area)}` : ''}${est ? ` · ${esc(est)}` : ''}</span>`;
}

function row(e, open = true, clock = null) {
  const stripe = e.section === 'hot' ? 'hot' : e.claude === 'back' ? 'ok' : '';
  const ticking = clock && clock.ref === e.ref ? '<span class="cc-chip clock">clock running</span>' : '';
  const body = `<span class="cc-stripe ${stripe}"></span><span class="cc-m"><span class="cc-t">${esc(e.title)}</span>${factsLine(e)}` +
    `${chips(e) || ticking || lineChip(e) ? `<span class="cc-why">${ticking}${chips(e)}${lineChip(e)}</span>` : ''}${flagDetail(e)}</span>`;
  const link = open ? rowLink(e, body) : `<div class="cc-row">${body}</div>`;
  const acts = open ? rowActs(e) : '';
  return acts ? `<div class="cc-item">${link}${acts}</div>` : link;
}

// ---- inbox (Brain DEV-61016.12) ---------------------------------------------------

const INBOX_KINDS = { line: 'Inbox', capture: 'Capture', unconfirmed: 'New item', close: 'Close proposed' };
const INBOX_SHOWN = 8;

export function inboxHref(r) {
  return r.ref ? `#/${encodeURI(r.path)}?item=${encodeURIComponent(r.ref)}` : `#/${encodeURI(r.path)}`;
}

// The add box starts on a project in the lens being looked at.
export function defaultProject(view, lens, projects) {
  if (lens === 'all') return projects[0];
  const homes = [...(view.inbox || []), ...view.entries].filter((r) => r.lens === lens).map((r) => /^project:(.+)$/.exec(r.home || '')?.[1]);
  return homes.find((slug) => projects.includes(slug)) || projects[0];
}

// `shown` holds refs already on the screen (focal, Also hot, the Claude lane): a flagged
// item is not repeated here. The heading counts lines and captures only; register flags
// get their own line (Brain D-115 A).
// The Inbox panel on Focus holds raw lines and captures only (Brain D-115 C): what the
// routines flagged is settled on the Inbox tab, which the flags line opens. `addFirst`
// puts the add box above the rows (the Inbox tab, flow review F9).
export function inboxHtml(view, lens, { projects = [], all = false, title = 'Inbox', addFirst = false, flagsLine = true, today = '' } = {}) {
  const inLens = (view.inbox || []).filter((r) => lens === 'all' || r.lens === lens);
  const rows = inLens.filter((r) => r.kind === 'line' || r.kind === 'capture');
  const captures = rows.length;
  const flagged = { unconfirmed: 0, close: 0 };
  for (const r of inLens) if (r.kind in flagged) flagged[r.kind] += 1;
  const shown = all ? rows : rows.slice(0, INBOX_SHOWN);
  const flagLine = flagsLine && (flagged.unconfirmed || flagged.close)
    ? `<a class="cc-flags" href="#inbox">${[flagged.unconfirmed ? `${flagged.unconfirmed} to confirm` : '', flagged.close ? `${flagged.close} close${flagged.close === 1 ? '' : 's'} proposed` : ''].filter(Boolean).join(', ')} →</a>` : '';
  const add = projects.length ? '<form class="cc-inbox-add"><label class="visually-hidden" for="cc-inbox-project">Project</label>' +
    `<select id="cc-inbox-project" name="project">${projects.map((p) => `<option value="${esc(p)}"${p === defaultProject(view, lens, projects) ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>` +
    '<input type="text" name="text" maxlength="500" required autocomplete="off" placeholder="Capture something…" aria-label="New inbox line">' +
    '<button type="submit" class="mini-btn primary">Add</button><span class="write-msg" hidden></span></form>' : '';
  let html = `<section class="cc-inbox"><h2 class="cc-gh">${esc(title)} <em>${captures}</em></h2>${flagLine}<div class="cc-box">${addFirst ? add : ''}`;
  const known = new Set(view.entries.map((e) => e.ref));
  html += shown.map((r) => inboxRow(r, known, today)).join('');
  if (!rows.length) html += `<p class="cc-empty">Inbox empty${lens === 'all' ? '' : ' in this lens'}. Nothing waits to be clarified.</p>`;
  if (rows.length > shown.length) html += `<button type="button" class="text-btn cc-more" data-cc-inbox-all="1">Show all ${rows.length}</button>`;
  if (!addFirst) html += add;
  return `${html}</div></section>`;
}

// One Inbox row. A flagged register item opens its card (Confirm, Reject, close); a raw
// line opens its categorisation card (Brain D-100 B); a new register item opens its card,
// which categorises and confirms it; a capture opens its file until its own card lands
// (Brain DEV-61026.27, D-100).
export const STALE_DAYS = 7;
export function inboxRow(r, known, today = '') {
  const open = r.kind === 'line' ? ` data-cc-line="${esc(r.raw || r.text)}" data-cc-project="${esc(projectOf(r) || '')}"`
    : r.ref && known.has(r.ref) ? ` data-cc-${r.kind === 'unconfirmed' ? 'sort' : 'ref'}="${esc(r.ref)}"` : '';
  const sorted = r.details && r.details.categorised ? ' <span class="cc-chip ok">categorised · in Next actions</span>'
    : r.details && r.details.reference ? ' <span class="cc-chip ok">reference · the groom files it</span>' : '';
  // A raw line a week old gets a nudge and one-tap ways out (DEV-61105.04).
  const age = r.kind === 'line' && !r.details?.categorised && !r.details?.reference && today && r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? daysBetween(r.date, today) : 0;
  const stale = age >= STALE_DAYS ? ` <span class="cc-chip warn">${age} d, still here?</span>` : '';
  const link = `<a class="cc-row cc-in" href="${inboxHref(r)}"${open}><span class="cc-stripe ${r.kind === 'line' || r.kind === 'capture' ? '' : 'flag'}"></span>` +
    `<span class="cc-m"><span class="cc-t">${esc(r.text)}${sorted}${stale}</span>` +
    `<span class="cc-id"><span class="cc-kind">${INBOX_KINDS[r.kind] || esc(r.kind)}</span> · ${esc(homeName(r.home))}${r.ref ? ` · ${esc(r.ref)}` : ''}${r.date ? ` · ${esc(r.date)}` : ''}</span></span></a>`;
  if (!stale) return link;
  return `<div class="cc-item">${link}<div class="cc-acts" data-cc-line-acts="1">${lineActsHtml(r.raw || r.text, projectOf(r) || '')}</div></div>`;
}

// ---- search (Brain DEV-61103.05) ------------------------------------------------------------
// Every open card, item, Inbox line and Someday line in the view, across every project and
// lens, found by a few words or an id. Done and archived items are not in the view, so a
// search never finds them; the files are the place for those.

const lower = (value) => String(value || '').toLowerCase();
// A word matches where a word starts, so "rac" finds "RAC" and not "tracking".
const starts = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);

// Matches, best first: an id, alias or `L-` line id exactly (with or without `P-`), then the
// whole query at a word in the title, then every word in the title, then every word anywhere
// on the item (its next step, home, context, priority, owner, state, kind and what was prepared).
export function searchMatches(view, q, { limit = 50 } = {}) {
  const query = lower(q).trim().replace(/\s+/g, ' ');
  if (!query) return [];
  const words = query.split(' ');
  const bareId = (id) => id.replace(/^p-/, '');
  const out = [];
  const consider = (kind, ids, title, extra, row) => {
    const lid = ids.filter(Boolean).map(lower);
    const t = lower(title);
    const hay = `${lid.join(' ')} ${t} ${lower(extra)}`;
    let score;
    if (lid.some((id) => id === query || bareId(id) === bareId(query))) score = 0;
    else if (starts(t, query)) score = 1;
    else if (words.every((w) => starts(t, w))) score = 2;
    else if (words.every((w) => starts(hay, w))) score = 3;
    else return;
    out.push({ kind, score, title, row });
  };
  withLines(view);
  const known = new Set();
  for (const e of view.entries || []) {
    known.add(e.ref);
    consider('entry', [e.ref, ...(e.aliases || [])], e.title,
      [e.next, e.home, e.context, e.priority, e.owner, e.state, e.kind, e.due, e.prepared, e.section, e.line && e.line.text].join(' '), e);
  }
  for (const r of view.inbox || []) {
    if (r.ref && known.has(r.ref)) continue; // a flagged item is already an entry
    const d = r.details || {};
    if (r.kind === 'line' && d.categorised && !d.reference) continue; // an entry since withLines
    consider(r.kind === 'line' ? 'line' : 'inbox', r.kind === 'line' ? [lineRef(r.home, r.text)] : [r.ref], r.text,
      [r.home, r.family, r.raw, r.date, INBOX_KINDS[r.kind]].join(' '), r);
  }
  for (const r of view.someday || []) consider('someday', [], r.text, [r.home, r.family, r.raw, 'someday'].join(' '), r);
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}

// A found card or item: its project, id and state, opening its card like any row.
function searchRow(e, clock) {
  const state = e.section === 'hot' ? 'hot' : e.place === 'today' ? 'Today' : e.place === 'next-week' ? 'Next week'
    : e.state && e.state !== 'open' ? e.state : SECTION_NAMES[e.section] || e.section || '';
  const extra = `${state ? `<span class="cc-chip">${esc(state)}</span>` : ''}${e.source === 'line' ? '<span class="cc-chip flag">line · card at the next groom</span>' : ''}`;
  const body = `<span class="cc-stripe ${e.section === 'hot' ? 'hot' : ''}"></span><span class="cc-m"><span class="cc-t">${esc(e.title)}</span>` +
    `<span class="cc-id">${esc(e.source === 'line' ? lineRef(e.home, e.title) : e.ref)} · ${esc(homeName(e.home))}${e.priority ? ` · ${esc(priorityText(e.priority))}` : ''}</span>` +
    `<span class="cc-why">${extra}${chips(e)}${clock && clock.ref === e.ref ? '<span class="cc-chip clock">clock running</span>' : ''}</span>` +
    (e.next ? `<span class="cc-next"><b>Next</b> ${esc(e.next)}</span>` : '') + '</span>';
  return rowLink(e, body);
}

export function searchResultsHtml(view, q, { clock = null } = {}) {
  const query = String(q || '').trim();
  if (!query) {
    return '<p class="cc-note">Every open card, item and Inbox line in every project, whatever the lens. Type a few words, an id or an old alias. ' +
      'Done and archived items are not searched: <a href="#/INDEX.md">browse the files</a> for those.</p>';
  }
  const hits = searchMatches(view, query);
  if (!hits.length) return `<p class="cc-empty">Nothing open matches “${esc(query)}”. Done and archived items are not searched; <a href="#/INDEX.md">the files</a> have those.</p>`;
  const known = new Set((view.entries || []).map((e) => e.ref));
  const body = hits.map((h) => (h.kind === 'entry' ? searchRow(h.row, clock) : h.kind === 'someday' ? somedayRow(h.row) : inboxRow(h.row, known))).join('');
  return `<section class="cc-inbox"><h2 class="cc-gh">Found <em>${hits.length}</em></h2><div class="cc-box">${body}</div></section>`;
}

// The search page: the box, then the results, live as the query changes.
export function searchHtml(view, q, { clock = null } = {}) {
  return '<section class="cc-search"><form class="cc-search-box" role="search" action="#search"><label class="visually-hidden" for="cc-q">Search Brain</label>' +
    `<input id="cc-q" type="search" name="q" data-cc-search="1" value="${esc(q || '')}" placeholder="Find a card, item or line: a few words or an id" ` +
    'autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></form>' +
    `<div id="cc-search-results">${searchResultsHtml(view, q, { clock })}</div></section>`;
}

// ---- capture from anywhere (Brain DEV-61105.01) ---------------------------------------------
// The card the fixed Capture button opens on every screen: one line into a project's Inbox,
// the same write as the Inbox tab's box; the walk follows at once (D-110 A).
export function captureHtml(projects, picked, { message = '', text = '' } = {}) {
  const options = projects.map((p) => `<option value="${esc(p)}"${p === picked ? ' selected' : ''}>${esc(p)}</option>`).join('');
  return '<div class="tk-head"><span class="cc-id">Capture · to the inbox</span><button type="button" class="icon-btn tk-x" data-tk="hide" aria-label="Close">✕</button></div>' +
    '<h2 class="tk-ttl" id="tk-title">What’s on your mind?</h2>' +
    '<form class="tk-panel tk-sort" data-tk-form="capture"><label for="tk-cap-text">One line. Clarify it straight after, do it now, or leave it for the morning.</label>' +
    `<input id="tk-cap-text" name="text" maxlength="500" required autocomplete="off" placeholder="Ring Sam about the quote" value="${esc(text)}">` +
    `<label for="tk-cap-project">Project</label><select id="tk-cap-project" name="project">${options}</select>` +
    '<span class="tk-acts"><button type="submit" class="mini-btn primary">Add to inbox</button></span>' +
    (message ? `<p class="write-msg${/^Not /.test(message) ? ' bad' : ''}">${esc(message)}</p>` : '') + '</form>';
}

// The card after an Inbox add (Brain D-110 A): sort it now, do it now, or leave it for the
// morning sort. `doing` is the Do it now step, which ends with the line marked handled.
export function addedHtml(row, { doing = false, message = '' } = {}) {
  let html = `<div class="tk-head">${doing ? '<button type="button" class="mini-btn tk-back" data-tk="added">‹ Back</button>' : ''}` +
    `<span class="cc-id">Inbox · ${esc(row.home)}</span><button type="button" class="icon-btn tk-x" data-tk="hide" aria-label="Close">✕</button></div>` +
    `<p class="rw-k">${doing ? 'Do it now' : '✓ Added to the inbox'}</p><h2 class="tk-ttl" id="tk-title">${esc(row.text)}</h2>`;
  if (doing) {
    html += '<p class="cc-note">Do it now. When it’s finished, mark it handled: the line leaves the inbox, and Brain’s history keeps it.</p>' +
      '<span class="tk-acts"><button type="button" class="mini-btn primary" data-tk="handled">Handled, remove it</button>' +
      '<button type="button" class="mini-btn" data-tk="added">Not now</button></span>';
  } else {
    const choice = (act, label, note, primary = false) => `<button type="button" class="tk-choice${primary ? ' primary' : ''}" data-tk="${act}">` +
      `<b>${label}</b><span>${note}</span></button>`;
    html += '<div class="tk-choices">' +
      choice('sort-added', 'Categorise now', 'Family, priority and estimate. The next groom makes it a card.', true) +
      choice('do-added', 'Do it now', 'Quick enough to do now? Do it, then mark it handled.') +
      choice('hide', 'Leave for later', 'It waits in the inbox and on Clarify for the morning sort.') + '</div>';
  }
  if (message) html += `<p class="write-msg${/^Not /.test(message) ? ' bad' : ''}">${esc(message)}</p>`;
  return html;
}

// ---- the task card (Brain D-97 A, D-98 A) -----------------------------------------------

export const QUICK_EVIDENCE = 'Marked done on the phone';

export function projectOf(entry) {
  return /^project:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(entry?.home || '')?.[1] || null;
}

// What closing means for this entry: a card moves to Done, an open item takes Evidence, a
// register decision takes Leon's outcome (Brain D-111 A); Brain's own D-n decisions and
// unconfirmed items are settled elsewhere.
export function closeKind(entry) {
  if (/^D-\d+$/.test(entry.ref)) return 'decision';
  if (entry.source === 'card') return projectOf(entry) ? 'card' : 'none';
  if (entry.kind === 'decision') return 'decide';
  return 'item'; // a `P-` item closes in one go, confirmed on the way (Brain D-112 A)
}

export const isUnconfirmed = (entry) => /^P-/.test(entry.ref) || (entry.flags || []).includes('unconfirmed');

// `focal` is { ref, mine } for the item in the focal slot: `mine` when it is Leon's pick.
// The mode on the task card (Brain D-127 A): Brain's guess or the card's `via`, changeable
// on a card or an open item (one `web: via` commit); a decision is always an agenda.
function modeFact(entry) {
  const kind = closeKind(entry);
  const current = viaOfContext(entry.context);
  if (kind !== 'card' && kind !== 'item') return `<dt>Mode</dt><dd>${esc((MODES.find((m) => m[0] === current) || MODES[2])[1])}</dd>`;
  return `<dt><label for="tk-mode">Mode</label></dt><dd><select id="tk-mode" class="tk-mode" data-tk-mode="1">${MODES.map(([v, label]) => opt(v, label, current)).join('')}</select></dd>`;
}

export function taskHtml(entry, { clock = null, now = Date.now(), panel = '', message = '', focal = null, paths = null, where = null } = {}) {
  const mine = clock && clock.ref === entry.ref;
  const other = clock && !mine;
  const est = estimateText(entry);
  const spent = mine ? clockMinutes(clock, now) : 0;
  const facts = [['Next', entry.next], ['Due', entry.due && entry.due !== 'unknown' ? entry.due : ''], ['Owner', entry.owner],
    ['Priority', priorityText(entry.priority, true)], ['Estimate', est], ['Area', entry.area]].filter(([, v]) => v);
  let html = `<div class="tk-head"><span class="cc-id">${esc(entry.ref)} · ${esc(entry.home)}</span>` +
    '<button type="button" class="icon-btn tk-x" data-tk="hide" aria-label="Close the card; the clock keeps running">✕</button></div>' +
    `<h2 class="tk-ttl" id="tk-title">${esc(entry.title)}</h2>${chips(entry) ? `<p class="cc-why">${chips(entry)}</p>` : ''}` +
    `<dl class="tk-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}${modeFact(entry)}</dl>`;
  if (mine) {
    const over = Number.parseInt(entry.minutes, 10) > 0 && spent > Number.parseInt(entry.minutes, 10);
    html += `<div class="tk-clock${over ? ' over' : ''}"><span class="tk-time" data-tk-time="1">${esc(fmtElapsed(clock, now))}</span>` +
      `<span class="tk-sub">since ${esc(clock.start)}${est ? ` · estimate ${esc(est)}` : ''}</span>` +
      '<button type="button" class="mini-btn" data-tk="stop">Stop clock</button></div>';
  } else if (other) {
    html += `<div class="tk-clock idle"><span class="tk-sub">The clock is running on ${esc(clock.ref)} (${esc(fmtMinutes(clockMinutes(clock, now)))}).</span>` +
      '<button type="button" class="mini-btn primary" data-tk="switch">Switch the clock to this</button></div>';
  } else {
    html += `<div class="tk-clock idle"><span class="tk-sub">Not timing this${est ? ` · estimate ${esc(est)}` : ''}.</span>` +
      '<button type="button" class="mini-btn primary" data-tk="start">Start clock</button><button type="button" class="mini-btn" data-tk="time-ask">Add time…</button></div>';
  }
  const kind = closeKind(entry);
  const proposed = (entry.flags || []).includes('close-proposed');
  // A proposed close comes first; on a decision, Decided is the alternative (Brain D-117 B).
  // Done is one tap on an open item, with "marked done on the phone" as its evidence; a
  // note is optional (Brain D-133 B). A card still asks, a decision still takes its outcome.
  const closeBtn = kind === 'item'
    ? `<button type="button" class="mini-btn${proposed ? '' : ' primary'}" data-tk="close-quick">Done</button><button type="button" class="mini-btn" data-tk="done-ask">Done with a note…</button>`
    : kind === 'card' || kind === 'decide'
      ? `<button type="button" class="mini-btn${proposed ? '' : ' primary'}" data-tk="done-ask">${kind === 'decide' ? (proposed ? 'Decided otherwise…' : 'Decided…') : 'Done…'}</button>` : '';
  const progressBtn = kind !== 'decision' && kind !== 'none' ? '<button type="button" class="mini-btn" data-tk="progress-ask">Add progress…</button>' : '';
  const sortBtn = entry.source === 'item' && kind !== 'decision' ? '<button type="button" class="mini-btn" data-tk="categorise">Categorise…</button>' : '';
  // The one thing for today (Brain D-113 A): any hot or next item can take the slot; the
  // current pick says so and offers the way back to the brief's.
  const isFocal = focal && focal.ref === entry.ref;
  const focalBtn = isFocal
    ? (focal.mine ? '<button type="button" class="mini-btn" data-tk="focal-clear">Back to the brief’s pick</button>' : '')
    : ['hot', 'next'].includes(entry.section) ? '<button type="button" class="mini-btn" data-tk="focal-set">Make this the one thing</button>' : '';
  if (proposed) {
    html += `<div class="tk-panel tk-proposed"><p>A routine thinks this is done${entry.evidence ? `: <q>${esc(entry.evidence.replace(/\.$/, ''))}</q>` : ' (its evidence is on the item in the register)'}. ${kind === 'decide' ? 'Confirm it to record that as the outcome, or keep it open.' : 'Close it, or keep it open.'}</p>` +
      '<span class="tk-acts"><button type="button" class="mini-btn primary" data-tk="confirm-close">Yes, it’s done</button>' +
      '<button type="button" class="mini-btn" data-tk="reject-close">No, keep it open</button></span></div>';
  }
  if (isFocal) html += `<p class="cc-note cc-focal-note">This is the one thing today${focal.mine ? ', your pick' : ''}.</p>`;
  // Hand to Claude (Brain D-119 A): one tap sets `ai: prepare`; the brief prepares it and
  // writes `Prepared:`, which the card shows as the way to what came back.
  const inLane = ['prepare', 'complete'].includes(entry.ai);
  const handBtn = kind !== 'decision' && kind !== 'none' && !inLane && ['hot', 'next', 'waiting'].includes(entry.section)
    ? '<button type="button" class="mini-btn" data-tk="hand">Hand to Claude</button>' : '';
  if (inLane) html += entry.prepared ? preparedHtml(entry, paths) : '<p class="cc-note cc-lane-note">In the Claude lane: the next morning brief prepares it and brings it back here.</p>';
  html += `<div class="tk-acts">${closeBtn}${progressBtn}${focalBtn}${handBtn}${sortBtn}<a class="mini-btn" href="${entryHref(entry)}" data-tk="file">Open in file</a></div>`;
  // Where it sits, and where it can move (DEV-61105.04): Today, Next, Next week or Floating.
  if (where && ['hot', 'next', 'waiting'].includes(entry.section) && kind !== 'decision') {
    const name = { today: 'Today', next: 'Next', later: 'Next week', week: 'Floating' }[where] || 'Floating';
    html += `<div class="tk-where"><span class="cc-id">In ${esc(name)}</span>${placeActs(entry, where, { index: 0, count: 1 })}</div>`;
  }
  if (kind === 'decision') html += '<p class="cc-note">A decision is settled by replying to it in a session; it is not closed here.</p>';
  if (isUnconfirmed(entry)) {
    html += `<div class="tk-panel"><p>A routine found this new item. Confirm it to keep it${proposed ? '' : ', close it with Done'}, or reject it.</p>` +
      `<span class="tk-acts"><button type="button" class="mini-btn${proposed ? '' : ' primary'}" data-tk="confirm">Confirm</button>` +
      '<button type="button" class="mini-btn" data-tk="reject-ask">Reject…</button></span></div>';
  }
  html += panel;
  if (message) html += `<p class="write-msg${/^Not |^Clock not/.test(message) ? ' bad' : ''}">${esc(message)}</p>`;
  return html;
}

export function fmtElapsed(clock, now = Date.now()) {
  const secs = Math.max(0, Math.floor((now - (clock.startMs || Date.parse(`${clock.date}T${clock.start}:00+08:00`))) / 1000));
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function taskPanel(kind, entry) {
  // Another mode on an item handed to Claude (Brain D-128 A): take it back too, or keep
  // Claude preparing it.
  if (kind === 'via-ask') {
    return `<div class="tk-panel"><p>${esc(entry.ref)} is with Claude. Take it out of the Claude lane too?</p>` +
      '<button type="button" class="mini-btn primary" data-tk="via-unhand">Yes, I’ll do it</button>' +
      '<button type="button" class="mini-btn" data-tk="via-keep">No, Claude still prepares it</button>' +
      '<button type="button" class="mini-btn" data-tk="cancel">Cancel</button></div>';
  }
  if (kind === 'reject') {
    return `<div class="tk-panel"><p>Reject ${esc(entry.ref)}? It is marked rejected in the register and leaves your lists; only a session can bring it back.</p>` +
      '<button type="button" class="mini-btn primary" data-tk="reject">Yes, reject</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></div>';
  }
  if (kind === 'time') {
    return '<form class="tk-panel" data-tk-form="time"><label for="tk-min">Time spent on this, in minutes (quarter hours)</label>' +
      '<input id="tk-min" name="minutes" type="number" min="15" max="720" step="15" required inputmode="numeric" placeholder="30">' +
      '<button type="submit" class="mini-btn primary">Add time</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></form>';
  }
  if (kind === 'done' && closeKind(entry) === 'card') {
    return `<div class="tk-panel"><p>Mark ${esc(entry.ref)} done? It moves under Done in its queue, and the clock stops.</p>` +
      '<button type="button" class="mini-btn primary" data-tk="done">Yes, done</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></div>';
  }
  const form = kind !== 'done' ? 'progress' : closeKind(entry) === 'decide' ? 'decide' : 'close';
  const [label, submit] = { progress: ['What moved', 'Save progress'], close: ['Evidence: what shows it is done', 'Close it'],
    decide: ['What did you decide?', 'Record it'] }[form];
  return `<form class="tk-panel" data-tk-form="${form}"><label for="tk-text">${label}</label>` +
    `<textarea id="tk-text" name="text" rows="2" maxlength="500" required></textarea>` +
    `<button type="submit" class="mini-btn primary">${submit}</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></form>`;
}

export function clockBarHtml(clock, entry, now = Date.now()) {
  if (!clock) return '';
  const title = entry ? entry.title : clock.note || clock.ref;
  return `<span class="cb-dot" aria-hidden="true"></span><span class="cb-t"><b>${esc(clock.ref)}</b> ${esc(title)}</span>` +
    `<span class="cb-time" data-tk-time="1">${esc(fmtElapsed(clock, now))}</span>` +
    `<button type="button" class="mini-btn" data-cb="open">Open</button><button type="button" class="mini-btn" data-cb="stop">Stop</button>`;
}

// The focal slot's rule order (Brain D-113): Today's first item (DEV-61026.34), then Leon's
// `focal` row today, then the view's pick (the brief's `Focal:` or the hottest by rule).
// Returns { entry, reason, mine }.
export function focalChoice(view, lens, pick, places = null) {
  const slot = view.lenses[lens];
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  const fits = (e) => e && ['hot', 'next'].includes(e.section) && (lens === 'all' || e.lens === lens);
  const first = places ? places.today.map((r) => byRef.get(r)).find(fits) : null;
  if (first) return { entry: first, reason: 'first up today', mine: false };
  const own = pick && pick.ref ? byRef.get(pick.ref) : null;
  if (fits(own)) return { entry: own, reason: 'your pick for today', mine: true };
  const theirs = slot.focal && byRef.get(slot.focal.ref);
  return theirs ? { entry: theirs, reason: slot.focal.reason, mine: false } : null;
}

// Focus reads top to bottom (Brain D-120 A, D-124 A): the one thing; the top 3 beside Claude
// can help; then Next actions · Today, where the Inbox panel used to be. It is one Today
// order underneath: the one thing is its first item, the top 3 the next three, the list the
// rest. Hot items not placed join the list, marked hot, for Leon to promote.
export function focusLists(view, lens, places, focalRef) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  const fits = (e) => e && (lens === 'all' || e.lens === lens) && e.section !== 'parked';
  const today = (places ? places.today : []).filter((r) => fits(byRef.get(r)));
  const rest = today.filter((r) => r !== focalRef);
  const placed = new Set([...today, focalRef]);
  const hot = lensEntries(view, lens).filter((e) => e.section === 'hot' && !placed.has(e.ref)).map((e) => e.ref);
  return { today, top: rest.slice(0, 3), list: rest.slice(3), hot, firstIsFocal: today[0] === focalRef };
}

function focusRow(e, zone, clock) {
  const stripe = e.section === 'hot' ? 'hot' : e.claude === 'back' ? 'ok' : '';
  const ticking = clock && clock.ref === e.ref ? '<span class="cc-chip clock">clock running</span>' : '';
  const why = `${ticking}${chips(e)}${lineChip(e)}`;
  const body = `<span class="cc-stripe ${stripe}"></span><span class="cc-m"><span class="cc-t">${esc(e.title)}</span>${factsLine(e, { area: false })}` +
    `${why ? `<span class="cc-why">${why}</span>` : ''}${flagDetail(e)}</span>`;
  // Moves live on the card a tap opens (DEV-61105.04); a drag still works here. A categorised
  // line has no card yet, so its moves stay on the row.
  const acts = e.source === 'line' ? placeActs(e, 'today', { index: 0, count: 1 }) : '';
  return `<div class="cc-item" draggable="true" data-cc-drag="${esc(e.ref)}" data-cc-zone="${zone}">${rowLink(e, body)}${rowActs(e)}${acts}</div>`;
}

function focusTab(view, lens, byRef, opts = {}) {
  const slot = view.lenses[lens];
  const choice = focalChoice(view, lens, opts.focal, opts.places);
  const focal = choice && choice.entry;
  const clock = opts.clock || null;
  let html = '';
  if (focal) {
    const est = estimateText(focal);
    html += `<a class="cc-focal" href="${entryHref(focal)}" data-cc-ref="${esc(focal.ref)}" data-cc-slot="one"><span class="cc-k">The one thing${clock && clock.ref === focal.ref ? ' · clock running' : ''}</span>` +
      `<span class="cc-ttl">${esc(focal.title)}</span><span class="cc-why">${chips(focal)}</span>` +
      `<span class="cc-id">${esc(focal.ref)} · ${esc(homeName(focal.home))}${est ? ` · ${esc(est)}` : ''} · ${esc(choice.reason)}</span></a>`;
  } else {
    const best = Object.entries(slot.contexts).filter(([, c]) => c.count).sort((a, b) => b[1].count - a[1].count)[0];
    html += '<div class="cc-focal calm" data-cc-slot="one"><span class="cc-k">Nothing hot</span><span class="cc-ttl">Nothing needs you right now' +
      `${lens === 'all' ? '' : ' in this lens'}.</span><span class="cc-why">Drag a row up to make it the one thing${best ? `, or pick from a door: <button type="button" class="cc-door" data-cc-context="${best[0]}">${CONTEXT_NAMES[best[0]]} <span class="c">${best[1].count}</span></button>` : '.'}</span></div>`;
  }
  const lists = focusLists(view, lens, opts.places, focal ? focal.ref : null);
  const rowsOf = (refs, zone) => refs.map((r) => byRef.get(r)).filter(Boolean).map((e) => focusRow(e, zone, clock)).join('');
  const open = 3 - lists.top.length;
  const lane = slot.claude.filter((ref) => !focal || ref !== focal.ref).map((ref) => byRef.get(ref)).filter(Boolean);
  html += `<div class="cc-two"><section><h2 class="cc-gh">Top 3 <em>${lists.top.length}</em></h2><div class="cc-box" data-cc-slot="top">` +
    rowsOf(lists.top, 'top') +
    (open ? `<p class="cc-empty cc-open">${open === 3 ? 'Nothing in your top 3 yet.' : `${open} open.`} Drag a row up or tap ↑ Top 3.</p>` : '') + '</div></section>' +
    `<section><h2 class="cc-gh">Claude can help <em>${slot.claude_total}</em></h2><div class="cc-box">` +
    (lane.map((e) => row(e, true, clock)).join('') || '<p class="cc-empty">Nothing is marked for Claude yet.</p>') + '</div></section></div>';
  const below = [...lists.hot, ...lists.list];
  html += `<section class="cc-today-list"><h2 class="cc-gh">Next actions · Today <em>${below.length}</em><a class="cc-more" href="#next">All next actions →</a></h2>` +
    `<div class="cc-box" data-cc-slot="list">${rowsOf(below, 'list') || '<p class="cc-empty">Nothing else in Today. Bring items up in Next actions.</p>'}</div></section>`;
  const waiting = clarifyCount(view, lens);
  if (waiting) {
    // One tap settles everything the routines flagged, without the trip to the Inbox tab
    // (DEV-61105.04; the batch writes are D-112 A's).
    const groups = new Map(clarifyGroups(view, lens));
    const fresh = groups.get('New items to confirm') || [];
    const closing = groups.get('Proposed closes') || [];
    const batch = (flag, rows, label) => (rows.length > 1
      ? `<button type="button" class="mini-btn cc-batch" data-cc-batch="${flag}" data-ids="${esc(rows.map((e) => e.ref).join(','))}">${label} ${rows.length}</button>` : '');
    html += `<p class="cc-quiet"><a href="#inbox">${waiting} to clarify in the Inbox →</a>${batch('unconfirmed', fresh, 'Confirm all')}${batch('close-proposed', closing, 'Close all')}</p>`;
  }
  return html;
}

// Contexts and areas filter the Priority list (Brain D-101 B); Focus keeps what is hot.
function doorsHtml(slot) {
  let html = `<div class="cc-doors"><span class="cc-lbl">Contexts</span>${Object.entries(slot.contexts).map(([k, c]) =>
    `<button type="button" class="cc-door" data-cc-context="${esc(k)}">${CONTEXT_NAMES[k] || esc(k)} <span class="c">${c.count}</span>${c.hot ? '<span class="cc-hd" title="something hot"></span>' : ''}</button>`).join('')}</div>`;
  if (Object.keys(slot.areas).length) {
    html += `<div class="cc-doors"><span class="cc-lbl">Areas</span>${Object.entries(slot.areas).map(([k, a]) =>
      `<button type="button" class="cc-door" data-cc-area="${esc(k)}">${esc(a.name)} <span class="c">${a.hours ? `${esc(a.hours)} h · ` : ''}${a.count}</span>${a.hot ? '<span class="cc-hd"></span>' : ''}</button>`).join('')}</div>`;
  }
  return html;
}

// Placement buttons on the task card (Brain D-107, D-109 A, D-120 A; moved off the rows by
// DEV-61105.04): where the item can move from where it sits (`today`, `next`, `later` or
// `week`, Floating), with the one thing and the top 3 as places in Today. Up and down are
// `index` and `count` within its list; a drag on the rows does the same.
export function placeActs(e, sub, { index = 0, count = 1 } = {}) {
  const ref = esc(e.ref);
  const b = (act, label, cls = '') => `<button type="button" class="mini-btn${cls}" data-cc-place="${act}" data-ref="${ref}">${label}</button>`;
  const ud = (index > 0 ? b('up', '▲') : '') + (index < count - 1 ? b('down', '▼') : '');
  let inner = '';
  if (sub === 'today') inner = b('one', '↑ One thing') + b('top', '↑ Top 3') + ud + b('next', '→ Next') + b('week', '→ Floating') + b('next-week', '→ Next week');
  else if (sub === 'next') inner = b('today', '→ Today', ' primary') + b('one', '↑ One thing') + ud + b('week', '→ Floating') + b('next-week', '→ Next week');
  else if (sub === 'later') inner = b('week', 'Promote', ' primary') + b('keep', 'Keep') + b('today', '→ Today') + b('next', '→ Next') + ud;
  else inner = b('today', '→ Today', ' primary') + b('one', '↑ One thing') + b('top', '↑ Top 3') + b('next', '→ Next') + b('next-week', '→ Next week');
  return `<div class="cc-acts cc-place" data-cc-place-for="${ref}">${inner}</div>`;
}

function placedRow(e, sub, clock, pos, extra = '') {
  const stripe = e.section === 'hot' ? 'hot' : e.claude === 'back' ? 'ok' : '';
  const ticking = clock && clock.ref === e.ref ? '<span class="cc-chip clock">clock running</span>' : '';
  const why = `${ticking}${chips(e)}${lineChip(e)}`;
  const body = `<span class="cc-stripe ${stripe}"></span><span class="cc-m"><span class="cc-t">${esc(e.title)}</span>${factsLine(e)}` +
    `${why ? `<span class="cc-why">${why}</span>` : ''}${extra}${flagDetail(e)}</span>`;
  const acts = e.source === 'line' ? placeActs(e, sub, pos) : ''; // a line has no card yet (DEV-61105.04)
  return `<div class="cc-item" draggable="true" data-cc-drag="${esc(e.ref)}" data-cc-list="${sub}">${rowLink(e, body)}${rowActs(e)}${acts}</div>`;
}

// The four lists of Next actions for a lens (Brain D-120 A): Today, Next and Next week in
// Leon's order, Floating every other clarified action in the view's order.
export const FLOAT_SECTIONS = ['hot', 'next', 'waiting', 'review', 'blocked'];
export function nextLists(view, lens, places) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  const inLens = (ref) => { const e = byRef.get(ref); return e && (lens === 'all' || e.lens === lens); };
  const today = (places ? places.today : []).filter(inLens);
  const next = (places ? places.next : []).filter((n) => inLens(n.ref));
  const later = (places ? places.week : []).filter((w) => inLens(w.ref));
  const placed = new Set([...today, ...next.map((n) => n.ref), ...later.map((w) => w.ref)]);
  const floating = lensEntries(view, lens).filter((e) => !placed.has(e.ref) && FLOAT_SECTIONS.includes(e.section));
  return { today, next, later, floating };
}

export function nextCounts(view, lens, places) {
  const l = nextLists(view, lens, places);
  const counts = { today: l.today.length, next: l.next.length, week: l.floating.length, later: l.later.length };
  return { all: counts.today + counts.next + counts.week + counts.later, ...counts };
}

export const FLOAT_SHOWN = 20;
// Where Next actions opens (DEV-61105.04): Today when it has anything, else Next, else Floating.
export function openingSub(view, lens, places) {
  const c = nextCounts(view, lens, places);
  return c.today ? 'today' : c.next ? 'next' : 'week';
}

function nextTab(view, lens, { sub = 'all', filter = null, clock = null, places = null, today = '', floatAll = false } = {}) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  if (!SUBS.includes(sub)) sub = 'all';
  const lists = nextLists(view, lens, places);
  const counts = nextCounts(view, lens, places);
  let html = `<nav class="cc-subs" aria-label="Next actions">${SUBS.map((k) => `<button type="button" data-cc-sub="${k}" aria-pressed="${k === sub}">${SUB_NAMES[k]} <em>${counts[k]}</em></button>`).join('')}</nav>`;
  const show = (k) => sub === 'all' || sub === k;
  const head = (k, note) => (sub === 'all' ? `<h2 class="cc-gh">${SUB_NAMES[k]} <em>${counts[k]}</em></h2>` : '') + `<p class="cc-note">${note}</p>`;
  if (show('today')) {
    html += head('today', 'Your order for today. Focus shows the first as the one thing, the next three as your top 3. Unfinished items move to the top of Next each morning.') + '<div class="cc-box" data-cc-list-box="today">';
    html += lists.today.map((r, i) => placedRow(byRef.get(r), 'today', clock, { index: i, count: lists.today.length })).join('')
      || '<p class="cc-empty">Nothing in Today yet. Bring items up from Next or Floating.</p>';
    html += '</div>';
  }
  if (show('next')) {
    html += head('next', 'Your short list after Today, in your order. It carries forward until you move an item.') + '<div class="cc-box" data-cc-list-box="next">';
    html += lists.next.map((n, i) => placedRow(byRef.get(n.ref), 'next', clock, { index: i, count: lists.next.length },
      n.carried && n.since ? `<span class="cc-next"><b>Left in Today</b> ${esc(n.since)}</span>` : '')).join('')
      || '<p class="cc-empty">Nothing in Next.</p>';
    html += '</div>';
  }
  if (show('week')) {
    const rows = lists.floating.filter((e) => !filter
      || (filter.type === 'context' ? e.context === filter.value : (e.area || 'untagged') === filter.value));
    html += (sub === 'all' ? `<h2 class="cc-gh">${SUB_NAMES.week} <em>${counts.week}</em></h2>` : '') + doorsHtml(view.lenses[lens]);
    html += filter
      ? `<p class="cc-note">Showing ${esc(filter.type === 'context' ? CONTEXT_NAMES[filter.value] || filter.value : (view.lenses[lens].areas[filter.value] || {}).name || filter.value)} · <button type="button" class="text-btn" data-cc-clear="1">Show everything</button></p>`
      : '<p class="cc-note">Every other clarified action, by priority and due date: hot first, then the order <code>brain.py next</code> gives. A line you categorise in the Inbox lands here at once.</p>';
    // Hot and next show first, the first FLOAT_SHOWN of them unless asked for all; waiting,
    // review and blocked fold under their own headings (DEV-61105.04).
    const active = rows.filter((e) => ['hot', 'next'].includes(e.section));
    const quiet = rows.filter((e) => !['hot', 'next'].includes(e.section));
    const shown = floatAll ? active : active.slice(0, FLOAT_SHOWN);
    let section = null;
    html += '<div class="cc-box" data-cc-list-box="week">';
    for (const e of shown) {
      if (e.section !== section) { section = e.section; html += `<h2 class="cc-sec">${SECTION_NAMES[section] || esc(section)}</h2>`; }
      html += placedRow(e, 'week', clock, {});
    }
    if (active.length > shown.length) html += `<button type="button" class="text-btn cc-more" data-cc-float-all="1">Show all ${active.length}</button>`;
    if (!rows.length) html += '<p class="cc-empty">Nothing here.</p>';
    html += '</div>';
    for (const key of ['waiting', 'review', 'blocked']) {
      const mine = quiet.filter((e) => e.section === key);
      if (!mine.length) continue;
      html += `<details class="cc-fold"><summary>${SECTION_NAMES[key]} <em>${mine.length}</em></summary><div class="cc-box" data-cc-list-box="week">${mine.map((e) => placedRow(e, 'week', clock, {})).join('')}</div></details>`;
    }
  }
  if (show('later')) {
    html += head('later', 'Pushed back to next week, latest raised first. At week end, promote each or keep it; it waits until you move it.') + '<div class="cc-box" data-cc-list-box="later">';
    html += lists.later.map((w, i) => {
      const e = byRef.get(w.ref);
      const raised = raisedDate(w.ref);
      const bits = [raised ? `raised ${raised}` : '', w.since && today ? `waited ${daysBetween(w.since, today)} d` : '', w.kept ? `kept ${w.kept}` : ''].filter(Boolean).join(' · ');
      return placedRow(e, 'later', clock, { index: i, count: lists.later.length }, bits ? `<span class="cc-next"><b>Next week</b> ${esc(bits)}</span>` : '');
    }).join('') || '<p class="cc-empty">Nothing pushed back to next week.</p>';
    html += '</div>';
  }
  return html;
}

// ---- clarify: what is not prioritised yet (Leon's morning sort) ------------------------

// What the routines flagged comes from the entries' own flags, which this page keeps
// current after each write, with the view's quiet lists and inbox flag rows as sources too.
function clarifyGroups(view, lens) {
  const q = view.lenses[lens].quiet;
  const inLens = lensEntries(view, lens);
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  const pick = (refs) => refs.map((r) => byRef.get(r)).filter(Boolean);
  const flagged = (flag, kind, refs) => {
    const out = inLens.filter((e) => (e.flags || []).includes(flag));
    const more = [...refs, ...(view.inbox || []).filter((r) => r.kind === kind && (lens === 'all' || r.lens === lens)).map((r) => r.ref)];
    for (const r of more) { const e = byRef.get(r); if (e && !out.includes(e)) out.push(e); }
    return out;
  };
  const fresh = flagged('unconfirmed', 'unconfirmed', q.unconfirmed);
  const closing = flagged('close-proposed', 'close', q.close_proposed);
  const settled = new Set([...fresh, ...closing].map((e) => e.ref));
  return [
    ['New items to confirm', fresh],
    ['Proposed closes', closing],
    // A missing estimate reads as 30 minutes (Brain D-135 B); only a hot one is worth a tidy-up.
    ['No estimate yet', inLens.filter((e) => e.section === 'hot' && !(Number.parseInt(e.minutes, 10) > 0) && !settled.has(e.ref))],
    ['Parked without a review date', pick(q.needs_review_date)],
    ['No owner: yours, or hand it over?', pick(q.no_owner)],
  ];
}

// What only Leon can settle: raw lines and captures, new items and proposed closes
// (DEV-61105.03). Tidy-ups (estimates, review dates, owners) are not counted.
export const SETTLE_GROUPS = ['New items to confirm', 'Proposed closes'];
export function clarifyCount(view, lens) {
  const inbox = (view.inbox || []).filter((r) => (lens === 'all' || r.lens === lens) && (r.kind === 'line' || r.kind === 'capture')).length;
  return inbox + clarifyGroups(view, lens).filter(([t]) => SETTLE_GROUPS.includes(t)).reduce((n, [, rows]) => n + rows.length, 0);
}
export function tidyCount(view, lens) {
  return clarifyGroups(view, lens).filter(([t]) => !SETTLE_GROUPS.includes(t)).reduce((n, [, rows]) => n + rows.length, 0);
}

// The Inbox tab (Brain DEV-61026.33): the add box first, then raw lines and captures to
// clarify (a tap walks the GTD questions), what the routines found with one-tap Confirm,
// Reject, Confirm all and Close all (D-112 A), then the rest of the old Clarify groups.
function inboxTab(view, lens, opts) {
  let html = '<p class="cc-note">Everything not yet clarified. Tap a line to decide what it is; settle what the routines found from the row.</p>';
  html += inboxHtml(view, lens, { projects: opts.projects || [], all: true, title: 'To clarify', addFirst: true, flagsLine: false, today: opts.today || '' });
  const groups = clarifyGroups(view, lens);
  const batch = { 'New items to confirm': ['unconfirmed', 'Confirm all'], 'Proposed closes': ['close-proposed', 'Close all'] };
  const section = (title, rows) => {
    const b = batch[title];
    const all = b && rows.length > 1
      ? `<button type="button" class="mini-btn primary cc-batch" data-cc-batch="${b[0]}" data-ids="${esc(rows.map((e) => e.ref).join(','))}">${b[1]} ${rows.length}</button>` : '';
    return `<section class="cc-inbox"><h2 class="cc-gh">${esc(title)} <em>${rows.length}</em></h2>${all ? `<p class="cc-batch-row">${all}</p>` : ''}<div class="cc-box">` +
      rows.map((e) => row(e, true, opts.clock)).join('') + '</div></section>';
  };
  for (const [title, rows] of groups) if (rows.length && SETTLE_GROUPS.includes(title)) html += section(title, rows);
  if (!clarifyCount(view, lens)) html += `<p class="cc-empty">Nothing to clarify${lens === 'all' ? '' : ' in this lens'}.</p>`;
  // Tidy-ups wait folded away: groomed work missing an estimate, a review date or an owner
  // is not clarifying, and it no longer swells the count (DEV-61105.03).
  const tidy = groups.filter(([title, rows]) => rows.length && !SETTLE_GROUPS.includes(title));
  if (tidy.length) {
    html += `<details class="cc-tidy"><summary>Tidy-ups <em>${tidyCount(view, lens)}</em> <span class="cc-note">estimates, review dates and owners; not urgent</span></summary>` +
      tidy.map(([title, rows]) => section(title, rows)).join('') + '</details>';
  }
  return html;
}

const HOURS_TARGETS = [['1', 'work'], ['2', 'work'], ['3', 'work'], ['4', 'work'], ['5', 'work'], ['vol', 'work'],
  ['', 'ventures'], ['', 'personal'], ['', 'brain']];

function allocationTab(view, lens, time) {
  const a = view.allocation;
  if (!a) return '<p class="cc-empty">No director allocation found.</p>';
  const areas = view.lenses.work.areas;
  const entries = lensEntries(view, 'work');
  const actual = time ? weekActuals(time.rows, time.monday) : null;
  const recorded = actual && actual.days > 0;
  // An area or lens with no rows reads "not recorded", never 0 (Brain D-114 A).
  const spentIn = (map, key) => (actual && Object.hasOwn(map, key) ? map[key] : null);
  let html = `<p class="cc-note">${esc(a.total)} h a week across five areas, plus ${esc(a.float)} h undeclared float. ` +
    (!time ? 'Loading this week’s recorded time…' : time.error ? `This week’s time could not be read (${esc(time.error)}).`
      : recorded ? `Recorded on ${actual.days} day${actual.days === 1 ? '' : 's'} this week, from ${esc(time.monday)}: task clocks and hours entered here or at the desk (a day counts with ${RECORDED_DAY_MINUTES} minutes or more). Unrecorded time is not counted as zero; the debrief covers it.`
        : 'Nothing recorded this week yet: start a task’s clock or enter hours below.') + '</p><div class="cc-lanes">';
  const name = (ref) => (a.areas[ref] ? a.areas[ref].name : ref === 'vol' ? 'Volunteering' : `Area ${ref}`);
  for (const [ref, area] of Object.entries(a.areas)) {
    const door = areas[ref] || { count: 0, hot: false };
    const items = entries.filter((e) => e.area === ref && ['hot', 'next', 'parked'].includes(e.section)).slice(0, 4);
    const spent = spentIn(actual ? actual.byArea : {}, ref);
    const known = recorded && spent !== null;
    const pct = Math.min(100, Math.round(((spent || 0) / (Number(area.hours) * 60 || 1)) * 100));
    const over = (spent || 0) > Number(area.hours) * 60;
    const chip = (e) => `<span class="cc-chip ${e.section === 'hot' ? 'hot' : ''}">${esc(e.ref)} ${esc(e.title.slice(0, 40))}${(e.flags || []).length ? ` · ${(e.flags || []).map((f) => FLAG_CHIPS[f]).filter(Boolean).join(', ')}` : ''}</span>`;
    html += `<div class="cc-lane"><span class="cc-nm">${esc(ref)} ${esc(area.name)}<small>${known ? `${esc(fmtMinutes(spent))} of ` : recorded ? 'not recorded · ' : ''}${esc(area.hours)} h a week · ${door.count} open${door.hot ? ' · something hot' : ''}</small></span>` +
      (known ? `<span class="cc-meter${over ? ' over' : ''}" role="img" aria-label="${esc(fmtMinutes(spent))} of ${esc(area.hours)} hours"><span style="width:${pct}%"></span></span>` : '') +
      `<span class="cc-why">${items.map(chip).join(' ') || '<span class="cc-chip">nothing open</span>'}</span></div>`;
  }
  const untagged = (areas.untagged || {}).count || 0;
  const floatSpent = spentIn(actual ? actual.byArea : {}, 'unassigned');
  html += `<div class="cc-lane float"><span class="cc-nm">Float<small>${esc(a.float)} h, undeclared · not a target${recorded && floatSpent ? ` · ${esc(fmtMinutes(floatSpent))} of work time with no area` : ''}</small></span><span class="cc-why">${untagged ? `<span class="cc-chip warn">${untagged} work item${untagged === 1 ? '' : 's'} with no area yet</span>` : ''}</span></div></div>`;
  if (recorded) {
    const other = ['vol', 'ventures', 'personal', 'brain'].map((k) => [k, k === 'vol' ? spentIn(actual.byArea, 'vol') : spentIn(actual.byLens, k)]);
    html += `<p class="cc-note">No budget, this week: ${other.map(([k, m]) => `${k === 'vol' ? 'Volunteering' : LENS_NAMES[k]} ${m === null ? 'not recorded' : esc(fmtMinutes(m))}`).join(' · ')}.</p>`;
  }
  html += '<form class="cc-hours"><span class="cc-lbl">Enter hours</span><label class="visually-hidden" for="cc-hours-where">Where</label>' +
    `<select id="cc-hours-where" name="where">${HOURS_TARGETS.map(([area, l]) => `<option value="${area}|${l}">${esc(area ? `${area === 'vol' ? '' : `${area} `}${name(area)}` : LENS_NAMES[l])}</option>`).join('')}</select>` +
    '<label class="visually-hidden" for="cc-hours-h">Hours</label><input id="cc-hours-h" name="hours" type="number" min="0.25" max="12" step="0.25" required placeholder="h" inputmode="decimal">' +
    '<input name="note" type="text" maxlength="120" placeholder="What it was (optional)" aria-label="What it was" autocomplete="off">' +
    '<button type="submit" class="mini-btn primary">Add</button><span class="write-msg" hidden></span></form>';
  return html + (lens === 'work' || lens === 'all' ? '' : '<p class="cc-note">The allocation covers Work; Ventures, Personal and Brain have no budgets.</p>');
}

// ---- Someday, by family, and the family pages (Brain D-104 C, DEV-61026.35) -------------------
// Someday lines never mix into Focus or Next actions: they have their own entry, grouped by
// family, each promotable back into the Inbox; a family page (#family/<CODE>) lists
// everything in that family.

export const familyOf = (ref) => (/^(?:P-)?([A-Z]+(?:-[A-Z]+)?|\?)-\d{5}\.\d{2,3}$/.exec(ref || '') || [])[1] || null;
export const familyHref = (code) => `#family/${encodeURIComponent(code)}`;

export function somedayRows(view, lens) {
  return (view.someday || []).filter((r) => lens === 'all' || r.lens === lens);
}

function somedayRow(r) {
  const project = projectOf(r) || '';
  return `<div class="cc-item"><div class="cc-row cc-in"><span class="cc-stripe"></span><span class="cc-m"><span class="cc-t">${esc(r.text)}</span>` +
    `<span class="cc-id"><span class="cc-kind">Someday</span> · ${esc(homeName(r.home))}${r.date ? ` · since ${esc(r.date)}` : ''}</span></span></div><div class="cc-acts"><button type="button" class="mini-btn" data-cc-promote="1" data-cc-line="${esc(r.raw || r.text)}" data-cc-project="${esc(project)}">Promote to Inbox</button></div></div>`;
}

export function somedayHtml(view, lens) {
  const rows = somedayRows(view, lens);
  let html = '<p class="cc-note">Someday / Maybe: parked on purpose, kept well apart from next actions. Browse by family; promote one into the Inbox when its time has come.</p>';
  const families = [...new Set(rows.map((r) => r.family || '?'))].sort();
  for (const code of families) {
    const mine = rows.filter((r) => (r.family || '?') === code);
    html += `<section class="cc-inbox"><h2 class="cc-gh"><a href="${familyHref(code)}">${esc(code)}</a> <em>${mine.length}</em></h2><div class="cc-box">${mine.map(somedayRow).join('')}</div></section>`;
  }
  if (!rows.length) html += `<p class="cc-empty">Nothing parked in Someday${lens === 'all' ? '' : ' in this lens'}.</p>`;
  return html;
}

// Everything in one family: next actions, waiting and parked items, then its Someday lines.
export function familyHtml(view, code, { clock = null } = {}) {
  const mine = view.entries.filter((e) => familyOf(e.ref) === code);
  const groups = [['Next actions', mine.filter((e) => ['hot', 'next'].includes(e.section))], ['Waiting for', mine.filter((e) => e.section === 'waiting')],
    ['Parked, under review or blocked', mine.filter((e) => ['parked', 'review', 'blocked'].includes(e.section))]];
  const parked = (view.someday || []).filter((r) => (r.family || '?') === code);
  let html = `<p class="cc-note">Family <b>${esc(code)}</b>: everything that carries it, across lenses. <a href="#someday">Back to Someday</a> · <a href="#next">Next actions</a></p>`;
  for (const [title, rows] of groups) {
    if (!rows.length) continue;
    html += `<section class="cc-inbox"><h2 class="cc-gh">${title} <em>${rows.length}</em></h2><div class="cc-box">${rows.map((e) => row(e, true, clock)).join('')}</div></section>`;
  }
  if (parked.length) html += `<section class="cc-inbox"><h2 class="cc-gh">Someday <em>${parked.length}</em></h2><div class="cc-box">${parked.map(somedayRow).join('')}</div></section>`;
  if (!mine.length && !parked.length) html += '<p class="cc-empty">Nothing carries this family yet.</p>';
  return html;
}

// One chip names the lens and opens the chooser (DEV-61026.34); the one-tap override stays.
export function lensChipHtml(lens, shown, open = false) {
  return `<div class="cc-lens"><button type="button" class="cc-lens-chip" data-cc-lens-open="1" aria-expanded="${open}" aria-haspopup="true">${LENS_NAMES[lens]} <span aria-hidden="true">▾</span></button>` +
    (open ? `<div class="cc-seg cc-chooser" role="group" aria-label="Lens">${shown.map((l) => `<button type="button" data-cc-lens="${l}" aria-pressed="${l === lens}">${LENS_NAMES[l]}</button>`).join('')}</div>` : '') + '</div>';
}

export function homeHtml(view, { lens, tab = 'focus', filter = null, asOf = '', time = null, clock = null, projects = [], inboxAll = false, today = '', focal = null, places = null, sub = 'all', lensOpen = false, family = null, q = '', floatAll = false } = {}) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  // Only the lenses this view carries, so an older view without Brain's own lens still renders.
  const shown = LENSES.filter((l) => view.lenses[l]);
  if (!view.lenses[lens]) lens = 'all';
  const seg = lensChipHtml(lens, shown, lensOpen);
  const count = clarifyCount(view, lens);
  if (tab === 'clarify') tab = 'inbox'; // the old tabs' links still land
  if (tab === 'priority') tab = 'next';
  const tabs = TABS.map((t) => `<a href="#${t}"${t === tab ? ' aria-current="page"' : ''}>${TAB_NAMES[t]}${t === 'inbox' && count ? ` <span class="cc-n">${count}</span>` : ''}</a>`).join('');
  const parked = somedayRows(view, lens).length;
  const body = tab === 'family' ? familyHtml(view, family || '?', { clock })
    : tab === 'search' ? searchHtml(view, q, { clock })
    : tab === 'someday' ? somedayHtml(view, lens)
    : tab === 'next' ? nextTab(view, lens, { sub, filter, clock, places, today, floatAll })
    : tab === 'allocation' ? allocationTab(view, lens, time)
      : tab === 'inbox' ? inboxTab(view, lens, { clock, projects, today })
        : focusTab(view, lens, byRef, { clock, projects, inboxAll, focal, places });
  // A view made on an earlier Perth day has yesterday's "overdue" and "due soon".
  const stale = today && view.date && view.date < today
    ? `<p class="cc-stale" role="status">View made for ${esc(view.date)}; today’s refresh runs at 06:00, so overdue and due-soon may be a day behind.</p>` : '';
  return `<div class="cc"><div class="cc-head">${seg}` +
    `<span class="cc-side"><a class="cc-files cc-someday" href="#someday"${tab === 'someday' ? ' aria-current="page"' : ''}>Someday <em>${parked}</em></a>` +
    `<a class="cc-files" href="#/INDEX.md">Files</a></span></div>` +
    `<nav class="cc-tabs" aria-label="Command centre">${tabs}</nav>` + stale + body +
    `<p class="cc-note">${esc(view.gaps.join(' '))}${asOf ? ` As of ${esc(asOf)}.` : ''}</p></div>`;
}

// ---- the reward when a task is done ------------------------------------------------------

const CHEERS = [
  'One less thing on your plate.', 'Done and dusted.', 'That’s momentum.', 'Closed. Onto the next.',
  'Nice work. Breathe, then pick the next one.', 'Off the list for good.', 'That one won’t nag you again.',
];

// `done` is { title, ref, minutes, today, next, back } where `next` is the item now in focus
// and `back` the item whose clock this one interrupted (Brain DEV-61030.15): both start
// their clock when tapped.
export function rewardHtml(done, pick = Math.random) {
  const cheer = CHEERS[Math.floor(pick() * CHEERS.length) % CHEERS.length];
  const bits = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${(i % 3) * 60}ms"></i>`).join('');
  const stats = [done.minutes ? `${fmtMinutes(done.minutes)} on it today` : '', `${done.today} done today`].filter(Boolean).join(' · ');
  return `<div class="tk-reward"><div class="rw-burst" aria-hidden="true">${bits}</div><div class="rw-tick" aria-hidden="true">✓</div>` +
    `<p class="rw-k">Task completed</p><h2 class="tk-ttl" id="tk-title">${esc(done.title)}</h2><p class="rw-cheer">${esc(cheer)}</p>` +
    `<p class="cc-note">${esc(done.ref)} · ${esc(stats)}</p><div class="tk-acts">` +
    (done.back && (!done.next || done.back.ref !== done.next.ref) ? `<button type="button" class="mini-btn primary" data-tk="back-to" data-ref="${esc(done.back.ref)}">Back to ${esc(done.back.title)}</button>` : '') +
    (done.next ? `<button type="button" class="mini-btn${done.back && done.back.ref !== done.next.ref ? '' : ' primary'}" data-tk="next" data-ref="${esc(done.next.ref)}">Next: ${esc(done.next.title)}</button>` : '') +
    '<button type="button" class="mini-btn" data-tk="hide">Back to the home</button></div>' +
    (done.next || done.back ? '<p class="cc-note">Next and Back start that item’s clock.</p>' : '') + '</div>';
}

// After a task leaves, the next hot item moves into focus and the hot list refills from the
// ranked entries, as Brain does on its next render (D-64 A).
export function promoteNext(view, ref) {
  view.entries = view.entries.filter((e) => e.ref !== ref);
  for (const [lens, slot] of Object.entries(view.lenses)) {
    const hot = lensEntries(view, lens).filter((e) => e.section === 'hot');
    slot.claude = slot.claude.filter((r) => r !== ref);
    slot.claude_total = slot.claude.length;
    for (const list of Object.values(slot.quiet)) { const i = list.indexOf(ref); if (i !== -1) list.splice(i, 1); }
    if (!slot.focal || slot.focal.ref === ref) {
      slot.focal = hot[0] ? { ref: hot[0].ref, reason: 'next hot, after the last one was done' } : null;
    }
    const focal = slot.focal && slot.focal.ref;
    slot.hot = hot.filter((e) => e.ref !== focal).slice(0, 3).map((e) => e.ref);
    slot.hot_total = hot.length;
  }
  return view;
}

// ---- the categorisation card (Brain D-100 B) --------------------------------------------

const ESTIMATES = [30, 60, 90, 120, 180, 240, 360, 480];

// Family codes from the table in Brain's context/families.md.
export function parseFamilies(markdown) {
  const out = [];
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const m = line.match(/^\|\s*([A-Z]+(?:-[A-Z]+)?|`\?`)\s*\|\s*([^|]+?)\s*\|/);
    if (m && m[1] !== 'Family') out.push({ code: m[1].replace(/`/g, ''), covers: m[2] });
  }
  return out;
}

// `target` is { kind: 'line', text, details, family, home } for an Inbox line, or
// { kind: 'item', entry } for an open register item.
// With `back`, the card was opened from a task's card: Back and Cancel return there.
export function categoriseHtml(target, { families = [], message = '', back = false } = {}) {
  const line = target.kind === 'line';
  const e = target.entry || {};
  const det = target.details || {};
  const v = line
    ? { title: target.text, next: det.next || '', family: det.family || target.family || '?', priority: det.priority || 'P2', minutes: det.minutes || '', due: det.due || '', owner: det.owner || 'leon' }
    : { title: e.title, next: e.next || '', family: (e.ref.replace(/^P-/, '').match(/^(.*)-\d{5}\.\d{2,3}$/) || [])[1] || '?', minutes: e.minutes || '', due: e.due && e.due !== 'unknown' ? e.due : '', owner: e.owner && e.owner !== 'unknown' ? e.owner : 'leon' };
  const fams = families.length ? families : [{ code: v.family, covers: '' }];
  const opt = (value, label, chosen) => `<option value="${esc(value)}"${String(value) === String(chosen) ? ' selected' : ''}>${esc(label)}</option>`;
  const fresh = !line && ((e.flags || []).includes('unconfirmed') || /^P-/.test(e.ref));
  let html = `<div class="tk-head">${back ? '<button type="button" class="mini-btn tk-back" data-tk="back">‹ Back</button>' : ''}` +
    `<span class="cc-id">${line ? `Inbox · ${esc(target.home)}` : `${esc(e.ref)} · ${esc(e.home)}`}</span>` +
    '<button type="button" class="icon-btn tk-x" data-tk="hide" aria-label="Close">✕</button></div>' +
    `<h2 class="tk-ttl" id="tk-title">Categorise</h2><p class="cc-note">${line
      ? 'Give it what a card needs. The next scheduled groom (every 2 hours, 07:00 to 21:00) turns it into a card.'
      : fresh ? 'A routine found this. Give it its details and it is confirmed with them.' : 'Set its details.'}</p>` +
    `<form class="tk-panel tk-sort" data-tk-form="categorise">` +
    `<label for="cg-title">What it is</label><input id="cg-title" name="title" maxlength="200" value="${esc(v.title)}" required>` +
    `<label for="cg-next">Next step</label><input id="cg-next" name="next" maxlength="300" value="${esc(v.next)}" required placeholder="The very next physical action">` +
    `<div class="tk-grid"><span><label for="cg-family">Family</label><select id="cg-family" name="family">${fams.map((f) => opt(f.code, f.covers ? `${f.code} · ${f.covers.slice(0, 48)}` : f.code, v.family)).join('')}</select></span>` +
    (line ? `<span class="tk-wide"><label for="cg-priority">Priority</label><select id="cg-priority" name="priority">${Object.keys(PRIORITIES).map((p) => opt(p, priorityText(p, true), v.priority)).join('')}</select></span>` : '') +
    `<span><label for="cg-minutes">Estimate</label><select id="cg-minutes" name="minutes">${opt('', 'Not sure yet', v.minutes)}${ESTIMATES.map((m) => opt(m, fmtMinutes(m), v.minutes)).join('')}</select></span>` +
    `<span><label for="cg-due">Due</label><input id="cg-due" name="due" type="date" value="${esc(v.due)}"></span>` +
    `<span><label for="cg-owner">Owner</label><input id="cg-owner" name="owner" maxlength="40" value="${esc(v.owner)}"></span></div>` +
    `<span class="tk-acts"><button type="submit" class="mini-btn primary">${line ? 'Save for grooming' : fresh ? 'Save and confirm' : 'Save'}</button>` +
    `<button type="button" class="mini-btn" data-tk="${back ? 'back' : 'hide'}">Cancel</button></span></form>`;
  if (message) html += `<p class="write-msg${/^Not /.test(message) ? ' bad' : ''}">${esc(message)}</p>`;
  return html;
}

// ---- the Inbox tab's question walk (Brain DEV-61026.33) --------------------------------
// A raw Inbox line leaves actionable, parked or gone: "Is it actionable?" then, for Yes,
// the next physical action (D-106 C), one action or several (D-108 A), under two minutes,
// delegate (D-105 C), and priority, estimate and date. `walk` is
// { row, step, a: answers, startedMs }; every write is one guarded web commit.

export const WALK_STEPS = ['actionable', 'action', 'two', 'doing', 'delegate', 'details'];
export const TWO_MINUTES_MS = 2 * 60 * 1000;
const NOT_A_VERB = new Set(['the', 'a', 'an', 'my', 'our', 'this', 'that', 'these', 'those', 'it', 'he', 'she', 'they', 're', 'fyi', 'about',
  'for', 'with', 'to', 'on', 'in', 'of', 'at', 'from', 'meeting', 'idea', 'note', 'reminder', 'question', 'issue', 'problem', 'maybe']);
const VAGUE = ['think about', 'look into', 'deal with', 'sort out', 'handle', 'work on', 'consider', 'figure out', 'plan for', 'follow up', 'chase up', 'organise', 'organize', 'get onto', 'do something about'];

// Does the text read as a physical action? Returns { ok, note }: `ok` false when it does not
// start with a verb, and a note when it leans on a vague phrase (D-106 C).
export function actionCheck(text) {
  const words = String(text || '').trim().toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return { ok: false, note: 'Say what you will physically do, starting with a verb: ring, draft, book, send, ask…' };
  if (NOT_A_VERB.has(words[0])) return { ok: false, note: 'Start with the verb: what is the very next physical action?' };
  const vague = VAGUE.find((v) => ` ${words.join(' ')} `.includes(` ${v} `));
  return { ok: true, note: vague ? `“${vague}” is not an action you can finish. What is the first physical step?` : '' };
}

const ESTIMATE_OPTIONS = [30, 60, 90, 120, 180, 240, 360, 480];
const opt = (value, label, chosen) => `<option value="${esc(value)}"${String(value) === String(chosen) ? ' selected' : ''}>${esc(label)}</option>`;
const choice = (act, label, note, primary = false) => `<button type="button" class="tk-choice${primary ? ' primary' : ''}" data-wk="${act}"><b>${label}</b><span>${note}</span></button>`;

export function walkHtml(walk, { families = [], message = '', now = Date.now() } = {}) {
  const r = walk.row; const a = walk.a || {};
  const head = (sub, back) => `<div class="tk-head">${back ? `<button type="button" class="mini-btn tk-back" data-wk="back">‹ Back</button>` : ''}` +
    `<span class="cc-id">Inbox · ${esc(r.home)}</span><button type="button" class="icon-btn tk-x" data-wk="hide" aria-label="Close">✕</button></div>` +
    `<p class="rw-k">${esc(sub)}</p><h2 class="tk-ttl" id="tk-title">${esc(r.text)}</h2>`;
  let html = '';
  if (walk.step === 'actionable') {
    html = head('Is it actionable?', false) + '<div class="tk-choices">' +
      choice('yes', 'Yes', 'It needs doing. Define the next physical action.', true) +
      choice('someday', 'Someday / Maybe', 'Not now. It parks in this project’s Someday list.') +
      choice('reference', 'Reference', 'Worth keeping, nothing to do. The groom files it in a project document.') +
      choice('trash-ask', 'Trash', 'Gone. The line is removed; git keeps it.') + '</div>';
    if (walk.asking === 'trash') {
      html += `<div class="tk-panel"><p>Remove this line from the inbox?</p><button type="button" class="mini-btn primary" data-wk="trash">Yes, trash it</button>` +
        '<button type="button" class="mini-btn" data-wk="cancel">Cancel</button></div>';
    }
  } else if (walk.step === 'action') {
    // Step 1 (Brain D-126 A): the line is offered as the next action; one tap when it is,
    // or edit it; several actions make a project with an Outcome (D-108 A).
    const next = a.next ?? r.text;
    const check = next ? actionCheck(next) : null;
    const project = a.kind === 'project';
    html = head('1 · The next physical action', true) +
      `<form class="tk-panel tk-sort" data-wk-form="action"><label for="wk-next">${project ? 'The first action' : 'Is this the next physical action? Edit it if not.'}</label>` +
      `<input id="wk-next" name="next" maxlength="300" required autocomplete="off" value="${esc(next)}" placeholder="Ring Sam about the quote">` +
      (check && !check.ok ? `<p class="write-msg bad">${esc(check.note)}</p>` : check && check.note ? `<p class="write-msg">${esc(check.note)}</p>` : '') +
      (project
        ? '<label for="wk-outcome">Outcome, when the project is done</label>' +
          `<input id="wk-outcome" name="outcome" maxlength="300" required autocomplete="off" value="${esc(a.outcome || '')}" placeholder="The cover is renewed and filed">` +
          '<span class="tk-acts"><button type="submit" class="mini-btn primary" name="kind" value="project">Next ›</button>' +
          '<button type="submit" class="mini-btn" name="kind" value="action" formnovalidate>It’s one action</button></span>'
        : '<span class="tk-acts"><button type="submit" class="mini-btn primary" name="kind" value="action">Yes, one action ›</button>' +
          '<button type="submit" class="mini-btn" name="kind" value="several" formnovalidate>It’s several (a project)</button></span>') +
      '</form>';
  } else if (walk.step === 'two') {
    html = head('2 · Can it be done in under two minutes?', true) + `<p class="cc-note">${esc(a.next || '')}</p><div class="tk-choices">` +
      choice('two-yes', 'Yes, do it now', 'A two-minute clock starts. Finishing records the time and closes the line.', true) +
      choice('two-no', 'No', 'On to delegating and scheduling.') + '</div>';
  } else if (walk.step === 'doing') {
    const left = TWO_MINUTES_MS - (now - (walk.startedMs || now));
    html = head('Doing it now', false) + `<p class="cc-note">${esc(a.next || '')}</p>` +
      `<div class="tk-clock${left < 0 ? ' over' : ''}"><span class="tk-time" data-wk-count="1">${esc(fmtCountdown(left))}</span><span class="tk-sub">two minutes</span></div>` +
      '<form class="tk-panel" data-wk-form="done"><label for="wk-min">Time it took, in minutes (quarter hours; the clock fills it in)</label>' +
      `<input id="wk-min" name="minutes" type="number" min="15" max="720" step="15" required inputmode="numeric" value="${Math.max(15, Math.ceil((now - (walk.startedMs || now)) / 60000 / 15) * 15)}">` +
      '<span class="tk-acts"><button type="submit" class="mini-btn primary">Done, record it</button>' +
      '<button type="button" class="mini-btn" data-wk="carry-on">Not finished, carry on</button></span></form>';
  } else if (walk.step === 'delegate') {
    html = head('3 · Delegate it?', true) + `<p class="cc-note">${esc(a.next || '')}</p><div class="tk-choices">` +
      choice('deleg-none', 'No, it is mine', 'On to priority, estimate and date.', true) +
      choice('deleg-person', 'A person', 'They own it; you wait, with a follow-up date.') +
      choice('deleg-claude', 'Claude', 'It joins the Claude lane: prepared for your review.') + '</div>';
    if (walk.asking === 'person') {
      html += '<form class="tk-panel tk-sort" data-wk-form="person"><label for="wk-owner">To whom?</label>' +
        `<input id="wk-owner" name="owner" maxlength="40" required autocomplete="off" value="${esc(a.owner && a.owner !== 'leon' ? a.owner : '')}" placeholder="sam">` +
        `<label for="wk-follow">Follow up on</label><input id="wk-follow" name="due" type="date" value="${esc(a.due || '')}">` +
        `<label><input type="checkbox" name="handover"${a.handover ? ' checked' : ''}> Add the handover itself as my next action (D-105 C)</label>` +
        '<span class="tk-acts"><button type="submit" class="mini-btn primary">Next ›</button></span></form>';
    }
  } else {
    const fams = families.length ? families : [{ code: a.family || r.family || '?', covers: '' }];
    html = head('4 · Priority, estimate and date', true) + `<p class="cc-note">${esc(a.next || '')}${a.owner && a.owner !== 'leon' ? ` · ${esc(a.owner)} owns it` : ''}${a.ai ? ' · Claude prepares it' : ''}</p>` +
      '<form class="tk-panel tk-sort" data-wk-form="details"><div class="tk-grid">' +
      `<span><label for="wk-family">Family</label><select id="wk-family" name="family">${fams.map((f) => opt(f.code, f.covers ? `${f.code} · ${f.covers.slice(0, 48)}` : f.code, a.family || r.family || '?')).join('')}</select></span>` +
      `<span class="tk-wide"><label for="wk-priority">Priority</label><select id="wk-priority" name="priority">${Object.keys(PRIORITIES).map((p) => opt(p, priorityText(p, true), a.priority || 'P2')).join('')}</select></span>` +
      `<span><label for="wk-minutes">Estimate</label><select id="wk-minutes" name="minutes">${opt('', 'Not sure yet', a.minutes || '')}${ESTIMATE_OPTIONS.map((m) => opt(m, fmtMinutes(m), a.minutes || '')).join('')}</select></span>` +
      `<span><label for="wk-via">Mode</label><select id="wk-via" name="via">${MODES.filter(([v]) => v !== 'ai').map(([v, label]) => opt(v, label, a.via || guessVia(`${r.text} ${a.next || ''}`))).join('')}</select></span>` +
      `<span><label for="wk-due">Deadline, or leave it to float</label><input id="wk-due" name="due" type="date" value="${esc(a.due || '')}"></span></div>` +
      '<span class="tk-acts"><button type="submit" class="mini-btn primary">Save</button></span>' +
      '<p class="cc-note">It goes into Next actions at once; the groom makes its card (every 2 hours, 07:00 to 21:00).</p></form>';
  }
  if (message) html += `<p class="write-msg${/^Not /.test(message) ? ' bad' : ''}">${esc(message)}</p>`;
  return html;
}

export function fmtCountdown(ms) {
  const over = ms < 0;
  const secs = Math.floor(Math.abs(ms) / 1000);
  return `${over ? '+' : ''}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}${over ? ' over' : ''}`;
}

// The details a finished walk saves on the line (categorise.js reads them).
export function walkDetails(walk, title) {
  const a = walk.a || {};
  return {
    title, next: a.next || '', family: a.family || walk.row.family || '?', priority: a.priority || 'P2',
    via: a.ai ? '' : a.via || guessVia(`${title} ${a.next || ''}`),
    minutes: a.minutes ? Number(a.minutes) : null, due: a.due || '', owner: a.owner || 'leon',
    kind: a.kind === 'project' ? 'project' : 'action', outcome: a.kind === 'project' ? a.outcome || '' : '',
    ai: a.ai || '', handover: a.handover && a.owner && a.owner !== 'leon' ? `Hand ${a.next || 'it'} to ${a.owner}` : '',
  };
}
