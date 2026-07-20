import { MODES } from '../data/modes.js';
import { dishPool, customEntry, removedIn } from '../data/dishes.js';
import { get, commit, toggleFavourite } from '../state.js';
import { escapeAttr, toast } from './dom.js';
import { openRecipe, openRecipeForm } from './recipeModal.js';
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
    const dishes = dishPool(mode.key);
    const removed = removedIn(mode.key);
    const cards = dishes.map((d) => {
      const [label, cls] = LEFTOVER_TAG[d.l] ?? LEFTOVER_TAG.keeps;
      const starred = favourites.has(d.n);
      const custom = Boolean(customEntry(d.n));
      return `
        <div class="docket" style="--gc:${mode.color}">
          <div class="dk-top">
            <div class="dk-name">${d.n}</div>
            <div class="dk-btns">
              <button class="star ${starred ? 'on' : ''}" data-fav="${escapeAttr(d.n)}"
                      aria-pressed="${starred}" aria-label="Favourite ${escapeAttr(d.n)}">${starred ? '★' : '☆'}</button>
              <button class="dk-del" data-del="${escapeAttr(d.n)}" aria-label="Delete ${escapeAttr(d.n)}">✕</button>
            </div>
          </div>
          <div class="dk-meta">
            ${d.p ? `<span class="tag">${d.p}</span>` : ''}
            ${d.t ? `<span class="tag">${d.t}</span>` : ''}
            <span class="tag ${cls}">${label}</span>
            ${custom ? '<span class="tag cu">yours</span>' : ''}
            ${isEdited(d.n, recipeEdits) ? '<span class="tag ed">edited</span>' : ''}
          </div>
          ${d.e ? `<div class="dk-engine">${d.e}</div>` : ''}
          <button class="rec-link" data-rec="${escapeAttr(d.n)}">📖 Recipe</button>
        </div>`;
    }).join('');

    const addTile = `
      <button class="add-docket" data-add="${mode.key}" style="--gc:${mode.color}">
        <span class="add-plus">+</span> Add a ${mode.name} recipe
      </button>`;

    const restoreRow = removed.length
      ? `<button class="restore-rm" data-restoremode="${mode.key}">↩ Restore ${removed.length} removed recipe${removed.length === 1 ? '' : 's'}</button>`
      : '';

    return `
      <details class="group" data-group="${mode.key}" style="--gc:${mode.color}" ${s.openGroups.has(mode.key) ? 'open' : ''}>
        <summary class="group-head" style="--gc:${mode.color}">
          <span class="group-name">${mode.name}</span>
          <span class="group-desc">${mode.ico} ${mode.desc}</span>
          <span class="group-count">${dishes.length} recipes</span>
          <span class="group-arr">▸</span>
        </summary>
        <div class="dockets">${cards}${addTile}</div>
        ${restoreRow}
      </details>`;
  }).join('');

  root.onclick = (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) return toggleFavourite(fav.dataset.fav);

    const rec = e.target.closest('[data-rec]');
    if (rec) return openRecipe(rec.dataset.rec);

    const add = e.target.closest('[data-add]');
    if (add) return openRecipeForm(add.dataset.add);

    const del = e.target.closest('[data-del]');
    if (del) return deleteDish(del.dataset.del);

    const restore = e.target.closest('[data-restoremode]');
    if (restore) {
      const names = new Set(removedIn(restore.dataset.restoremode));
      s.removedDishes = s.removedDishes.filter((n) => !names.has(n));
      toast('Recipes restored');
      return commit({ customs: true });
    }
  };

  // Remember expand/collapse directly on the store — no emit, the DOM already shows it.
  root.querySelectorAll('details.group').forEach((det) => {
    det.addEventListener('toggle', () => {
      if (det.open) s.openGroups.add(det.dataset.group);
      else s.openGroups.delete(det.dataset.group);
    });
  });
}

function deleteDish(name) {
  const s = get();
  if (customEntry(name)) {
    if (!confirm(`Delete "${name}"? Your recipe will be gone for good.`)) return;
    delete s.customRecipes[name];
    delete s.recipeEdits[name];
    s.favourites.delete(name);
    toast(`${name} deleted`);
    commit({ customs: true, recipes: true, favourites: true });
  } else {
    if (!confirm(`Remove "${name}" from your recipes? It leaves the cards and the month shuffle — you can restore it from the bottom of its group.`)) return;
    if (!s.removedDishes.includes(name)) s.removedDishes.push(name);
    toast(`${name} removed`);
    commit({ customs: true });
  }
}
