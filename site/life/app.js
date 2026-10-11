import {
  STORAGE_KEY, AREAS, STATUS, REPEATS, EVENT_TYPES, EVENT_CONFIRMATIONS,
  EVENT_TIMINGS, LOGISTICS, initialState, normaliseState, areaFor,
  todayISO, addDays, nextRecurrence, dayDelta, dueText, niceDate, uid, parseDate,
  esc, safeLink, openTask, orderedTasks, metrics, projectProgress
} from './core.js';
import { renderNextDays, renderNextDaysPreview } from './schedule-view.js';

const $ = id => document.getElementById(id);
const viewEl = $('view');
let state;
let storageAvailable = true;
let activeView = 'schedule';
let scheduleOffset = 0;  // weeks from today's rolling horizon
let scheduleSpan = 7;     // 7 or 14 days
let editContext = null;
let filter = { search: '', status: 'open', area: 'all', owner: 'all', project: 'all' };
let toastTimeout;
let memoryState = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normaliseState(JSON.parse(raw)) : initialState();
  } catch (error) {
    // A disabled storage backend and a bad backup are handled separately below.
    try { localStorage.setItem('__life_test__', '1'); localStorage.removeItem('__life_test__'); }
    catch (_) { storageAvailable = false; }
    console.warn('Life Admin could not load local data:', error);
    return initialState();
  }
}
function checkStorage() {
  try {
    const key = '__life_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
  } catch (_) { storageAvailable = false; }
  $('storage-warning').hidden = storageAvailable;
  $('storage-dot').classList.toggle('bad', !storageAvailable);
  $('storage-label').textContent = storageAvailable ? 'Saved in this browser' : 'Not saved — storage blocked';
}
function persist() {
  state.updatedAt = new Date().toISOString();
  memoryState = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch (_) { storageAvailable = false; }
  checkStorage();
}
function showToast(message) {
  clearTimeout(toastTimeout);
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  toastTimeout = setTimeout(() => { el.hidden = true; }, 3700);
}
function heading(kicker, title, lead, action = '') {
  return '<div class="page-heading"><div><p class="kicker">' + esc(kicker)
    + '</p><h1>' + esc(title) + '</h1><p class="lead">' + esc(lead)
    + '</p></div>' + action + '</div>';
}
function sectionHeader(title, right = '') {
  return '<div class="section-header"><h2>' + esc(title) + '</h2>' + right + '</div>';
}
function empty(title, detail, button = '') {
  return '<div class="empty-state"><h3>' + esc(title) + '</h3><p>' + esc(detail)
    + '</p>' + button + '</div>';
}
function btn(action, text, cls = 'secondary-button', extra = '') {
  return '<button type="button" class="' + cls + '" data-action="' + action + '" ' + extra + '>' + esc(text) + '</button>';
}
function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}
function ownersWith(value) {
  return [...new Set([...state.settings.owners, ...(value ? [value] : [])])];
}
function areaOptions(selected) {
  return AREAS.map(a => opt(a.id, a.label, selected)).join('');
}
function ownerOptions(selected, allowAll = false) {
  return (allowAll ? opt('all', 'Any owner', selected) : opt('', 'Unassigned', selected))
    + ownersWith(selected === 'all' ? '' : selected).map(n => opt(n, n, selected)).join('');
}
function projectOptions(selected) {
  return opt('', 'No outcome / project', selected)
    + state.projects.map(p => opt(p.id, p.title, selected)).join('');
}
function projectName(id) { return state.projects.find(p => p.id === id)?.title || ''; }

function taskRow(task) {
  const area = areaFor(task.area);
  const done = task.status === 'done';
  const meta = [];
  if (area) meta.push('<span class="meta-piece"><span class="area-icon" style="color:' + area.colour + '">' + area.icon + '</span>' + esc(area.label) + '</span>');
  if (task.owner) meta.push('<span class="meta-piece">↳ ' + esc(task.owner) + '</span>');
  if (task.due) meta.push('<span class="chip ' + (dayDelta(task.due) < 0 && !done ? 'overdue' : dayDelta(task.due) === 0 && !done ? 'today' : '') + '">' + esc(dueText(task.due)) + '</span>');
  if (task.status === 'waiting') meta.push('<span class="chip waiting">Waiting</span>');
  if (task.status === 'doing') meta.push('<span class="chip">In progress</span>');
  if (task.priority === 'high' && !done) meta.push('<span class="chip high">Priority</span>');
  if (task.repeat !== 'none') meta.push('<span class="meta-piece">↻ ' + esc(REPEATS.find(r => r.id === task.repeat)?.label || task.repeat) + '</span>');
  if (task.projectId && projectName(task.projectId)) meta.push('<span class="meta-piece">▦ ' + esc(projectName(task.projectId)) + '</span>');
  return '<article class="task-row' + (done ? ' completed' : '') + '">'
    + '<button type="button" class="task-check' + (done ? ' done' : '') + '" data-action="check-task" data-id="' + esc(task.id) + '" aria-label="' + (done ? 'Mark not done' : 'Complete action') + '" title="' + (task.repeat !== 'none' ? 'Complete this occurrence' : 'Mark complete') + '">' + (done ? '✓' : '') + '</button>'
    + '<div class="task-body"><h3 class="task-title">' + esc(task.title) + '</h3><div class="task-meta">' + meta.join('') + '</div></div>'
    + '<div class="task-tools">'
    + '<button type="button" class="mini-tool' + (task.focus ? ' pinned' : '') + '" data-action="focus-task" data-id="' + esc(task.id) + '" aria-label="' + (task.focus ? 'Remove from top three' : 'Add to top three') + '" title="Top three focus">' + (task.focus ? '★' : '☆') + '</button>'
    + '<button type="button" class="mini-tool" data-action="edit-task" data-id="' + esc(task.id) + '" aria-label="Edit action" title="Edit">✎</button>'
    + '</div></article>';
}
function renderTaskRows(tasks, label = 'Nothing needs action here.') {
  if (!tasks.length) return '<div class="empty-state compact"><h3>All clear.</h3><p>' + esc(label) + '</p></div>';
  return tasks.map(taskRow).join('');
}
function upcomingList() {
  const today = todayISO(), max = addDays(today, 30);
  const tasks = state.tasks.filter(t => openTask(t) && t.due && t.due >= today && t.due <= max)
    .map(t => ({ date: t.due, title: t.title, meta: 'Action · ' + (t.owner || areaFor(t.area)?.label || '') }));
  const records = state.records.filter(r => r.date && r.date >= today && r.date <= max)
    .map(r => ({ date: r.date, title: r.title, meta: 'Reference date · ' + (r.owner || areaFor(r.area)?.label || '') }));
  const entries = [...tasks, ...records].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  if (!entries.length) return '<div class="empty-state compact"><h3>Nothing on the horizon.</h3><p>Due dates and reference reminders will appear here.</p></div>';
  return entries.map(e => {
    const date = new Date(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8)), 12);
    const month = new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(date);
    return '<div class="upcoming-item"><div class="date-box"><strong>' + date.getDate() + '</strong><small>' + esc(month) + '</small></div>'
      + '<div><h3>' + esc(e.title) + '</h3><p>' + esc(e.meta) + '</p></div></div>';
  }).join('');
}
function renderAreas() {
  return AREAS.map(a => {
    const n = state.tasks.filter(t => openTask(t) && t.area === a.id).length;
    return '<button type="button" class="area-card" data-action="area" data-id="' + esc(a.id) + '" style="--area:' + a.colour + '">'
      + '<span class="area-symbol">' + a.icon + '</span>'
      + '<span class="area-label">' + esc(a.label) + '</span><span class="area-count">' + n + ' open</span></button>';
  }).join('');
}
function projectCard(project) {
  const area = areaFor(project.area), progress = projectProgress(state, project.id);
  const status = project.status === 'active' ? 'Active' : project.status === 'paused' ? 'Paused' : 'Complete';
  return '<article class="project-card"><div class="card-kicker"><span>' + esc(area?.label || 'Outcome') + '</span><span>' + esc(status) + '</span></div>'
    + '<h3>' + esc(project.title) + '</h3><p>' + esc(project.notes || 'Define the next few actions and this outcome will begin to move.') + '</p>'
    + '<div class="project-progress"><div class="progress-label"><span>' + progress.done + ' of ' + progress.total + ' actions complete</span><span>' + progress.pct + '%</span></div>'
    + '<div class="progress-track"><div class="progress-fill" style="width:' + progress.pct + '%"></div></div></div>'
    + '<div class="card-actions">'
    + '<button type="button" data-action="view-project" data-id="' + esc(project.id) + '">View actions →</button>'
    + '<button type="button" data-action="new-project-task" data-id="' + esc(project.id) + '">＋ Add action</button>'
    + '<button type="button" data-action="edit-project" data-id="' + esc(project.id) + '">Edit</button>'
    + '</div></article>';
}
function renderOverview() {
  const today = todayISO(), m = metrics(state);
  const focus = orderedTasks(state.tasks.filter(t => openTask(t) && t.focus)).slice(0, 3);
  const queue = orderedTasks(state.tasks.filter(t => openTask(t) && !t.focus && (t.status !== 'waiting')))
    .slice(0, Math.max(3, 6 - focus.length));
  const activeProjects = state.projects.filter(p => p.status === 'active').slice(0, 3);
  const greeting = m.overdue ? 'Get the important things back in sight.' : m.open ? 'Know what matters. Then get on with living.' : 'A clear desk for everything that matters.';
  viewEl.innerHTML = [
    heading('THE BIGGER PICTURE', 'Life, in order.', 'Family, home, money, people and the thousand little things. One calm place to keep track.'),
    renderNextDaysPreview(state),
    '<section class="hero"><div><p class="eyebrow">YOUR PERSONAL OPERATING SYSTEM</p><h2>' + esc(greeting) + '</h2>'
      + '<p>Choose three things that really matter this week. Keep the rest of life visible without carrying it all in your head.</p></div>'
      + '<div class="hero-aside"><span class="hero-big">' + m.open + '</span><span class="hero-meta">open actions across life</span></div></section>',
    '<div class="metric-grid">',
    '<button type="button" class="metric alert" data-action="goto" data-view="tasks" data-status="overdue"><div><div class="metric-label">Overdue</div><div class="metric-number">' + m.overdue + '</div></div><span class="metric-icon">↗</span></button>',
    '<button type="button" class="metric accent" data-action="goto" data-view="tasks" data-status="today"><div><div class="metric-label">Due today</div><div class="metric-number">' + m.today + '</div></div><span class="metric-icon">◷</span></button>',
    '<button type="button" class="metric" data-action="goto" data-view="tasks" data-status="soon"><div><div class="metric-label">Next 7 days</div><div class="metric-number">' + m.soon + '</div></div><span class="metric-icon">↗</span></button>',
    '<button type="button" class="metric" data-action="goto" data-view="tasks" data-status="waiting"><div><div class="metric-label">Waiting on others</div><div class="metric-number">' + m.waiting + '</div></div><span class="metric-icon">◎</span></button>',
    '</div>',
    '<div class="panel-grid"><section class="panel"><div class="panel-head"><h2>Your top three</h2><small>' + focus.length + ' / 3 selected</small></div><div class="panel-inner">',
    focus.length ? renderTaskRows(focus) : empty('Set a direction for the week', 'Star up to three actions anywhere in the workspace. They stay at the top until you complete or unstar them.', btn('goto','Browse actions','secondary-button','data-view="tasks"')),
    '<div class="panel-head" style="padding:20px 0 0"><h2>Next actions</h2><button type="button" class="link-button" data-action="goto" data-view="tasks">See all →</button></div>',
    renderTaskRows(queue, 'Use quick capture below to add the first thing on your mind.'),
    '<form class="quick-capture" id="quick-form"><label class="sr-only" for="quick-title">Quickly capture an action</label><input id="quick-title" name="title" maxlength="160" placeholder="Quick capture: something to remember…" autocomplete="off" required><button class="primary-button" type="submit">Add ↗</button></form>',
    '</div></section>',
    '<section class="panel"><div class="panel-head"><h2>Coming up</h2><small>Next 30 days</small></div><div class="panel-inner">' + upcomingList() + '</div></section></div>',
    sectionHeader('All the moving parts', '<span class="sub">Select an area to see its actions</span>'),
    '<div class="area-grid">' + renderAreas() + '</div>',
    sectionHeader('Outcomes in motion', '<button type="button" class="link-button" data-action="goto" data-view="projects">See outcomes →</button>'),
    activeProjects.length ? '<div class="project-grid">' + activeProjects.map(projectCard).join('') + '</div>'
      : empty('Bigger than a to-do', 'Add an outcome to group several actions under a shared goal — like a move, a holiday, or an important life change.', btn('new-project','＋ Create outcome')),
    '<div class="inline-legend" style="margin-top:21px">Tip: use Actions for things to do, Outcomes for what you are trying to achieve, and Reference for things you need to remember.</div>',
    '<div class="tool-link"><div><strong>A useful piece already on Staldex</strong><p>Meal planning and the grocery list have their own dedicated space.</p></div><a href="https://staldex.com/lrmp/">Open meal planner ↗</a></div>'
  ].join('');
}
function getFilteredTasks() {
  const today = todayISO();
  return orderedTasks(state.tasks.filter(t => {
    const q = filter.search.trim().toLowerCase();
    if (q && ![t.title, t.notes, t.owner, projectName(t.projectId), areaFor(t.area)?.label || ''].some(s => s.toLowerCase().includes(q))) return false;
    if (filter.area !== 'all' && t.area !== filter.area) return false;
    if (filter.owner !== 'all' && t.owner !== filter.owner) return false;
    if (filter.project !== 'all' && t.projectId !== filter.project) return false;
    if (filter.status === 'open' && !openTask(t)) return false;
    if (filter.status === 'overdue' && (!openTask(t) || !t.due || t.due >= today)) return false;
    if (filter.status === 'today' && (!openTask(t) || t.due !== today)) return false;
    if (filter.status === 'soon' && (!openTask(t) || !t.due || t.due < today || t.due > addDays(today, 7))) return false;
    if (filter.status === 'inbox' && (!openTask(t) || t.due || t.projectId)) return false;
    if (!['all', 'open', 'overdue', 'today', 'soon', 'inbox'].includes(filter.status) && t.status !== filter.status) return false;
    return true;
  }));
}
function renderTaskListOnly() {
  const results = $('task-results');
  if (!results) return;
  const tasks = getFilteredTasks();
  results.innerHTML = renderTaskRows(tasks, 'Try changing your filters or capture a new action.');
  const count = $('task-result-count');
  if (count) count.textContent = tasks.length + ' shown';
}
function renderTasks() {
  viewEl.innerHTML = [
    heading('EVERY NEXT STEP', 'Actions', 'Capture it, assign it, date it, and move it forward. Recurring actions roll to their next date when ticked off.',
      btn('new-task','＋ Add action','primary-button')),
    '<div class="toolbar">',
    '<label class="sr-only" for="task-search">Search actions</label><input type="search" id="task-search" value="' + esc(filter.search) + '" placeholder="Search all actions…" autocomplete="off">',
    '<label class="sr-only" for="task-status">Action status</label><select id="task-status">',
    [['open','Open actions'],['all','All statuses'],['overdue','Overdue'],['today','Due today'],['soon','Next 7 days'],['inbox','Unscheduled inbox'],...STATUS.map(s=>[s.id,s.label])]
      .map(([v,l])=>opt(v,l,filter.status)).join(''),
    '</select><label class="sr-only" for="task-area">Life area</label><select id="task-area">' + opt('all','Every area',filter.area) + AREAS.map(a=>opt(a.id,a.label,filter.area)).join('') + '</select>',
    '<label class="sr-only" for="task-owner">Assigned owner</label><select id="task-owner">' + ownerOptions(filter.owner,true) + '</select>',
    '<span class="filter-count" id="task-result-count"></span>',
    filter.project !== 'all' ? '<button type="button" class="secondary-button" data-action="clear-project">× ' + esc(projectName(filter.project) || 'Outcome filter') + '</button>' : '',
    '</div><section class="list-surface task-list" id="task-results"></section>',
    '<p class="inline-legend" style="margin-top:15px">☆ stars an action as one of your three priorities. ↻ repeats automatically after completion.</p>'
  ].join('');
  renderTaskListOnly();
}
function renderProjects() {
  const active = [...state.projects].sort((a,b) => ({active:0,paused:1,done:2}[a.status] - {active:0,paused:1,done:2}[b.status]));
  viewEl.innerHTML = [
    heading('THE LONGER GAME','Outcomes','Projects, milestones and changes that take more than a single action.',
      btn('new-project','＋ New outcome','primary-button')),
    active.length ? '<div class="project-grid">' + active.map(projectCard).join('') + '</div>'
      : empty('Start with the finish line','Create an outcome, then break it into practical actions. The progress bar fills as you tick those actions off.', btn('new-project','＋ Create first outcome')),
    '<p class="inline-legend" style="margin-top:18px">Deleting an outcome keeps its actions — they become independent tasks.</p>'
  ].join('');
}
function recordCard(record) {
  const area = areaFor(record.area);
  const link = safeLink(record.link);
  return '<article class="record-card"><div class="card-kicker"><span>' + esc(area?.label || 'Reference') + '</span><span>' + esc(record.owner || '') + '</span></div>'
    + '<h3>' + esc(record.title) + '</h3><p>' + esc(record.details || 'No notes yet.') + '</p>'
    + (record.date ? '<span class="record-date ' + (dayDelta(record.date) < 0 ? 'overdue' : '') + '">◷ ' + esc(niceDate(record.date, { day: 'numeric', month: 'short', year: 'numeric' })) + '</span>' : '')
    + (link ? '<div><a class="record-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open related link ↗</a></div>' : '')
    + '<div class="card-actions">'
    + '<button type="button" data-action="edit-record" data-id="' + esc(record.id) + '">Edit reference</button>'
    + '<button type="button" data-action="remove-record" data-id="' + esc(record.id) + '">Delete</button>'
    + '</div></article>';
}
function renderRecords() {
  const records = [...state.records].sort((a,b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31'));
  viewEl.innerHTML = [
    heading('KEEP THE IMPORTANT STUFF FINDABLE','Reference','Key dates, renewals, useful links and the details you are always searching for.',
      btn('new-record','＋ Add reference','primary-button')),
    '<p class="inline-legend">Not a password vault. Keep account numbers, credentials, identity documents and sensitive health details in a secured system.</p>',
    records.length ? '<div class="record-grid">' + records.map(recordCard).join('') + '</div>'
      : empty('The memory bank','Add a reference such as an insurance renewal, a vehicle service date, or a link to a family document.', btn('new-record','＋ Add first reference'))
  ].join('');
}
function renderReview() {
  const m = metrics(state);
  const focus = orderedTasks(state.tasks.filter(t => openTask(t) && t.focus));
  const overdue = orderedTasks(state.tasks.filter(t => openTask(t) && t.due && t.due < todayISO())).slice(0, 5);
  const inbox = orderedTasks(state.tasks.filter(t => openTask(t) && !t.due && !t.projectId)).slice(0, 5);
  viewEl.innerHTML = [
    heading('A BIT OF SPACE TO THINK','Weekly reset','A practical fifteen-minute review to stop important things disappearing behind urgent things.'),
    '<div class="review-grid"><section class="review-panel"><p class="eyebrow">CHECK IN</p><h2>Five useful questions</h2>',
    '<div class="prompt"><span>01</span><div>What three actions would make this a good week?<br><em>Star them in Actions and see them on the dashboard.</em></div></div>',
    '<div class="prompt"><span>02</span><div>What is overdue, stuck or waiting on somebody?<br><em>' + m.overdue + ' overdue · ' + m.waiting + ' waiting right now.</em></div></div>',
    '<div class="prompt"><span>03</span><div>What does family and home need from me this week?<br><em>Care handovers, events, repairs, household jobs.</em></div></div>',
    '<div class="prompt"><span>04</span><div>What is quietly approaching?<br><em>Renewals, bills, bookings, appointments, important dates.</em></div></div>',
    '<div class="prompt"><span>05</span><div>What could I simplify, delegate or stop carrying?<br><em>Get the next action clear rather than keeping the whole problem in mind.</em></div></div>',
    '<label class="field" for="review-note" style="margin-top:18px"><span class="eyebrow">THIS WEEK’S NOTE</span></label>',
    '<textarea id="review-note" maxlength="5000" placeholder="What matters this week? What can wait?">' + esc(state.reviewNote) + '</textarea>',
    '<button type="button" class="primary-button" data-action="save-review">Save weekly note</button><p class="stat-note">This is a single running note — edit it each week, or copy it to your own journal.</p>',
    '</section><div class="review-stack"><section class="panel"><div class="panel-head"><h2>Top three focus</h2><small>' + focus.length + ' / 3</small></div><div class="panel-inner">',
    renderTaskRows(focus, 'You have not selected any priorities yet.'), '</div></section>',
    '<section class="panel"><div class="panel-head"><h2>Needs attention</h2><small>Overdue</small></div><div class="panel-inner">',
    renderTaskRows(overdue, 'Nothing overdue.'), '</div></section>',
    '<section class="panel"><div class="panel-head"><h2>Unscheduled inbox</h2><small>' + m.inbox + ' total</small></div><div class="panel-inner">',
    renderTaskRows(inbox, 'No loose actions. Beautiful.'), '</div></section></div></div>'
  ].join('');
}
function render() {
  const labels = { schedule:'Next days', overview:'Overview', tasks:'Actions', projects:'Outcomes', records:'Reference', review:'Weekly reset' };
  const globalAdd = $('global-add');
  globalAdd.dataset.action = activeView === 'schedule' ? 'new-event' : 'new-task';
  globalAdd.innerHTML = activeView === 'schedule' ? '<span>＋</span> New activity' : '<span>＋</span> New action';
  $('breadcrumb').textContent = labels[activeView].toUpperCase();
  document.querySelectorAll('[data-view].nav-item').forEach(b => {
    const active = b.dataset.view === activeView;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (activeView === 'schedule') viewEl.innerHTML = renderNextDays(state, { offset: scheduleOffset, span: scheduleSpan });
  else if (activeView === 'tasks') renderTasks();
  else if (activeView === 'projects') renderProjects();
  else if (activeView === 'records') renderRecords();
  else if (activeView === 'review') renderReview();
  else renderOverview();
}
function goto(view, status = '') {
  if (!['schedule','overview','tasks','projects','records','review'].includes(view)) return;
  activeView = view;
  if (view === 'tasks' && status) filter = { search: '', status, area: 'all', owner: 'all', project: 'all' };
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function field(label, name, input, help = '') {
  return '<div class="field"><label for="f-' + esc(name) + '">' + esc(label) + '</label>' + input
    + (help ? '<small>' + esc(help) + '</small>' : '') + '</div>';
}
function textInput(name, value = '', type = 'text', required = false, max = 160) {
  return '<input id="f-' + esc(name) + '" name="' + esc(name) + '" type="' + esc(type)
    + '" value="' + esc(value) + '" maxlength="' + max + '"' + (required ? ' required' : '') + '>';
}
function dateInput(name, value = '') { return textInput(name, value, 'date', false, 10); }
function selectInput(name, options) { return '<select name="' + esc(name) + '" id="f-' + esc(name) + '">' + options + '</select>'; }
function textareaInput(name, value = '', max = 5000) {
  return '<textarea name="' + esc(name) + '" id="f-' + esc(name) + '" maxlength="' + max + '" rows="4">' + esc(value) + '</textarea>';
}
function formRows(kind, obj = {}) {
  if (kind === 'event') {
    return [
      field('Activity / commitment', 'title', textInput('title', obj.title, 'text', true)),
      '<div class="field-row">' + field('Starts on', 'date', dateInput('date', obj.date || todayISO()))
      + field('Ends on (if multi-day)', 'endDate', dateInput('endDate', obj.endDate && obj.endDate !== obj.date ? obj.endDate : '')) + '</div>',
      '<div class="field-row">' + field('Kind of activity', 'type', selectInput('type', EVENT_TYPES.map(t => opt(t.id,t.label,obj.type||'family')).join('')))
      + field('Responsible / lead', 'owner', selectInput('owner', ownerOptions(obj.owner || ''))) + '</div>',
      '<div class="field-row">' + field('Timing', 'timing', selectInput('timing', EVENT_TIMINGS.map(t => opt(t.id,t.label,obj.timing||'tbc')).join('')))
      + field('Confirmation', 'confirmation', selectInput('confirmation', EVENT_CONFIRMATIONS.map(x => opt(x.id,x.label,obj.confirmation||'confirmed')).join(''))) + '</div>',
      '<div class="field-row" id="event-time-fields">' + field('Starts at', 'start', textInput('start', obj.start, 'time'))
      + field('Ends at (optional)', 'end', textInput('end', obj.end, 'time')) + '</div>',
      '<div class="field-row">' + field('Repeats', 'repeat', selectInput('repeat', REPEATS.map(r => opt(r.id,r.label,obj.repeat||'none')).join('')))
      + '<div id="event-until-field">' + field('Repeat until (optional)', 'until', dateInput('until', obj.until)) + '</div></div>',
      field('Who is involved?', 'people', textInput('people', obj.people, 'text', false, 250), 'Names, guests, carers or anyone involved in making the plan work.'),
      field('Where?', 'location', textInput('location', obj.location, 'text', false, 200)),
      field('Transport / getting there', 'transport', textInput('transport', obj.transport, 'text', false, 300), 'Cars, parking, flights, pick-ups, access, accommodation, etc.'),
      field('Care / handovers', 'care', textInput('care', obj.care, 'text', false, 300), 'Childcare, who has the kids, or handover arrangements.'),
      field('Logistics readiness', 'logistics', selectInput('logistics', LOGISTICS.map(x => opt(x.id,x.label,obj.logistics||'needs')).join(''))),
      field('Other notes', 'notes', textareaInput('notes', obj.notes)),
      obj.id && obj.repeat !== 'none' ? '<p class="inline-legend">Editing this activity changes the entire repeating series. To skip just one date, use “Skip this occurrence” on that day.</p>' : '',
      obj.id ? '<button type="button" class="danger-button" data-action="remove-event" data-id="' + esc(obj.id) + '" style="align-self:flex-start">Delete ' + (obj.repeat !== 'none' ? 'entire series' : 'activity') + '</button>' : ''
    ].join('');
  }
  if (kind === 'task') {
    return [
      field('Action title', 'title', textInput('title', obj.title, 'text', true)),
      '<div class="field-row">' + field('Life area', 'area', selectInput('area', areaOptions(obj.area || 'home')))
      + field('Responsible', 'owner', selectInput('owner', ownerOptions(obj.owner || ''))) + '</div>',
      '<div class="field-row">' + field('Due date', 'due', dateInput('due', obj.due))
      + field('Priority', 'priority', selectInput('priority', [['normal','Normal'],['high','Important'],['low','Low']].map(([v,l])=>opt(v,l,obj.priority||'normal')).join(''))) + '</div>',
      '<div class="field-row">' + field('Status', 'status', selectInput('status', STATUS.map(s=>opt(s.id,s.label,obj.status||'todo')).join('')))
      + field('Repeat', 'repeat', selectInput('repeat', REPEATS.map(s=>opt(s.id,s.label,obj.repeat||'none')).join(''))) + '</div>',
      field('Part of an outcome', 'projectId', selectInput('projectId', projectOptions(obj.projectId || ''))),
      field('Notes / next step', 'notes', textareaInput('notes', obj.notes), 'Keep this short and practical.'),
      obj.id ? '<button type="button" class="danger-button" data-action="remove-task" data-id="' + esc(obj.id) + '" style="align-self:flex-start">Delete action</button>' : ''
    ].join('');
  }
  if (kind === 'project') return [
    field('Outcome / project', 'title', textInput('title', obj.title, 'text', true)),
    '<div class="field-row">' + field('Life area','area',selectInput('area',areaOptions(obj.area||'home')))
      + field('Responsible','owner',selectInput('owner',ownerOptions(obj.owner||''))) + '</div>',
    '<div class="field-row">' + field('Target date','due',dateInput('due',obj.due))
      + field('Stage','status',selectInput('status',[['active','Active'],['paused','Paused'],['done','Complete']].map(([v,l])=>opt(v,l,obj.status||'active')).join(''))) + '</div>',
    field('What does success look like?', 'notes',textareaInput('notes',obj.notes)),
    obj.id ? '<button type="button" class="danger-button" data-action="remove-project" data-id="' + esc(obj.id) + '" style="align-self:flex-start">Delete outcome</button>' : ''
  ].join('');
  return [
    field('Reference title','title',textInput('title',obj.title,'text',true)),
    '<div class="field-row">' + field('Life area','area',selectInput('area',areaOptions(obj.area||'money')))
      + field('Responsible','owner',selectInput('owner',ownerOptions(obj.owner||''))) + '</div>',
    field('Important / renewal date', 'date', dateInput('date',obj.date)),
    field('Related link (optional)', 'link', textInput('link',obj.link,'url',false,1000), 'Only http:// or https:// links; no files are uploaded.'),
    field('Information to remember','details',textareaInput('details',obj.details,10000), 'Avoid sensitive identifiers, credentials or private documents.'),
    obj.id ? '<button type="button" class="danger-button" data-action="remove-record" data-id="' + esc(obj.id) + '" style="align-self:flex-start">Delete reference</button>' : ''
  ].join('');
}
function edit(kind, id = '', preset = {}) {
  const collection = kind === 'task' ? state.tasks : kind === 'project' ? state.projects
    : kind === 'record' ? state.records : state.events;
  const obj = id ? collection.find(x => x.id === id) : preset;
  if (!obj) return;
  editContext = { kind, id };
  const title = kind === 'task' ? 'action' : kind === 'project' ? 'outcome'
    : kind === 'event' ? 'activity' : 'reference';
  $('dialog-title').textContent = id ? 'Edit ' + title : 'New ' + title;
  $('submit-entity').textContent = id ? 'Save changes' : 'Create ' + title;
  $('form-fields').innerHTML = formRows(kind, obj);
  if (kind === 'event') toggleEventFormFields();
  $('entity-dialog').showModal();
  $('form-fields').querySelector('input[name="title"]')?.focus();
}
function toggleEventFormFields() {
  const timeFields = $('event-time-fields');
  const repeatUntil = $('event-until-field');
  if (timeFields) timeFields.hidden = $('f-timing')?.value !== 'timed';
  if (repeatUntil) repeatUntil.hidden = $('f-repeat')?.value === 'none';
}
function saveEntity(event) {
  event.preventDefault();
  if (!editContext) return;
  const kind = editContext.kind;
  const vals = Object.fromEntries(new FormData($('entity-form')).entries());
  const title = String(vals.title || '').trim();
  if (!title) return showToast('Add a title first.');
  if (kind === 'task' && vals.repeat !== 'none' && !vals.due) return showToast('Repeating actions need a due date.');
  if (kind === 'record' && vals.link && !safeLink(vals.link)) return showToast('Please enter an http:// or https:// link.');
  const collection = kind === 'task' ? state.tasks : kind === 'project' ? state.projects : state.records;
  const old = editContext.id ? collection.find(item => item.id === editContext.id) : null;
  const base = old || { id: uid(), createdAt: new Date().toISOString() };
  const shared = { ...base, title, area: vals.area, owner: vals.owner || '', updatedAt: new Date().toISOString() };
  let item;
  if (kind === 'task') {
    item = { ...shared, due: vals.due || '', notes: vals.notes || '', priority: vals.priority,
      status: vals.status, repeat: vals.repeat, projectId: vals.projectId || '', focus: old?.focus || false,
      completedAt: old?.completedAt || '', lastCompletedAt: old?.lastCompletedAt || '', completionCount: old?.completionCount || 0 };
    if (item.status === 'done' && item.repeat !== 'none' && item.due) {
      const next = nextRecurrence(item.due, item.repeat);
      if (!next) return showToast('Could not calculate the next due date.');
      item.due = next;
      item.status = 'todo';
      item.lastCompletedAt = new Date().toISOString();
      item.completionCount += 1;
      item.completedAt = '';
      item.focus = false;
    } else {
      if (item.status === 'done' && old?.status !== 'done') item.completedAt = new Date().toISOString();
      if (item.status !== 'done') item.completedAt = '';
      if (item.status === 'done') item.focus = false;
    }
  } else if (kind === 'project') {
    item = { ...shared, due: vals.due || '', notes: vals.notes || '', status: vals.status };
  } else {
    item = { ...shared, date: vals.date || '', link: safeLink(vals.link), details: vals.details || '' };
  }
  if (old) collection[collection.indexOf(old)] = item; else collection.push(item);
  state = normaliseState(state);
  persist();
  $('entity-dialog').close();
  render();
  showToast((old ? 'Updated ' : 'Added ') + title + '.');
}
function completeTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.status === 'done') {
    task.status = 'todo'; task.completedAt = '';
    showToast('Action reopened.');
  } else if (task.repeat !== 'none' && task.due) {
    const next = nextRecurrence(task.due, task.repeat);
    if (!next) return showToast('Could not calculate the next due date.');
    task.lastCompletedAt = new Date().toISOString();
    task.completionCount = (task.completionCount || 0) + 1;
    task.due = next;
    task.status = 'todo';
    task.focus = false;
    showToast('Completed. Next occurrence: ' + niceDate(next, {day:'numeric',month:'short',year:'numeric'}) + '.');
  } else {
    task.status = 'done';
    task.focus = false;
    task.completedAt = new Date().toISOString();
    showToast('Action completed.');
  }
  task.updatedAt = new Date().toISOString();
  persist(); render();
}
function focusTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task || !openTask(task)) return;
  if (!task.focus && state.tasks.filter(t => openTask(t) && t.focus).length >= 3) {
    return showToast('You have three priorities. Unstar one first.');
  }
  task.focus = !task.focus;
  task.updatedAt = new Date().toISOString();
  persist(); render();
  showToast(task.focus ? 'Added to your top three.' : 'Removed from your top three.');
}
function deleteEntity(kind, id) {
  const collection = kind === 'task' ? state.tasks : kind === 'project' ? state.projects : state.records;
  const item = collection.find(x => x.id === id);
  if (!item) return;
  const extra = kind === 'project' ? ' Its actions will be kept, but unlinked.' : '';
  if (!window.confirm('Delete "' + item.title + '"?' + extra + ' This cannot be undone.')) return;
  collection.splice(collection.indexOf(item), 1);
  if (kind === 'project') state.tasks.forEach(t => { if (t.projectId === id) t.projectId = ''; });
  persist();
  if ($('entity-dialog').open) $('entity-dialog').close();
  render(); showToast('Deleted.');
}
function saveOwners() {
  const owners = $('owner-settings').value.split(/\r?\n/).map(n=>n.trim().slice(0,70)).filter(Boolean);
  if (!owners.length) return showToast('Enter at least one person.');
  state.settings.owners = [...new Set(owners)].slice(0,12);
  persist(); render(); showToast('People updated.');
}
function downloadBackup() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'staldex-life-' + todayISO() + '.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Backup downloaded. Store it securely.');
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return showToast('That backup is too large (2 MB limit).');
  try {
    const imported = normaliseState(JSON.parse(await file.text()));
    if (!window.confirm('Replace everything in this browser with ' + imported.tasks.length + ' actions, '
      + imported.projects.length + ' outcomes and ' + imported.records.length + ' reference cards? Export a backup first if needed.')) return;
    state = imported;
    persist(); $('settings-dialog').close();
    filter = { search: '', status: 'open', area: 'all', owner: 'all', project: 'all' };
    goto('overview');
    showToast('Backup imported successfully.');
  } catch (err) { showToast('Import failed: ' + err.message); }
  finally { $('import-file').value = ''; }
}
function resetWorkspace() {
  if (window.prompt('This will erase all Life Admin data in this browser. Type CLEAR to continue:') !== 'CLEAR') return;
  state = initialState(); persist();
  $('settings-dialog').close(); goto('overview'); showToast('Workspace cleared.');
}
function openSettings() {
  $('owner-settings').value = state.settings.owners.join('\n');
  $('settings-dialog').showModal();
}
document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-view]');
  if (nav) { goto(nav.dataset.view); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'goto') { goto(button.dataset.view || 'tasks', button.dataset.status || ''); return; }
  if (action === 'area') { filter.area = id; filter.status = 'open'; filter.project = 'all'; goto('tasks'); return; }
  if (action === 'view-project') { filter.project = id; filter.area = 'all'; filter.status = 'all'; goto('tasks'); return; }
  if (action === 'clear-project') { filter.project = 'all'; render(); return; }
  if (action === 'new-task') return edit('task');
  if (action === 'new-project') return edit('project');
  if (action === 'new-record') return edit('record');
  if (action === 'new-project-task') return edit('task','',{ projectId: id, area: state.projects.find(p=>p.id===id)?.area || 'home' });
  if (action === 'edit-task') return edit('task',id);
  if (action === 'edit-project') return edit('project',id);
  if (action === 'edit-record') return edit('record',id);
  if (action === 'check-task') return completeTask(id);
  if (action === 'focus-task') return focusTask(id);
  if (action === 'remove-task') return deleteEntity('task',id);
  if (action === 'remove-project') return deleteEntity('project',id);
  if (action === 'remove-record') return deleteEntity('record',id);
  if (action === 'close-editor') { $('entity-dialog').close(); return; }
  if (action === 'close-settings') { $('settings-dialog').close(); return; }
  if (action === 'save-owners') return saveOwners();
  if (action === 'save-review') {
    state.reviewNote = $('review-note').value; persist(); showToast('Weekly note saved.'); return;
  }
  if (action === 'export') return downloadBackup();
  if (action === 'import') return $('import-file').click();
  if (action === 'reset') return resetWorkspace();
});
document.addEventListener('submit', event => {
  if (event.target.id === 'entity-form') return saveEntity(event);
  if (event.target.id === 'quick-form') {
    event.preventDefault();
    const title = $('quick-title').value.trim().slice(0,160);
    if (!title) return;
    state.tasks.push({ id: uid(), title, area: 'personal', owner: '', projectId: '',
      notes: '', due: '', priority: 'normal', status: 'todo', repeat: 'none', focus: false,
      completedAt: '', lastCompletedAt: '', completionCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    persist(); render(); showToast('Captured to your inbox.'); return;
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'task-search') {
    filter.search = event.target.value;
    renderTaskListOnly();
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'task-status') { filter.status = event.target.value; renderTaskListOnly(); }
  if (event.target.id === 'task-area') { filter.area = event.target.value; renderTaskListOnly(); }
  if (event.target.id === 'task-owner') { filter.owner = event.target.value; renderTaskListOnly(); }
});
$('settings-trigger').addEventListener('click', openSettings);
$('entity-form').addEventListener('reset', event => event.preventDefault());
$('import-file').addEventListener('change', event => importBackup(event.target.files?.[0]));
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try { state = normaliseState(JSON.parse(event.newValue)); render(); showToast('Workspace updated from another tab.'); }
  catch (error) { console.warn('Ignoring invalid storage update', error); }
});
state = load();
checkStorage();
$('current-date').textContent = new Intl.DateTimeFormat('en-AU',{ weekday:'short',day:'numeric',month:'short',year:'numeric' }).format(new Date());
render();
