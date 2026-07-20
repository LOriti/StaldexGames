import './styles.css';
import { hydrate, subscribe, get, setUI, snapshot, applyRemote } from './state.js';
import { backend } from './storage/adapter.js';
import { initSync } from './storage/sync.js';
import { renderRecipes } from './ui/recipesView.js';
import { renderMonth } from './ui/monthView.js';
import { renderWeekly } from './ui/weeklyView.js';
import { renderShopping } from './ui/shoppingView.js';
import { initModal } from './ui/recipeModal.js';
import { $, $$, toast } from './ui/dom.js';

const VIEWS = {
  recipes: { el: () => $('#recipesView'), render: renderRecipes },
  month: { el: () => $('#monthView'), render: renderMonth },
  weekly: { el: () => $('#weeklyView'), render: renderWeekly },
  shopping: { el: () => $('#shoppingView'), render: renderShopping },
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

// Passive indicator only — sync is automatic, nothing to configure.
const SYNC_LABELS = { off: '☁ …', ok: '☁ synced', error: '☁ offline' };

function initSyncUI() {
  const el = $('#syncStatus');
  return (status) => { el.textContent = SYNC_LABELS[status] || SYNC_LABELS.off; };
}

async function init() {
  await hydrate();
  initModal();

  $$('#tabBar button').forEach((b) => {
    b.onclick = () => setUI({ tab: b.dataset.tab });
  });

  subscribe(render);
  render();

  if (backend() === 'memory') {
    toast('Storage unavailable — changes will not be saved');
  }

  // Remote sync. Runs after first render so a slow network never blocks the UI;
  // adopting a newer server copy re-renders via emit().
  await initSync({ apply: applyRemote, snapshot, onStatus: initSyncUI() });
}

init();
