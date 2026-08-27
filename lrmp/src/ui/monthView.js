import { MODE_BY_KEY } from '../data/modes.js';
import { shuffleAll, clearPlan, seedPlan, swapDinners, emptyDinner } from '../core/plan.js';
import { CONTEXT_DAYS, dateForIndex, formatDate, formatDay, formatRange } from '../core/timeline.js';
import { get, commit } from '../state.js';
import { toast, beginDrag } from './dom.js';
import { openDishPicker, clearDay } from './dishPicker.js';

/**
 * 28-day view = the rolling 4x7 grid. Tap any day to open the dish picker (mode click filters,
 * then pick / surprise). Tapping an already-planned day jumps straight to its mode's
 * list with a "clear this day" option. Drag a day onto another to swap, or onto the
 * bin to remove it. There is no brush — the picker replaced it.
 *
 * This writes to the SAME plan array the Weekly view reads. There is no sync step.
 */
export function renderMonth(root) {
  const { plan, planAnchor } = get();

  const cells = [];
  for (let w = 0; w < 4; w++) {
    const range = formatRange(dateForIndex(w * 7, planAnchor), dateForIndex(w * 7 + 6, planAnchor));
    const row = [`<div class="mwk"><span>${w === 0 ? 'Now' : `+${w}w`}</span><small>${range}</small></div>`];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const dinner = plan[idx].dinner;
      const mode = dinner.cat ? MODE_BY_KEY[dinner.cat] : null;
      row.push(`
        <div class="mcell ${idx === CONTEXT_DAYS ? 'is-today' : ''} ${idx < CONTEXT_DAYS ? 'is-past' : ''} ${dinner.cat ? 'on' : ''} ${!dinner.dish && dinner.note ? 'noted' : ''}" data-idx="${idx}" ${mode ? `style="--gc:${mode.color}"` : ''}>
          <span class="mc-date">${formatDate(dateForIndex(idx, planAnchor))}${idx === CONTEXT_DAYS ? ' · Today' : ''}</span>
          ${mode ? `<div class="mc-ico">${mode.ico}</div>` : ''}
          <div class="mc-dish">${dinner.dish ?? (dinner.note ? `✎ ${dinner.note}` : '')}</div>
        </div>`);
    }
    cells.push(`<div class="mrow">${row.join('')}</div>`);
  }

  root.innerHTML = `
    <div class="brush-bar">
      <span class="bb-label">Rolling 28 days</span>
      <span class="spacer"></span>
      <button class="reset" data-cmd="shuffle">🎲 Shuffle all</button>
      <button class="reset" data-cmd="reset">Reset</button>
      <button class="reset" data-cmd="clear">Clear</button>
    </div>
    <div class="mgrid-scroll"><div class="mgrid">
      <div class="mrow mhead2"><div class="mwk"></div>${Array.from({ length: 7 }, (_, d) => `<div class="mdh">${formatDay(dateForIndex(d, planAnchor))}</div>`).join('')}</div>
      ${cells.join('')}
    </div></div>
    <div class="mbin">🗑 Remove from the plan — drag a day here</div>
    <p class="board-note">Tap a day to pick a dish — choose a cooking mode, then a recipe (or 🎲 surprise).
      Tap a planned day to change or clear it. Drag a day onto another to swap them, or into the bin to remove it.
      Blank days are fine: they're your leftover/freezer nights. This feeds straight into the Weekly plan.</p>`;

  wire(root);
}

function wire(root) {
  root.querySelectorAll('[data-cmd]').forEach((cmd) => {
    cmd.onclick = () => {
      const s = get();
      if (cmd.dataset.cmd === 'shuffle') shuffleAll(s.plan);
      else if (cmd.dataset.cmd === 'reset') s.plan = seedPlan();
      else if (cmd.dataset.cmd === 'clear') clearPlan(s.plan);
      // All three change which dishes exist where — lunch pins would point at ghosts.
      s.lunchPins = {};
      commit({ plan: true, pins: true });
    };
  });

  const dragOpts = {
    findTarget: (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest('.mbin') || el.closest('.mcell');
    },
    onDrop: (target, payload) => {
      const s = get();
      if (target.classList.contains('mbin')) {
        s.plan[payload.idx].dinner = emptyDinner();
        toast('Removed — not this month');
        return commit({ plan: true });
      }
      const to = Number(target.dataset.idx);
      if (to === payload.idx) return;
      swapDinners(s.plan, payload.idx, to);
      commit({ plan: true });
    },
    onEnd: () => renderMonth(root),
  };

  root.querySelectorAll('.mcell').forEach((cell) => {
    const idx = Number(cell.dataset.idx);

    cell.addEventListener('pointerdown', (e) => {
      const s = get();
      const dinner = s.plan[idx].dinner;
      const openPicker = () => openDishPicker(idx, {
        startMode: dinner.cat ?? undefined,
        onRemove: dinner.dish || dinner.note ? () => clearDay(idx) : undefined,
      });

      // Empty days can't be dragged — a tap opens the picker at the mode step.
      if (!dinner.dish && !dinner.note) {
        cell.onclick = openPicker;
        return;
      }
      cell.onclick = null;

      const mode = dinner.cat ? MODE_BY_KEY[dinner.cat] : null;
      beginDrag(e, cell, {
        type: 'mday',
        idx,
        label: dinner.dish ?? dinner.note,
        colour: mode ? mode.color : '#a49d8e',
      }, { ...dragOpts, onTap: openPicker });
    });
  });
}
