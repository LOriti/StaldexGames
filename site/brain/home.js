// Brain viewer — the command centre home (Brain card brain-032).
// Renders the read-only view Brain generates into views/command-centre.json: the one
// focal item, what else is hot, where Claude can help, the quiet line and the doors, with
// Priority and Allocation tabs. No imports, so the tests can load it on its own; every
// string from Brain goes through esc().

export const VIEW_PATH = 'views/command-centre.json';
export const LENSES = ['work', 'ventures', 'personal', 'all'];
export const TABS = ['focus', 'priority', 'allocation'];
const LENS_NAMES = { work: 'Work', ventures: 'Ventures', personal: 'Personal', all: 'All' };
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

export function lensEntries(view, lens) {
  return view.entries.filter((e) => lens === 'all' || e.lens === lens);
}

function chips(e) {
  const out = (e.hot || []).map((h) => `<span class="cc-chip hot">${esc(h)}</span>`);
  if (e.no_owner) out.push('<span class="cc-chip warn">no owner: yours?</span>');
  return out.join(' ');
}

function row(e, open = true) {
  const stripe = e.section === 'hot' ? 'hot' : e.claude === 'back' ? 'ok' : '';
  const body = `<span class="cc-stripe ${stripe}"></span><span class="cc-m"><span class="cc-id">${esc(e.ref)} · ${esc(e.home)}${e.area ? ` · area ${esc(e.area)}` : ''}</span>` +
    `<span class="cc-t">${esc(e.title)}</span>${chips(e) ? `<span class="cc-why">${chips(e)}</span>` : ''}</span>`;
  return open ? `<a class="cc-row" href="#/${encodeURI(sourcePath(e))}">${body}</a>` : `<div class="cc-row">${body}</div>`;
}

function focusTab(view, lens, byRef) {
  const slot = view.lenses[lens];
  const focal = slot.focal && byRef.get(slot.focal.ref);
  let html = '';
  if (focal) {
    html += `<a class="cc-focal" href="#/${encodeURI(sourcePath(focal))}"><span class="cc-k">The one thing</span>` +
      `<span class="cc-ttl">${esc(focal.title)}</span><span class="cc-why">${chips(focal)}</span>` +
      `<span class="cc-id">${esc(focal.ref)} · ${esc(focal.home)} · ${esc(slot.focal.reason)}</span></a>`;
  } else {
    const best = Object.entries(slot.contexts).filter(([, c]) => c.count).sort((a, b) => b[1].count - a[1].count)[0];
    html += '<div class="cc-focal calm"><span class="cc-k">Nothing hot</span><span class="cc-ttl">Nothing needs you right now' +
      `${lens === 'all' ? '' : ' in this lens'}.</span>${best ? `<span class="cc-why">Pick from a door: <button type="button" class="cc-door" data-cc-context="${best[0]}">${CONTEXT_NAMES[best[0]]} <span class="c">${best[1].count}</span></button></span>` : ''}</div>`;
  }
  const hot = slot.hot.map((ref) => byRef.get(ref)).filter(Boolean);
  const lane = slot.claude.map((ref) => byRef.get(ref)).filter(Boolean);
  const moreHot = Math.max(0, slot.hot_total - (focal && focal.section === 'hot' ? 1 : 0));
  html += `<div class="cc-two"><section><h2 class="cc-gh">Also hot <em>${moreHot}</em></h2><div class="cc-box">` +
    (hot.map((e) => row(e)).join('') || '<p class="cc-empty">Nothing else is hot.</p>') + '</div></section>' +
    `<section><h2 class="cc-gh">Claude can help <em>${slot.claude_total}</em></h2><div class="cc-box">` +
    (lane.map((e) => row(e)).join('') || '<p class="cc-empty">Nothing is marked for Claude yet.</p>') + '</div></section></div>';
  const q = slot.quiet;
  const parts = [];
  if (q.needs_review_date.length) parts.push(`${q.needs_review_date.length} parked without a review date (${esc(q.needs_review_date.join(', '))})`);
  if (q.no_owner.length) parts.push(`${q.no_owner.length} with no owner: delegate? (${esc(q.no_owner.join(', '))})`);
  if (q.unconfirmed.length || q.close_proposed.length) parts.push(`Clarify: ${q.unconfirmed.length} unconfirmed, ${q.close_proposed.length} close proposed`);
  if (parts.length) html += `<p class="cc-quiet">${parts.map((p) => `<span>${p}</span>`).join('')}</p>`;
  html += `<div class="cc-doors"><span class="cc-lbl">Contexts</span>${Object.entries(slot.contexts).map(([k, c]) =>
    `<button type="button" class="cc-door" data-cc-context="${esc(k)}">${CONTEXT_NAMES[k] || esc(k)} <span class="c">${c.count}</span>${c.hot ? '<span class="cc-hd" title="something hot"></span>' : ''}</button>`).join('')}</div>`;
  if (Object.keys(slot.areas).length) {
    html += `<div class="cc-doors"><span class="cc-lbl">Areas</span>${Object.entries(slot.areas).map(([k, a]) =>
      `<button type="button" class="cc-door" data-cc-area="${esc(k)}">${esc(a.name)} <span class="c">${a.hours ? `${esc(a.hours)} h · ` : ''}${a.count}</span>${a.hot ? '<span class="cc-hd"></span>' : ''}</button>`).join('')}</div>`;
  }
  return html;
}

function priorityTab(view, lens, filter) {
  const rows = lensEntries(view, lens).filter((e) => !filter
    || (filter.type === 'context' ? e.context === filter.value : (e.area || 'untagged') === filter.value));
  let html = filter
    ? `<p class="cc-note">Showing ${esc(filter.type === 'context' ? CONTEXT_NAMES[filter.value] || filter.value : (view.lenses[lens].areas[filter.value] || {}).name || filter.value)} · <button type="button" class="text-btn" data-cc-clear="1">Show everything</button></p>`
    : '<p class="cc-note">Everything for this lens, ranked: hot first, then in the order <code>brain.py next</code> gives. Tap an item to open it.</p>';
  let section = null;
  html += '<div class="cc-box">';
  for (const e of rows) {
    if (e.section !== section) { section = e.section; html += `<h2 class="cc-sec">${SECTION_NAMES[section] || esc(section)}</h2>`; }
    html += row(e);
  }
  if (!rows.length) html += '<p class="cc-empty">Nothing here.</p>';
  return html + '</div>';
}

function allocationTab(view, lens) {
  const a = view.allocation;
  if (!a) return '<p class="cc-empty">No director allocation found.</p>';
  const areas = view.lenses.work.areas;
  const entries = lensEntries(view, 'work');
  let html = `<p class="cc-note">${esc(a.total)} h a week across five areas, plus ${esc(a.float)} h undeclared float. Hours you track at the desk show on the desk command centre; this view shows what is open in each area.</p><div class="cc-lanes">`;
  for (const [ref, area] of Object.entries(a.areas)) {
    const door = areas[ref] || { count: 0, hot: false };
    const items = entries.filter((e) => e.area === ref && ['hot', 'next', 'parked'].includes(e.section)).slice(0, 4);
    html += `<div class="cc-lane"><span class="cc-nm">${esc(ref)} ${esc(area.name)}<small>${esc(area.hours)} h a week · ${door.count} open${door.hot ? ' · something hot' : ''}</small></span>` +
      `<span class="cc-why">${items.map((e) => `<span class="cc-chip ${e.section === 'hot' ? 'hot' : ''}">${esc(e.ref)} ${esc(e.title.slice(0, 40))}</span>`).join(' ') || '<span class="cc-chip">nothing open</span>'}</span></div>`;
  }
  const untagged = (areas.untagged || {}).count || 0;
  html += `<div class="cc-lane float"><span class="cc-nm">Float<small>${esc(a.float)} h, undeclared · not a target</small></span><span class="cc-why">${untagged ? `<span class="cc-chip warn">${untagged} work item${untagged === 1 ? '' : 's'} with no area yet</span>` : ''}</span></div></div>`;
  return html + (lens === 'work' || lens === 'all' ? '' : '<p class="cc-note">The allocation covers Work; Ventures and Personal have no budgets.</p>');
}

export function homeHtml(view, { lens, tab = 'focus', filter = null, asOf = '' } = {}) {
  const byRef = new Map(view.entries.map((e) => [e.ref, e]));
  const seg = LENSES.map((l) => `<button type="button" data-cc-lens="${l}" aria-pressed="${l === lens}">${LENS_NAMES[l]}</button>`).join('');
  const tabs = TABS.map((t) => `<a href="#${t}"${t === tab ? ' aria-current="page"' : ''}>${t[0].toUpperCase()}${t.slice(1)}</a>`).join('');
  const body = tab === 'priority' ? priorityTab(view, lens, filter) : tab === 'allocation' ? allocationTab(view, lens) : focusTab(view, lens, byRef);
  return `<div class="cc"><div class="cc-head"><div class="cc-seg" role="group" aria-label="Lens">${seg}</div>` +
    `<nav class="cc-tabs" aria-label="Command centre">${tabs}</nav>` +
    '<a class="cc-files" href="#/INDEX.md">Browse files</a></div>' + body +
    `<p class="cc-note">${esc(view.gaps.join(' '))}${asOf ? ` As of ${esc(asOf)}.` : ''}</p></div>`;
}
