import { RECIPES } from '../data/recipes.js';
import { metaOf } from '../data/dishes.js';
import { MODE_BY_KEY } from '../data/modes.js';
import { $, $$ } from './dom.js';

export function openRecipe(name) {
  const info = metaOf(name);
  const recipe = RECIPES[name];
  const mode = info ? MODE_BY_KEY[info.mode] : null;
  const colour = mode ? mode.color : 'var(--curry)';
  const body = $('#modalBody');

  if (!recipe) {
    body.innerHTML = `<h3 class="m-title">${name}</h3><p class="m-meta">No recipe yet.</p>`;
  } else {
    body.innerHTML = `
      <div class="m-eyebrow" style="color:${colour}">${mode ? `${mode.ico} ${mode.name}` : ''}</div>
      <h3 class="m-title">${name}</h3>
      <div class="m-meta">${info ? `${info.dish.p} · ${info.dish.t}` : ''}</div>
      <div class="m-cols" style="--gc:${colour}">
        <div class="m-ing"><h4>Ingredients</h4><ul>${recipe.ing.map((x) => `<li>${x}</li>`).join('')}</ul></div>
        <div class="m-step"><h4>Method</h4><ol>${recipe.steps.map((x) => `<li>${x}</li>`).join('')}</ol></div>
      </div>
      ${recipe.note ? `<div class="m-note">${recipe.note}</div>` : ''}`;
  }

  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

export function closeRecipe() {
  $('#recipeModal').hidden = true;
  document.body.style.overflow = '';
}

export function initModal() {
  $$('#recipeModal [data-close]').forEach((el) => el.addEventListener('click', closeRecipe));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRecipe();
  });
}
