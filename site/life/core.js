// Staldex Life Admin — dependency-free domain model.
// No personal data is stored in the repository. Everything starts in this browser.
export const STORAGE_KEY = 'staldex-life-admin-v1';
export const AREAS = [
  { id: 'home', label: 'Home & property', icon: '⌂', colour: '#597f69' },
  { id: 'family', label: 'Family & care', icon: '♡', colour: '#a56b70' },
  { id: 'money', label: 'Money & paperwork', icon: '$', colour: '#9b7d45' },
  { id: 'health', label: 'Health & wellbeing', icon: '✳', colour: '#65908f' },
  { id: 'vehicles', label: 'Vehicles & transport', icon: '↗', colour: '#777ba4' },
  { id: 'people', label: 'People & relationships', icon: '◎', colour: '#aa765b' },
  { id: 'travel', label: 'Plans & travel', icon: '✈', colour: '#6c86ac' },
  { id: 'digital', label: 'Digital & subscriptions', icon: '◇', colour: '#917e9f' },
  { id: 'personal', label: 'Personal growth', icon: '◈', colour: '#819562' },
  { id: 'ventures', label: 'Work & ventures', icon: '▣', colour: '#597b87' }
];
export const STATUS = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'waiting', label: 'Waiting on someone' },
  { id: 'done', label: 'Done' }
];
export const REPEATS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnightly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Every 3 months' },
  { id: 'yearly', label: 'Yearly' }
];
const areaIds = new Set(AREAS.map(a => a.id));
const statusIds = new Set(STATUS.map(s => s.id));
const repeatIds = new Set(REPEATS.map(s => s.id));

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
export function parseDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const value = new Date(y, m - 1, d, 12);
  return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d ? value : null;
}
export function isoFromDate(date) { return todayISO(date); }
export function addDays(iso, days) {
  const date = parseDate(iso);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}
export function addMonths(iso, months, anchorDay) {
  const date = parseDate(iso);
  if (!date) return '';
  const day = anchorDay || date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return isoFromDate(target);
}
// Advances past today even if a missed occurrence was weeks ago. Preserves
// month-end anchors (31 Jan -> 28 Feb -> 31 Mar), including leap years.
export function nextRecurrence(due, repeat, today = todayISO()) {
  if (!parseDate(due) || repeat === 'none' || !repeatIds.has(repeat)) return '';
  const anchorDay = Number(due.slice(-2));
  const daySteps = { daily: 1, weekly: 7, fortnightly: 14 };
  const monthSteps = { monthly: 1, quarterly: 3, yearly: 12 };
  for (let i = 1; i <= 10000; i++) {
    const candidate = daySteps[repeat]
      ? addDays(due, daySteps[repeat] * i)
      : addMonths(due, monthSteps[repeat] * i, anchorDay);
    if (candidate > today) return candidate;
  }
  return '';
}
export function niceDate(iso, opts = { day: 'numeric', month: 'short' }) {
  const date = parseDate(iso);
  return date ? new Intl.DateTimeFormat('en-AU', opts).format(date) : 'No date';
}
export function dayDelta(iso, today = todayISO()) {
  const a = parseDate(iso);
  const b = parseDate(today);
  if (!a || !b) return Infinity;
  return Math.round((a - b) / 86400000);
}
export function dueText(iso, today = todayISO()) {
  if (!iso) return 'No date';
  const d = dayDelta(iso, today);
  if (d < 0) return Math.abs(d) + 'd overdue';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return niceDate(iso);
}
export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
export function initialState() {
  return {
    version: 1,
    tasks: [],
    projects: [],
    records: [],
    settings: { owners: ['Leon', 'Rahana', 'Shared'] },
    reviewNote: '',
    updatedAt: new Date().toISOString()
  };
}
export function areaFor(id) { return AREAS.find(a => a.id === id) || null; }
export function esc(input) {
  return String(input ?? '').replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
  ));
}
export function safeLink(input) {
  try {
    const url = new URL(String(input || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch (_) { return ''; }
}
function txt(input, max = 200) { return String(input ?? '').trim().slice(0, max); }
function dateOrBlank(input) { const v = txt(input, 10); return parseDate(v) ? v : ''; }
function enumOr(input, allowed, fallback) { return allowed.has(input) ? input : fallback; }
function isoOrBlank(input) {
  const text = txt(input, 40);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text : '';
}
function base(item) {
  return {
    id: txt(item.id, 100) || uid(),
    title: txt(item.title, 160),
    area: enumOr(item.area, areaIds, 'home'),
    owner: txt(item.owner, 70),
    createdAt: isoOrBlank(item.createdAt) || new Date().toISOString(),
    updatedAt: isoOrBlank(item.updatedAt) || new Date().toISOString()
  };
}
function dedupe(array) {
  const used = new Set();
  return array.map(item => {
    if (used.has(item.id)) item.id = uid();
    used.add(item.id);
    return item;
  });
}
// Also used for importing JSON. Drop unrecognised fields; do not trust user
// supplied markup or scriptable URLs.
export function normaliseState(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1
    || !Array.isArray(raw.tasks) || !Array.isArray(raw.projects) || !Array.isArray(raw.records)) {
    throw new Error('Not a Life Admin version 1 backup.');
  }
  if (raw.tasks.length > 10000 || raw.projects.length > 2000 || raw.records.length > 5000) {
    throw new Error('Backup exceeds supported record limits.');
  }
  const projects = dedupe(raw.projects.filter(x => x && typeof x === 'object').map(x => ({
    ...base(x),
    notes: txt(x.notes, 5000),
    status: enumOr(x.status, new Set(['active', 'paused', 'done']), 'active'),
    due: dateOrBlank(x.due)
  })).filter(x => x.title));
  const projectIds = new Set(projects.map(p => p.id));
  const tasks = dedupe(raw.tasks.filter(x => x && typeof x === 'object').map(x => ({
    ...base(x),
    notes: txt(x.notes, 5000),
    status: enumOr(x.status, statusIds, 'todo'),
    priority: enumOr(x.priority, new Set(['normal', 'high', 'low']), 'normal'),
    due: dateOrBlank(x.due),
    repeat: enumOr(x.repeat, repeatIds, 'none'),
    focus: Boolean(x.focus),
    projectId: projectIds.has(x.projectId) ? x.projectId : '',
    completedAt: isoOrBlank(x.completedAt),
    lastCompletedAt: isoOrBlank(x.lastCompletedAt),
    completionCount: Number.isInteger(x.completionCount) && x.completionCount >= 0 ? Math.min(1000000, x.completionCount) : 0
  })).filter(x => x.title));
  const records = dedupe(raw.records.filter(x => x && typeof x === 'object').map(x => ({
    ...base(x),
    details: txt(x.details, 10000),
    date: dateOrBlank(x.date),
    link: safeLink(x.link)
  })).filter(x => x.title));
  const owners = Array.isArray(raw.settings?.owners) ? raw.settings.owners.map(o => txt(o, 70)).filter(Boolean).slice(0, 12) : [];
  return {
    version: 1, tasks, projects, records,
    settings: { owners: [...new Set(owners)].length ? [...new Set(owners)] : ['Me', 'Shared'] },
    reviewNote: txt(raw.reviewNote, 5000),
    updatedAt: isoOrBlank(raw.updatedAt) || new Date().toISOString()
  };
}
export function openTask(task) { return task.status !== 'done'; }
export function orderedTasks(tasks, today = todayISO()) {
  const ranks = { high: 0, normal: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    const da = a.due || '9999-12-31', db = b.due || '9999-12-31';
    const overA = !!a.due && a.due < today, overB = !!b.due && b.due < today;
    if (overA !== overB) return overA ? -1 : 1;
    if (da !== db) return da.localeCompare(db);
    if (a.focus !== b.focus) return a.focus ? -1 : 1;
    if (ranks[a.priority] !== ranks[b.priority]) return ranks[a.priority] - ranks[b.priority];
    return a.title.localeCompare(b.title);
  });
}
export function metrics(state, today = todayISO()) {
  const open = state.tasks.filter(openTask);
  const inSeven = addDays(today, 7);
  return {
    open: open.length,
    overdue: open.filter(t => t.due && t.due < today).length,
    today: open.filter(t => t.due === today).length,
    soon: open.filter(t => t.due && t.due >= today && t.due <= inSeven).length,
    waiting: open.filter(t => t.status === 'waiting').length,
    inbox: open.filter(t => !t.due && !t.projectId).length,
    focus: open.filter(t => t.focus).length
  };
}
export function projectProgress(state, projectId) {
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  const done = tasks.filter(t => t.status === 'done').length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round(done * 100 / tasks.length) : 0 };
}
