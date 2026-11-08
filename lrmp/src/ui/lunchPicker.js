import { MODE_BY_KEY } from '../data/modes.js';
import { metaOf, allDishNames } from '../data/dishes.js';
import { allocate } from '../core/allocate.js';
import { MAX_LUNCH_NAME, clearManualLunch, manualAt, setFrozenLunch, setManualLunch } from '../core/lunches.js';
import { dateForIndex, formatDate, formatDay } from '../core/timeline.js';
import { get, commit } from '../state.js';
import { $, escapeAttr, toast } from './dom.js';
import { closeRecipe } from './recipeModal.js';

const colourOf = (dish) => {
  const info = metaOf(dish);
  return info ? MODE_BY_KEY[info.mode].color : '#888';
};

/**
 * Tap-a-lunch picker (Weekly view). Adds a lunch by hand: type anything ("sandwich",
 * "work lunch"), pick a dish from the suggestions, or take a portion out of the freezer.
 * A hand-added lunch eats no leftover, so whatever was derived for that day moves on to
 * a later lunch. See core/lunches.js.
 */
export function openLunchPicker(idx) {
  render(idx);
  $('#recipeModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function render(idx) {
  const s = get();
  const date = dateForIndex(idx, s.planAnchor);
  const current = allocate(s.plan, s.lunchPins, s.manualLunches).lunch[idx];
  const manual = manualAt(s.manualLunches, idx);

  let now = '<p class="m-meta">No lunch on this day yet.</p>';
  if (manual) {
    now = `<p class="m-meta">Right now: <strong>${escapeAttr(manual.name)}</strong> · ${manual.frozen ? 'from the freezer' : 'added by you'}.</p>`;
  } else if (current && !current.unfulfilled) {
    now = `<p class="m-meta">Right now: <strong>${escapeAttr(current.dish)}</strong> leftovers. Adding something else keeps that portion for a later lunch.</p>`;
  } else if (current?.unfulfilled) {
    now = `<p class="m-meta">Right now: a pin for <strong>${escapeAttr(current.dish)}</strong> that has no portion yet. Adding a lunch replaces the pin.</p>`;
  }

  const frozen = Object.keys(s.freezer).filter((k) => s.freezer[k] > 0);
  const freezerRows = frozen.map((k) => `
    <button class="pick-row" data-frozen="${escapeAttr(k)}" style="--gc:${colourOf(k)}">
      <span class="pick-dish">❄ ${escapeAttr(k)}</span>
      <span class="pick-tags"><span class="tag">×${s.freezer[k]}</span></span>
    </button>`).join('');

  const options = allDishNames().map((n) => `<option value="${escapeAttr(n)}"></option>`).join('');

  const body = $('#modalBody');
  body.innerHTML = `
    <div class="m-eyebrow">Lunch · ${formatDay(date)} ${formatDate(date)}</div>
    <h3 class="m-title">${manual ? 'Change lunch' : 'Add a lunch'}</h3>
    ${now}
    <div class="m-form lunch-form">
      <label class="m-lab">What's for lunch
        <input class="m-in" data-lunch-name list="lunchOptions" maxlength="${MAX_LUNCH_NAME}"
               placeholder="e.g. Tuna salad, eating out" value="${escapeAttr(manual && !manual.frozen ? manual.name : '')}">
      </label>
      <datalist id="lunchOptions">${options}</datalist>
      <div class="m-edit-row">
        <button class="m-editbtn save" data-lunch-save>Add lunch</button>
        ${manual ? '<button class="m-editbtn" data-lunch-clear>🗑 Remove this lunch</button>' : ''}
      </div>
    </div>
    ${frozen.length ? `
      <div class="m-eyebrow lunch-sub">Or take one from the freezer</div>
      <div class="pick-list">${freezerRows}</div>` : ''}`;

  const input = body.querySelector('[data-lunch-name]');
  const save = () => {
    const st = get();
    if (!setManualLunch(st.manualLunches, st.freezer, st.lunchPins, idx, input.value)) {
      input.focus();
      return toast('Type a lunch first');
    }
    commit({ lunches: true, pins: true, freezer: true });
    closeRecipe();
    toast(`Lunch added for ${formatDay(date)}`);
  };
  body.querySelector('[data-lunch-save]').onclick = save;
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') save();
  };

  const clear = body.querySelector('[data-lunch-clear]');
  if (clear) {
    clear.onclick = () => {
      const st = get();
      const wasFrozen = manualAt(st.manualLunches, idx)?.frozen;
      clearManualLunch(st.manualLunches, st.freezer, idx);
      commit({ lunches: true, freezer: true });
      closeRecipe();
      toast(wasFrozen ? 'Lunch removed — portion back in the freezer' : 'Lunch removed');
    };
  }

  body.querySelectorAll('[data-frozen]').forEach((b) => {
    b.onclick = () => {
      const st = get();
      const dish = b.dataset.frozen;
      if (!setFrozenLunch(st.manualLunches, st.freezer, st.lunchPins, idx, dish)) return toast('None left in the freezer');
      commit({ lunches: true, pins: true, freezer: true });
      closeRecipe();
      toast(`${dish} out of the freezer for ${formatDay(date)} lunch`);
    };
  });

  // Phones: don't pop the keyboard over the freezer list unless there's no list.
  if (!frozen.length && window.matchMedia?.('(pointer:fine)').matches) input.focus();
}
