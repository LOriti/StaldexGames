// Brain viewer — window onto the private Brain repo, plus narrow QUEUE and register edits.
// Data comes from /api/brain (worker-brain/), behind Cloudflare Access.

import { escapeHtml, parseFrontmatter, renderMarkdown, resolvePath } from './markdown.js?v=20261026b';
import {
  VIEW_PATH, LENSES, defaultLens, homeHtml, perthDay, openClock, taskHtml, taskPanel, clockBarHtml, projectOf,
  closeKind, fmtElapsed, fmtMinutes, clockMinutes, rewardHtml, promoteNext, categoriseHtml, parseFamilies,
} from './home.js?v=20261027f';

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
const home = { view: null, sha: null, lens: null, filter: null, time: null, inboxAll: false };

function homeTab() {
  const match = /^#(?:\/)?(focus|priority|clarify|allocation)?$/.exec(location.hash || '#');
  return match ? (match[1] || 'focus') : null;
}

function storedLens() {
  try {
    const saved = JSON.parse(localStorage.getItem('brain.lens') || 'null');
    return saved && saved.day === new Date().toDateString() && LENSES.includes(saved.lens) ? saved.lens : null;
  } catch { return null; }
}

function storeLens(lens) {
  try { localStorage.setItem('brain.lens', JSON.stringify({ lens, day: new Date().toDateString() })); } catch { /* private mode */ }
}

class ApiError extends Error {
  constructor(kind, status) {
    super(kind);
    this.kind = kind;
    this.status = status;
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
  if (!res.ok || !body) throw new ApiError(body?.error || `HTTP ${res.status}`, res.status);
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
      home.view = JSON.parse(await fileText(VIEW_PATH));
      home.sha = entry.sha;
    }
    home.lens = home.lens || storedLens() || defaultLens(home.view.work_hours);
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
    today: perthDay().today,
  });
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
      if (row) openSort({ ...row, kind: 'line' });
    }
    return;
  }
  const el = e.target.closest('[data-cc-lens], [data-cc-context], [data-cc-area], [data-cc-clear], [data-cc-inbox-all]');
  if (!el || !home.view) return;
  const d = el.dataset;
  if (d.ccInboxAll) { home.inboxAll = true; return renderHome(); }
  if (d.ccLens) { home.lens = d.ccLens; home.filter = null; storeLens(d.ccLens); return renderHome(); }
  if (d.ccClear) { home.filter = null; return renderHome(); }
  home.filter = d.ccContext ? { type: 'context', value: d.ccContext } : { type: 'area', value: d.ccArea };
  if (location.hash === '#priority') renderHome('priority');
  else location.hash = '#priority';
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

async function write(route, body) {
  const { commit } = await api(route, body);
  // Reload pinned to the commit just made: GitHub can briefly serve the branch head from
  // before it, which would hide the change.
  await load(commit);
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
  try {
    await write('/inbox', { project: form.dataset.project, text });
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

let clock = null; // { ref, title, area, lens, date, start, startMs, written }
const task = { ref: null, panel: '', message: '', reward: null, sort: null };
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
  if (task.sort) {
    modal.querySelector('.tk').innerHTML = categoriseHtml(task.sort, { families, message: task.message });
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
  modal.querySelector('.tk').innerHTML = taskHtml(entry, { clock, panel, message: task.message });
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
  if (!clock) return;
  for (const el of document.querySelectorAll('[data-tk-time]')) el.textContent = fmtElapsed(clock);
}, 1000);

function openTask(ref) {
  if (!entryFor(ref)) return;
  Object.assign(task, { ref, panel: '', message: '', reward: null, sort: null });
  refreshAll();
}

// The categorisation card (Brain D-100 B), with the family list read from Brain.
async function openSort(target) {
  if (target.kind === 'item' && !target.entry) return;
  Object.assign(task, { ref: null, panel: '', message: '', reward: null, sort: target });
  refreshAll();
  if (!families.length && state.paths.has('context/families.md')) {
    try { families = parseFamilies(await fileText('context/families.md')); } catch { /* the card falls back to the item's own family */ }
    if (task.sort === target) renderTask();
  }
}

const placeOf = (entry) => ({ area: entry.lens === 'work' ? entry.area || '' : '', lens: entry.lens || '' });

// Starting is deliberate, so the start row is written at once.
async function startClock(entry) {
  const { today, hhmm } = perthDay();
  const next = { ref: entry.ref, title: entry.title, ...placeOf(entry), date: today, start: hhmm, startMs: Date.now(), written: false };
  try {
    await api('/clock', { action: 'start', ref: next.ref, title: next.title, area: next.area, lens: next.lens, start: next.start });
    next.written = true;
    clock = next;
    task.message = '';
  } catch (err) {
    task.message = `Clock not saved: ${writeError(err)}`;
  }
  refreshAll();
}

// Stops the running clock; false when it could not be saved (it then keeps running).
async function stopClock() {
  const c = clock;
  if (!c) return true;
  clock = null;
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
    task.message = 'Under a minute, so nothing was recorded.';
  }
  refreshAll();
  return true;
}

// This week's time rows from the daily log: actuals for the Allocation tab, and a clock
// started on another screen.
async function loadTime() {
  const { monday } = perthDay();
  try {
    const body = await api(`/time?from=${monday}`);
    home.time = { rows: body.rows, monday };
    const open = openClock(body.rows);
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
  Object.assign(task, { ref: null, panel: '', reward: null, sort: null });
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
  if (act === 'categorise' && entry) return openSort({ kind: 'item', entry });
  if (act === 'file') { task.ref = null; modal.hidden = true; renderClock(); return; }
  if (act === 'hide' || !entry) return hideTask();
  if (act === 'stop') { await stopClock(); return; }
  if (act === 'start') { await startClock(entry); return; }
  if (act === 'switch') { if (await stopClock()) await startClock(entry); return; }
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
      for (const slot of Object.values(home.view.lenses)) slot.quiet.close_proposed = slot.quiet.close_proposed.filter((r) => r !== entry.ref);
      entry.flags = (entry.flags || []).filter((f) => f !== 'close-proposed');
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
      await write(`/${act}`, { id: entry.ref, flag: 'unconfirmed' });
      if (act === 'reject') {
        if (clock && clock.ref === entry.ref) await stopClock();
        dropFromView(entry.ref);
        task.ref = null;
      } else {
        // Confirming drops the `P-`; this page's copy follows until Brain regenerates the view.
        const landed = entry.ref.replace(/^P-/, '');
        for (const slot of Object.values(home.view.lenses)) {
          slot.hot = slot.hot.map((r) => (r === entry.ref ? landed : r));
          if (slot.focal && slot.focal.ref === entry.ref) slot.focal.ref = landed;
          slot.quiet.unconfirmed = slot.quiet.unconfirmed.filter((r) => r !== entry.ref);
          slot.quiet.close_proposed = slot.quiet.close_proposed.map((r) => (r === entry.ref ? landed : r));
        }
        entry.flags = (entry.flags || []).filter((f) => f !== 'unconfirmed');
        if (clock && clock.ref === entry.ref) clock.ref = landed;
        entry.ref = landed;
        task.ref = landed;
        task.message = `Confirmed as ${landed}.`;
      }
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

modal.addEventListener('submit', async (e) => {
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
      Object.assign(task, { sort: null, ref: null });
      refreshAll();
      bar.hidden = false;
      bar.innerHTML = `<span class="cb-t">${escapeHtml(done)}</span><button type="button" class="mini-btn" data-cb="dismiss">OK</button>`;
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
  const closing = form.dataset.tkForm === 'close';
  try {
    if (closing) {
      const ran = await stopIfMine(entry);
      if (ran === null) { for (const el of form.elements) el.disabled = false; return; }
      await write('/close', { id: entry.ref, text });
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
      await write(route, body);
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
