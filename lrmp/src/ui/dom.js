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

  const st = { sx: e.clientX, sy: e.clientY, moved: false, ghost: null };
  const DRAG_THRESHOLD = 6; // px — below this it's a tap, not a drag

  const move = (ev) => {
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

    clearDropHighlights();
    const target = findTarget(ev.clientX, ev.clientY, payload);
    if (target) {
      target.classList.add(target.classList.contains('freezer') ? 'fz-hot' : 'slot-hot');
    }
  };

  const finish = (ev) => {
    try { tile.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    tile.removeEventListener('pointermove', move);
    tile.removeEventListener('pointerup', finish);
    tile.removeEventListener('pointercancel', finish);
    tile.classList.remove('dragging');
    clearDropHighlights();
    st.ghost?.remove();

    if (st.moved) {
      const target = findTarget(ev.clientX, ev.clientY, payload);
      if (target) onDrop(target, payload);
    } else if (onTap) {
      onTap();
    }
    onEnd();
  };

  tile.addEventListener('pointermove', move);
  tile.addEventListener('pointerup', finish);
  tile.addEventListener('pointercancel', finish);
}
