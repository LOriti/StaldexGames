import { MODE_BY_KEY } from '../data/modes.js';
import { metaOf } from '../data/dishes.js';
import { DAY_NAMES, swapDinners } from '../core/plan.js';
import { allocate, groupSurplus } from '../core/allocate.js';
import * as fz from '../core/freezer.js';
import { get, commit, setUI } from '../state.js';
import { escapeAttr, toast, beginDrag } from './dom.js';
import { openRecipe } from './recipeModal.js';

const colourOf = (dish) => {
  const info = metaOf(dish);
  return info ? MODE_BY_KEY[info.mode].color : '#888';
};

/* ---------- tiles ---------- */

function dinnerTile(plan, idx) {
  const d = plan[idx].dinner;
  if (!d.dish) return `<div class="flex">empty — set in Month, or use the freezer</div>`;

  const colour = d.cat ? MODE_BY_KEY[d.cat].color : '#888';
  const controls =
    d.src === 'freezer'
      ? `<span class="frz-badge">❄ from freezer</span>`
      : `<span class="lft">
           <button class="st" data-act="dec" data-idx="${idx}" aria-label="Fewer leftovers">−</button>
           <span class="lft-n">${d.extra}</span>
           <button class="st" data-act="inc" data-idx="${idx}" aria-label="More leftovers">+</button>
           <span class="lft-l">leftovers</span>
         </span>
         <button class="frzbtn" data-act="freeze" data-idx="${idx}" ${d.extra > 0 ? '' : 'disabled'}
                 aria-label="Freeze one portion">❄</button>`;

  return `<div class="tile dtile" data-idx="${idx}" style="--gc:${colour}">
            <button class="rbtn" aria-label="Recipe">📖</button>
            <div class="tile-name">${d.dish}</div>
            <div class="dctrl">${controls}</div>
          </div>`;
}

function lunchTile(lunch, idx) {
  const L = lunch[idx];
  if (!L) return `<div class="flex lunch-gap">no lunch</div>`;
  return `<div class="tile ltile" data-dish="${escapeAttr(L.dish)}" style="--gc:${colourOf(L.dish)}">
            <button class="rbtn" aria-label="Recipe">📖</button>
            <div class="tile-name sm">${L.dish}</div>
            <div class="tile-kind">leftovers</div>
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
    : `<div class="fz-empty">Freezer is empty — drag a dinner in here, or hit ❄ to bank a single portion.</div>`;

  return `<details class="freezer" open>
            <summary>❄ Freezer <span class="fz-count">${total} portion${total === 1 ? '' : 's'}</span>
              <span class="fz-drop-hint">drop here to freeze</span></summary>
            <div class="fz-body">${items}</div>
          </details>`;
}

function surplusRow(tokens, week) {
  const batches = groupSurplus(tokens);
  if (!batches.length) return '';

  const terminal = week === 3;
  const label = terminal ? 'Surplus — freeze it or lose it' : `Rolling into Wk ${week + 2}`;

  const tiles = batches.map((b) =>
    `<div class="stile" data-dish="${escapeAttr(b.dish)}" data-froms="${b.froms.join(',')}" style="--gc:${colourOf(b.dish)}">
       <span class="stile-name">${b.dish}</span><span class="stile-q">×${b.count}</span>
     </div>`).join('');

  return `<div class="surplus">
            <div class="surplus-head">${terminal ? '⚠' : '↻'} ${label}</div>
            <div class="surplus-tiles">${tiles}</div>
            <div class="surplus-hint">Drag a batch up into the freezer to bank it${terminal ? '' : ', or leave it to roll forward as lunches'}.</div>
          </div>`;
}

/* ---------- view ---------- */

export function renderWeekly(root) {
  const { plan, freezer, week } = get();
  const { lunch, weekSurplus } = allocate(plan);

  const weekBtns = [0, 1, 2, 3]
    .map((i) => `<button class="wk-btn ${i === week ? 'on' : ''}" data-wk="${i}">Wk ${i + 1}</button>`)
    .join('');

  const rows = DAY_NAMES.map((name, d) => {
    const idx = week * 7 + d;
    return `<div class="brow">
              <div class="bday">${name}</div>
              <div class="slot dslot" data-idx="${idx}">${dinnerTile(plan, idx)}</div>
              <div class="slot lslot">${lunchTile(lunch, idx)}</div>
            </div>`;
  }).join('');

  root.innerHTML = `
    ${freezerPanel(freezer)}
    <div class="board-bar"><span class="bb-label">Week</span><div class="wk-seg">${weekBtns}</div></div>
    <div class="board">
      <div class="brow bhead"><div class="bday"></div><div class="bcol">Dinner</div><div class="bcol">Lunch</div></div>
      ${rows}
    </div>
    ${surplusRow(weekSurplus[week], week)}
    <p class="board-note">Drag a dinner onto another day to swap, or onto the freezer ❄ to bank all its leftovers ·
      −/+ sets leftover portions (they fill later lunches, earliest-cooked first, and roll into the next week) ·
      everything saves automatically.</p>`;

  wire(root);
}

/* ---------- interaction ---------- */

function wire(root) {
  root.querySelectorAll('.wk-btn').forEach((b) => {
    b.onclick = () => setUI({ week: Number(b.dataset.wk) });
  });

  root.onclick = (e) => {
    const s = get();

    const act = e.target.closest('[data-act]');
    if (act) {
      const idx = Number(act.dataset.idx);
      const d = s.plan[idx].dinner;
      if (act.dataset.act === 'inc') d.extra = Math.min(8, d.extra + 1);
      else if (act.dataset.act === 'dec') d.extra = Math.max(0, d.extra - 1);
      else if (act.dataset.act === 'freeze') fz.freezeOne(s.plan, s.freezer, idx);
      return commit({ plan: true, freezer: true });
    }

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
      const freezerEl = el.closest('.freezer');
      if (freezerEl) return freezerEl; // both drag types can land in the freezer
      if (payload.type === 'dinner') return el.closest('.dslot'); // only dinners land on days
      return null;
    },
    onDrop: (target, payload) => {
      const s = get();
      if (target.classList.contains('freezer')) {
        if (payload.type === 'dinner') {
          const n = fz.freezeDinner(s.plan, s.freezer, payload.idx);
          toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'No leftovers to freeze');
        } else {
          const n = fz.freezeSurplus(s.plan, s.freezer, payload.dish, payload.froms);
          toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'Nothing to freeze');
        }
        return commit({ plan: true, freezer: true });
      }
      if (target.classList.contains('dslot') && payload.type === 'dinner') {
        swapDinners(s.plan, payload.idx, Number(target.dataset.idx));
        commit({ plan: true });
      }
    },
    onEnd: () => renderWeekly(root),
  };

  root.querySelectorAll('.dtile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // let the -/+/❄/📖 buttons through
      const d = get().plan[Number(t.dataset.idx)].dinner;
      if (!d.dish) return;
      beginDrag(e, t, {
        type: 'dinner',
        idx: Number(t.dataset.idx),
        dish: d.dish,
        label: d.dish,
        colour: d.cat ? MODE_BY_KEY[d.cat].color : '#888',
      }, dragOpts);
    });
  });

  root.querySelectorAll('.stile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      const dish = t.dataset.dish;
      const froms = String(t.dataset.froms).split(',').filter(Boolean).map(Number);
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
