import { RECIPES } from '../data/recipes.js';
import { metaOf } from '../data/dishes.js';
import { MODE_BY_KEY } from '../data/modes.js';
import { ingredientsOf, isEdited, PORTIONS_PER_SERVE } from '../core/recipes.js';
import { get, commit } from '../state.js';
import { $, $$, toast } from './dom.js';

export function openRecipe(name) {
  const info = metaOf(name);
  const recipe = RECIPES[name];
  const mode = info ? MODE_BY_KEY[info.mode] : null;
  const colour = mode ? mode.color : 'var(--curry)';
  const body = $('#modalBody');
  const { recipeEdits } = get();

  if (!recipe) {
    body.innerHTML = `<h3 class="m-title">${name}</h3><p class="m-meta">No recipe yet.</p>`;
  } else {
    const ing = ingredientsOf(name, recipeEdits);
    const edited = isEdited(name, recipeEdits);
    body.innerHTML = `
      <div class="m-eyebrow" style="color:${colour}">${mode ? `${mode.ico} ${mode.name}` : ''}</div>
      <h3 class="m-title">${name}</h3>
      <div class="m-meta">${info ? `${info.dish.p} · ${info.dish.t}` : ''}</div>
      <div class="m-serves">Quantities are for <b>1 serve = ${PORTIONS_PER_SERVE} portions</b> — the shopping list scales them by how much you're cooking.</div>
      <div class="m-cols" style="--gc:${colour}">
        <div class="m-ing">
          <h4>Ingredients ${edited ? '<span class="m-edited">edited</span>' : ''}</h4>
          <ul>${ing.map((x) => `<li>${x}</li>`).join('')}</ul>
          <div class="m-edit-row">
            <button class="m-editbtn" data-edit="1">✎ Edit ingredients</button>
            ${edited ? '<button class="m-editbtn" data-restore="1">Restore original</button>' : ''}
          </div>
        </div>
        <div class="m-step"><h4>Method</h4><ol>${recipe.steps.map((x) => `<li>${x}</li>`).join('')}</ol></div>
      </div>
      ${recipe.note ? `<div class="m-note">${recipe.note}</div>` : ''}`;

    body.querySelector('[data-edit]').onclick = () => openEditor(name, ing);
    const restore = body.querySelector('[data-restore]');
    if (restore) {
      restore.onclick = () => {
        delete get().recipeEdits[name];
        commit({ recipes: true });
        toast('Original recipe restored');
        openRecipe(name); // re-render the modal with the built-in list
      };
    }
  }

  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

/** Swap the ingredient list for a one-line-per-ingredient editor. */
function openEditor(name, current) {
  const wrap = $('#modalBody .m-ing');
  wrap.innerHTML = `
    <h4>Ingredients — one per line, for 1 serve</h4>
    <textarea class="m-ta" rows="${Math.max(6, current.length + 1)}" spellcheck="false">${current.join('\n')}</textarea>
    <div class="m-edit-row">
      <button class="m-editbtn save" data-save="1">Save</button>
      <button class="m-editbtn" data-cancel="1">Cancel</button>
    </div>`;

  const ta = wrap.querySelector('.m-ta');
  ta.focus();

  wrap.querySelector('[data-save]').onclick = () => {
    const lines = ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
    const s = get();
    const original = RECIPES[name]?.ing ?? [];
    if (!lines.length || lines.join('\n') === original.join('\n')) {
      delete s.recipeEdits[name]; // empty or identical to the book — no edit to keep
    } else {
      s.recipeEdits[name] = lines;
    }
    commit({ recipes: true });
    toast('Ingredients saved');
    openRecipe(name);
  };
  wrap.querySelector('[data-cancel]').onclick = () => openRecipe(name);
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
