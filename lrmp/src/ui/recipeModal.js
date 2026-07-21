import { RECIPES } from '../data/recipes.js';
import { metaOf, customEntry, allDishNames } from '../data/dishes.js';
import { MODE_BY_KEY } from '../data/modes.js';
import { ingredientsOf, isEdited, editOf, recipeServes, PORTIONS_PER_SERVE } from '../core/recipes.js';
import { get, commit } from '../state.js';
import { $, $$, escapeAttr, toast } from './dom.js';

export function openRecipe(name) {
  const info = metaOf(name);
  const custom = customEntry(name);
  const recipe = RECIPES[name] ?? custom;
  const mode = info ? MODE_BY_KEY[info.mode] : null;
  const colour = mode ? mode.color : 'var(--curry)';
  const body = $('#modalBody');
  const { recipeEdits } = get();

  if (!recipe) {
    body.innerHTML = `<h3 class="m-title">${name}</h3><p class="m-meta">No recipe yet.</p>`;
  } else {
    const ing = ingredientsOf(name, recipeEdits);
    const edited = isEdited(name, recipeEdits);
    const makes = recipeServes(name, recipeEdits);
    const steps = recipe.steps ?? [];
    const servesOptions = [1, 2, 3, 4, 5, 6]
      .map((n) => `<option value="${n}" ${n === makes ? 'selected' : ''}>${n}</option>`).join('');
    body.innerHTML = `
      <div class="m-eyebrow" style="color:${colour}">${mode ? `${mode.ico} ${mode.name}` : ''}${custom ? ' · your recipe' : ''}</div>
      <h3 class="m-title">${name}</h3>
      <div class="m-meta">${info && (info.dish.p || info.dish.t) ? [info.dish.p, info.dish.t].filter(Boolean).join(' · ') : ''}</div>
      <div class="m-serves">As written this makes
        <select class="m-serves-sel" id="servesSel" aria-label="Serves this recipe makes">${servesOptions}</select>
        <b>serve${makes === 1 ? '' : 's'} = ${makes * PORTIONS_PER_SERVE} portions</b> (1 serve = ${PORTIONS_PER_SERVE} portions).
        ${makes > 1
          ? `Planning it defaults to ${(makes - 1) * PORTIONS_PER_SERVE} leftovers — dinner eats one serve.`
          : 'The shopping list scales quantities by how much you cook.'}</div>
      <div class="m-cols" style="--gc:${colour}">
        <div class="m-ing">
          <h4>Ingredients ${edited ? '<span class="m-edited">edited</span>' : ''}</h4>
          <ul>${ing.map((x) => `<li>${x}</li>`).join('')}</ul>
          <div class="m-edit-row">
            ${custom
              ? '<button class="m-editbtn" data-editcustom="1">✎ Edit recipe</button>'
              : '<button class="m-editbtn" data-edit="1">✎ Edit ingredients</button>'}
            ${edited ? '<button class="m-editbtn" data-restore="1">Restore original</button>' : ''}
          </div>
        </div>
        <div class="m-step"><h4>Method</h4>${
          steps.length ? `<ol>${steps.map((x) => `<li>${x}</li>`).join('')}</ol>`
                       : '<p class="m-meta">No method written down.</p>'
        }</div>
      </div>
      ${recipe.note ? `<div class="m-note">${recipe.note}</div>` : ''}`;

    body.querySelector('#servesSel').onchange = (ev) => {
      setMakesServes(name, Number(ev.target.value), Boolean(custom));
      openRecipe(name);
    };
    const editIng = body.querySelector('[data-edit]');
    if (editIng) editIng.onclick = () => openIngredientEditor(name, ing);
    const editCustom = body.querySelector('[data-editcustom]');
    if (editCustom) editCustom.onclick = () => openRecipeForm(custom.mode, name);
    const restore = body.querySelector('[data-restore]');
    if (restore) {
      restore.onclick = () => {
        delete get().recipeEdits[name];
        commit({ recipes: true });
        toast('Original recipe restored');
        openRecipe(name);
      };
    }
  }

  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

/** Persist how many serves a recipe's written quantities make. */
function setMakesServes(name, serves, isCustom) {
  const s = get();
  if (isCustom) {
    s.customRecipes[name].serves = serves;
    commit({ customs: true });
  } else {
    const cur = editOf(s.recipeEdits, name) ?? {};
    if (serves === 1) delete cur.serves;
    else cur.serves = serves;
    if (!Array.isArray(cur.ing) && cur.serves == null) delete s.recipeEdits[name];
    else s.recipeEdits[name] = cur;
    commit({ recipes: true });
  }
  toast(`Makes ${serves} serve${serves === 1 ? '' : 's'} now`);
}

/** Swap the ingredient list for a one-line-per-ingredient editor (built-in recipes). */
function openIngredientEditor(name, current) {
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
    const cur = editOf(s.recipeEdits, name) ?? {};
    if (!lines.length || lines.join('\n') === original.join('\n')) {
      delete cur.ing; // empty or identical to the book — no ingredient edit to keep
    } else {
      cur.ing = lines;
    }
    if (!Array.isArray(cur.ing) && cur.serves == null) delete s.recipeEdits[name];
    else s.recipeEdits[name] = cur;
    commit({ recipes: true });
    toast('Ingredients saved');
    openRecipe(name);
  };
  wrap.querySelector('[data-cancel]').onclick = () => openRecipe(name);
}

/**
 * Add (or edit, when `existingName` is passed) a custom recipe. Renders into the same
 * modal shell as openRecipe. Name is the primary key everywhere, so it's locked when
 * editing — delete + re-add to rename.
 */
export function openRecipeForm(modeKey, existingName = null) {
  const s = get();
  const mode = MODE_BY_KEY[modeKey];
  const existing = existingName ? s.customRecipes[existingName] : null;
  const body = $('#modalBody');

  body.innerHTML = `
    <div class="m-eyebrow" style="color:${mode.color}">${mode.ico} ${mode.name} · ${existing ? 'edit your recipe' : 'new recipe'}</div>
    <h3 class="m-title">${existing ? existingName : 'Add a recipe'}</h3>
    <div class="m-form" style="--gc:${mode.color}">
      ${existing ? '' : `<label class="m-lab">Name<input class="m-in" data-f="name" maxlength="40" placeholder="e.g. Nan's chicken soup"></label>`}
      <div class="m-form-row">
        <label class="m-lab">Protein <span class="m-opt">optional</span><input class="m-in" data-f="p" maxlength="24" value="${escapeAttr(existing?.p ?? '')}" placeholder="e.g. Chicken thigh"></label>
        <label class="m-lab">Prep time <span class="m-opt">optional</span><input class="m-in" data-f="t" maxlength="16" value="${escapeAttr(existing?.t ?? '')}" placeholder="e.g. 25 min"></label>
      </div>
      <label class="m-lab">Makes — how many serves the quantities below yield (1 serve = ${PORTIONS_PER_SERVE} portions; more than 1 auto-sets leftovers when planned)
        <select class="m-in" data-f="serves">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${(existing?.serves ?? 1) === n ? 'selected' : ''}>${n} serve${n === 1 ? '' : 's'} = ${n * PORTIONS_PER_SERVE} portions</option>`).join('')}</select>
      </label>
      <label class="m-lab">Ingredients — one per line, for the serves above
        <textarea class="m-ta" data-f="ing" rows="8" spellcheck="false" placeholder="2 tins chickpeas&#10;2 tins coconut milk&#10;1 onion, diced">${(existing?.ing ?? []).join('\n')}</textarea>
      </label>
      <label class="m-lab">Method — one step per line <span class="m-opt">optional</span>
        <textarea class="m-ta" data-f="steps" rows="5" spellcheck="false" placeholder="Brown the chicken.&#10;Add everything else; simmer.">${(existing?.steps ?? []).join('\n')}</textarea>
      </label>
      <div class="m-edit-row">
        <button class="m-editbtn save" data-save="1">${existing ? 'Save changes' : 'Add recipe'}</button>
        <button class="m-editbtn" data-cancel="1">Cancel</button>
      </div>
    </div>`;

  const val = (f) => body.querySelector(`[data-f="${f}"]`)?.value ?? '';
  const lines = (f) => val(f).split('\n').map((l) => l.trim()).filter(Boolean);

  body.querySelector('[data-save]').onclick = () => {
    const name = existing ? existingName : val('name').trim();
    if (!name) return toast('Give it a name');
    if (!existing && (allDishNames().includes(name) || RECIPES[name])) {
      return toast('A recipe with that name already exists');
    }
    const ing = lines('ing');
    if (!ing.length) return toast('At least one ingredient needed');

    s.customRecipes[name] = {
      mode: modeKey,
      p: val('p').trim(),
      t: val('t').trim(),
      l: existing?.l ?? 'keeps',
      e: existing?.e ?? '',
      serves: Math.max(1, Number(val('serves')) || 1),
      ing,
      steps: lines('steps'),
    };
    commit({ customs: true });
    toast(existing ? 'Recipe updated' : `${name} added to ${mode.name}`);
    openRecipe(name);
  };
  body.querySelector('[data-cancel]').onclick = () => {
    if (existing) openRecipe(existingName);
    else closeRecipe();
  };

  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!existing) body.querySelector('[data-f="name"]').focus();
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
