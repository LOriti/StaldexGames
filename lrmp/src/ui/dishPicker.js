import { MODES, MODE_BY_KEY } from '../data/modes.js';
import { dishPool } from '../data/dishes.js';
import { DAY_NAMES, sameWeekDishes, defaultExtraFor, paintDay } from '../core/plan.js';
import { get, commit } from '../state.js';
import { $, escapeAttr, toast } from './dom.js';
import { closeRecipe } from './recipeModal.js';

/**
 * Tap-an-empty-day dish picker (Weekly view). Two clicks: mode → dish. The mode step IS
 * the filter — you never scroll all 40+ dishes. Favourites float to the top; dishes
 * already planned this week are marked but still pickable.
 */
export function openDishPicker(idx, { onNote } = {}) {
  renderModeStep(idx, onNote);
  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function dayLabel(idx) {
  return `Wk ${Math.floor(idx / 7) + 1} · ${DAY_NAMES[idx % 7]}`;
}

function renderModeStep(idx, onNote) {
  const body = $('#modalBody');
  body.innerHTML = `
    <div class="m-eyebrow">${dayLabel(idx)}</div>
    <h3 class="m-title">Plan dinner</h3>
    <div class="pick-modes">
      ${MODES.map((m) => `
        <button class="pick-mode" data-mode="${m.key}" style="--gc:${m.color}">
          <span class="pick-ico">${m.ico}</span>
          <span class="pick-name">${m.name}</span>
          <span class="pick-desc">${m.desc}</span>
        </button>`).join('')}
    </div>
    <div class="m-edit-row">
      <button class="m-editbtn" data-note="1">✎ Just write a note (e.g. dinner out)</button>
    </div>`;

  body.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => renderDishStep(idx, b.dataset.mode, onNote);
  });
  body.querySelector('[data-note]').onclick = () => {
    closeRecipe();
    onNote?.();
  };
}

function renderDishStep(idx, modeKey, onNote) {
  const s = get();
  const mode = MODE_BY_KEY[modeKey];
  const used = sameWeekDishes(s.plan, idx);

  // Favourites first, then the rest — both in pool order.
  const pool = dishPool(modeKey);
  const dishes = [
    ...pool.filter((d) => s.favourites.has(d.n)),
    ...pool.filter((d) => !s.favourites.has(d.n)),
  ];

  const rows = dishes.map((d) => `
    <button class="pick-row" data-dish="${escapeAttr(d.n)}" style="--gc:${mode.color}">
      <span class="pick-dish">${s.favourites.has(d.n) ? '★ ' : ''}${d.n}</span>
      <span class="pick-tags">
        ${d.p ? `<span class="tag">${d.p}</span>` : ''}
        ${d.t ? `<span class="tag">${d.t}</span>` : ''}
        ${used.has(d.n) ? '<span class="tag wk">this week</span>' : ''}
      </span>
    </button>`).join('');

  const body = $('#modalBody');
  body.innerHTML = `
    <div class="m-eyebrow" style="color:${mode.color}">${mode.ico} ${mode.name} · ${dayLabel(idx)}</div>
    <h3 class="m-title">Pick a dish</h3>
    <div class="pick-list">${rows || '<p class="m-meta">No dishes in this mode — add one from the Recipes tab.</p>'}</div>
    <div class="m-edit-row">
      <button class="m-editbtn" data-back="1">‹ Back</button>
      <button class="m-editbtn" data-random="1">🎲 Surprise me</button>
    </div>`;

  body.querySelectorAll('[data-dish]').forEach((b) => {
    b.onclick = () => {
      const name = b.dataset.dish;
      s.plan[idx].dinner = { cat: modeKey, dish: name, src: 'cook', extra: defaultExtraFor(name) };
      commit({ plan: true });
      closeRecipe();
      toast(`${name} planned for ${DAY_NAMES[idx % 7]}`);
    };
  });
  body.querySelector('[data-back]').onclick = () => renderModeStep(idx, onNote);
  body.querySelector('[data-random]').onclick = () => {
    paintDay(s.plan, idx, modeKey);
    commit({ plan: true });
    closeRecipe();
    toast(`${s.plan[idx].dinner.dish ?? 'Nothing'} planned for ${DAY_NAMES[idx % 7]}`);
  };
}
