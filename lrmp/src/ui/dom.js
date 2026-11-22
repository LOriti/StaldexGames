/** Small DOM + drag helpers shared by the views. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function clearDropHighlights() {
  $$('.slot-hot, .fz-hot').forEach((el) => el.classList.remove('slot-hot', 'fz-hot'));
}

/**
 * Unified pointer-based drag. Pointer events (not HTML5 DnD) because HTML5 drag-and-drop
 * does not work on touch — and this app is used on a phone in a kitchen.
 *
 * @param {PointerEvent} e
 * @param {HTMLElement} tile      the element being dragged
 * @param {object} payload        { type, label, colour, ... } — passed back on drop
 * @param {(x:number,y:number,payload:object)=>HTMLElement|null} findTarget
 * @param {(target:HTMLElement, payload:object)=>void} onDrop
 * @param {()=>void} onEnd        always called (re-render)
 * @param {()=>void} [onTap]      called instead of onDrop when the pointer never moved
 *                                past the threshold — lets a draggable element keep a
 *                                tap action (pointerdown+capture can swallow the click)
 */
export function beginDrag(e, tile, payload, { findTarget, onDrop, onEnd, onTap }) {
  e.preventDefault();
  try { tile.setPointerCapture(e.pointerId); } catch { /* ignore */ }

  const st = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, ghost: null, raf: 0 };
  const DRAG_THRESHOLD = 6; // px — below this it's a tap, not a drag
  const EDGE = 72; // px from the top/bottom of the screen where the page scrolls itself
  const mine = (ev) => ev.pointerId === e.pointerId;

  const highlight = () => {
    clearDropHighlights();
    const target = findTarget(st.x, st.y, payload);
    if (target) target.classList.add(target.classList.contains('freezer') ? 'fz-hot' : 'slot-hot');
  };

  // A finger can't scroll the page while it is dragging, so near the screen edge the page
  // scrolls itself: otherwise a day that is off screen on a phone could never be reached.
  const edgeScroll = () => {
    st.raf = 0;
    if (!st.moved) return;
    // Hold still over anything marked data-noscroll (the week buttons): you're aiming at it.
    if (document.elementFromPoint(st.x, st.y)?.closest('[data-noscroll]')) return;
    const h = window.innerHeight;
    const dy = st.y < EDGE ? -(EDGE - st.y) : st.y > h - EDGE ? st.y - (h - EDGE) : 0;
    if (!dy) return;
    const before = window.scrollY;
    window.scrollBy(0, Math.round(dy / 6));
    if (window.scrollY !== before) highlight();
    st.raf = requestAnimationFrame(edgeScroll);
  };

  const move = (ev) => {
    if (!mine(ev)) return;
    st.x = ev.clientX;
    st.y = ev.clientY;
    if (!st.moved && Math.hypot(ev.clientX - st.sx, ev.clientY - st.sy) < DRAG_THRESHOLD) return;
    st.moved = true;

    if (!st.ghost) {
      st.ghost = document.createElement('div');
      st.ghost.className = 'drag-ghost';
      st.ghost.style.setProperty('--gc', payload.colour || '#888');
      st.ghost.textContent = payload.label || '';
      document.body.appendChild(st.ghost);
      tile.classList.add('dragging');
    }
    st.ghost.style.left = `${ev.clientX}px`;
    st.ghost.style.top = `${ev.clientY}px`;

    highlight();
    if (!st.raf) st.raf = requestAnimationFrame(edgeScroll);
  };

  // Listen on window, not the tile: a drop target may re-render the board mid-drag (the
  // Weekly view switches week when you hover a week button), which removes the tile.
  const finish = (ev) => {
    if (!mine(ev)) return;
    try { tile.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    cancelAnimationFrame(st.raf);
    tile.classList.remove('dragging');
    clearDropHighlights();
    st.ghost?.remove();

    if (st.moved && ev.type === 'pointerup') {
      const target = findTarget(ev.clientX, ev.clientY, payload);
      if (target) onDrop(target, payload);
    } else if (!st.moved && ev.type === 'pointerup' && onTap) {
      onTap();
    }
    onEnd();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}
