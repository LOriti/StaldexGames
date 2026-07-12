import './styles.css';
import { NOTES } from './data/notes.js';
import { hydrate, subscribe, get, setUI } from './state.js';
import { backend } from './storage/adapter.js';
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
}

init();
