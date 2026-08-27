import { MODE_BY_KEY } from '../data/modes.js';
import { buildList, remainingCount, listText, clearWeek, dishKey, ingKey } from '../core/shopping.js';
import { formatServes } from '../core/recipes.js';
import { get, commit, setUI } from '../state.js';
import { escapeAttr, toast } from './dom.js';
import { openRecipe } from './recipeModal.js';

function dishCard(d, week) {
  const colour = d.cat ? MODE_BY_KEY[d.cat].color : '#888';
  const name = `${d.dish} <span class="shop-x">${formatServes(d.serves)} serve${d.serves === 1 ? '' : 's'}</span>`;

  if (d.excluded) {
    return `<div class="shop-dish out" style="--gc:${colour}">
              <div class="shop-head">
                <span class="shop-name">${name}</span>
                <button class="shop-skip" data-skip="${escapeAttr(d.dish)}" aria-pressed="true">skipped — add back</button>
              </div>
            </div>`;
  }

  const rows = d.ing.map((x) => `
    <button class="shop-ing ${x.have ? 'got' : ''}" data-ing="${escapeAttr(ingKey(week, d.dish, x.i))}"
            aria-pressed="${x.have}">
      <span class="shop-tick">${x.have ? '✓' : ''}</span><span class="shop-txt">${x.text}</span>
    </button>`).join('');

  return `<div class="shop-dish" style="--gc:${colour}">
            <div class="shop-head">
              <button class="rbtn" data-recipe="${escapeAttr(d.dish)}" aria-label="Recipe">📖</button>
              <span class="shop-name">${name}</span>
              <button class="shop-skip" data-skip="${escapeAttr(d.dish)}" aria-pressed="false">skip</button>
            </div>
            <div class="shop-ings">${rows}</div>
          </div>`;
}

export function renderShopping(root) {
  const { plan, week, shopping, recipeEdits } = get();
  const list = buildList(plan, week, shopping, recipeEdits);
  const remaining = remainingCount(plan, week, shopping, recipeEdits);

  const weekBtns = [0, 1, 2, 3]
    .map((i) => `<button class="wk-btn ${i === week ? 'on' : ''}" data-wk="${i}">Wk ${i + 1}</button>`)
    .join('');

  const body = list.length
    ? list.map((d) => dishCard(d, week)).join('')
    : `<div class="shop-empty">No cooked dinners in this period yet — plan some days in the 28-day view first.
       Freezer and leftover nights need no shopping.</div>`;

  root.innerHTML = `
    <div class="board-bar"><span class="bb-label">Week</span><div class="wk-seg">${weekBtns}</div>
      <span class="spacer"></span>
      <span class="shop-count">${remaining} item${remaining === 1 ? '' : 's'} to buy</span>
    </div>
    <div class="shop">${body}</div>
    ${list.length ? `
      <div class="shop-actions">
        <button class="shop-copy" ${remaining ? '' : 'disabled'}>📋 Copy list</button>
        <button class="shop-reset">Clear ticks for this week</button>
      </div>` : ''}
    <p class="board-note">Tap an ingredient to tick it off (already bought / in the pantry) ·
      skip a dish to leave it off the list entirely · quantities scale with serves
      (1 serve = 2 portions, so a dinner with 2 leftovers shops as 2 serves) ·
      Copy grabs only what's left, grouped by dish, ready to paste anywhere ·
      ticks are per-week and sync across devices.</p>`;

  wire(root);
}

async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    // Clipboard API needs a secure context / permission — textarea fallback for old WebViews.
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nothing more to try */ }
    ta.remove();
    return ok;
  }
}

function wire(root) {
  root.querySelectorAll('.wk-btn').forEach((b) => {
    b.onclick = () => setUI({ week: Number(b.dataset.wk) });
  });

  root.onclick = async (e) => {
    const s = get();

    const ing = e.target.closest('[data-ing]');
    if (ing) {
      const k = ing.dataset.ing;
      if (s.shopping.have[k]) delete s.shopping.have[k];
      else s.shopping.have[k] = 1;
      return commit({ shopping: true });
    }

    const skip = e.target.closest('[data-skip]');
    if (skip) {
      const k = dishKey(s.week, skip.dataset.skip);
      if (s.shopping.excluded[k]) delete s.shopping.excluded[k];
      else s.shopping.excluded[k] = 1;
      return commit({ shopping: true });
    }

    const rb = e.target.closest('[data-recipe]');
    if (rb) return openRecipe(rb.dataset.recipe);

    if (e.target.closest('.shop-reset')) {
      clearWeek(s.shopping, s.week);
      toast(`Wk ${s.week + 1} list reset`);
      return commit({ shopping: true });
    }

    if (e.target.closest('.shop-copy')) {
      const ok = await copyText(listText(s.plan, s.week, s.shopping, s.recipeEdits));
      toast(ok ? 'List copied — paste it anywhere' : 'Copy failed — try long-pressing to select');
    }
  };
}
