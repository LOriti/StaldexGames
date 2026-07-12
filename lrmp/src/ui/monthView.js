import { MODES, MODE_BY_KEY } from '../data/modes.js';
import { DAY_NAMES, paintDay, shuffleAll, clearPlan, seedPlan } from '../core/plan.js';
import { get, commit, setUI } from '../state.js';

/**
 * Month view = paint categories onto a 4x7 grid. Painting a day auto-drops a dish from
 * that category's pool (avoiding same-week repeats). Re-tapping a painted day re-rolls it.
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
        <div class="mcell ${dinner.cat ? 'on' : ''}" data-idx="${idx}" ${mode ? `style="--gc:${mode.color}"` : ''}>
          ${mode ? `<div class="mc-ico">${mode.ico}</div>` : ''}
          <div class="mc-dish">${dinner.dish ?? ''}</div>
        </div>`);
    }
    cells.push(`<div class="mrow">${row.join('')}</div>`);
  }

  root.innerHTML = `
    <div class="brush-bar">
      <span class="bb-label">Brush</span>
      ${brushes}
      <button class="brush erase ${brush === 'erase' ? 'on' : ''}" data-brush="erase">⌫ Erase</button>
      <span class="spacer"></span>
      <button class="reset" data-cmd="shuffle">🎲 Shuffle all</button>
      <button class="reset" data-cmd="reset">Reset</button>
      <button class="reset" data-cmd="clear">Clear</button>
    </div>
    <div class="mgrid-scroll"><div class="mgrid">
      <div class="mrow mhead2"><div class="mwk"></div>${DAY_NAMES.map((d) => `<div class="mdh">${d}</div>`).join('')}</div>
      ${cells.join('')}
    </div></div>
    <p class="board-note">Pick a brush, then tap days to set a category — a recipe drops in automatically.
      Tap a painted day again to re-roll it. Blank days are fine: they're your leftover/freezer nights.
      This feeds straight into the Weekly plan.</p>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-brush]');
    if (b) return setUI({ brush: b.dataset.brush });

    const cmd = e.target.closest('[data-cmd]');
    if (cmd) {
      const s = get();
      if (cmd.dataset.cmd === 'shuffle') shuffleAll(s.plan);
      else if (cmd.dataset.cmd === 'reset') s.plan = seedPlan();
      else if (cmd.dataset.cmd === 'clear') clearPlan(s.plan);
      return commit({ plan: true });
    }

    const cell = e.target.closest('.mcell');
    if (cell) {
      const s = get();
      paintDay(s.plan, Number(cell.dataset.idx), s.brush);
      commit({ plan: true });
    }
  };
}
