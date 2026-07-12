import { MODES } from '../data/modes.js';
import { DISHES } from '../data/dishes.js';
import { get, toggleFavourite } from '../state.js';
import { escapeAttr } from './dom.js';
import { openRecipe } from './recipeModal.js';

const LEFTOVER_TAG = {
  keeps: ['keeps', 'lo'],
  fresh: ['fresh', 'fr'],
  parts: ['parts', 'pt'],
};

export function renderRecipes(root) {
  const { favourites } = get();

  root.innerHTML = MODES.map((mode) => {
    const dishes = DISHES[mode.key] ?? [];
    const cards = dishes.map((d) => {
      const [label, cls] = LEFTOVER_TAG[d.l];
      const starred = favourites.has(d.n);
      return `
        <div class="docket" style="--gc:${mode.color}">
          <div class="dk-top">
            <div class="dk-name">${d.n}</div>
            <button class="star ${starred ? 'on' : ''}" data-fav="${escapeAttr(d.n)}"
                    aria-pressed="${starred}" aria-label="Favourite ${escapeAttr(d.n)}">${starred ? '★' : '☆'}</button>
          </div>
          <div class="dk-meta">
            <span class="tag">${d.p}</span>
            <span class="tag">${d.t}</span>
            <span class="tag ${cls}">${label}</span>
          </div>
          <div class="dk-engine">${d.e}</div>
          <button class="rec-link" data-rec="${escapeAttr(d.n)}">📖 Recipe</button>
        </div>`;
    }).join('');

    return `
      <section class="group" style="--gc:${mode.color}">
        <div class="group-head" style="--gc:${mode.color}">
          <span class="group-name">${mode.name}</span>
          <span class="group-desc">${mode.ico} ${mode.desc}</span>
          <span class="group-count">${dishes.length} recipes</span>
        </div>
        <div class="dockets">${cards}</div>
      </section>`;
  }).join('');

  root.onclick = (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) return toggleFavourite(fav.dataset.fav);
    const rec = e.target.closest('[data-rec]');
    if (rec) openRecipe(rec.dataset.rec);
  };
}
