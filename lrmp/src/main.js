import './styles.css';
import { NOTES } from './data/notes.js';
import { hydrate, subscribe, get, setUI, snapshot, applyRemote } from './state.js';
import { backend } from './storage/adapter.js';
import { initSync, setPassphrase } from './storage/sync.js';
import { renderRecipes } from './ui/recipesView.js';
import { renderMonth } from './ui/monthView.js';
import { renderWeekly } from './ui/weeklyView.js';
import { initModal } from './ui/recipeModal.js';
import { $, $$, toast } from './ui/dom.js';

const VIEWS = {
  recipes: { el: () => $('#recipesView'), render: renderRecipes },
  month: { el: () => $('#monthView'), render: renderMonth },
  weekly: { el: () => $('#weeklyView'), render: renderWeekly },
};

function render() {
  const { tab } = get();
  for (const [name, view] of Object.entries(VIEWS)) {
    const el = view.el();
    el.hidden = name !== tab;
    if (name === tab) view.render(el);
  }
  $$('#tabBar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
}

function renderNotes() {
  $('#notesBody').innerHTML = NOTES.map(
    ([title, body]) => `<div class="note-row"><b>${title}</b><span>${body}</span></div>`
  ).join('');
}

const SYNC_LABELS = { off: '☁ sync off', ok: '☁ synced', error: '☁ sync error' };

function initSyncUI() {
  const btn = $('#syncBtn');
  btn.onclick = async () => {
    const phrase = prompt('Sync passphrase (same on every device; leave empty to turn sync off):');
    if (phrase === null) return; // cancelled
    await setPassphrase(phrase);
    // Simplest correct thing: reboot so initSync runs the pull/push reconcile from scratch.
    location.reload();
  };
  return (status) => { btn.textContent = SYNC_LABELS[status] || SYNC_LABELS.off; };
}

async function init() {
  await hydrate();
  renderNotes();
  initModal();

  $$('#tabBar button').forEach((b) => {
    b.onclick = () => setUI({ tab: b.dataset.tab });
  });

  subscribe(render);
  render();

  if (backend() === 'memory') {
    toast('Storage unavailable — changes will not be saved');
  }

  // Remote sync (optional, off until a passphrase is set). Runs after first render so a
  // slow network never blocks the UI; adopting a newer server copy re-renders via emit().
  await initSync({ apply: applyRemote, snapshot, onStatus: initSyncUI() });
}

init();
