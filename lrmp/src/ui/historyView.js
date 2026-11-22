import { MODE_BY_KEY } from '../data/modes.js';
import { metaOf } from '../data/dishes.js';
import { historyWeek, weeksOfHistory, earliestKey } from '../core/history.js';
import { dateFromKey, dayDelta, formatDate, formatDay, formatLongDate, formatRange, localDateKey } from '../core/timeline.js';
import { get, setUI } from '../state.js';
import { escapeAttr } from './dom.js';
import { openRecipe } from './recipeModal.js';

/**
 * Read-only look back at days that have left the rolling plan (core/history.js).
 * Reached from the Weekly view's "◀" button; state.histWeek says how many weeks back.
 */

const colourOf = (dish, cat) => {
  if (cat && MODE_BY_KEY[cat]) return MODE_BY_KEY[cat].color;
  const info = metaOf(dish);
  return info ? MODE_BY_KEY[info.mode].color : '#a49d8e';
};

const LUNCH_KIND = {
  leftovers: 'leftovers',
  added: 'added by you',
  frozen: '❄ from freezer',
  waiting: 'pinned — never had a portion',
};

function dinnerCell(d) {
  if (!d) return '<div class="flex hist-none">nothing recorded</div>';
  if (!d.dish) {
    return `<div class="tile ntile htile">
              <div class="tile-name sm">${escapeAttr(d.note ?? '')}</div>
              <div class="tile-kind">note${d.extra ? ` · ${d.extra} leftover${d.extra === 1 ? '' : 's'}` : ''}</div>
            </div>`;
  }
  const kind = d.src === 'freezer' ? '❄ from freezer'
    : d.src === 'leftover' ? '\u{1F961} leftovers'
      : `cooked${d.extra ? ` · ${d.extra} leftover${d.extra === 1 ? '' : 's'}` : ''}`;
  return `<div class="tile htile" style="--gc:${colourOf(d.dish, d.cat)}" data-dish="${escapeAttr(d.dish)}">
            ${metaOf(d.dish) ? '<button class="rbtn" aria-label="Recipe">\u{1F4D6}</button>' : ''}
            <div class="tile-name">${escapeAttr(d.dish)}</div>
            <div class="tile-kind">${kind}</div>
          </div>`;
}

function lunchCell(l) {
  if (!l) return '<div class="flex hist-none">no lunch</div>';
  return `<div class="tile htile" style="--gc:${colourOf(l.dish)}" data-dish="${escapeAttr(l.dish)}">
            ${metaOf(l.dish) ? '<button class="rbtn" aria-label="Recipe">\u{1F4D6}</button>' : ''}
            <div class="tile-name sm">${escapeAttr(l.dish)}</div>
            <div class="tile-kind">${LUNCH_KIND[l.kind] ?? 'lunch'}</div>
          </div>`;
}

/** The week buttons, shared with the plan view: ◀ back, a chip for this week, Now, +1… */
export function weekSegment({ histWeek, week, planAnchor, history, rangeOf }) {
  const max = weeksOfHistory(history, planAnchor);
  const back = `<button class="wk-btn wk-back" data-hist="${histWeek + 1}" ${histWeek >= max ? 'disabled' : ''}
                  aria-label="Go back a week" title="Go back a week">◀</button>`;
  const here = histWeek > 0 ? `<button class="wk-btn on" data-hist="${histWeek}">−${histWeek} wk${histWeek === 1 ? '' : 's'}</button>` : '';
  const ahead = [0, 1, 2, 3].map((i) => {
    const label = i === 0 ? 'Now' : `+${i} wk${i === 1 ? '' : 's'}`;
    return `<button class="wk-btn ${histWeek === 0 && i === week ? 'on' : ''}" data-wk="${i}" title="${rangeOf(i)}">${label}</button>`;
  }).join('');
  return `<div class="wk-seg" data-noscroll>${back}${here}${ahead}</div>`;
}

export function wireWeekSegment(root) {
  root.querySelectorAll('[data-wk]').forEach((b) => {
    b.onclick = () => setUI({ week: Number(b.dataset.wk), histWeek: 0 });
  });
  root.querySelectorAll('[data-hist]').forEach((b) => {
    b.onclick = () => setUI({ histWeek: Number(b.dataset.hist) });
  });
}

export function renderHistory(root) {
  const { history, histWeek, week, planAnchor } = get();
  const days = historyWeek(history, planAnchor, histWeek);
  const todayKey = localDateKey();
  const any = days.some((d) => d.entry);
  const first = earliestKey(history);

  const rows = days.map(({ key, date, entry }) => {
    const ago = dayDelta(key, todayKey);
    return `<div class="brow is-hist">
              <div class="bday">
                <span class="bday-name">${formatDay(date)}</span>
                <span class="bday-date">${formatDate(date)}</span>
                <span class="bday-context">${ago}d ago</span>
              </div>
              <div class="slot">${dinnerCell(entry?.dinner)}</div>
              <div class="slot">${lunchCell(entry?.lunch)}</div>
            </div>`;
  }).join('');

  const note = any ? ''
    : `<p class="board-note hist-empty">Nothing recorded for these days. ${first
      ? `History goes back to ${formatLongDate(dateFromKey(first))}.`
      : 'Days are kept from when they leave the plan, so history builds up from here on.'}</p>`;

  root.innerHTML = `
    <section class="today-card hist-card" aria-label="History">
      <div>
        <span class="today-kicker">History</span>
        <strong>${formatRange(days[0].date, days[6].date)}</strong>
        <span>What was planned and eaten · read only</span>
      </div>
      <button class="today-jump" data-today>Back to today</button>
    </section>
    <div class="board-bar"><span class="bb-label">Timeline</span>
      ${weekSegment({ histWeek, week, planAnchor, history, rangeOf: () => '' })}
    </div>
    <div class="board">
      <div class="brow bhead"><div class="bday"></div><div class="bcol">Dinner</div><div class="bcol">Lunch</div></div>
      ${rows}
    </div>
    ${note}`;

  root.querySelector('[data-today]').onclick = () => setUI({ week: 0, histWeek: 0 });
  wireWeekSegment(root);
  root.onclick = (e) => {
    const rb = e.target.closest('.rbtn');
    if (rb) openRecipe(rb.closest('.tile').dataset.dish);
  };
}
