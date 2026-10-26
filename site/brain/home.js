// Brain viewer — the command centre home (Brain card brain-032).
// Renders the view Brain generates into views/command-centre.json: the inbox, the one
// focal item, what else is hot, where Claude can help, the quiet line and the doors, with
// Priority and Allocation tabs; plus the task card a tap opens, its clock, and this week's
// time against the allocation (Brain D-96 C, D-97 A, D-98 A). No imports, so the tests can
// load it on its own; every string from Brain goes through esc().

export const VIEW_PATH = 'views/command-centre.json';
export const LENSES = ['work', 'ventures', 'personal', 'brain', 'all'];
export const TABS = ['focus', 'priority', 'allocation'];
const LENS_NAMES = { work: 'Work', ventures: 'Ventures', personal: 'Personal', brain: 'Brain', all: 'All' };
const CONTEXT_NAMES = {
  emails: 'Emails', calls: 'Calls', computer: 'Computer', errands: 'Errands',
  agendas: 'Agendas', waiting: 'Waiting for', claude: 'Claude',
};
const SECTION_NAMES = {
  hot: 'Hot', next: 'Next', review: 'Parked without a review date', waiting: 'Waiting for',
  parked: 'Parked', blocked: 'Blocked',
};

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

// This week's recorded time: every kind but plans and still-running clocks.
export function weekActuals(rows, monday) {
  const byArea = {}; const byLens = {}; const days = new Set(); const sources = new Set();
  for (const r of rows || []) {
    if (r.date < monday || r.kind === 'planned' || r.kind === 'started' || !(r.minutes > 0)) continue;
    days.add(r.date);
    sources.add(r.kind === 'entered' ? 'entered' : 'timed');
    const lens = r.lens || 'unknown';
    byLens[lens] = (byLens[lens] || 0) + r.minutes;
    if (lens === 'work') byArea[r.area || 'unassigned'] = (byArea[r.area || 'unassigned'] || 0) + r.minutes;
  }
  return { byArea, byLens, days: days.size, sources: [...sources] };
}

// Working hours open on Work, the rest on Personal (Brain D-53 A).
export function defaultLens(hours, date = new Date()) {
  const { weekday, minutes } = perthParts(date);
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const days = hours?.work_days ?? [0, 1, 2, 3, 4];
  const working = days.includes(weekday) && minutes >= toMin(hours?.work_start ?? '08:00') && minutes < toMin(hours?.work_end ?? '17:00');
  return working ? 'work' : 'personal';
}

// Where tapping an entry goes: its card's queue, or the register file it lives in.
export function sourcePath(entry) {
  const project = /^project:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(entry.home || '');
  if (entry.source === 'card' && project) return `projects/${project[1]}/QUEUE.md`;
  return /^D-\d+$/.test(entry.ref) ? 'register/decisions.md' : 'register/open-items.md';
}

// The link for an entry: its file, with `?item=` so the viewer scrolls to that card or item.
export function entryHref(entry) {
  return `#/${encodeURI(sourcePath(entry))}?item=${encodeURIComponent(entry.ref)}`;
}

export function lensEntries(view, lens) {
  return view.entries.filter((e) => lens === 'all' || e.lens === lens);
}

function chips(e) {
  const out = (e.hot || []).map((h) => `<span class="cc-chip hot">${esc(h)}</span>`);
  if (e.no_owner) out.push('<span class="cc-chip warn">no owner: yours?</span>');
  return out.join(' ');
}

function row(e, open = true, clock = null) {
  const stripe = e.section === 'hot' ? 'hot' : e.claude === 'back' ? 'ok' : '';
  const est = estimateText(e);
  const ticking = clock && clock.ref === e.ref ? '<span class="cc-chip clock">clock running</span>' : '';
  const body = `<span class="cc-stripe ${stripe}"></span><span class="cc-m"><span class="cc-id">${esc(e.ref)} · ${esc(e.home)}${e.area ? ` · area ${esc(e.area)}` : ''}${est ? ` · ${esc(est)}` : ''}</span>` +
    `<span class="cc-t">${esc(e.title)}</span>${chips(e) || ticking ? `<span class="cc-why">${ticking}${chips(e)}</span>` : ''}</span>`;
  return open ? `<a class="cc-row" href="${entryHref(e)}" data-cc-ref="${esc(e.ref)}">${body}</a>` : `<div class="cc-row">${body}</div>`;
}

// ---- inbox (Brain DEV-61016.12) ---------------------------------------------------

const INBOX_KINDS = { line: 'Inbox', capture: 'Capture', unconfirmed: 'New item', close: 'Close proposed' };
const INBOX_SHOWN = 8;

export function inboxHref(r) {
  return r.ref ? `#/${encodeURI(r.path)}?item=${encodeURIComponent(r.ref)}` : `#/${encodeURI(r.path)}`;
}

export function inboxHtml(view, lens, { projects = [], all = false } = {}) {
  const rows = (view.inbox || []).filter((r) => lens === 'all' || r.lens === lens);
  const shown = all ? rows : rows.slice(0, INBOX_SHOWN);
  let html = `<section class="cc-inbox"><h2 class="cc-gh">Inbox <em>${rows.length}</em></h2><div class="cc-box">`;
  html += shown.map((r) => `<a class="cc-row cc-in" href="${inboxHref(r)}"><span class="cc-stripe ${r.kind === 'line' || r.kind === 'capture' ? '' : 'flag'}"></span>` +
    `<span class="cc-m"><span class="cc-id"><span class="cc-kind">${INBOX_KINDS[r.kind] || esc(r.kind)}</span> · ${esc(r.home)}${r.ref ? ` · ${esc(r.ref)}` : ''}${r.date ? ` · ${esc(r.date)}` : ''}</span>` +
    `<span class="cc-t">${esc(r.text)}</span></span></a>`).join('');
  if (!rows.length) html += `<p class="cc-empty">Inbox empty${lens === 'all' ? '' : ' in this lens'}. Nothing waits to be clarified.</p>`;
  if (rows.length > shown.length) html += `<button type="button" class="text-btn cc-more" data-cc-inbox-all="1">Show all ${rows.length}</button>`;
  if (projects.length) {
    html += '<form class="cc-inbox-add"><label class="visually-hidden" for="cc-inbox-project">Project</label>' +
      `<select id="cc-inbox-project" name="project">${projects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>` +
      '<input type="text" name="text" maxlength="500" required autocomplete="off" placeholder="Capture something…" aria-label="New inbox line">' +
      '<button type="submit" class="mini-btn primary">Add</button><span class="write-msg" hidden></span></form>';
  }
  return `${html}</div></section>`;
}

// ---- the task card (Brain D-97 A, D-98 A) -----------------------------------------------

export function projectOf(entry) {
  return /^project:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(entry?.home || '')?.[1] || null;
}

// What closing means for this entry: a card moves to Done, an open item takes Evidence,
// and decisions and unconfirmed items are settled elsewhere.
export function closeKind(entry) {
  if (/^D-\d+$/.test(entry.ref)) return 'decision';
  if (entry.source === 'card') return projectOf(entry) ? 'card' : 'none';
  if (/^P-/.test(entry.ref)) return 'unconfirmed';
  if (entry.kind === 'decision') return 'decision';
  return 'item';
}

export function taskHtml(entry, { clock = null, now = Date.now(), panel = '', message = '' } = {}) {
  const mine = clock && clock.ref === entry.ref;
  const other = clock && !mine;
  const est = estimateText(entry);
  const spent = mine ? clockMinutes(clock, now) : 0;
  const facts = [['Next', entry.next], ['Due', entry.due && entry.due !== 'unknown' ? entry.due : ''], ['Owner', entry.owner],
    ['Priority', entry.priority], ['Estimate', est], ['Area', entry.area]].filter(([, v]) => v);
  let html = `<div class="tk-head"><span class="cc-id">${esc(entry.ref)} · ${esc(entry.home)}</span>` +
    '<button type="button" class="icon-btn tk-x" data-tk="hide" aria-label="Close the card; the clock keeps running">✕</button></div>' +
    `<h2 class="tk-ttl" id="tk-title">${esc(entry.title)}</h2>${chips(entry) ? `<p class="cc-why">${chips(entry)}</p>` : ''}` +
    `<dl class="tk-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  if (mine) {
    const over = Number.parseInt(entry.minutes, 10) > 0 && spent > Number.parseInt(entry.minutes, 10);
    html += `<div class="tk-clock${over ? ' over' : ''}"><span class="tk-time" data-tk-time="1">${esc(fmtElapsed(clock, now))}</span>` +
      `<span class="tk-sub">since ${esc(clock.start)}${est ? ` · estimate ${esc(est)}` : ''}${clock.written ? '' : ' · saved after the first minute'}</span>` +
      '<button type="button" class="mini-btn" data-tk="stop">Stop clock</button></div>';
  } else if (other) {
    html += `<div class="tk-clock idle"><span class="tk-sub">The clock is running on ${esc(clock.ref)} (${esc(fmtMinutes(clockMinutes(clock, now)))}).</span>` +
      '<button type="button" class="mini-btn primary" data-tk="switch">Switch the clock to this</button></div>';
  } else {
    html += '<div class="tk-clock idle"><span class="tk-sub">Clock stopped.</span><button type="button" class="mini-btn primary" data-tk="start">Start clock</button></div>';
  }
  const kind = closeKind(entry);
  const closeBtn = kind === 'card' || kind === 'item' ? '<button type="button" class="mini-btn primary" data-tk="done-ask">Done…</button>' : '';
  const progressBtn = kind !== 'decision' && kind !== 'none' ? '<button type="button" class="mini-btn" data-tk="progress-ask">Add progress…</button>' : '';
  html += `<div class="tk-acts">${closeBtn}${progressBtn}<a class="mini-btn" href="${entryHref(entry)}" data-tk="file">Open in file</a></div>`;
  if (kind === 'decision') html += '<p class="cc-note">A decision is settled by replying to it in a session; it is not closed here.</p>';
  if (kind === 'unconfirmed') html += '<p class="cc-note">Confirm this new item in the register first; then it can be closed here.</p>';
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
  if (kind === 'done' && closeKind(entry) === 'card') {
    return `<div class="tk-panel"><p>Mark ${esc(entry.ref)} done? It moves under Done in its queue, and the clock stops.</p>` +
      '<button type="button" class="mini-btn primary" data-tk="done">Yes, done</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></div>';
  }
  const done = kind === 'done';
  return `<form class="tk-panel" data-tk-form="${done ? 'close' : 'progress'}"><label for="tk-text">${done ? 'Evidence: what shows it is done' : 'What moved'}</label>` +
    `<textarea id="tk-text" name="text" rows="2" maxlength="500" required></textarea>` +
    `<button type="submit" class="mini-btn primary">${done ? 'Close it' : 'Save progress'}</button><button type="button" class="mini-btn" data-tk="cancel">Cancel</button></form>`;
}

export function clockBarHtml(clock, entry, now = Date.now()) {
  if (!clock) return '';
  const title = entry ? entry.title : clock.note || clock.ref;
  return `<span class="cb-dot" aria-hidden="true"></span><span class="cb-t"><b>${esc(clock.ref)}</b> ${esc(title)}</span>` +
    `<span class="cb-time" data-tk-time="1">${esc(fmtElapsed(clock, now))}</span>` +
    `<button type="button" class="mini-btn" data-cb="open">Open</button><button type="button" class="mini-btn" data-cb="stop">Stop</button>`;
}

function focusTab(view, lens, byRef, opts = {}) {
  const slot = view.lenses[lens];
  const focal = slot.focal && byRef.get(slot.focal.ref);
  const clock = opts.clock || null;
  let html = inboxHtml(view, lens, { projects: opts.projects || [], all: opts.inboxAll });
  if (focal) {
    const est = estimateText(focal);
    html += `<a class="cc-focal" href="${entryHref(focal)}" data-cc-ref="${esc(focal.ref)}"><span class="cc-k">The one thing${clock && clock.ref === focal.ref ? ' · clock running' : ''}</span>` +
      `<span class="cc-ttl">${esc(focal.title)}</span><span class="cc-why">${chips(focal)}</span>` +
      `<span class="cc-id">${esc(focal.ref)} · ${esc(focal.home)}${est ? ` · ${esc(est)}` : ''} · ${esc(slot.focal.reason)}</span></a>`;
  } else {
    const best = Object.entries(slot.contexts).filter(([, c]) => c.count).sort((a, b) => b[1].count - a[1].count)[0];
    html += '<div class="cc-focal calm"><span class="cc-k">Nothing hot</span><span class="cc-ttl">Nothing needs you right now' +
      `${lens === 'all' ? '' : ' in this lens'}.</span>${best ? `<span class="cc-why">Pick from a door: <button type="button" class="cc-door" data-cc-context="${best[0]}">${CONTEXT_NAMES[best[0]]} <span class="c">${best[1].count}</span></button></span>` : ''}</div>`;
  }
  const hot = slot.hot.map((ref) => byRef.get(ref)).filter(Boolean);
  const lane = slot.claude.map((ref) => byRef.get(ref)).filter(Boolean);
  const moreHot = Math.max(0, slot.hot_total - (focal && focal.section === 'hot' ? 1 : 0));
  html += `<div class="cc-two"><section><h2 class="cc-gh">Also hot <em>${moreHot}</em></h2><div class="cc-box">` +
    (hot.map((e) => row(e, true, clock)).join('') || '<p class="cc-empty">Nothing else is hot.</p>') + '</div></section>' +
    `<section><h2 class="cc-gh">Claude can help <em>${slot.claude_total}</em></h2><div class="cc-box">` +
    (lane.map((e) => row(e, true, clock)).join('') || '<p class="cc-empty">Nothing is marked for Claude yet.</p>') + '</div></section></div>';
  const q = slot.quiet;
  const parts = [];
  if (q.needs_review_date.length) parts.push(`${q.needs_review_date.length} parked without a review date (${esc(q.needs_review_date.join(', '))})`);
  if (q.no_owner.length) parts.push(`${q.no_owner.length} with no owner: delegate? (${esc(q.no_owner.join(', '))})`);
  if (q.unconfirmed.length || q.close_proposed.length) parts.push(`<a href="#/register/open-items.md">Clarify: ${q.unconfirmed.length} unconfirmed, ${q.close_proposed.length} close proposed</a>`);
  if (parts.length) html += `<p class="cc-quiet">${parts.map((p) => `<span>${p}</span>`).join('')}</p>`;
  html += `<div class="cc-doors"><span class="cc-lbl">Contexts</span>${Object.entries(slot.contexts).map(([k, c]) =>
    `<button type="button" class="cc-door" data-cc-context="${esc(k)}">${CONTEXT_NAMES[k] || esc(k)} <span class="c">${c.count}</span>${c.hot ? '<span class="cc-hd" title="something hot"></span>' : ''}</button>`).join('')}</div>`;
  if (Object.keys(slot.areas).length) {
    html += `<div class="cc-doors"><span class="cc-lbl">Areas</span>${Object.entries(slot.areas).map(([k, a]) =>
      `<button type="button" class="cc-door" data-cc-area="${esc(k)}">${esc(a.name)} <span class="c">${a.hours ? `${esc(a.hours)} h · ` : ''}${a.count}</span>${a.hot ? '<span class="cc-hd"></span>' : ''}</button>`).join('')}</div>`;
  }
  return html;
}

function priorityTab(view, lens, filter, clock = null) {
  const rows = lensEntries(view, lens).filter((e) => !filter
    || (filter.type === 'context' ? e.context === filter.value : (e.area || 'untagged') === filter.value));
  let html = filter
    ? `<p class="cc-note">Showing ${esc(filter.type === 'context' ? CONTEXT_NAMES[filter.value] || filter.value : (view.lenses[lens].areas[filter.value] || {}).name || filter.value)} · <button type="button" class="text-btn" data-cc-clear="1">Show everything</button></p>`
    : '<p class="cc-note">Everything for this lens, ranked: hot first, then in the order <code>brain.py next</code> gives. Tap an item to open it.</p>';
  let section = null;
  html += '<div class="cc-box">';
  for (const e of rows) {
    if (e.section !== section) { section = e.section; html += `<h2 class="cc-sec">${SECTION_NAMES[section] || esc(section)}</h2>`; }
    html += row(e, true, clock);
  }
  if (!rows.length) html += '<p class="cc-empty">Nothing here.</p>';
  return html + '</div>';
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
  let html = `<p class="cc-note">${esc(a.total)} h a week across five areas, plus ${esc(a.float)} h undeclared float. ` +
    (!time ? 'Loading this week’s recorded time…' : time.error ? `This week’s time could not be read (${esc(time.error)}).`
      : recorded ? `Recorded this week, from ${esc(time.monday)}: task clocks and hours entered here or at the desk, on ${actual.days} day${actual.days === 1 ? '' : 's'}. Unrecorded time is not counted as zero; the debrief covers it.`
        : 'Nothing recorded this week yet: start a task’s clock or enter hours below.') + '</p><div class="cc-lanes">';
  const name = (ref) => (a.areas[ref] ? a.areas[ref].name : ref === 'vol' ? 'Volunteering' : `Area ${ref}`);
  for (const [ref, area] of Object.entries(a.areas)) {
    const door = areas[ref] || { count: 0, hot: false };
    const items = entries.filter((e) => e.area === ref && ['hot', 'next', 'parked'].includes(e.section)).slice(0, 4);
    const spent = actual ? actual.byArea[ref] || 0 : 0;
    const pct = Math.min(100, Math.round((spent / (Number(area.hours) * 60 || 1)) * 100));
    const over = spent > Number(area.hours) * 60;
    html += `<div class="cc-lane"><span class="cc-nm">${esc(ref)} ${esc(area.name)}<small>${recorded ? `${esc(fmtMinutes(spent))} of ` : ''}${esc(area.hours)} h a week · ${door.count} open${door.hot ? ' · something hot' : ''}</small></span>` +
      (recorded ? `<span class="cc-meter${over ? ' over' : ''}" role="img" aria-label="${esc(fmtMinutes(spent))} of ${esc(area.hours)} hours"><span style="width:${pct}%"></span></span>` : '') +
      `<span class="cc-why">${items.map((e) => `<span class="cc-chip ${e.section === 'hot' ? 'hot' : ''}">${esc(e.ref)} ${esc(e.title.slice(0, 40))}</span>`).join(' ') || '<span class="cc-chip">nothing open</span>'}</span></div>`;
  }
  const untagged = (areas.untagged || {}).count || 0;
  const floatSpent = actual ? (actual.byArea.unassigned || 0) : 0;
  html += `<div class="cc-lane float"><span class="cc-nm">Float<small>${esc(a.float)} h, undeclared · not a target${recorded && floatSpent ? ` · ${esc(fmtMinutes(floatSpent))} of work time with no area` : ''}</small></span><span class="cc-why">${untagged ? `<span class="cc-chip warn">${untagged} work item${untagged === 1 ? '' : 's'} with no area yet</span>` : ''}</span></div></div>`;
  if (recorded) {
    const other = ['vol', 'ventures', 'personal', 'brain'].map((k) => [k, k === 'vol' ? actual.byArea.vol || 0 : actual.byLens[k] || 0]);
    html += `<p class="cc-note">No budget, recorded this week: ${other.map(([k, m]) => `${k === 'vol' ? 'Volunteering' : LENS_NAMES[k]} ${esc(fmtMinutes(m))}`).join(' · ')}.</p>`;
  }
  html += '<form class="cc-hours"><span class="cc-lbl">Enter hours</span><label class="visually-hidden" for="cc-hours-where">Where</label>' +
    `<select id="cc-hours-where" name="where">${HOURS_TARGETS.map(([area, l]) => `<option value="${area}|${l}">${esc(area ? `${area === 'vol' ? '' : `${area} `}${name(area)}` : LENS_NAMES[l])}</option>`).join('')}</select>` +
    '<label class="visually-hidden" for="cc-hours-h">Hours</label><input id="cc-hours-h" name="hours" type="number" min="0.25" max="12" step="0.25" required placeholder="h" inputmode="decimal">' +
    '<input name="note" type="text" maxlength="120" placeholder="What it was (optional)" aria-label="What it was" autocomplete="off">' +
    '<button type="submit" class="mini-btn primary">Add</button><span class="write-msg" hidden></span></form>';
  return html + (lens === 'work' || lens === 'all' ? '' : '<p class="cc-note">The allocation covers Work; Ventures, Personal and Brain have no budgets.</p>');
}

export function homeHtml(view, { lens, tab = 'focus', filter = null, asOf = '', time = null, clock = null, projects = [], inboxAll = false } = {}) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  // Only the lenses this view carries, so an older view without Brain's own lens still renders.
  const shown = LENSES.filter((l) => view.lenses[l]);
  if (!view.lenses[lens]) lens = 'all';
  const seg = shown.map((l) => `<button type="button" data-cc-lens="${l}" aria-pressed="${l === lens}">${LENS_NAMES[l]}</button>`).join('');
  const tabs = TABS.map((t) => `<a href="#${t}"${t === tab ? ' aria-current="page"' : ''}>${t[0].toUpperCase()}${t.slice(1)}</a>`).join('');
  const body = tab === 'priority' ? priorityTab(view, lens, filter, clock)
    : tab === 'allocation' ? allocationTab(view, lens, time) : focusTab(view, lens, byRef, { clock, projects, inboxAll });
  return `<div class="cc"><div class="cc-head"><div class="cc-seg" role="group" aria-label="Lens">${seg}</div>` +
    `<nav class="cc-tabs" aria-label="Command centre">${tabs}</nav>` +
    '<a class="cc-files" href="#/INDEX.md">Browse files</a></div>' + body +
    `<p class="cc-note">${esc(view.gaps.join(' '))}${asOf ? ` As of ${esc(asOf)}.` : ''}</p></div>`;
}
