import { MODES, MODE_BY_KEY } from '../data/modes.js';
import { DAY_NAMES, paintDay, shuffleAll, clearPlan, seedPlan, swapDinners, emptyDinner } from '../core/plan.js';
import { get, commit, setUI } from '../state.js';
import { toast, beginDrag } from './dom.js';

/**
 * Month view = paint categories onto a 4x7 grid. Painting a day auto-drops a dish from
 * that category's pool (avoiding same-week repeats). Re-tapping a painted day re-rolls it.
 * Drag a painted day onto another day to swap them, or onto the bin to drop it from the
 * month entirely (that's the eraser — there is no separate erase brush).
 *
 * This writes to the SAME plan array the Weekly view reads. There is no sync step.
 */
export function renderMonth(root) {
  const { plan, brush } = get();

  const brushes = MODES.map(
    (m) => `<button class="brush ${brush === m.key ? 'on' : ''}" data-brush="${m.key}" style="--gc:${m.color}">
              <span class="ico">${m.ico}</span>${m.name}
            </button>`
  ).join('');

  const cells = [];
  for (let w = 0; w < 4; w++) {
    const row = [`<div class="mwk">W${w + 1}</div>`];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const dinner = plan[idx].dinner;
      const mode = dinner.cat ? MODE_BY_KEY[dinner.cat] : null;
      row.push(`
        <div class="mcell ${dinner.cat ? 'on' : ''} ${!dinner.dish && dinner.note ? 'noted' : ''}" data-idx="${idx}" ${mode ? `style="--gc:${mode.color}"` : ''}>
          ${mode ? `<div class="mc-ico">${mode.ico}</div>` : ''}
          <div class="mc-dish">${dinner.dish ?? (dinner.note ? `✎ ${dinner.note}` : '')}</div>
        </div>`);
    }
    cells.push(`<div class="mrow">${row.join('')}</div>`);
  }

  root.innerHTML = `
    <div class="brush-bar">
      <span class="bb-label">Paint with</span>
      ${brushes}
      <span class="spacer"></span>
      <button class="reset" data-cmd="shuffle">🎲 Shuffle all</button>
      <button class="reset" data-cmd="reset">Reset</button>
      <button class="reset" data-cmd="clear">Clear</button>
    </div>
    <div class="mgrid-scroll"><div class="mgrid">
      <div class="mrow mhead2"><div class="mwk"></div>${DAY_NAMES.map((d) => `<div class="mdh">${d}</div>`).join('')}</div>
      ${cells.join('')}
    </div></div>
    <div class="mbin">🗑 Not this month — drag a day here to remove it</div>
    <p class="board-note">Pick a category, then tap days to paint — a recipe drops in automatically.
      Tap a painted day again to re-roll it. Drag a day onto another to swap them, or into the bin to remove it.
      Blank days are fine: they're your leftover/freezer nights. This feeds straight into the Weekly plan.</p>`;

  wire(root);
}

function wire(root) {
  root.querySelectorAll('[data-brush]').forEach((b) => {
    b.onclick = () => setUI({ brush: b.dataset.brush });
  });

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
      const paint = () => {
        paintDay(s.plan, idx, s.brush);
        commit({ plan: true });
      };

      // Empty days can't be dragged — a tap paints them.
      if (!dinner.dish && !dinner.note) {
        cell.onclick = paint;
        return;
      }
      cell.onclick = null;

      const mode = dinner.cat ? MODE_BY_KEY[dinner.cat] : null;
      beginDrag(e, cell, {
        type: 'mday',
        idx,
        label: dinner.dish ?? dinner.note,
        colour: mode ? mode.color : '#8a8377',
      }, { ...dragOpts, onTap: paint });
    });
  });
}
