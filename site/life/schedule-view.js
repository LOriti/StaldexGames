import {
  EVENT_TYPES, todayISO, addDays, niceDate, parseDate, scheduleDays,
  coordinationReasons, possibleClashes, dayDelta, esc
} from './core.js';

function dayFormat(date, parts) {
  return new Intl.DateTimeFormat('en-AU', parts).format(parseDate(date));
}
function humanDay(date, today) {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return dayFormat(date, { weekday: 'long' });
}
function dateLabel(date) { return dayFormat(date, { day: 'numeric', month: 'short' }); }
function dateLong(date) { return niceDate(date, {day:'numeric',month:'long',year:'numeric'}); }
function kindOf(id) { return EVENT_TYPES.find(t => t.id === id) || EVENT_TYPES[EVENT_TYPES.length-1]; }
function activeEvent(e) { return e.confirmation !== 'cancelled'; }
function eventTime(e) {
  if (e.continuation) return 'Continues';
  if (e.timing === 'all-day') return 'All day';
  if (e.timing !== 'timed' || !e.start) return 'Time TBC';
  return e.start + (e.end ? '–' + e.end : '');
}
function fmtStatus(e) {
  if (e.confirmation === 'cancelled') return '<span class="plan-pill cancelled">Cancelled</span>';
  if (e.confirmation === 'tentative') return '<span class="plan-pill tentative">Tentative</span>';
  return '';
}
function detail(symbol, label, content) {
  return content ? '<div class="plan-detail"><span class="plan-detail-icon">' + symbol + '</span><span class="plan-detail-name">' + esc(label) + '</span><span class="plan-detail-value">' + esc(content) + '</span></div>' : '';
}
function eventCard(event) {
  const kind = kindOf(event.type);
  const reasons = coordinationReasons(event);
  return '<article class="plan-event' + (activeEvent(event) ? '' : ' is-cancelled') + '" style="--kind:' + kind.colour + '">'
    + '<div class="plan-event-top"><span class="plan-event-time">' + esc(eventTime(event))
    + '</span><span class="plan-event-kind">' + kind.icon + ' ' + esc(kind.label) + '</span></div>'
    + '<button type="button" class="plan-event-title" data-action="edit-event" data-id="' + esc(event.id) + '">' + esc(event.title) + '</button>'
    + '<div class="plan-pills">' + fmtStatus(event)
    + (event.repeat !== 'none' ? '<span class="plan-pill repeat">↻ ' + esc(event.repeat) + '</span>' : '')
    + (event.endDate > event.date ? '<span class="plan-pill duration">◷ Multi-day</span>' : '')
    + (reasons.length && !event.continuation ? '<span class="plan-pill logistics-warning">! ' + esc(reasons.join(' · ')) + '</span>' : '')
    + '</div>'
    + '<div class="plan-event-details">'
    + detail('◎','With',event.people || event.owner)
    + detail('⌖','Where',event.location)
    + detail('↗','Travel',event.transport)
    + detail('♡','Care / handover',event.care)
    + (event.notes ? '<div class="plan-event-note">' + esc(event.notes) + '</div>' : '')
    + '</div>'
    + '<div class="plan-event-bottom">'
    + '<button type="button" data-action="edit-event" data-id="' + esc(event.id) + '">Edit ' + (event.repeat !== 'none' ? 'series' : 'plan') + ' ↗</button>'
    + (event.repeat !== 'none' && activeEvent(event)
      ? '<button type="button" data-action="skip-event" data-id="' + esc(event.id) + '" data-date="' + esc(event.seriesDate) + '">Skip this occurrence</button>' : '')
    + '</div></article>';
}
function taskSnippet(task) {
  return '<div class="plan-task">'
    + '<button type="button" class="task-check" data-action="check-task" data-id="' + esc(task.id) + '" aria-label="Complete ' + esc(task.title) + '"></button>'
    + '<div><button class="plan-task-title" type="button" data-action="edit-task" data-id="' + esc(task.id) + '">' + esc(task.title) + '</button>'
    + (task.owner ? '<small>' + esc(task.owner) + '</small>' : '')
    + '</div></div>';
}
function recordSnippet(record) {
  return '<button type="button" class="plan-reference" data-action="edit-record" data-id="' + esc(record.id) + '">'
    + '<span>◈</span><span>' + esc(record.title) + '</span></button>';
}
function dayCard(day, today) {
  const dayId = 'day-' + day.date;
  const scheduled = day.events.filter(activeEvent);
  const coordination = scheduled.filter(e => coordinationReasons(e).length).length;
  const clashes = possibleClashes(day);
  const isToday = day.date === today;
  const summary = [
    scheduled.length + ' planned',
    day.tasks.length ? day.tasks.length + ' due' : '',
    day.records.length ? day.records.length + ' dates' : ''
  ].filter(Boolean).join(' · ');
  return '<section class="plan-day-card' + (isToday ? ' is-today' : '') + '" id="' + dayId + '">'
    + '<div class="plan-day-head"><div>'
    + '<p class="plan-day-eyebrow">' + (isToday ? '● TODAY' : esc(dayFormat(day.date,{weekday:'long'}).toUpperCase()))
    + '</p><h3>' + esc(dateLabel(day.date)) + '</h3><span class="plan-day-summary">' + esc(summary) + '</span></div>'
    + '<button type="button" class="plan-add-small" data-action="new-event-date" data-date="' + esc(day.date) + '" aria-label="Add activity on ' + esc(dateLong(day.date)) + '" title="Add activity">＋</button>'
    + '</div>'
    + (coordination || clashes.length ? '<div class="plan-day-flags">' + (coordination ? '<span>! ' + coordination + ' to coordinate</span>' : '')
      + (clashes.length ? '<span>⚠ Possible overlap</span>' : '') + '</div>' : '')
    + (day.events.length ? '<div class="plan-day-events">' + day.events.map(eventCard).join('') + '</div>'
      : '<div class="plan-day-empty"><span>Nothing planned yet</span><button type="button" data-action="new-event-date" data-date="' + esc(day.date) + '">＋ Plan something</button></div>')
    + (day.records.length ? '<div class="plan-day-section"><p class="plan-day-section-label">Important dates</p>' + day.records.map(recordSnippet).join('') + '</div>' : '')
    + (day.tasks.length ? '<div class="plan-day-section"><p class="plan-day-section-label">Actions due</p>' + day.tasks.map(taskSnippet).join('') + '</div>' : '')
    + '</section>';
}
function dayRail(day, today) {
  const pending = day.events.filter(e => activeEvent(e) && coordinationReasons(e).length).length;
  const scheduled = day.events.filter(activeEvent);
  const isToday = day.date === today;
  return '<button type="button" class="plan-day-tab' + (isToday ? ' is-today' : '') + '" data-action="jump-day" data-date="' + esc(day.date) + '" aria-label="Jump to ' + esc(dateLong(day.date)) + '">'
    + '<small>' + esc(dayFormat(day.date,{weekday:'short'}).toUpperCase()) + '</small>'
    + '<strong>' + esc(dayFormat(day.date,{day:'numeric'})) + '</strong>'
    + '<span class="plan-day-tab-count">' + scheduled.length + ' plan' + (scheduled.length===1?'':'s') + '</span>'
    + (pending ? '<i class="plan-day-tab-alert" aria-hidden="true"></i>' : '')
    + '</button>';
}
function watchList(days) {
  const flagged = [], clashes = [], seen = new Set();
  for (const day of days) {
    for (const e of day.events) {
      const reasons = coordinationReasons(e);
      if (!reasons.length) continue;
      const key = e.id + ':' + e.seriesDate;
      if (seen.has(key)) continue;
      seen.add(key);
      flagged.push({date:day.date,id:e.id,title:e.title,reasons:reasons.join(' · ')});
    }
    for (const clash of possibleClashes(day)) clashes.push({date:day.date, ...clash});
  }
  return { flagged, clashes };
}
function watchCard(watch) {
  const all = watch.flagged.length + watch.clashes.length;
  return '<section class="plan-watch"><div class="plan-watch-heading"><div><p class="eyebrow">COORDINATION</p>'
    + '<h2>Still to sort <span>' + all + '</span></h2></div></div>'
    + (all ? '<div class="plan-watch-list">'
      + watch.flagged.map(x => '<button type="button" class="plan-watch-row" data-action="edit-event" data-id="' + esc(x.id) + '"><small>' + esc(dateLabel(x.date)) + '</small><strong>' + esc(x.title) + '</strong><span>' + esc(x.reasons) + '</span></button>').join('')
      + watch.clashes.map(x => '<button type="button" class="plan-watch-row conflict" data-action="jump-day" data-date="' + esc(x.date) + '"><small>' + esc(dateLabel(x.date)) + ' · Possible clash</small><strong>' + esc(x.first.title + ' / ' + x.second.title) + '</strong><span>Overlapping time for ' + esc(x.common.join(', ')) + '</span></button>').join('')
      + '</div>' : '<p class="plan-watch-clear">No outstanding coordination flagged for these days. Plans marked tentative, time TBC or “needs organising” will appear here.</p>')
    + '</section>';
}
function careCard(days) {
  const seen = new Set(), care = [];
  for (const day of days) for (const e of day.events) {
    const key=e.id+':'+e.seriesDate;
    if (e.type!=='care' || !activeEvent(e) || seen.has(key)) continue;
    seen.add(key); care.push({day:day.date,event:e});
  }
  return '<section class="plan-watch care-panel"><div class="plan-watch-heading"><p class="eyebrow">CARE & HANDOVERS</p><h2>Who is covering what</h2></div>'
    + (care.length
      ? '<div class="plan-care-list">' + care.map(({day,event:e}) => '<button type="button" class="plan-care-row" data-action="edit-event" data-id="' + esc(e.id) + '"><span class="plan-care-date">' + esc(dateLabel(day)) + '</span><span><strong>' + esc(e.title) + '</strong><small>' + esc(e.care || e.people || e.owner || 'Coverage details to add') + '</small></span></button>').join('') + '</div>'
      : '<p class="plan-watch-clear">Add carers, childcare shifts and pick-ups as “Care & handovers” activities. They’ll appear here alongside the rest of the week.</p>')
    + '</section>';
}

export function renderNextDays(state, settings = {}) {
  const today = todayISO(), count = settings.span === 14 ? 14 : 7;
  const offset = Number.isInteger(settings.offset) ? settings.offset : 0;
  const start = addDays(today, offset * 7);
  const end = addDays(start, count - 1);
  const days = scheduleDays(state, start, count);
  const scheduled = days.flatMap(d => d.events.filter(activeEvent));
  const unique = new Set(scheduled.map(e => e.id + ':' + e.seriesDate));
  const care = new Set(scheduled.filter(e => e.type === 'care').map(e => e.id + ':' + e.seriesDate));
  const due = days.reduce((n,d)=>n+d.tasks.length,0);
  const watch = watchList(days);
  const future = start > today ? 'Looking ahead' : end < today ? 'Earlier days' : 'From today';
  const subtitle = dateLong(start) + ' — ' + dateLong(end);
  return '<div class="plan-page">'
    + '<div class="page-heading"><div><p class="kicker">YOUR DAYS / LOGISTICS & ACTIVITIES</p><h1>Next few days<span class="plan-title-dot">.</span></h1>'
    + '<p class="lead">What’s on, who’s involved, how everyone gets there, and what still needs to be organised.</p></div>'
    + '<button type="button" class="primary-button" data-action="new-event">＋ Plan activity</button></div>'
    + '<div class="plan-controls"><div class="plan-range"><span class="plan-range-kicker">' + esc(future) + '</span><strong>' + esc(subtitle) + '</strong></div>'
    + '<div class="plan-controls-buttons">'
    + '<button type="button" class="secondary-button" data-action="schedule-prev" title="Previous week">←</button>'
    + '<button type="button" class="secondary-button" data-action="schedule-today"' + (offset===0?' disabled':'') + '>Today</button>'
    + '<button type="button" class="secondary-button" data-action="schedule-next" title="Next week">→</button>'
    + '<button type="button" class="secondary-button" data-action="copy-schedule" title="Copy a plain-text summary to share">Copy</button>'
    + '<button type="button" class="secondary-button" data-action="print-schedule" title="Print or save a PDF">Print</button>'
    + '<label class="sr-only" for="schedule-span">Days shown</label><select id="schedule-span" aria-label="Days shown">'
    + '<option value="7"' + (count===7?' selected':'') + '>7 days</option>'
    + '<option value="14"' + (count===14?' selected':'') + '>14 days</option>'
    + '</select></div></div>'
    + '<div class="plan-pulse">'
    + '<div class="plan-pulse-main"><p class="eyebrow">COMING UP</p><strong>' + unique.size + '</strong><span>activities across ' + count + ' days</span></div>'
    + '<div class="plan-pulse-metric"><strong>' + care.size + '</strong><span>care arrangements</span></div>'
    + '<div class="plan-pulse-metric' + (watch.flagged.length || watch.clashes.length ? ' needs-attention' : '') + '"><strong>' + (watch.flagged.length + watch.clashes.length) + '</strong><span>to coordinate</span></div>'
    + '<div class="plan-pulse-metric"><strong>' + due + '</strong><span>actions due</span></div></div>'
    + '<div class="plan-layout"><div class="plan-layout-main">'
    + '<div class="plan-rail" aria-label="Jump to a day">' + days.map(d => dayRail(d,today)).join('') + '</div>'
    + '<div class="plan-days-grid">' + days.map(d => dayCard(d,today)).join('') + '</div>'
    + '</div><aside class="plan-aside">' + watchCard(watch) + careCard(days)
    + '<div class="plan-aside-tip"><strong>Activity ≠ task</strong><p>Put appointments, school runs, work days, dinners and trips here. Keep actions like “book a table” or “pay the bill” in the Actions list. They will appear on the relevant day when due.</p></div>'
    + '</aside></div></div>';
}
export function renderNextDaysPreview(state) {
  const today=todayISO(), days=scheduleDays(state,today,3);
  const n=days.flatMap(d=>d.events).filter(activeEvent).length;
  return '<section class="plan-preview"><div class="section-header"><h2>Next 72 hours</h2>'
    + '<button type="button" class="link-button" data-action="goto" data-view="schedule">Open day-by-day planner →</button></div>'
    + '<p class="plan-preview-intro">Your commitments and logistics at a glance, not just the to-do list.</p>'
    + '<div class="plan-preview-grid">' + days.map(d => {
      const events=d.events.filter(activeEvent);
      const due=d.tasks.length;
      const flagged=events.filter(e=>coordinationReasons(e).length).length;
      return '<button type="button" class="plan-preview-day" data-action="goto-day" data-date="' + esc(d.date) + '">'
        + '<span class="plan-preview-label">' + esc(humanDay(d.date,today)) + ' · ' + esc(dateLabel(d.date)) + '</span>'
        + '<strong>' + (events.length ? events.slice(0,3).map(e=>esc(eventTime(e)+' '+e.title)).join('<span class="plan-preview-divider"> · </span>') : 'Nothing planned yet') + '</strong>'
        + '<small>' + (due ? due + ' action' + (due===1?'':'s') + ' due' : 'No actions due')
        + (flagged ? ' · <em>' + flagged + ' to coordinate</em>' : '') + '</small></button>';
    }).join('') + '</div>'
    + (!n ? '<p class="plan-preview-hint">Start by adding the regular pattern — work days, carers, school runs, family commitments and travel.</p>' : '')
    + '</section>';
}


// Creates a shareable agenda without transmitting any data; callers decide
// whether to copy or print. Do not include cancelled items in shared summaries.
export function schedulePlainText(state, from = todayISO(), count = 7) {
  const days = scheduleDays(state, from, count);
  const lines = ['LIFE ADMIN · ' + dateLong(from) + ' – ' + dateLong(addDays(from, count - 1))];
  for (const day of days) {
    lines.push('', humanDay(day.date, todayISO()) + ', ' + dateLong(day.date));
    const events = day.events.filter(activeEvent);
    if (!events.length && !day.tasks.length && !day.records.length) lines.push('  No plans recorded');
    for (const e of events) {
      const kind = kindOf(e.type).label;
      lines.push('  ' + eventTime(e) + ' · ' + e.title + ' [' + kind + ']'
        + (e.confirmation === 'tentative' ? ' (tentative)' : ''));
      if (e.people || e.owner) lines.push('    Who: ' + (e.people || e.owner));
      if (e.location) lines.push('    Where: ' + e.location);
      if (e.transport) lines.push('    Transport: ' + e.transport);
      if (e.care) lines.push('    Care: ' + e.care);
      const reasons = coordinationReasons(e);
      if (reasons.length) lines.push('    To coordinate: ' + reasons.join(', '));
    }
    for (const record of day.records) lines.push('  Important date: ' + record.title);
    for (const task of day.tasks) lines.push('  Action due: ' + task.title + (task.owner ? ' (' + task.owner + ')' : ''));
  }
  return lines.join('\n');
}
