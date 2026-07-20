import { MODE_BY_KEY } from '../data/modes.js';
import { metaOf, allDishNames } from '../data/dishes.js';
import { DAY_NAMES, swapDinners, deferDinner, emptyDinner } from '../core/plan.js';
import { allocate, groupSurplus } from '../core/allocate.js';
import * as fz from '../core/freezer.js';
import { get, commit, setUI } from '../state.js';
import { escapeAttr, toast, beginDrag } from './dom.js';
import { openRecipe } from './recipeModal.js';
import { openDishPicker } from './dishPicker.js';

const colourOf = (dish) => {
  const info = metaOf(dish);
  return info ? MODE_BY_KEY[info.mode].color : '#888';
};

/* ---------- tiles ---------- */

function dinnerTile(plan, idx) {
  const d = plan[idx].dinner;

  if (!d.dish && d.note) {
    return `<div class="tile ntile" data-idx="${idx}">
              <button class="nbtn" data-clearnote="${idx}" aria-label="Clear note">✕</button>
              <div class="tile-name sm" data-editnote="${idx}">${escapeAttr(d.note)}</div>
              <div class="tile-kind">no cooking</div>
            </div>`;
  }
  if (!d.dish) {
    return `<button class="flex empty-day" data-pickday="${idx}">empty — tap to plan<br>a dinner or a note</button>`;
  }

  const colour = d.cat ? MODE_BY_KEY[d.cat].color : '#888';
  const controls =
    d.src === 'freezer'
      ? `<span class="frz-badge">❄ from freezer</span>`
      : `<span class="lft">
           <button class="st" data-act="dec" data-idx="${idx}" aria-label="Fewer leftovers">−</button>
           <span class="lft-n">${d.extra}</span>
           <button class="st" data-act="inc" data-idx="${idx}" aria-label="More leftovers">+</button>
           <span class="lft-l">leftovers</span>
         </span>`;

  return `<div class="tile dtile" data-idx="${idx}" style="--gc:${colour}">
            <button class="rbtn" aria-label="Recipe">📖</button>
            <div class="tile-name">${d.dish}</div>
            <div class="dctrl">${controls}</div>
          </div>`;
}

function lunchTile(lunch, idx) {
  const L = lunch[idx];
  if (!L) return `<div class="flex lunch-gap">no lunch</div>`;

  if (L.unfulfilled) {
    return `<div class="tile ltile unful" data-idx="${idx}" data-dish="${escapeAttr(L.dish)}" style="--gc:${colourOf(L.dish)}">
              <button class="pinbtn" data-unpin="${idx}" aria-label="Unpin this lunch">📌</button>
              <div class="tile-name sm">${L.dish}</div>
              <div class="tile-kind">pinned — no portion by then</div>
            </div>`;
  }
  return `<div class="tile ltile" data-idx="${idx}" data-from="${L.from}" data-dish="${escapeAttr(L.dish)}" ${L.pinned ? 'data-pinned="1"' : ''} style="--gc:${colourOf(L.dish)}">
            <button class="rbtn" aria-label="Recipe">📖</button>
            ${L.pinned ? `<button class="pinbtn" data-unpin="${idx}" aria-label="Unpin this lunch">📌</button>` : ''}
            <div class="tile-name sm">${L.dish}</div>
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
  const label = terminal ? 'Surplus / next month — Wk 1' : 'Surplus / next week';

  const tiles = batches.length
    ? batches.map((b) =>
        `<div class="stile" data-dish="${escapeAttr(b.dish)}" data-froms="${b.froms.join(',')}" style="--gc:${colourOf(b.dish)}">
           <span class="stile-name">${b.dish}</span><span class="stile-q">×${b.count}</span>
         </div>`).join('')
    : `<div class="surplus-none">nothing rolling over yet</div>`;

  const hint = terminal
    ? 'A new month starts fresh — drag batches up into the freezer to keep them. Drop a dinner here to move it to next month’s Wk 1.'
    : 'These portions roll forward as next week’s lunches. Drag a batch up into the freezer to bank it, or drop a dinner here to push it to next week.';

  return `<div class="surplus">
            <div class="surplus-head">${terminal ? '⤴' : '↻'} ${label}</div>
            <div class="surplus-tiles">${tiles}</div>
            <div class="surplus-hint">${hint}</div>
          </div>`;
}

/* ---------- view ---------- */

export function renderWeekly(root) {
  const { plan, freezer, week, lunchPins } = get();
  const { lunch, weekSurplus } = allocate(plan, lunchPins);

  const weekBtns = [0, 1, 2, 3]
    .map((i) => `<button class="wk-btn ${i === week ? 'on' : ''}" data-wk="${i}">Wk ${i + 1}</button>`)
    .join('');

  const rows = DAY_NAMES.map((name, d) => {
    const idx = week * 7 + d;
    return `<div class="brow">
              <div class="bday">${name}</div>
              <div class="slot dslot" data-idx="${idx}">${dinnerTile(plan, idx)}</div>
              <div class="slot lslot" data-idx="${idx}">${lunchTile(lunch, idx)}</div>
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
    <p class="board-note">Drag a dinner onto another day to swap, onto the freezer ❄ to bank all its leftovers, or down into the surplus strip to push it to next week ·
      drag a lunch onto another day to pin it there 📌, or onto the freezer to bank that one portion ·
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
      s.plan[idx].dinner = { ...emptyDinner(), note: v };
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
      return commit({ plan: true });
    }

    const up = e.target.closest('[data-unpin]');
    if (up) {
      delete s.lunchPins[Number(up.dataset.unpin)];
      return commit({ pins: true });
    }

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

    const en = e.target.closest('[data-editnote]');
    if (en) return openNoteEditor(root, en.closest('.dslot'), Number(en.dataset.editnote));

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
      const freezerEl = el.closest('.freezer');
      if (freezerEl) return freezerEl; // every drag type can land in the freezer
      if (payload.type === 'dinner') return el.closest('.dslot') || el.closest('.surplus');
      if (payload.type === 'lunch') return el.closest('.lslot');
      return null;
    },
    onDrop: (target, payload) => {
      const s = get();

      if (target.classList.contains('freezer')) {
        if (payload.type === 'dinner') {
          const n = fz.freezeDinner(s.plan, s.freezer, payload.idx);
          toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'No leftovers to freeze');
          return commit({ plan: true, freezer: true });
        }
        if (payload.type === 'lunch') {
          const ok = fz.freezeOne(s.plan, s.freezer, payload.from);
          if (ok && payload.pinned) delete s.lunchPins[payload.idx];
          toast(ok ? '1 portion frozen' : 'Nothing to freeze');
          return commit({ plan: true, freezer: true, pins: payload.pinned });
        }
        const n = fz.freezeSurplus(s.plan, s.freezer, payload.dish, payload.froms);
        toast(n ? `${n} portion${n === 1 ? '' : 's'} frozen` : 'Nothing to freeze');
        return commit({ plan: true, freezer: true });
      }

      if (target.classList.contains('surplus') && payload.type === 'dinner') {
        const res = deferDinner(s.plan, payload.idx);
        if (!res.ok) return toast('Next week has no empty day — clear one first');
        toast(`Moved to ${res.wrapped ? 'next month · ' : ''}Wk ${Math.floor(res.idx / 7) + 1} ${DAY_NAMES[res.idx % 7]}`);
        return commit({ plan: true });
      }

      if (target.classList.contains('dslot') && payload.type === 'dinner') {
        swapDinners(s.plan, payload.idx, Number(target.dataset.idx));
        return commit({ plan: true });
      }

      if (target.classList.contains('lslot') && payload.type === 'lunch') {
        const to = Number(target.dataset.idx);
        if (to === payload.idx) return;
        s.lunchPins[to] = payload.dish;
        if (payload.pinned) delete s.lunchPins[payload.idx];
        // Honest feedback: a pin the allocator can't feed shows as waiting, not filled.
        const check = allocate(s.plan, s.lunchPins).lunch[to];
        if (check?.unfulfilled) toast(`No ${payload.dish} portion available by ${DAY_NAMES[to % 7]} — pin will wait`);
        return commit({ pins: true });
      }
    },
    onEnd: () => renderWeekly(root),
  };

  root.querySelectorAll('.dtile').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // let the -/+/📖 buttons through
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

  root.querySelectorAll('.ltile:not(.unful)').forEach((t) => {
    t.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return; // let 📖/📌 through
      beginDrag(e, t, {
        type: 'lunch',
        idx: Number(t.dataset.idx),
        from: Number(t.dataset.from),
        dish: t.dataset.dish,
        pinned: t.dataset.pinned === '1',
        label: t.dataset.dish,
        colour: colourOf(t.dataset.dish),
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
