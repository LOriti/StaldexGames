import { MODES } from '../data/modes.js';
import { DISHES } from '../data/dishes.js';
import { get, toggleFavourite } from '../state.js';
import { escapeAttr } from './dom.js';
import { openRecipe } from './recipeModal.js';
import { isEdited } from '../core/recipes.js';

const LEFTOVER_TAG = {
  keeps: ['keeps', 'lo'],
  fresh: ['fresh', 'fr'],
  parts: ['parts', 'pt'],
};

export function renderRecipes(root) {
  const s = get();
  const { favourites, recipeEdits } = s;

  // Which groups are expanded is per-session UI state. Kept on the store (not persisted)
  // so the nuke-and-rebuild render doesn't snap groups shut when a star is toggled.
  s.openGroups ??= new Set(MODES.map((m) => m.key));

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
            ${isEdited(d.n, recipeEdits) ? '<span class="tag ed">edited</span>' : ''}
          </div>
          <div class="dk-engine">${d.e}</div>
          <button class="rec-link" data-rec="${escapeAttr(d.n)}">📖 Recipe</button>
        </div>`;
    }).join('');

    return `
      <details class="group" data-group="${mode.key}" style="--gc:${mode.color}" ${s.openGroups.has(mode.key) ? 'open' : ''}>
        <summary class="group-head" style="--gc:${mode.color}">
          <span class="group-name">${mode.name}</span>
          <span class="group-desc">${mode.ico} ${mode.desc}</span>
          <span class="group-count">${dishes.length} recipes</span>
          <span class="group-arr">▸</span>
        </summary>
        <div class="dockets">${cards}</div>
      </details>`;
  }).join('');

  root.onclick = (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) return toggleFavourite(fav.dataset.fav);
    const rec = e.target.closest('[data-rec]');
    if (rec) openRecipe(rec.dataset.rec);
  };

  // Remember expand/collapse directly on the store — no emit, the DOM already shows it.
  root.querySelectorAll('details.group').forEach((det) => {
    det.addEventListener('toggle', () => {
      if (det.open) s.openGroups.add(det.dataset.group);
      else s.openGroups.delete(det.dataset.group);
    });
  });
}
