// Brain viewer — window onto the private Brain repo, plus two narrow QUEUE edits.
// Data comes from /api/brain (worker-brain/), behind Cloudflare Access.

import { escapeHtml, parseFrontmatter, renderMarkdown, resolvePath } from './markdown.js';

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
  if (res.status === 503) throw new ApiError('setup', res.status);
  let body = null;
  try { body = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !body) throw new ApiError(body?.error || 'error', res.status);
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
  const { text } = await api(`/file?path=${encodeURIComponent(path)}`);
  state.files.set(entry.sha, text);
  return text;
}

async function show(path) {
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
    } else {
      els.doc.innerHTML = `<h1>${escapeHtml(path.split('/').pop())}</h1>` + renderJson(path, text);
    }
    const title = els.doc.querySelector('h1')?.textContent || label(path);
    document.title = `${title} — Brain`;
    els.doc.focus({ preventScroll: true });
    window.scrollTo(0, 0);
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

function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '');
  try { return decodeURI(raw) || HOME; } catch { return HOME; }
}

// ---- queue writes -------------------------------------------------------------
// The only two edits this page makes: mark a groomed card done, add an Inbox line.
// Everything else in Brain goes through a Claude session.

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
    if (!id || !id.startsWith(`${slug}-`)) continue;
    const ctl = document.createElement('span');
    ctl.className = 'card-act';
    ctl.dataset.id = id;
    ctl.innerHTML = '<button type="button" class="mini-btn" data-act="done">Done</button>';
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
  await api(route, body);
  // The write cleared this isolate's tree cache; ask for a fresh tree anyway in case the
  // next request lands on another one.
  await load(true);
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
  } else if (act === 'cancel') {
    ctl.innerHTML = '<button type="button" class="mini-btn" data-act="done">Done</button>';
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

async function load(fresh = false) {
  els.doc.innerHTML = '<p class="status">Loading Brain…</p>';
  try {
    state.tree = await api(fresh === true ? '/tree?fresh=1' : '/tree');
  } catch (err) {
    showError(err);
    els.nav.innerHTML = '';
    return;
  }
  state.paths = new Set(state.tree.files.map((f) => f.path));
  renderFoot();
  // Statuses come from INDEX.md; fetch it in the background if we didn't land on it.
  if (currentPath() !== HOME && state.paths.has(HOME)) {
    fileText(HOME).then((t) => { readStatuses(t); renderNav(); }).catch(() => {});
  }
  await show(currentPath());
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

window.addEventListener('hashchange', () => { if (state.tree) show(currentPath()); });
els.filter.addEventListener('input', () => { if (state.tree) renderNav(); });
els.filter.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = els.nav.querySelector('a');
    if (first) location.hash = first.getAttribute('href');
  }
  if (e.key === 'Escape') { els.filter.value = ''; renderNav(); els.filter.blur(); }
});
els.refresh.addEventListener('click', () => load());
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
