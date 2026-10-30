// Brain viewer — window onto the private Brain repo, plus narrow QUEUE and register edits.
// Data comes from /api/brain (worker-brain/), behind Cloudflare Access.

import { escapeHtml, parseFrontmatter, renderMarkdown, resolvePath } from './markdown.js?v=20261026b';
import {
  VIEW_PATH, LENSES, openingLens, homeHtml, perthDay, openClock, taskHtml, taskPanel, clockBarHtml, projectOf,
  closeKind, fmtElapsed, fmtMinutes, clockMinutes, rewardHtml, promoteNext, categoriseHtml, parseFamilies,
  latestFocal, focalChoice, clockRecords, CLOCK_GRACE_MS, refreshDue, rowActs, walkHtml, walkDetails, actionCheck,
  TWO_MINUTES_MS, fmtCountdown, placements, SUBS,
} from './home.js?v=20261030d';

const API = '/api/brain';
const HOME = 'INDEX.md';

const $ = (id) => document.getElementById(id);
const els = {
  shell: $('shell'), side: $('side'), nav: $('nav'), filter: $('filter'), foot: $('side-foot'),
  doc: $('doc'), crumbs: $('crumbs'), source: $('source'), refresh: $('refresh'),
  menu: $('menu'), sideClose: $('side-close'), scrim: $('scrim'),
};

const state = {
  tree: null,
  paths: new Set(),
  files: new Map(), // sha → text
  statuses: new Map(), // project slug → status, read from INDEX.md
  current: null,
};

// The command centre home (Brain brain-032): what the page opens on unless a file is asked for.
// `focal` is Leon's pick of the one thing today from the daily log (Brain D-113 A); `dirty`
// says this page's copy of the view carries writes Brain has not rendered yet.
// `places` are the Next actions placements from the daily log (D-109 A), `sub` the sub-tab
// shown, `lensOpen` whether the lens chooser is open.
const home = { view: null, sha: null, lens: null, filter: null, time: null, inboxAll: false, focal: null, dirty: false, places: null, sub: 'today', lensOpen: false };

function homeTab() {
  if (familyCode()) return 'family';
  const match = /^#(?:\/)?(focus|inbox|next|priority|clarify|allocation|someday)?$/.exec(location.hash || '#');
  if (!match) return null;
  return { clarify: 'inbox', priority: 'next' }[match[1]] || match[1] || 'focus';
}

// The lens last used, kept across days (Brain D-116 A); working hours still open on Work.
// `#family/<CODE>`: one family's page (Brain DEV-61026.35).
function familyCode() {
  const m = /^#family\/([A-Za-z%3F?-]+)$/.exec(location.hash || '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]).toUpperCase(); } catch { return null; }
}

function storedLens() {
  try {
    const saved = JSON.parse(localStorage.getItem('brain.lens') || 'null');
    return saved && LENSES.includes(saved.lens) ? saved.lens : null;
  } catch { return null; }
}

function storeLens(lens) {
  try { localStorage.setItem('brain.lens', JSON.stringify({ lens })); } catch { /* private mode */ }
}

// This page's patched copy of the view outlives a reload until Brain renders a new view
// (Brain DEV-61030.12): keyed by the view's sha, so a newer view always wins.
const STASH = 'brain.view';
function stashView() {
  if (!home.dirty || !home.sha) return;
  try { sessionStorage.setItem(STASH, JSON.stringify({ sha: home.sha, view: home.view })); } catch { /* storage full or off */ }
}

function stashedView(sha) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STASH) || 'null');
    if (saved && saved.sha === sha && saved.view && Array.isArray(saved.view.entries)) return saved.view;
    if (saved && saved.sha !== sha) sessionStorage.removeItem(STASH);
  } catch { /* fall through to a plain load */ }
  return null;
}

class ApiError extends Error {
  constructor(kind, status, body = null) {
    super(kind);
    this.kind = kind;
    this.status = status;
    this.body = body; // the Worker's JSON, such as the ids a batch refused on
  }
}

// redirect: 'manual' so an expired Access session (which answers with a redirect to the
// login page) shows a clear "sign in again" state instead of an opaque CORS failure.
async function api(path, payload) {
  const init = { credentials: 'same-origin', redirect: 'manual', headers: { Accept: 'application/json' } };
  if (payload) {
    // The Worker refuses writes without JSON, the site's Origin and this header.
    init.method = 'POST';
    init.headers['Content-Type'] = 'application/json';
    init.headers['X-Brain-Write'] = '1';
    init.body = JSON.stringify(payload);
  }
  let res;
  try {
    res = await fetch(API + path, init);
  } catch {
    throw new ApiError('offline');
  }
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) throw new ApiError('signin', res.status);
  let body = null;
  try { body = await res.json(); } catch { /* handled below */ }
  // Only the Worker's own "not configured" means setup; any other 503 (Access certs
  // unreachable, a Cloudflare error page) shows what came back.
  if (res.status === 503 && body?.error === 'not configured') throw new ApiError('setup', res.status);
  if (!res.ok || !body) throw new ApiError(body?.error || `HTTP ${res.status}`, res.status, body);
  return body;
}

// ---- grouping -------------------------------------------------------------

const GROUPS = [
  { key: 'home', title: 'Portfolio', test: (p) => !p.includes('/') },
  { key: 'projects', title: 'Projects', test: (p) => p.startsWith('projects/') },
  { key: 'graph', title: 'Graph', test: (p) => p.startsWith('graph/') },
  { key: 'inbox', title: 'Inbox', test: (p) => p.startsWith('inbox/') },
  { key: 'context', title: 'Context', test: (p) => p.startsWith('context/') },
  { key: 'other', title: 'Other', test: () => true },
];

const HOME_ORDER = ['INDEX.md', 'README.md', 'AGENTS.md', 'CLAUDE.md'];

function label(path) {
  const name = path.split('/').pop();
  return name.replace(/\.md$/i, '').replace(/^(\d{4}-\d{2}-\d{2})-/, '$1 · ').replace(/[-_]/g, ' ');
}

function grouped(paths) {
  const groups = GROUPS.map((g) => ({ ...g, items: [] }));
  for (const p of paths) groups.find((g) => g.test(p)).items.push(p);
  for (const g of groups) {
    if (g.key === 'home') g.items.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    else if (g.key === 'inbox') g.items.sort((a, b) => b.localeCompare(a)); // newest capture first
    else g.items.sort();
  }
  return groups.filter((g) => g.items.length);
}

function rank(p) {
  const i = HOME_ORDER.indexOf(p);
  return i === -1 ? HOME_ORDER.length : i;
}

function link(path, text, extra = '') {
  const current = path === state.current ? ' aria-current="page"' : '';
  return `<a href="#/${encodeURI(path)}"${current}${extra}>${text}</a>`;
}

function renderNav() {
  const q = els.filter.value.trim().toLowerCase();
  const paths = state.tree.files.map((f) => f.path).filter((p) => !q || p.toLowerCase().includes(q));
  if (!paths.length) {
    els.nav.innerHTML = '<p class="nav-empty">No files match.</p>';
    return;
  }

  els.nav.innerHTML = grouped(paths).map((g) => {
    let body;
    if (g.key === 'projects') {
      // One row per project: slug, status from INDEX, then its QUEUE / STATE links. Any other
      // documents in the project folder sit in a collapsed list under the row, so a project
      // with many documents can't squeeze its own name out of the sidebar.
      const bySlug = new Map();
      for (const p of g.items) {
        const slug = p.split('/')[1];
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug).push(p);
      }
      const slugs = [...bySlug.keys()].sort((a, b) => (a.startsWith('_') - b.startsWith('_')) || a.localeCompare(b));
      body = slugs.map((slug) => {
        const files = bySlug.get(slug);
        const main = files.filter((p) => /^projects\/[^/]+\/(QUEUE|STATE)\.md$/.test(p));
        const docs = files.filter((p) => !main.includes(p));
        const status = state.statuses.get(slug);
        const dot = `<span class="status-dot" data-status="${escapeHtml(status || '')}"${status ? ` title="${escapeHtml(status)}"` : ''}></span>`;
        const active = main.includes(state.current) ? ' active' : '';
        const name = (p) => escapeHtml(p.split('/').slice(2).join('/').replace(/\.md$/i, ''));
        const row = `<li class="project${active}"><span class="project-name">${dot}<span class="slug" title="${escapeHtml(slug)}">${escapeHtml(slug)}</span>` +
          `${status ? `<span class="visually-hidden">, ${escapeHtml(status)}</span>` : ''}</span>` +
          `<span class="project-files">${main.map((p) => link(p, name(p))).join('')}</span></li>`;
        if (!docs.length) return row;
        // Open while filtering or when the current file is one of these documents.
        const open = q || docs.includes(state.current) ? ' open' : '';
        return `${row}<li class="project-docs"><details${open}><summary>${docs.length} ${docs.length === 1 ? 'doc' : 'docs'}</summary>` +
          `<ul>${docs.map((p) => `<li>${link(p, name(p))}</li>`).join('')}</ul></details></li>`;
      }).join('');
    } else {
      body = g.items.map((p) => {
        const sub = g.key === 'other' || g.key === 'graph' ? p.split('/').slice(1, -1).join('/') : '';
        const hint = sub ? `<span class="hint">${escapeHtml(sub)}/</span>` : '';
        return `<li>${link(p, `${hint}${escapeHtml(label(p))}`)}</li>`;
      }).join('');
    }
    return `<section class="group"><h2>${g.title} <span>${g.items.length}</span></h2><ul>${body}</ul></section>`;
  }).join('');
}

function renderFoot() {
  const t = state.tree;
  const when = t.commit.date ? new Date(t.commit.date).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : 'unknown';
  els.foot.innerHTML =
    `<div><span class="dot" aria-hidden="true"></span>${escapeHtml(t.ref)} @ <code>${escapeHtml(t.commit.sha.slice(0, 7))}</code> · ${escapeHtml(when)}</div>` +
    `<div class="commit-msg" title="${escapeHtml(t.commit.message)}">${escapeHtml(t.commit.message)}</div>` +
    (t.viewer ? `<div class="viewer">Signed in as ${escapeHtml(t.viewer)}</div>` : '') +
    (t.truncated ? '<div class="warn">Tree truncated by GitHub — some files are hidden.</div>' : '');
}

// ---- documents -------------------------------------------------------------

function githubUrl(path) {
  return `https://github.com/${state.tree.repo}/blob/${encodeURIComponent(state.tree.ref)}/${encodeURI(path)}`;
}

function linkFor(fromPath) {
  return (href) => {
    if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
    if (href.startsWith('#')) return null;
    const [target] = href.split('#');
    const resolved = resolvePath(fromPath, target);
    if (state.paths.has(resolved)) return { href: `#/${encodeURI(resolved)}`, external: false };
    for (const index of ['README.md', 'INDEX.md']) {
      const candidate = resolved ? `${resolved}/${index}` : index;
      if (state.paths.has(candidate)) return { href: `#/${encodeURI(candidate)}`, external: false };
    }
    return { href: githubUrl(resolved), external: true };
  };
}

const META_ORDER = ['status', 'type', 'domain', 'sensitivity', 'updated', 'project', 'id', 'people', 'aliases', 'repositories'];

function renderMeta(meta) {
  if (!meta || !Object.keys(meta).length) return '';
  const keys = Object.keys(meta).sort((a, b) => {
    const ia = META_ORDER.indexOf(a), ib = META_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const value = (k, v) => {
    if (Array.isArray(v)) {
      if (!v.length) return '<span class="none">none</span>';
      return v.map((x) => /^https?:\/\//.test(x)
        ? `<a href="${escapeHtml(x)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.replace(/^https?:\/\/(www\.)?/, ''))}</a>`
        : `<span class="pill">${escapeHtml(x)}</span>`).join(' ');
    }
    if (k === 'status' || k === 'sensitivity') return `<span class="badge" data-status="${escapeHtml(v)}">${escapeHtml(v)}</span>`;
    return escapeHtml(v);
  };
  return `<dl class="meta">${keys.map((k) => `<div><dt>${escapeHtml(k)}</dt><dd>${value(k, meta[k])}</dd></div>`).join('')}</dl>`;
}

function renderJson(path, text) {
  let pretty = text;
  try {
    pretty = path.endsWith('.jsonl')
      ? text.split('\n').filter((l) => l.trim()).map((l) => JSON.stringify(JSON.parse(l))).join('\n')
      : JSON.stringify(JSON.parse(text), null, 2);
  } catch { /* show as-is */ }
  return `<pre class="json"><code>${escapeHtml(pretty)}</code></pre>`;
}

function renderCrumbs(path) {
  const parts = path.split('/');
  els.crumbs.innerHTML = parts.map((part, i) =>
    `<li${i === parts.length - 1 ? ' aria-current="page"' : ''}>${escapeHtml(part)}</li>`).join('');
  els.source.href = githubUrl(path);
  els.source.hidden = false;
}

// INDEX.md's generated table is the one place project status lives in aggregate.
function readStatuses(text) {
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length > 3 && cells[1] && cells[2] && !/^-+$/.test(cells[2]) && cells[1] !== 'Project') {
      state.statuses.set(cells[1], cells[2].toLowerCase());
    }
  }
}

async function fileText(path) {
  const entry = state.tree.files.find((f) => f.path === path);
  if (!entry) return null;
  if (state.files.has(entry.sha)) return state.files.get(entry.sha);
  // Pinned to the commit the tree came from, so the text always matches the tree shown.
  const { sha, text } = await api(`/file?path=${encodeURIComponent(path)}&commit=${state.tree.commit.sha}`);
  state.files.set(sha, text);
  return text;
}

async function show(path) {
  els.shell.classList.remove('home-mode');
  state.current = path;
  renderCrumbs(path);
  renderNav();
  closeSide();

  if (!state.paths.has(path)) {
    els.doc.innerHTML = `<p class="status">No readable file at <code>${escapeHtml(path)}</code>.</p>` +
      `<p><a href="#/${HOME}">Back to the portfolio index</a></p>`;
    return;
  }

  els.doc.classList.add('loading');
  try {
    const text = await fileText(path);
    if (state.current !== path) return; // a later navigation won
    if (path === HOME) { readStatuses(text); renderNav(); }

    if (/\.md$/i.test(path)) {
      const { meta, body } = parseFrontmatter(text);
      els.doc.innerHTML = renderMeta(meta) + renderMarkdown(body, { linkFor: linkFor(path) });
      addQueueControls(path);
      addRegisterControls(path);
    } else {
      els.doc.innerHTML = `<h1>${escapeHtml(path.split('/').pop())}</h1>` + renderJson(path, text);
    }
    const title = els.doc.querySelector('h1')?.textContent || label(path);
    document.title = `${title} — Brain`;
    els.doc.focus({ preventScroll: true });
    const item = currentItem();
    if (!item || !jumpToItem(item)) window.scrollTo(0, 0);
  } catch (err) {
    showError(err);
  } finally {
    els.doc.classList.remove('loading');
  }
}

function showError(err) {
  const messages = {
    signin: ['Signed out', 'Your Cloudflare Access session has ended. Reload to sign in again.'],
    setup: ['Not set up yet', 'The Brain Worker is deployed without its Access or GitHub settings. See worker-brain/README.md.'],
    offline: ['Can’t reach Brain', 'The network request failed. Check the connection and try again.'],
  };
  const [title, body] = messages[err?.kind] || ['Something went wrong', `The Brain API answered: ${err?.kind || 'unknown error'}.`];
  els.doc.innerHTML = `<div class="notice"><h1>${title}</h1><p>${body}</p>` +
    '<p><button type="button" class="text-btn" data-action="reload">Reload</button></p></div>';
}

// ---- routing & chrome --------------------------------------------------------

function route() {
  const tab = homeTab();
  return tab ? showHome(tab) : show(currentPath());
}

async function showHome(tab) {
  state.current = null;
  // The home view is the whole page: no file list beside it (Leon, 26 Oct).
  els.shell.classList.add('home-mode');
  els.crumbs.innerHTML = '<li aria-current="page">Home</li>';
  els.source.hidden = true;
  renderNav();
  closeSide();
  const entry = state.tree.files.find((f) => f.path === VIEW_PATH);
  if (!entry) return show(HOME); // Brain has not generated the view yet
  els.doc.classList.add('loading');
  try {
    if (home.sha !== entry.sha) {
      const stashed = stashedView(entry.sha);
      home.view = stashed || refreshDue(JSON.parse(await fileText(VIEW_PATH)), perthDay().today);
      home.sha = entry.sha;
      home.dirty = Boolean(stashed);
    }
    home.lens = home.lens || openingLens(home.view.work_hours, storedLens());
    renderHome(tab);
    document.title = 'Brain — Staldex';
    window.scrollTo(0, 0);
  } catch (err) {
    showError(err);
  } finally {
    els.doc.classList.remove('loading');
  }
}

function renderHome(tab = homeTab() || 'focus') {
  const when = state.tree.commit.date ? new Date(state.tree.commit.date).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '';
  const asOf = `${home.view.date}${when ? `, last change ${when}` : ''}`;
  els.doc.innerHTML = homeHtml(home.view, {
    lens: home.lens, tab, filter: home.filter, asOf, time: home.time, clock, projects: projectSlugs(), inboxAll: home.inboxAll,
    today: perthDay().today, focal: home.focal, places: home.places, sub: home.sub, lensOpen: home.lensOpen, family: familyCode(),
  });
  stashView();
}

// Six weeks of daily-log rows: this week's actuals, today's clock, pick and Today list, and
// Next week placements that carry forward (D-109 A).
function timeFrom() {
  const d = new Date(`${perthDay().monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 35);
  return d.toISOString().slice(0, 10);
}

// The item in the focal slot for the current lens, and whether it is Leon's own pick.
function currentFocal() {
  if (!home.view || !home.view.lenses[home.lens]) return null;
  const choice = focalChoice(home.view, home.lens, home.focal, home.places);
  return choice ? { ref: choice.entry.ref, mine: choice.mine } : null;
}

els.doc.addEventListener('click', (e) => {
  // A task row opens its card (Brain D-97 A); a modified click still opens the file.
  const taskLink = e.target.closest('a[data-cc-ref], a[data-cc-line], a[data-cc-sort]');
  if (taskLink && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    const d = taskLink.dataset;
    if (d.ccRef) openTask(d.ccRef);
    else if (d.ccSort) openSort({ kind: 'item', entry: entryFor(d.ccSort) });
    else {
      const row = (home.view.inbox || []).find((r) => r.kind === 'line' && (r.raw || r.text) === d.ccLine && r.home === `project:${d.ccProject}`);
      if (row) openWalk(row);
    }
    return;
  }
  const el = e.target.closest('[data-cc-lens], [data-cc-lens-open], [data-cc-sub], [data-cc-context], [data-cc-area], [data-cc-clear], [data-cc-inbox-all]');
  if (!el || !home.view) return;
  const d = el.dataset;
  if (d.ccInboxAll) { home.inboxAll = true; return renderHome(); }
  if (d.ccLensOpen) { home.lensOpen = !home.lensOpen; return renderHome(); }
  if (d.ccLens) { home.lens = d.ccLens; home.filter = null; home.lensOpen = false; storeLens(d.ccLens); return renderHome(); }
  if (d.ccSub) { home.sub = SUBS.includes(d.ccSub) ? d.ccSub : 'today'; return renderHome(); }
  if (d.ccClear) { home.filter = null; return renderHome(); }
  home.filter = d.ccContext ? { type: 'context', value: d.ccContext } : { type: 'area', value: d.ccArea };
  home.sub = 'week';
  if (homeTab() === 'next') renderHome('next');
  else location.hash = '#next';
});

// ---- Next actions placements (Brain D-107, D-109 A) -----------------------------------------
// Today and Next week are rows on the daily log, one commit per move or reorder; this
// page's rows follow at once and the lists are recomputed from them.

function placeAll(kind, items) {
  const { today, hhmm } = perthDay();
  const rows = items.map((it) => ({ date: today, kind: it.kind || kind, start: hhmm, end: '', minutes: 0, ref: it.ref, area: '', lens: '', note: String(it.note) }));
  if (home.time) home.time.rows.push(...rows);
  home.places = placements(home.time ? home.time.rows : rows, today);
}

async function placeWrite(kind, items, lens) {
  await api('/place', { kind, items, lens: lens || '' });
  placeAll(kind, items);
  home.dirty = true;
  refreshAll();
}

const inLensRefs = (refs) => refs.filter((r) => { const e = entryFor(r); return e && (home.lens === 'all' || e.lens === home.lens); });

async function placeAct(act, ref, btn) {
  const entry = entryFor(ref);
  if (!entry || !home.places) return;
  const lens = entry.lens || '';
  const today = inLensRefs(home.places.today);
  const later = inLensRefs(home.places.week.map((w) => w.ref));
  const inToday = today.includes(ref); const inLater = later.includes(ref);
  const positions = (list, kind) => list.map((r, i) => ({ kind, ref: r, note: i + 1 }));
  let kind = 'today'; let items = [];
  if (act === 'today') {
    items = [{ kind: 'today', ref, note: today.length + 1 }, ...(inLater ? [{ kind: 'next-week', ref, note: 'out' }] : [])];
  } else if (act === 'next-week') {
    kind = 'next-week';
    items = [{ kind: 'next-week', ref, note: 0 }, ...(inToday ? [{ kind: 'today', ref, note: 'out' }] : [])];
  } else if (act === 'week') {
    kind = inLater ? 'next-week' : 'today';
    items = [...(inToday ? [{ kind: 'today', ref, note: 'out' }] : []), ...(inLater ? [{ kind: 'next-week', ref, note: 'out' }] : [])];
    if (!items.length) return;
  } else if (act === 'keep') {
    kind = 'next-week';
    items = [{ kind: 'next-week', ref, note: 'keep' }];
  } else if (act === 'up' || act === 'down') {
    const list = inToday ? today : later;
    kind = inToday ? 'today' : 'next-week';
    const i = list.indexOf(ref); const j = act === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    items = positions(list, kind);
  } else return;
  if (btn) btn.disabled = true;
  try {
    await placeWrite(kind, items, lens);
    note(act === 'today' ? `${ref} is next up today.` : act === 'next-week' ? `${ref} waits for next week.` : act === 'week' ? `${ref} is back in This week.` : act === 'keep' ? `Kept ${ref} for next week.` : 'Reordered.');
  } catch (err) {
    note(writeError(err), true);
    refreshAll();
  }
}

// A dragged row lands before the row it is dropped on; the whole list's positions are written.
let dragging = null;
els.doc.addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-cc-drag]');
  if (!item) return;
  dragging = item.dataset.ccDrag;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragging);
});
els.doc.addEventListener('dragover', (e) => {
  const item = e.target.closest('[data-cc-drag]');
  if (!item || !dragging || item.dataset.ccDrag === dragging) return;
  e.preventDefault();
  for (const el of els.doc.querySelectorAll('.cc-item.drag-over')) el.classList.remove('drag-over');
  item.classList.add('drag-over');
});
els.doc.addEventListener('dragend', () => { for (const el of els.doc.querySelectorAll('.cc-item.drag-over')) el.classList.remove('drag-over'); });
els.doc.addEventListener('drop', async (e) => {
  const item = e.target.closest('[data-cc-drag]');
  if (!item || !dragging || !home.places) return;
  e.preventDefault();
  const target = item.dataset.ccDrag; const moved = dragging; dragging = null;
  const today = inLensRefs(home.places.today);
  const inToday = today.includes(moved);
  const list = inToday ? today : inLensRefs(home.places.week.map((w) => w.ref));
  if (!list.includes(target) || moved === target) return;
  list.splice(list.indexOf(moved), 1);
  list.splice(list.indexOf(target), 0, moved);
  const kind = inToday ? 'today' : 'next-week';
  try { await placeWrite(kind, list.map((r, i) => ({ kind, ref: r, note: i + 1 })), entryFor(moved)?.lens || ''); note('Reordered.'); } catch (err) { note(writeError(err), true); refreshAll(); }
});

els.doc.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cc-place]');
  if (!btn || !home.view) return;
  e.preventDefault();
  placeAct(btn.dataset.ccPlace, btn.dataset.ref, btn);
});

// A Someday line promoted back into the Inbox for clarifying (Brain DEV-61026.35).
els.doc.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cc-promote]');
  if (!btn || !home.view) return;
  e.preventDefault();
  const { ccLine: line, ccProject: project } = btn.dataset;
  const row = (home.view.someday || []).find((r) => (r.raw || r.text) === line && r.home === `project:${project}`);
  if (!row) return;
  btn.disabled = true;
  try {
    await write('/promote', { project, line });
    home.view.someday = home.view.someday.filter((r) => r !== row);
    home.view.inbox = [{ kind: 'line', text: row.text, raw: row.text, details: {}, family: row.family, home: row.home, date: perthDay().today, path: row.path, ref: null, lens: row.lens }, ...(home.view.inbox || [])];
    note(`${row.text} is back in the Inbox to clarify.`);
  } catch (err) {
    note(writeError(err), true);
  }
  refreshAll();
});

function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  try { return decodeURI(raw) || HOME; } catch { return HOME; }
}

// `#/<file>?item=<id>` from a home row: the card or item to scroll to once the file shows.
function currentItem() {
  const query = location.hash.split('?')[1] || '';
  return new URLSearchParams(query).get('item');
}

// The H3 whose attribute line carries this id, highlighted and scrolled into view.
function jumpToItem(ref) {
  const value = ref.toLowerCase();
  const field = [...els.doc.querySelectorAll('code.field[data-key="id"]')].find((f) => f.dataset.value === value);
  const h3 = field?.closest('p')?.previousElementSibling;
  if (!h3 || h3.tagName !== 'H3') return false;
  h3.classList.add('target');
  h3.scrollIntoView({ block: 'start' });
  return true;
}

// ---- queue and register writes ---------------------------------------------------
// The only edits this page makes: mark a groomed card done, add an Inbox line, and
// confirm or reject what a daily routine flagged in the register. Everything else in
// Brain goes through a Claude session.

const QUEUE_PATH = /^projects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/QUEUE\.md$/;

function addQueueControls(path) {
  const slug = path.match(QUEUE_PATH)?.[1];
  const inbox = slug && [...els.doc.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Inbox');
  if (!inbox) return;

  // Groomed cards are the H3s above the Inbox; each carries its id in a `id: …` code span.
  for (const h3 of els.doc.querySelectorAll('h3')) {
    if (!(h3.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    let id = null;
    for (let el = h3.nextElementSibling; el && !/^H[1-3]$/.test(el.tagName) && !id; el = el.nextElementSibling) {
      for (const code of el.querySelectorAll('code')) {
        const m = code.dataset.key === 'id' && code.textContent.match(/^id\s*(\S+)$/);
        if (m) { id = m[1]; break; }
      }
    }
    // Date-based ids (DEV-61025.14) or, from before brain-021, `<slug>-NNN`.
    if (!id || !(/^(?:\?|[A-Z]+(?:-[A-Z]+)?)-\d{5}\.\d{2,3}$/.test(id) || id.startsWith(`${slug}-`))) continue;
    const ctl = document.createElement('span');
    ctl.className = 'card-act';
    ctl.dataset.id = id;
    ctl.innerHTML = actsHtml(ctl);
    h3.append(' ', ctl);
  }

  let end = inbox;
  while (end.nextElementSibling && !/^H[12]$/.test(end.nextElementSibling.tagName)) end = end.nextElementSibling;
  const form = document.createElement('form');
  form.className = 'inbox-add';
  form.dataset.project = slug;
  form.innerHTML = '<input type="text" name="text" maxlength="500" required autocomplete="off" ' +
    'placeholder="Add to inbox…" aria-label="Add to inbox">' +
    '<button type="submit" class="text-btn">Add</button>' +
    '<p class="write-msg" role="status" hidden></p>';
  end.after(form);
}

const REGISTER_PATH = 'register/open-items.md';
const REGISTER_ID = /^(?:P-)?(?:\?|[A-Z]+(?:-[A-Z]+)?)-\d{5}\.\d{2,3}$/;
// What a daily routine flags for confirmation (Brain D-42), and how each reads here.
const FLAGS = { unconfirmed: 'New item', 'close-proposed': 'Close proposed' };

function actsHtml(ctl) {
  const flag = ctl.dataset.flag;
  if (!flag) return '<button type="button" class="mini-btn" data-act="done">Done</button>';
  return `<span class="flag-k">${FLAGS[flag]}</span>` +
    '<button type="button" class="mini-btn primary" data-act="confirm">Confirm</button>' +
    '<button type="button" class="mini-btn" data-act="reject-ask">Reject…</button>';
}

// On the register, each flagged item gets Confirm and Reject per flag, and the page opens
// with a list of everything waiting, each entry jumping to its item.
function addRegisterControls(path) {
  if (path !== REGISTER_PATH) return;
  const waiting = [];
  for (const h3 of els.doc.querySelectorAll('h3')) {
    const attrs = h3.nextElementSibling;
    if (!attrs || attrs.tagName !== 'P') continue;
    const field = (key) => attrs.querySelector(`code.field[data-key="${key}"]`);
    const id = field('id')?.textContent.match(/^id\s*(\S+)$/)?.[1];
    const state = field('state')?.dataset.value;
    if (!id || !REGISTER_ID.test(id) || state === 'done' || state === 'rejected') continue;
    const title = h3.textContent.trim();
    for (const flag of Object.keys(FLAGS)) {
      if (!field(flag)) continue;
      const ctl = document.createElement('span');
      ctl.className = 'card-act';
      ctl.dataset.id = id;
      ctl.dataset.flag = flag;
      ctl.innerHTML = actsHtml(ctl);
      h3.append(' ', ctl);
      waiting.push({ h3, title, id, flag });
    }
  }
  if (!waiting.length) return;
  const count = (flag) => waiting.filter((w) => w.flag === flag).length;
  const box = document.createElement('section');
  box.className = 'reg-todo';
  box.innerHTML = `<p><strong>To confirm or reject:</strong> ${count('unconfirmed')} new, ${count('close-proposed')} close proposed.</p><ul>` +
    waiting.map((w, i) => `<li><button type="button" class="jump" data-jump="${i}">${escapeHtml(w.title)}</button>` +
      ` <code>${escapeHtml(w.id)}</code> <span class="flag-k">${FLAGS[w.flag]}</span></li>`).join('') + '</ul>';
  box.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) waiting[Number(jump.dataset.jump)].h3.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  (els.doc.querySelector('h1') || els.doc.firstChild).after(box);
}

function setMessage(el, text, bad = true) {
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('bad', bad);
}

function writeError(err) {
  if (err?.kind === 'signin') return 'Signed out. Reload to sign in again.';
  if (err?.kind === 'offline') return 'Can’t reach Brain. Try again.';
  return err?.status === 409 ? `Not saved: ${err.kind}.` : `Not saved: ${err?.kind || 'error'}.`;
}

// A write refreshes the tree pinned to the commit just made (GitHub can briefly serve the
// branch head from before it) without a full reload: the home keeps this page's patched
// copy of the view until Brain renders a new one, and a file page re-shows its new text.
async function write(route, body) {
  const { commit } = await api(route, body);
  home.dirty = true;
  await refreshTree(commit);
  return commit;
}

async function refreshTree(commit) {
  try {
    state.tree = await api(commit ? `/tree?commit=${encodeURIComponent(commit)}` : '/tree');
  } catch (err) {
    if (err?.kind === 'signin') showError(err);
    return; // the page's own copy stays; the next load catches up
  }
  state.paths = new Set(state.tree.files.map((f) => f.path));
  renderFoot();
  if (homeTab()) {
    const entry = state.tree.files.find((f) => f.path === VIEW_PATH);
    if (entry && entry.sha !== home.sha) await showHome(homeTab()); // Brain rendered a new view
    else renderHome();
  } else {
    await show(currentPath());
  }
}

els.doc.addEventListener('click', async (e) => {
  const btn = e.target.closest('.card-act button');
  if (!btn) return;
  const ctl = btn.closest('.card-act');
  const act = btn.dataset.act;
  if (act === 'done') {
    ctl.innerHTML = `<span class="confirm">Mark ${escapeHtml(ctl.dataset.id)} done?</span>` +
      '<button type="button" class="mini-btn primary" data-act="yes">Yes</button>' +
      '<button type="button" class="mini-btn" data-act="cancel">Cancel</button>';
    ctl.querySelector('[data-act="yes"]').focus();
  } else if (act === 'reject-ask') {
    // Reject asks first, like Done; Confirm is one tap.
    ctl.innerHTML = `<span class="confirm">Reject ${escapeHtml(ctl.dataset.id)}${ctl.dataset.flag === 'close-proposed' ? '’s proposed close' : ''}?</span>` +
      '<button type="button" class="mini-btn primary" data-act="reject">Yes</button>' +
      '<button type="button" class="mini-btn" data-act="cancel">Cancel</button>';
    ctl.querySelector('[data-act="reject"]').focus();
  } else if (act === 'cancel') {
    ctl.innerHTML = actsHtml(ctl);
  } else if (act === 'confirm' || act === 'reject') {
    for (const b of ctl.querySelectorAll('button')) b.disabled = true;
    try {
      await write(`/${act}`, { id: ctl.dataset.id, flag: ctl.dataset.flag });
    } catch (err) {
      ctl.innerHTML = `<span class="write-err">${escapeHtml(writeError(err))}</span>` +
        '<button type="button" class="mini-btn" data-act="cancel">OK</button>';
    }
  } else if (act === 'yes') {
    for (const b of ctl.querySelectorAll('button')) b.disabled = true;
    const project = state.current.match(QUEUE_PATH)[1];
    try {
      await write('/done', { project, id: ctl.dataset.id });
    } catch (err) {
      ctl.innerHTML = `<span class="write-err">${escapeHtml(writeError(err))}</span>` +
        '<button type="button" class="mini-btn" data-act="cancel">OK</button>';
    }
  }
});

els.doc.addEventListener('submit', async (e) => {
  const form = e.target.closest('.inbox-add');
  if (!form) return;
  e.preventDefault();
  const input = form.elements.text;
  const msg = form.querySelector('.write-msg');
  const text = input.value.trim();
  if (!text) { setMessage(msg, 'Type something first.'); return; }
  for (const el of form.elements) el.disabled = true;
  setMessage(msg, 'Saving…', false);
  // The same card as the home's add box (Brain D-110 A), then the page shows the new line.
  try {
    const commit = await added(form, { project: form.dataset.project, text });
    await refreshTree(commit);
  } catch (err) {
    for (const el of form.elements) el.disabled = false;
    setMessage(msg, writeError(err));
  }
});

// ---- the task card and its clock (Brain D-96 C, D-97 A, D-98 A) -------------------------
// Tapping a task opens its card. Its clock starts only when Leon presses Start, which
// writes a `started` row on Brain's daily log; Stop writes the `tracked` row, and Add time
// writes an `entered` row for time he did not clock. Closing the card leaves the clock
// running, shown in a bar; any screen reading the daily log sees the same clock. One
// clock runs at a time. Finishing a task shows the reward and moves the next hot item up.

let clock = null; // { ref, title, area, lens, date, start, startMs, written, pending }
// `walk` is the Inbox tab's question walk over a raw line (Brain DEV-61026.33), which an
// added line opens at once (D-110 A folded in).
const task = { ref: null, panel: '', message: '', reward: null, sort: null, back: null, walk: null };
let families = [];

const modal = document.createElement('div');
modal.className = 'tk-wrap';
modal.hidden = true;
modal.innerHTML = '<div class="tk-scrim" data-tk="hide"></div><section class="tk" role="dialog" aria-modal="true" aria-labelledby="tk-title"></section>';
const bar = document.createElement('div');
bar.className = 'clock-bar';
bar.hidden = true;
bar.setAttribute('role', 'status');
document.body.append(modal, bar);

function projectSlugs() {
  return state.tree ? state.tree.files.map((f) => f.path.match(QUEUE_PATH)?.[1]).filter(Boolean).sort() : [];
}

const entryFor = (ref) => home.view?.entries.find((e) => e.ref === ref) || null;

function renderTask() {
  if (task.walk) {
    modal.querySelector('.tk').innerHTML = walkHtml(task.walk, { families, message: task.message });
    modal.hidden = false;
    return;
  }
  if (task.sort) {
    modal.querySelector('.tk').innerHTML = categoriseHtml(task.sort, { families, message: task.message, back: Boolean(task.back) });
    modal.hidden = false;
    return;
  }
  if (task.reward) {
    modal.querySelector('.tk').innerHTML = rewardHtml(task.reward);
    modal.hidden = false;
    return;
  }
  const entry = task.ref && entryFor(task.ref);
  if (!entry) { modal.hidden = true; task.ref = null; return; }
  const panel = task.panel ? taskPanel(task.panel, entry) : '';
  modal.querySelector('.tk').innerHTML = taskHtml(entry, { clock, panel, message: task.message, focal: currentFocal() });
  modal.hidden = false;
}

function renderClock() {
  bar.hidden = !clock || !modal.hidden;
  bar.innerHTML = clock ? clockBarHtml(clock, entryFor(clock.ref)) : '';
}

function refreshAll() {
  renderTask();
  renderClock();
  if (home.view && homeTab()) renderHome();
}

setInterval(() => {
  if (clock) for (const el of document.querySelectorAll('[data-tk-time]')) el.textContent = fmtElapsed(clock);
  const w = task.walk;
  if (w && w.step === 'doing' && w.startedMs) {
    const left = TWO_MINUTES_MS - (Date.now() - w.startedMs);
    for (const el of document.querySelectorAll('[data-wk-count]')) { el.textContent = fmtCountdown(left); el.closest('.tk-clock')?.classList.toggle('over', left < 0); }
  }
}, 1000);

function openTask(ref) {
  if (!entryFor(ref)) return;
  Object.assign(task, { ref, panel: '', message: '', reward: null, sort: null, back: null, walk: null });
  refreshAll();
}

async function loadFamilies() {
  if (families.length || !state.paths.has('context/families.md')) return;
  try { families = parseFamilies(await fileText('context/families.md')); } catch { /* the form falls back to the line's own family */ }
  renderTask();
}

// The question walk over a raw Inbox line (Brain DEV-61026.33).
function openWalk(row) {
  Object.assign(task, { ref: null, panel: '', message: '', reward: null, sort: null, back: null, walk: { row, step: 'actionable', a: {}, history: [], asking: null } });
  refreshAll();
  loadFamilies();
}

// The categorisation card (Brain D-100 B), with the family list read from Brain.
// `from` is the task whose card it was opened from (its ref), or `{ added }` for a line just
// added, so Back and Cancel return there.
async function openSort(target, from = null) {
  if (target.kind === 'item' && !target.entry) return;
  Object.assign(task, { ref: null, panel: '', message: '', reward: null, sort: target, back: from, walk: null });
  refreshAll();
  await loadFamilies();
}

const placeOf = (entry) => ({ area: entry.lens === 'work' ? entry.area || '' : '', lens: entry.lens || '' });

// Starting is deliberate, but the start row waits out the first minute (Brain D-114 A):
// a clock stopped before then records nothing, so an accidental open leaves no row.
function startClock(entry) {
  const { today, hhmm } = perthDay();
  const next = { ref: entry.ref, title: entry.title, ...placeOf(entry), date: today, start: hhmm, startMs: Date.now(), written: false, pending: null };
  next.pending = setTimeout(() => { if (clock === next) commitStart(next); }, CLOCK_GRACE_MS);
  clock = next;
  task.message = '';
  refreshAll();
}

async function commitStart(c) {
  c.pending = null;
  c.writing = api('/clock', { action: 'start', ref: c.ref, title: c.title, area: c.area, lens: c.lens, start: c.start })
    .then(() => { c.written = true; })
    .catch((err) => { if (clock === c) { task.message = `Clock not saved: ${writeError(err)}`; refreshAll(); } })
    .finally(() => { c.writing = null; });
  await c.writing;
}

// Stops the running clock; false when it could not be saved (it then keeps running).
async function stopClock() {
  const c = clock;
  if (!c) return true;
  clock = null;
  if (c.pending) clearTimeout(c.pending);
  if (c.writing) await c.writing;
  if (c.written) {
    try {
      await api('/clock', { action: 'stop', ref: c.ref, title: c.title, area: c.area, lens: c.lens, start: c.start, date: c.date });
      task.message = `Recorded ${fmtMinutes(clockMinutes(c))} on ${c.ref}.`;
      loadTime();
    } catch (err) {
      clock = c;
      task.message = `Clock not saved: ${writeError(err)}`;
      refreshAll();
      return false;
    }
  } else {
    task.message = clockRecords(c) ? 'Clock not saved, so nothing was recorded.' : 'Under a minute, so nothing was recorded.';
  }
  refreshAll();
  return true;
}

// Leon's one thing for today (Brain D-113 A): one `focal` row on the daily log, read live
// by every screen. An empty ref goes back to the brief's pick.
async function setFocal(entry, clear = false) {
  for (const b of modal.querySelectorAll('button')) b.disabled = true;
  const ref = clear ? '' : entry.ref;
  const lens = entry.lens || '';
  try {
    await api('/focal', { ref, lens });
    const { today, hhmm } = perthDay();
    home.focal = { ref };
    if (home.time) home.time.rows.push({ date: today, kind: 'focal', start: hhmm, end: '', minutes: 0, ref, area: '', lens, note: '' });
    task.message = clear ? 'Back to the brief’s pick.' : 'Saved as your pick for today.';
  } catch (err) {
    task.message = writeError(err);
  }
  refreshAll();
}

// This week's time rows from the daily log: actuals for the Allocation tab, and a clock
// started on another screen.
async function loadTime() {
  const { monday, today } = perthDay();
  try {
    const body = await api(`/time?from=${timeFrom()}`);
    home.time = { rows: body.rows, monday };
    home.focal = latestFocal(body.rows, today);
    home.places = placements(body.rows, today);
    // A clock from a bygone day is not still running: only recent rows decide.
    const open = openClock(body.rows.filter((r) => r.date >= monday));
    if (open && !(clock && clock.ref === open.ref && clock.start === open.start) && (!clock || clock.written)) {
      clock = { ref: open.ref, title: open.note, area: open.area, lens: open.lens, date: open.date, start: open.start,
        startMs: Date.parse(`${open.date}T${open.start}:00+08:00`), written: true };
    } else if (!open && clock && clock.written) {
      clock = null; // stopped on another screen
    }
  } catch (err) {
    home.time = { rows: [], monday, error: writeError(err).replace(/^Not saved: /, '') };
  }
  refreshAll();
}

// A finished task leaves this page's copy of the view at once and the next hot item moves
// up; Brain regenerates the view within a minute or two of the commit.
function dropFromView(ref) {
  promoteNext(home.view, ref);
}

// Minutes recorded against a task today, from the daily log's rows.
function minutesToday(ref) {
  const { today } = perthDay();
  return (home.time?.rows || []).filter((r) => r.ref === ref && r.date === today && r.kind !== 'started' && r.kind !== 'planned')
    .reduce((n, r) => n + (r.minutes || 0), 0);
}

function doneTodayCount() {
  const key = `brain.done.${perthDay().today}`;
  let n = 1;
  try { n = Number(localStorage.getItem(key) || 0) + 1; localStorage.setItem(key, String(n)); } catch { /* private mode */ }
  return n;
}

// The task is done: drop it, show the reward, and offer the item now in focus.
function celebrate(entry, clockedNow) {
  const minutes = minutesToday(entry.ref) + clockedNow;
  dropFromView(entry.ref);
  const slot = home.view.lenses[home.lens] || home.view.lenses.all;
  const next = slot.focal ? entryFor(slot.focal.ref) : null;
  task.reward = { title: entry.title, ref: entry.ref, minutes, today: doneTodayCount(), next };
  task.ref = null;
  refreshAll();
}

// Stops this task's clock if it is the one running; returns the minutes it ran, or null
// when the stop could not be saved.
async function stopIfMine(entry) {
  if (!clock || clock.ref !== entry.ref) return 0;
  const ran = clockMinutes(clock);
  return (await stopClock()) ? ran : null;
}

function hideTask() {
  Object.assign(task, { ref: null, panel: '', reward: null, sort: null, back: null, walk: null });
  refreshAll();
}

// A one-line note on the bar, back on the home.
function note(text, bad = false) {
  bar.hidden = false;
  bar.innerHTML = `<span class="cb-t${bad ? ' bad' : ''}">${escapeHtml(text)}</span><button type="button" class="mini-btn" data-cb="dismiss">OK</button>`;
}

// ---- settling what a routine flagged, from a row or a card (Brain D-42, D-112 A) ------------
// This page's copy of the view follows each write until Brain renders the next view.

function applyConfirmed(ref) {
  const landed = ref.replace(/^P-/, '');
  const swap = (r) => (r === ref ? landed : r);
  for (const slot of Object.values(home.view.lenses)) {
    slot.hot = slot.hot.map(swap);
    slot.claude = slot.claude.map(swap);
    if (slot.focal && slot.focal.ref === ref) slot.focal.ref = landed;
    slot.quiet.unconfirmed = slot.quiet.unconfirmed.filter((r) => r !== ref);
    for (const k of ['close_proposed', 'needs_review_date', 'no_owner']) slot.quiet[k] = slot.quiet[k].map(swap);
  }
  home.view.inbox = (home.view.inbox || []).filter((r) => !(r.kind === 'unconfirmed' && r.ref === ref)).map((r) => (r.ref === ref ? { ...r, ref: landed } : r));
  const entry = entryFor(ref);
  if (entry) { entry.flags = (entry.flags || []).filter((f) => f !== 'unconfirmed'); entry.ref = landed; }
  if (clock && clock.ref === ref) clock.ref = landed;
  if (task.ref === ref) task.ref = landed;
  if (home.focal && home.focal.ref === ref) home.focal.ref = landed;
  return landed;
}

// Closed or rejected: the item leaves this page's lists and the next hot item moves up.
function applyGone(ref) {
  dropFromView(ref);
  home.view.inbox = (home.view.inbox || []).filter((r) => r.ref !== ref);
  if (task.ref === ref) task.ref = null;
}

function applyKept(ref) {
  const entry = entryFor(ref);
  if (entry) entry.flags = (entry.flags || []).filter((f) => f !== 'close-proposed');
  for (const slot of Object.values(home.view.lenses)) slot.quiet.close_proposed = slot.quiet.close_proposed.filter((r) => r !== ref);
  home.view.inbox = (home.view.inbox || []).filter((r) => !(r.kind === 'close' && r.ref === ref));
}

// Confirm, close, reject and keep from a row (D-112 A); Reject and Keep open ask first.
els.doc.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cc-act], [data-cc-batch]');
  if (!btn || !home.view) return;
  e.preventDefault();
  if (btn.dataset.ccBatch) return settleAll(btn.dataset.ccBatch, btn.dataset.ids.split(',').filter(Boolean), btn);
  const { ccAct: act, ref } = btn.dataset;
  const entry = entryFor(ref);
  const box = btn.closest('.cc-acts');
  if (!entry || !box) return;
  if (act === 'reject-ask' || act === 'keep-ask') { box.outerHTML = rowActs(entry, act === 'reject-ask' ? 'reject' : 'keep'); return; }
  if (act === 'cancel') { box.outerHTML = rowActs(entry); return; }
  for (const b of box.querySelectorAll('button')) b.disabled = true;
  try {
    if (act === 'confirm') {
      await write('/confirm', { id: ref, flag: 'unconfirmed' });
      note(`Confirmed as ${applyConfirmed(ref)}.`);
    } else if (act === 'close') {
      const ran = await stopIfMine(entry);
      if (ran === null) return;
      await write('/confirm', { id: ref, flag: 'close-proposed' });
      applyGone(ref);
      note(`Closed ${ref}.`);
    } else if (act === 'reject') {
      if (clock && clock.ref === ref) await stopClock();
      await write('/reject', { id: ref, flag: 'unconfirmed' });
      applyGone(ref);
      note(`Rejected ${ref}.`);
    } else if (act === 'keep') {
      await write('/reject', { id: ref, flag: 'close-proposed' });
      applyKept(ref);
      note(`Kept ${ref} open.`);
    }
  } catch (err) {
    note(writeError(err), true);
  }
  refreshAll();
});

// "Confirm all N" and "Close all N": one commit; a batch the Worker refused names the ids
// that changed since the page loaded, and the page catches up.
async function settleAll(flag, ids, btn) {
  if (!ids.length) return;
  btn.disabled = true;
  try {
    await write('/confirm-all', { ids, flag });
    for (const id of ids) { if (flag === 'unconfirmed') applyConfirmed(id); else applyGone(id); }
    note(`${flag === 'unconfirmed' ? 'Confirmed' : 'Closed'} ${ids.length}.`);
  } catch (err) {
    const changed = err?.body?.ids;
    note(changed ? `Not saved: ${changed.length} of ${ids.length} changed since the page loaded (${changed.join(', ')}). Catching up.` : writeError(err), true);
    if (changed) { home.sha = null; await refreshTree(); }
  }
  refreshAll();
}

// After a save, this page's copy follows until Brain regenerates the view.
function afterSort(target, d) {
  const today = perthDay().today;
  if (target.kind === 'line') {
    const row = (home.view.inbox || []).find((r) => r === target || ((r.raw || r.text) === (target.raw || target.text) && r.home === target.home));
    if (row) Object.assign(row, { text: d.title || row.text, details: { ...d, categorised: today } });
    return 'Saved. It becomes a card at the next groom.';
  }
  const e = target.entry;
  const number = e.ref.match(/-(\d{5}\.\d{2,3})$/)[1];
  const landed = `${d.family}-${number}`;
  for (const slot of Object.values(home.view.lenses)) {
    slot.quiet.unconfirmed = slot.quiet.unconfirmed.filter((r) => r !== e.ref);
    slot.hot = slot.hot.map((r) => (r === e.ref ? landed : r));
    if (slot.focal && slot.focal.ref === e.ref) slot.focal.ref = landed;
  }
  home.view.inbox = (home.view.inbox || []).filter((r) => !(r.kind === 'unconfirmed' && r.ref === e.ref));
  if (clock && clock.ref === e.ref) clock.ref = landed;
  Object.assign(e, { ref: landed, title: d.title || e.title, next: d.next, owner: d.owner, due: d.due || 'unknown',
    minutes: d.minutes ? String(d.minutes) : e.minutes, flags: (e.flags || []).filter((f) => f !== 'unconfirmed') });
  return `Saved as ${landed}.`;
}

modal.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-tk]');
  if (!btn) return;
  const entry = entryFor(task.ref);
  const act = btn.dataset.tk;
  if (act === 'next') return openTask(btn.dataset.ref);
  if (act === 'categorise' && entry) return openSort({ kind: 'item', entry }, entry.ref);
  if (act === 'back') {
    const from = task.back;
    Object.assign(task, { sort: null, ref: typeof from === 'string' ? from : null, back: null, message: '' });
    return refreshAll();
  }
  if (act === 'file') { task.ref = null; modal.hidden = true; renderClock(); return; }
  if (act === 'hide' || !entry) return hideTask();
  if (act === 'stop') { await stopClock(); return; }
  if (act === 'start') { startClock(entry); return; }
  if (act === 'switch') { if (await stopClock()) startClock(entry); return; }
  if (act === 'focal-set' || act === 'focal-clear') { await setFocal(entry, act === 'focal-clear'); return; }
  if (act === 'cancel') { task.panel = ''; return renderTask(); }
  if (act === 'confirm-close' || act === 'reject-close') {
    for (const b of modal.querySelectorAll('button')) b.disabled = true;
    try {
      if (act === 'confirm-close') {
        const ran = await stopIfMine(entry);
        if (ran === null) return;
        await write('/confirm', { id: entry.ref, flag: 'close-proposed' });
        return celebrate(entry, ran);
      }
      await write('/reject', { id: entry.ref, flag: 'close-proposed' });
      applyKept(entry.ref);
      task.message = 'Kept open.';
    } catch (err) {
      task.message = writeError(err);
    }
    return refreshAll();
  }
  if (act === 'done-ask' || act === 'progress-ask' || act === 'time-ask' || act === 'reject-ask') {
    task.panel = { 'done-ask': 'done', 'progress-ask': 'progress', 'time-ask': 'time', 'reject-ask': 'reject' }[act];
    task.message = '';
    renderTask();
    modal.querySelector('textarea, input, [data-tk="done"], [data-tk="reject"]')?.focus();
    return;
  }
  if (act === 'confirm' || act === 'reject') {
    // The register's own Confirm and Reject (Brain DEV-61025.13), from the card.
    for (const b of modal.querySelectorAll('button')) b.disabled = true;
    try {
      if (act === 'reject' && clock && clock.ref === entry.ref) await stopClock();
      const ref = entry.ref;
      await write(`/${act}`, { id: ref, flag: 'unconfirmed' });
      if (act === 'reject') applyGone(ref);
      else task.message = `Confirmed as ${applyConfirmed(ref)}.`;
    } catch (err) {
      task.message = writeError(err);
    }
    return refreshAll();
  }
  if (act === 'done') {
    for (const b of modal.querySelectorAll('button')) b.disabled = true;
    const ran = await stopIfMine(entry);
    if (ran === null) return;
    try {
      await write('/done', { project: projectOf(entry), id: entry.ref });
      celebrate(entry, ran);
    } catch (err) {
      task.message = writeError(err);
      renderTask();
    }
  }
});

const lineBody = (row) => ({ project: projectOf(row), line: row.raw || row.text });
const dropLine = (row) => { home.view.inbox = (home.view.inbox || []).filter((r) => !(r.kind === 'line' && (r.raw || r.text) === (row.raw || row.text) && r.home === row.home)); };

modal.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-wk]');
  const w = task.walk;
  if (!btn || !w) return;
  const act = btn.dataset.wk;
  const go = (step) => { w.history.push(w.step); w.step = step; w.asking = null; task.message = ''; renderTask(); modal.querySelector('input:not([type=radio]):not([type=checkbox])')?.focus(); };
  if (act === 'hide') return hideTask();
  if (act === 'back') { w.step = w.history.pop() || 'actionable'; w.asking = null; task.message = ''; return renderTask(); }
  if (act === 'cancel') { w.asking = null; return renderTask(); }
  if (act === 'yes') return go('action');
  if (act === 'trash-ask') { w.asking = 'trash'; return renderTask(); }
  if (act === 'two-yes') { w.startedMs = Date.now(); return go('doing'); }
  if (act === 'two-no' || act === 'carry-on') return go('delegate');
  if (act === 'deleg-none') { w.a.owner = 'leon'; w.a.ai = ''; w.a.handover = false; return go('details'); }
  if (act === 'deleg-claude') { w.a.owner = 'leon'; w.a.ai = 'prepare'; w.a.handover = false; return go('details'); }
  if (act === 'deleg-person') { w.asking = 'person'; renderTask(); modal.querySelector('#wk-owner')?.focus(); return; }
  if (act === 'someday' || act === 'reference' || act === 'trash') {
    for (const b of modal.querySelectorAll('button')) b.disabled = true;
    try {
      await write(`/${act}`, lineBody(w.row));
      if (act === 'reference') { const row = (home.view.inbox || []).find((r) => r.kind === 'line' && (r.raw || r.text) === (w.row.raw || w.row.text) && r.home === w.row.home); if (row) row.details = { reference: perthDay().today }; }
      else dropLine(w.row);
      home.dirty = true;
      hideTask();
      note(act === 'someday' ? 'Parked in Someday.' : act === 'reference' ? 'Kept as reference; the next groom files it.' : 'Trashed.');
    } catch (err) {
      task.message = writeError(err);
      renderTask();
    }
  }
});

// "Several" reveals the Outcome field.
modal.addEventListener('change', (e) => {
  const w = task.walk;
  if (w && e.target.matches('input[name="kind"]')) {
    w.a.next = modal.querySelector('#wk-next')?.value ?? w.a.next;
    w.a.outcome = modal.querySelector('#wk-outcome')?.value ?? w.a.outcome;
    w.a.kind = e.target.value;
    renderTask();
    if (w.a.kind === 'project') modal.querySelector('#wk-outcome')?.focus();
  }
});

modal.addEventListener('submit', async (e) => {
  const wform = e.target.closest('[data-wk-form]');
  const w = task.walk;
  if (wform && w) {
    e.preventDefault();
    const f = wform.elements;
    const go = (step) => { w.history.push(w.step); w.step = step; w.asking = null; task.message = ''; renderTask(); };
    if (wform.dataset.wkForm === 'action') {
      w.a.next = f.next.value.trim();
      w.a.kind = f.kind.value;
      w.a.outcome = f.outcome.value.trim();
      const check = actionCheck(w.a.next);
      if (!check.ok) { task.message = ''; renderTask(); modal.querySelector('#wk-next')?.focus(); return; } // the form shows the note
      if (w.a.kind === 'project' && !w.a.outcome) { task.message = 'Not yet: a project needs an outcome.'; return renderTask(); }
      return go('two');
    }
    if (wform.dataset.wkForm === 'person') {
      w.a.owner = f.owner.value.trim().toLowerCase() || 'leon';
      w.a.due = f.due.value;
      w.a.handover = f.handover.checked;
      w.a.ai = '';
      return go('details');
    }
    for (const el of f) el.disabled = true;
    if (wform.dataset.wkForm === 'done') {
      // Under two minutes and done: the time is recorded and the line leaves the inbox.
      const minutes = Math.max(15, Math.round(Number(f.minutes.value) / 15) * 15);
      try {
        const lens = w.row.lens || (home.lens === 'all' ? 'work' : home.lens);
        await api('/hours', { minutes, lens, note: `${w.a.next || w.row.text} (${w.row.text})`.slice(0, 120) });
        loadTime();
        return handled(w.row, minutes);
      } catch (err) {
        task.message = writeError(err);
        return renderTask();
      }
    }
    // details: save for the groom
    Object.assign(w.a, { family: f.family.value, priority: f.priority.value, minutes: f.minutes.value, due: f.due.value });
    const details = walkDetails(w, w.row.text);
    try {
      await write('/categorise', { ...lineBody(w.row), details });
      const row = (home.view.inbox || []).find((r) => r.kind === 'line' && (r.raw || r.text) === (w.row.raw || w.row.text) && r.home === w.row.home);
      if (row) Object.assign(row, { details: { ...details, categorised: perthDay().today } });
      hideTask();
      note('Saved. It becomes a card at the next groom.');
    } catch (err) {
      task.message = writeError(err);
      renderTask();
    }
    return;
  }
  const form = e.target.closest('[data-tk-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.tkForm === 'categorise') {
    const target = task.sort;
    const f = form.elements;
    const d = { title: f.title.value.trim(), next: f.next.value.trim(), family: f.family.value, priority: f.priority ? f.priority.value : '',
      minutes: f.minutes.value ? Number(f.minutes.value) : null, due: f.due.value, owner: f.owner.value.trim().toLowerCase() || 'leon' };
    for (const el of f) el.disabled = true;
    try {
      const body = target.kind === 'line' ? { project: projectOf(target), line: target.raw || target.text, details: d } : { id: target.entry.ref, details: d };
      await write('/categorise', body);
      const done = afterSort(target, d);
      // Opened from a task's card: return to it (under its new id once confirmed).
      const fromTask = typeof task.back === 'string';
      Object.assign(task, { sort: null, ref: fromTask ? target.entry.ref : null, back: null, message: fromTask ? done : '' });
      refreshAll();
      if (!fromTask) { // back on the home: say so in the bar
        bar.hidden = false;
        bar.innerHTML = `<span class="cb-t">${escapeHtml(done)}</span><button type="button" class="mini-btn" data-cb="dismiss">OK</button>`;
      }
    } catch (err) {
      task.message = writeError(err);
      renderTask();
    }
    return;
  }
  const entry = entryFor(task.ref);
  if (!entry) return;
  if (form.dataset.tkForm === 'time') {
    const minutes = Math.round(Number(form.elements.minutes.value) / 15) * 15;
    if (!(minutes > 0)) return;
    for (const el of form.elements) el.disabled = true;
    try {
      await api('/hours', { minutes, ref: entry.ref, ...placeOf(entry), note: entry.title });
      task.panel = '';
      task.message = `Added ${fmtMinutes(minutes)} to ${entry.ref}.`;
      await loadTime();
    } catch (err) {
      task.message = writeError(err);
      for (const el of form.elements) el.disabled = false;
      renderTask();
    }
    return;
  }
  const text = form.elements.text.value.trim();
  if (!text) return;
  for (const el of form.elements) el.disabled = true;
  const closing = form.dataset.tkForm === 'close' || form.dataset.tkForm === 'decide';
  try {
    if (closing) {
      const ran = await stopIfMine(entry);
      if (ran === null) { for (const el of form.elements) el.disabled = false; return; }
      await write(`/${form.dataset.tkForm}`, { id: entry.ref, text });
      return celebrate(entry, ran);
    } else {
      const card = closeKind(entry) === 'card';
      await write('/progress', { id: entry.ref, text, ...(card ? { project: projectOf(entry) } : {}) });
      task.panel = '';
      task.message = 'Progress saved.';
    }
    refreshAll();
  } catch (err) {
    task.message = writeError(err);
    for (const el of form.elements) el.disabled = false;
    renderTask();
  }
});

bar.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-cb]')?.dataset.cb;
  if (act === 'open' && clock) openTask(clock.ref);
  if (act === 'dismiss') renderClock();
  if (act === 'stop') await stopClock();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) hideTask();
});

// A line added on the home shows at once and its card opens (Brain D-110 A), with no
// reload: the view lists it once Brain regenerates, within a minute or two.
async function added(form, body) {
  const { commit } = await api('/inbox', body);
  home.dirty = true;
  if (!home.view) { // added from a queue page before the home was opened
    const entry = state.tree.files.find((f) => f.path === VIEW_PATH);
    if (!entry) throw new ApiError('no view');
    home.view = stashedView(entry.sha) || refreshDue(JSON.parse(await fileText(VIEW_PATH)), perthDay().today);
    home.sha = entry.sha;
    home.lens = home.lens || openingLens(home.view.work_hours, storedLens());
  }
  const home_ = `project:${body.project}`;
  const kin = [...(home.view.inbox || []), ...home.view.entries].find((r) => r.home === home_);
  const row = { kind: 'line', text: body.text, raw: body.text, details: {}, family: kin?.family || '?', home: home_,
    date: perthDay().today, path: `projects/${body.project}/QUEUE.md`, ref: null, lens: kin?.lens || (home.lens === 'all' ? 'work' : home.lens) };
  home.view.inbox = [row, ...(home.view.inbox || [])];
  if (homeTab()) renderHome(homeTab()); else stashView();
  openWalk(row);
  return commit;
}

// Done inside two minutes: the line leaves the inbox and the reward shows.
async function handled(row, minutes = 0) {
  for (const b of modal.querySelectorAll('button')) b.disabled = true;
  try {
    await write('/handled', lineBody(row));
  } catch (err) {
    task.message = writeError(err);
    return renderTask();
  }
  dropLine(row);
  home.dirty = true;
  if (homeTab()) renderHome(homeTab()); else stashView();
  const slot = home.view.lenses[home.lens] || home.view.lenses.all;
  const next = slot.focal ? entryFor(slot.focal.ref) : null;
  Object.assign(task, { walk: null, message: '', reward: { title: row.text, ref: `Inbox · ${row.home}`, minutes, today: doneTodayCount(), next } });
  refreshAll();
}

// The inbox box on the home and hours entered on the Allocation tab.
els.doc.addEventListener('submit', async (e) => {
  const inbox = e.target.closest('.cc-inbox-add');
  const hours = e.target.closest('.cc-hours');
  if (!inbox && !hours) return;
  e.preventDefault();
  const form = inbox || hours;
  const msg = form.querySelector('.write-msg');
  let route; let body;
  if (inbox) {
    const text = form.elements.text.value.trim();
    if (!text) { setMessage(msg, 'Type something first.'); return; }
    route = '/inbox';
    body = { project: form.elements.project.value, text };
  } else {
    const minutes = Math.round((Number(form.elements.hours.value) * 60) / 15) * 15;
    if (!(minutes > 0)) { setMessage(msg, 'Enter hours, in quarter hours.'); return; }
    const [area, lens] = form.elements.where.value.split('|');
    route = '/hours';
    body = { minutes, area, lens, note: form.elements.note.value.trim() };
  }
  for (const el of form.elements) el.disabled = true;
  setMessage(msg, 'Saving…', false);
  try {
    if (inbox) {
      await added(form, body);
    } else {
      await api(route, body);
      await loadTime();
    }
  } catch (err) {
    for (const el of form.elements) el.disabled = false;
    setMessage(msg, writeError(err));
  }
});

// `commit` (after a write) loads that exact commit; otherwise the branch head.
async function load(commit = null) {
  els.doc.innerHTML = '<p class="status">Loading Brain…</p>';
  try {
    state.tree = await api(typeof commit === 'string' && commit ? `/tree?commit=${encodeURIComponent(commit)}` : '/tree');
  } catch (err) {
    showError(err);
    els.nav.innerHTML = '';
    return;
  }
  state.paths = new Set(state.tree.files.map((f) => f.path));
  renderFoot();
  // Statuses come from INDEX.md; fetch it in the background if we didn't land on it.
  if ((homeTab() || currentPath() !== HOME) && state.paths.has(HOME)) {
    fileText(HOME).then((t) => { readStatuses(t); renderNav(); }).catch(() => {});
  }
  await route();
  if (!home.time) loadTime(); // the week's time rows and any clock running elsewhere
}

function openSide() {
  els.shell.classList.add('side-open');
  els.scrim.hidden = false;
  els.menu.setAttribute('aria-expanded', 'true');
  els.filter.focus();
}

function closeSide() {
  if (!els.shell.classList.contains('side-open')) return;
  els.shell.classList.remove('side-open');
  els.scrim.hidden = true;
  els.menu.setAttribute('aria-expanded', 'false');
}

window.addEventListener('hashchange', () => { if (state.tree) route(); });
els.filter.addEventListener('input', () => { if (state.tree) renderNav(); });
els.filter.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = els.nav.querySelector('a');
    if (first) location.hash = first.getAttribute('href');
  }
  if (e.key === 'Escape') { els.filter.value = ''; renderNav(); els.filter.blur(); }
});
els.refresh.addEventListener('click', () => { home.time = null; load(); });
els.menu.addEventListener('click', openSide);
els.sideClose.addEventListener('click', closeSide);
els.scrim.addEventListener('click', closeSide);
els.doc.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="reload"]')) location.reload();
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== els.filter && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    if (window.matchMedia('(max-width: 860px)').matches) openSide();
    else els.filter.focus();
  }
  if (e.key === 'Escape') closeSide();
});

els.doc.tabIndex = -1;
load();
