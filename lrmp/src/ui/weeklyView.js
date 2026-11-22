import { MODE_BY_KEY } from '../data/modes.js';
import { metaOf, allDishNames } from '../data/dishes.js';
import { DAY_NAMES, swapDinners, deferDinner, emptyDinner, leftoverDinner } from '../core/plan.js';
import { allocate, groupSurplus } from '../core/allocate.js';
import * as fz from '../core/freezer.js';
import { get, commit, setUI } from '../state.js';
import { escapeAttr, toast, beginDrag } from './dom.js';
import { openRecipe } from './recipeModal.js';
import { openDishPicker } from './dishPicker.js';
import { openLunchPicker } from './lunchPicker.js';
import { renderHistory, weekSegment, wireWeekSegment } from './historyView.js';
import { clearManualLunch, dinnerToLunch, freezeManualLunch, lunchToDinner, manualAt, moveManualLunch } from '../core/lunches.js';
import { carryLeftovers } from '../core/carry.js';

// Appended to a move's toast when its pinned lunches or leftover dinners came along.
const withLeftovers = (msg, carried) => (carried ? `${msg} \u2014 its leftovers moved too` : msg);
import {
  CONTEXT_DAYS, dateForIndex, dayContext, formatDate, formatDay, formatLongDate, formatRange,
} from '../core/timeline.js';

const colourOf = (dish) => {
  const info = metaOf(dish);
  return info ? MODE_BY_KEY[info.mode].color : '#888';
};

/* ---------- tiles ---------- */

/** −/+ leftover stepper. `meal` says whose count it changes: the day's dinner or lunch. */
function stepper(idx, n, meal = 'dinner') {
  return `<span class="lft">
           <button class="st" data-act="dec" data-idx="${idx}" data-meal="${meal}" aria-label="Fewer leftovers">−</button>
           <span class="lft-n">${n}</span>
           <button class="st" data-act="inc" data-idx="${idx}" data-meal="${meal}" aria-label="More leftovers">+</button>
           <span class="lft-l">leftovers</span>
         </span>`;
}

function dinnerTile(plan, idx, left, planAnchor) {
  const d = plan[idx].dinner;

  if (d.dish && d.src === 'leftover') {
    const colour = d.cat && MODE_BY_KEY[d.cat] ? MODE_BY_KEY[d.cat].color : colourOf(d.dish);
    const ok = left && !left.unfulfilled;
    const kind = ok
      ? `🥡 leftovers · from ${formatDay(dateForIndex(left.from, planAnchor))}${left.meal === 'lunch' ? ' lunch' : ''}`
      : '🥡 no portion left by then';
    return `<div class="tile dtile lodin ${ok ? '' : 'lodin-wait'}" data-idx="${idx}" style="--gc:${colour}">
              <button class="nbtn" data-cleardinner="${idx}" aria-label="Send this portion back to lunches">✕</button>
              ${metaOf(d.dish) ? '<button class="rbtn" aria-label="Recipe">📖</button>' : ''}
              <div class="tile-name">${escapeAttr(d.dish)}</div>
              <div class="tile-kind">${kind}</div>
            </div>`;
  }

  if (!d.dish && d.note) {
    return `<div class="tile ntile" data-idx="${idx}">
              <button class="nbtn" data-clearnote="${idx}" aria-label="Clear note">✕</button>
              <div class="tile-name sm">${escapeAttr(d.note)}</div>
              <div class="dctrl">${stepper(idx, d.extra ?? 0)}</div>
            </div>`;
  }
  if (!d.dish) {
    return `<button class="flex empty-day" data-pickday="${idx}">empty — tap to plan<br>a dinner or a note</button>`;
  }

  const colour = d.cat ? MODE_BY_KEY[d.cat].color : '#888';
  const controls =
    d.src === 'freezer'
      ? `<span class="frz-badge">❄ from freezer</span>`
      : stepper(idx, d.extra);

  return `<div class="tile dtile" data-idx="${idx}" style="--gc:${colour}">
            <button class="rbtn" aria-label="Recipe">📖</button>
            <div class="tile-name">${d.dish}</div>
            <div class="dctrl">${controls}</div>
          </div>`;
}

function lunchTile(lunch, idx, manualLunches = {}) {
  const L = lunch[idx];
  if (!L) return `<button class="flex lunch-gap add-lunch" data-addlunch="${idx}">no lunch — tap to add</button>`;

  if (L.manual) {
    const known = Boolean(metaOf(L.dish));
    return `<div class="tile ltile mtile" data-idx="${idx}" data-dish="${escapeAttr(L.dish)}" style="--gc:${known ? colourOf(L.dish) : '#a49d8e'}">
              <button class="nbtn" data-clearlunch="${idx}" aria-label="Remove this lunch">✕</button>
              ${known ? '<button class="rbtn" aria-label="Recipe">📖</button>' : ''}
              <div class="tile-name sm">${escapeAttr(L.dish)}</div>
              ${L.frozen
                ? '<div class="tile-kind">❄ from freezer</div>'
                : `<div class="dctrl">${stepper(idx, manualLunches[idx]?.extra ?? 0, 'lunch')}</div>`}
            </div>`;
  }

  if (L.unfulfilled) {
    return `<div class="tile ltile unful" data-idx="${idx}" data-dish="${escapeAttr(L.dish)}" style="--gc:${colourOf(L.dish)}">
              <button class="pinbtn" data-unpin="${idx}" aria-label="Unpin this lunch">📌</button>
              <div class="tile-name sm" data-addlunch="${idx}">${escapeAttr(L.dish)}</div>
              <div class="tile-kind">pinned — no portion by then</div>
            </div>`;
  }
  return `<div class="tile ltile" data-idx="${idx}" data-from="${L.from}" data-meal="${L.meal ?? 'dinner'}" data-dish="${escapeAttr(L.dish)}" ${L.pinned ? 'data-pinned="1"' : ''} style="--gc:${colourOf(L.dish)}">
            ${metaOf(L.dish) ? '<button class="rbtn" aria-label="Recipe">📖</button>' : ''}
            ${L.pinned ? `<button class="pinbtn" data-unpin="${idx}" aria-label="Unpin this lunch">📌</button>` : ''}
            <div class="tile-name sm">${escapeAttr(L.dish)}</div>
            <div class="tile-kind">${L.pinned ? 'leftovers · pinned' : 'leftovers'}</div>
          </div>`;
}

function freezerPanel(freezer) {
  const keys = Object.keys(freezer).filter((k) => freezer[k] > 0);
  const total = fz.totalPortions(freezer);

  const items = keys.length
    ? keys.map((k) => `
        <div class="fz-item" style="--gc:${colourOf(k)}">
          <span class="fz-name">${k}</span>
          <span class="fz-qty">×${freezer[k]}</span>
          <button class="fz-use" data-fz="${escapeAttr(k)}" data-op="use">Use ▸</button>
          <button class="fz-rm" data-fz="${escapeAttr(k)}" data-op="rm" aria-label="Remove one">✕</button>
        </div>`).join('')
    : `<div class="fz-empty">Freezer is empty — drag a dinner in here to bank all its leftovers, or a single lunch to bank that portion.</div>`;

  const dishOptions = allDishNames()
    .map((n) => `<option value="${escapeAttr(n)}"></option>`).join('');

  return `<details class="freezer" open>
            <summary>❄ Freezer <span class="fz-count">${total} portion${total === 1 ? '' : 's'}</span>
              <span class="fz-drop-hint">drop here to freeze</span></summary>
            <div class="fz-body">${items}
              <div class="fz-add">
                <input class="fz-in" list="dishOptions" placeholder="Add what's in there — a dish or e.g. “Bought lasagne”" maxlength="40" aria-label="Meal name">
                <datalist id="dishOptions">${dishOptions}</datalist>
                <input class="fz-num" type="number" min="1" max="30" value="1" aria-label="Portions">
                <button class="fz-addbtn">+ Add</button>
              </div>
            </div>
          </details>`;
}

function surplusRow(tokens, week) {
  const batches = groupSurplus(tokens);
  const terminal = week === 3;
  const label = terminal ? 'Beyond the 28-day plan' : 'Surplus / next week';

  const tiles = batches.length
    ? batches.map((b) =>
        `<div class="stile" data-dish="${escapeAttr(b.dish)}" data-froms="${b.froms.join(',')}" style="--gc:${colourOf(b.dish)}">
           <span class="stile-name">${b.dish}</span><span class="stile-q">×${b.count}</span>
         </div>`).join('')
    : `<div class="surplus-none">nothing rolling over yet</div>`;

  const hint = terminal
    ? 'This is the edge of the visible plan — drag batches up into the freezer to keep them. The window extends automatically as days pass.'
    : 'These portions roll forward as next week’s lunches. Drag a batch up into the freezer to bank it, or drop a dinner here to push it to next week.';

  return `<div class="surplus">
            <div class="surplus-head">${terminal ? '⤴' : '↻'} ${label}</div>
            <div class="surplus-tiles">${tiles}</div>
            <div class="surplus-hint">${hint}</div>
          </div>`;
}

/* ---------- view ---------- */

export function renderWeekly(root) {
  if (get().histWeek > 0) return renderHistory(root);
  const { plan, freezer, week, lunchPins, manualLunches, planAnchor, history, histWeek } = get();
  const { lunch, weekSurplus, dinner: leftDinners } = allocate(plan, lunchPins, manualLunches);

  const weekBtns = weekSegment({
    histWeek, week, planAnchor, history,
    rangeOf: (i) => formatRange(dateForIndex(i * 7, planAnchor), dateForIndex(i * 7 + 6, planAnchor)),
  });

  const rows = DAY_NAMES.map((name, d) => {
    const idx = week * 7 + d;
    const offset = idx - CONTEXT_DAYS;
    const date = dateForIndex(idx, planAnchor);
    const timing = offset === 0 ? 'is-today' : offset < 0 ? 'is-past' : 'is-future';
    return `<div class="brow ${timing}">
              <div class="bday">
                <span class="bday-name">${formatDay(date)}</span>
                <span class="bday-date">${formatDate(date)}</span>
                <span class="bday-context">${dayContext(idx)}</span>
              </div>
              <div class="slot dslot" data-idx="${idx}">${dinnerTile(plan, idx, leftDinners[idx], planAnchor)}</div>
              <div class="slot lslot" data-idx="${idx}">${lunchTile(lunch, idx, manualLunches)}</div>
            </div>`;
  }).join('');

  const start = dateForIndex(week * 7, planAnchor);
  const end = dateForIndex(week * 7 + 6, planAnchor);
  const today = dateForIndex(CONTEXT_DAYS, planAnchor);
  const context = week === 0
    ? `Showing ${formatRange(start, end)} · the previous ${CONTEXT_DAYS} days stay visible for context`
    : `Showing ${formatRange(start, end)} · ${week * 7 - CONTEXT_DAYS}–${week * 7 + 6 - CONTEXT_DAYS} days from today`;

  root.innerHTML = `
    <section class="today-card" aria-label="Current planning date">
      <div>
        <span class="today-kicker">Today</span>
        <strong>${formatLongDate(today)}</strong>
        <span>${context}</span>
      </div>
      ${week === 0 ? '' : '<button class="today-jump" data-today>Back to today</button>'}
    </section>
    ${freezerPanel(freezer)}
    <div class="board-bar"><span class="bb-label">Timeline</span>${weekBtns}</div>
    <div class="board">
      <div class="brow bhead"><div class="bday"></div><div class="bcol">Dinner</div><div class="bcol">Lunch</div></div>
      ${rows}
    </div>
    ${surplusRow(weekSurplus[week], week)}
    <p class="board-note">Drag a dinner onto another day to swap, onto the freezer ❄ to bank all its leftovers, or down into the surplus strip to push it to next week ·
      drag a lunch onto another day to pin it there 📌, or onto the freezer to bank that one portion ·
      drag any meal, notes and your own lunches included, onto another day to move it; hold it on a week button to move it to that week ·
      drag a lunch onto an empty dinner to have those leftovers for dinner instead 🥡, or a dinner onto a lunch to have it for lunch ·
      tap a lunch, or an empty one, to add your own: typed, a dish, or one from the freezer (the leftovers move on to a later day) ·
      notes and your own lunches can make leftovers too with −/+ ·
      −/+ sets leftover portions (they fill later lunches, earliest-cooked first, and roll into the next week) ·
      tap an empty dinner to pick a dish (filtered by mode) or write a note · everything saves automatically.</p>`;

  wire(root);
}

/* ---------- note editing ---------- */

function openNoteEditor(root, slot, idx) {
  const d = get().plan[idx].dinner;
  slot.innerHTML = `<input class="note-input" type="text" maxlength="40"
                           placeholder="e.g. dinner out" value="${escapeAttr(d.note ?? '')}">`;
  const input = slot.querySelector('input');
  input.focus();
  input.select();

  const save = () => {
    const s = get();
    const v = input.value.trim();
    if (v) {
      const keep = s.plan[idx].dinner.note ? s.plan[idx].dinner.extra ?? 0 : 0; // edits keep leftovers
      s.plan[idx].dinner = { ...emptyDinner(), note: v, extra: keep };
      commit({ plan: true });
    } else if (s.plan[idx].dinner.note) {
      s.plan[idx].dinner = emptyDinner();
      commit({ plan: true });
    } else {
      renderWeekly(root); // nothing changed — just restore the empty slot
    }
  };
  input.onblur = save;
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') input.blur();
    else if (ev.key === 'Escape') {
      input.onblur = null;
      renderWeekly(root);
    }
  };
}

/**
 * Manual freezer additions ("as-built" inventory / bought meals). These portions come
 * from OUTSIDE the plan, so the conservation rule doesn't apply — nothing is decremented.
 * Unknown names are fine: they get a neutral colour, and `Use ▸` still fills a dinner
 * slot (with no recipe card behind it).
 */
function addToFreezer(root) {
  const s = get();
  const nameEl = root.querySelector('.fz-in');
  const numEl = root.querySelector('.fz-num');
  const name = nameEl.value.trim();
  const n = Math.max(1, Math.min(30, Number(numEl.value) || 1));
  if (!name) {
    nameEl.focus();
    return toast('Name the meal first');
  }
  fz.bank(s.freezer, name, n);
  toast(`${name} ×${n} added to the freezer`);
  commit({ freezer: true });
}

/* ---------- interaction ---------- */

// While dragging, resting on a week button for a moment switches to that week, so a meal
// can be dropped on any day of the plan. The board re-renders under the finger; the drag
// carries on because beginDrag listens on window, not on the tile.
let weekHover = { el: null, timer: 0 };
function hoverWeek(btn) {
  if (btn && btn === weekHover.el) {
    if (weekHover.timer) btn.classList.add('slot-hot'); // the drag clears highlights each move
    return;
  }
  if (!btn && !weekHover.el) return;
  clearTimeout(weekHover.timer);
  weekHover = { el: btn, timer: 0 };
  if (!btn) return;
  const wk = Number(btn.dataset.wk);
  if (wk === get().week && get().histWeek === 0) return;
  btn.classList.add('slot-hot');
  weekHover.timer = setTimeout(() => {
    weekHover = { el: null, timer: 0 };
    setUI({ week: wk, histWeek: 0 });
  }, 450);
}

function wire(root) {
  const today = root.querySelector('[data-today]');
  if (today) today.onclick = () => setUI({ week: 0, histWeek: 0 });
  wireWeekSegment(root);

  root.onclick = (e) => {
    const s = get();

    const act = e.target.closest('[data-act]');
    if (act) {
      const idx = Number(act.dataset.idx);
      const lunchMeal = act.dataset.meal === 'lunch';
      const d = lunchMeal ? s.manualLunches[idx] : s.plan[idx].dinner;
      if (!d) return;
      const n = d.extra ?? 0;
      if (act.dataset.act === 'inc') d.extra = Math.min(8, n + 1);
      else if (act.dataset.act === 'dec') d.extra = Math.max(0, n - 1);
      return commit(lunchMeal ? { lunches: true } : { plan: true });
    }

    const up = e.target.closest('[data-unpin]');
    if (up) {
      delete s.lunchPins[Number(up.dataset.unpin)];
      return commit({ pins: true });
    }

    const cd = e.target.closest('[data-cleardinner]');
    if (cd) {
      s.plan[Number(cd.dataset.cleardinner)].dinner = emptyDinner();
      toast('Portion back with the lunches');
      return commit({ plan: true });
    }

    const cl = e.target.closest('[data-clearlunch]');
    if (cl) {
      const idx = Number(cl.dataset.clearlunch);
      const wasFrozen = s.manualLunches[idx]?.frozen;
      clearManualLunch(s.manualLunches, s.freezer, idx);
      if (wasFrozen) toast('Portion back in the freezer');
      return commit({ lunches: true, freezer: true });
    }

    // Empty lunch, a hand-added lunch's name, or a waiting pin's name: open the lunch picker.
    // (Leftover tiles are draggable, so their tap arrives through beginDrag's onTap.)
    const al = e.target.closest('[data-addlunch]');
    if (al) return openLunchPicker(Number(al.dataset.addlunch));

    const pd = e.target.closest('[data-pickday]');
    if (pd) {
      const idx = Number(pd.dataset.pickday);
      return openDishPicker(idx, {
        onNote: () => {
          const slot = root.querySelector(`.dslot[data-idx="${idx}"]`);
          if (slot) openNoteEditor(root, slot, idx);
        },
      });
    }

    const cn = e.target.closest('[data-clearnote]');
    if (cn) {
      s.plan[Number(cn.dataset.clearnote)].dinner = emptyDinner();
      return commit({ plan: true });
    }

    const addBtn = e.target.closest('.fz-addbtn');
    if (addBtn) return addToFreezer(root);

    const f = e.target.closest('[data-fz]');
    if (f) {
      const dish = f.dataset.fz;
      if (f.dataset.op === 'use') {
        const res = fz.useFromFreezer(s.plan, s.freezer, dish, { week: s.week });
        if (!res.ok) return toast('No empty dinner slot this week — clear one first');
      } else {
        fz.take(s.freezer, dish, 1);
      }
      return commit({ plan: true, freezer: true });
    }

    const rb = e.target.closest('.rbtn');
    if (rb) {
      const tile = rb.closest('.tile');
      const name = tile.classList.contains('dtile')
        ? s.plan[Number(tile.dataset.idx)].dinner.dish
        : tile.dataset.dish;
      if (name) openRecipe(name);
    }
  };

  const dragOpts = {
    findTarget: (x, y, payload) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      if (payload.type !== 'surplus') hoverWeek(el.closest('[data-wk]'));
      const freezerEl = el.closest('.freezer');
      if (freezerEl) return freezerEl; // every drag type can land in the freezer
      if (payload.type === 'dinner') return el.closest('.dslot') || el.closest('.lslot') || el.closest('.surplus');
      if (payload.type === 'lunch' || payload.type === 'mlunch') return el.closest('.lslot') || el.closest('.dslot');
      return null;
    },
    onDrop: (target, payload) => {
      const s = get();

      // A hand-added lunch: onto the freezer, another lunch, or an empty dinner.
      if (payload.type === 'mlunch') {
        const to = Number(target.dataset.idx);
        if (target.classList.contains('freezer')) {
          const frozen = s.manualLunches[payload.idx]?.frozen;
          const n = freezeManualLunch(s.manualLunches, s.freezer, payload.idx);
          toast(frozen ? 'Back in the freezer' : n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'No leftovers to freeze — add some with +');
          return commit({ lunches: true, freezer: true });
        }
        if (target.classList.contains('lslot')) {
          const swapping = Boolean(manualAt(s.manualLunches, to));
          const sources = [{ day: payload.idx, meal: 'lunch' }, ...(swapping ? [{ day: to, meal: 'lunch' }] : [])];
          const { result, carried } = carryLeftovers(s.plan, s.lunchPins, s.manualLunches, sources, () => {
            const ok = moveManualLunch(s.manualLunches, s.lunchPins, payload.idx, to);
            return { ok, to: ok ? [to, payload.idx] : [] };
          });
          if (!result.ok) return;
          toast(withLeftovers(`${payload.dish} moved to ${formatDay(dateForIndex(to, s.planAnchor))} lunch`, carried));
          return commit({ plan: true, lunches: true, pins: true });
        }
        if (target.classList.contains('dslot')) {
          const { result: res, carried } = carryLeftovers(s.plan, s.lunchPins, s.manualLunches, [{ day: payload.idx, meal: 'lunch' }], () => {
            const r = lunchToDinner(s.plan, s.manualLunches, payload.idx, to);
            return { ...r, to: [r.ok ? to : null] };
          });
          if (!res.ok) return toast('That day already has a dinner — clear it first');
          toast(withLeftovers(`${res.dish} moved to ${formatDay(dateForIndex(to, s.planAnchor))} dinner`, carried));
          return commit({ plan: true, lunches: true, pins: true });
        }
        return;
      }

      if (target.classList.contains('freezer')) {
        if (payload.type === 'dinner') {
          if (s.plan[payload.idx].dinner.src === 'leftover') {
            return toast('That night eats leftovers — ✕ sends the portion back to lunches');
          }
          const n = fz.freezeDinner(s.plan, s.freezer, payload.idx);
          toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'No leftovers to freeze');
          return commit({ plan: true, freezer: true });
        }
        if (payload.type === 'lunch') {
          const ok = fz.freezeOne(s.plan, s.freezer, payload.from, s.manualLunches, payload.meal);
          if (ok && payload.pinned) delete s.lunchPins[payload.idx];
          toast(ok ? '1 portion frozen' : 'Nothing to freeze');
          return commit({ plan: true, freezer: true, pins: payload.pinned, lunches: true });
        }
        const n = fz.freezeSurplus(s.plan, s.freezer, payload.dish, payload.froms, s.manualLunches);
        toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'Nothing to freeze');
        return commit({ plan: true, freezer: true, lunches: true });
      }

      if (target.classList.contains('surplus') && payload.type === 'dinner') {
        const { result: res, carried } = carryLeftovers(s.plan, s.lunchPins, s.manualLunches, [{ day: payload.idx }], () => {
          const r = deferDinner(s.plan, payload.idx);
          return { ...r, to: [r.ok ? r.idx : null] };
        });
        if (!res.ok) return toast(res.reason === 'horizon'
          ? 'That day is already at the edge of the 28-day plan'
          : 'Next week has no empty day — clear one first');
        const movedDate = dateForIndex(res.idx, s.planAnchor);
        toast(withLeftovers(`Moved to ${formatDay(movedDate)} ${formatDate(movedDate)}`, carried));
        return commit({ plan: true, pins: true });
      }

      if (target.classList.contains('dslot') && payload.type === 'dinner') {
        const to = Number(target.dataset.idx);
        if (to === payload.idx) return;
        // Both days' meals move, and each takes its own leftovers along.
        const { carried } = carryLeftovers(s.plan, s.lunchPins, s.manualLunches, [{ day: payload.idx }, { day: to }], () => {
          swapDinners(s.plan, payload.idx, to);
          return { to: [to, payload.idx] };
        });
        if (carried) toast(withLeftovers(`${payload.dish} moved`, carried));
        return commit({ plan: true, pins: true });
      }

      // A dinner dropped on a lunch slot: have it for lunch (see core/lunches.js).
      if (target.classList.contains('lslot') && payload.type === 'dinner') {
        const to = Number(target.dataset.idx);
        // Only a meal that moves itself to lunch ('moved') carries its leftovers along.
        const { result: res, carried } = carryLeftovers(s.plan, s.lunchPins, s.manualLunches, [{ day: payload.idx }], () => {
          const r = dinnerToLunch(s.plan, s.lunchPins, s.manualLunches, s.freezer, payload.idx, to);
          return { ...r, to: [r.kind === 'moved' ? to : null] };
        });
        if (!res.ok) return;
        const day = formatDay(dateForIndex(to, s.planAnchor));
        if (res.kind === 'pinned') {
          const check = allocate(s.plan, s.lunchPins, s.manualLunches).lunch[to];
          toast(check?.unfulfilled
            ? `No ${res.dish} portion left by ${day} — lunch will wait`
            : `${res.dish} leftovers for ${day} lunch`);
        } else if (res.kind === 'frozen') {
          toast(`${res.dish} from the freezer moved to ${day} lunch`);
        } else {
          toast(withLeftovers(`${res.dish} moved to ${day} lunch`, carried));
        }
        return commit({ plan: true, pins: true, lunches: true, freezer: true });
      }

      // A leftover lunch dropped on a dinner slot: eat that dish for dinner instead.
      if (target.classList.contains('dslot') && payload.type === 'lunch') {
        const to = Number(target.dataset.idx);
        const din = s.plan[to].dinner;
        if (din.dish || din.note) return toast('That day already has a dinner — clear it first');
        const info = metaOf(payload.dish);
        s.plan[to].dinner = leftoverDinner(payload.dish, info ? info.mode : null);
        if (payload.pinned) delete s.lunchPins[payload.idx];
        const day = formatDay(dateForIndex(to, s.planAnchor));
        const check = allocate(s.plan, s.lunchPins, s.manualLunches).dinner[to];
        toast(check?.unfulfilled
          ? `No ${payload.dish} portion left by ${day} — dinner will wait`
          : `${payload.dish} leftovers for ${day} dinner`);
        return commit({ plan: true, pins: payload.pinned });
      }

      if (target.classList.contains('lslot') && payload.type === 'lunch') {
        const to = Number(target.dataset.idx);
        if (to === payload.idx) return;
        // Dropping leftovers onto a hand-added lunch replaces it (a frozen one goes back).
        const hadManual = clearManualLunch(s.manualLunches, s.freezer, to);
        s.lunchPins[to] = payload.dish;
        if (payload.pinned) delete s.lunchPins[payload.idx];
        // Honest feedback: a pin the allocator can't feed shows as waiting, not filled.
        const check = allocate(s.plan, s.lunchPins, s.manualLunches).lunch[to];
        if (check?.unfulfilled) toast(`No ${payload.dish} portion available by ${formatDay(dateForIndex(to, s.planAnchor))} — pin will wait`);
        return commit({ pins: true, lunches: hadManual, freezer: hadManual });
      }
    },
    onEnd: () => {
      hoverWeek(null);
      renderWeekly(root);
    },
  };

  // Dinners and note days drag the same way: swap with another day, push to next week,
  // have it for lunch, or freeze its leftovers. A note's tap still edits it.
  root.querySelectorAll('.dtile, .ntile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // let the -/+/📖/✕ buttons through
      const idx = Number(t.dataset.idx);
      const d = get().plan[idx].dinner;
      const name = d.dish || d.note;
      if (!name) return;
      beginDrag(e, t, {
        type: 'dinner',
        idx,
        dish: name,
        label: name,
        colour: d.cat && MODE_BY_KEY[d.cat] ? MODE_BY_KEY[d.cat].color : '#a49d8e',
      }, d.dish ? dragOpts : {
        ...dragOpts,
        // onEnd re-renders the board after a tap, so open the inline editor on the new DOM.
        onTap: () => setTimeout(() => {
          const slot = root.querySelector(`.dslot[data-idx="${idx}"]`);
          if (slot) openNoteEditor(root, slot, idx);
        }),
      });
    });
  });

  // Hand-added lunches: move to another lunch, have it for dinner, or freeze. Tap edits.
  root.querySelectorAll('.mtile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const idx = Number(t.dataset.idx);
      beginDrag(e, t, {
        type: 'mlunch',
        idx,
        dish: t.dataset.dish,
        label: t.dataset.dish,
        colour: colourOf(t.dataset.dish),
      }, { ...dragOpts, onTap: () => openLunchPicker(idx) });
    });
  });

  root.querySelectorAll('.ltile:not(.unful):not(.mtile)').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // let 📖/📌 through
      const idx = Number(t.dataset.idx);
      beginDrag(e, t, {
        type: 'lunch',
        idx: Number(t.dataset.idx),
        from: Number(t.dataset.from),
        meal: t.dataset.meal,
        dish: t.dataset.dish,
        pinned: t.dataset.pinned === '1',
        label: t.dataset.dish,
        colour: colourOf(t.dataset.dish),
      }, { ...dragOpts, onTap: () => openLunchPicker(idx) });
    });
  });

  root.querySelectorAll('.stile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      const dish = t.dataset.dish;
      // Dinner sources are day numbers; lunch-made portions are 'L<day>' (see groupSurplus).
      const froms = String(t.dataset.froms).split(',').filter(Boolean)
        .map((f) => (f.startsWith('L') ? f : Number(f)));
      beginDrag(e, t, {
        type: 'surplus',
        dish,
        froms,
        label: `${dish} ×${froms.length}`,
        colour: colourOf(dish),
      }, dragOpts);
    });
  });
}
