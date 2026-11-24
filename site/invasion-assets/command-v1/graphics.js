/* Invasion · Command graphics pack v1. No model state or random-number consumption. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src).href;
  const earth = new Image();
  earth.src = base + 'earth.webp';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const paths = {
    D1: 'M16 3 27 8v8c0 7-11 13-11 13S5 23 5 16V8Z M10 16h12 M16 10v12',
    D2: 'M6 27v-9l5-4 5 4v9 M21 14l5 4v9 M11 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M23 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M3 27h26',
    D3: 'M16 3 23 21l-7-3-7 3Z M16 18v7 M4 12l4 10-4-2-2 2Z M27 12l3 10-3-2-3 2Z M14 29h4',
    D4: 'M7 26 23 6 M17 6h6v6 M4 28h12 M10 22l4 4 M25 2v-1 M29 6h2',
    E1: 'M4 11 16 4l12 7v16H4Z M4 11h24 M9 15h4v7H9Z M19 15h4v7h-4Z M13 27v-5h6v5',
    E2: 'M3 27h26 M6 27V15l5-5v17 M14 27V5h7v22 M24 27V17h3v10 M17 9h1 M17 13h1 M17 17h1 M2 13 5 7 10 4',
    E3: 'M3 12 16 4l13 8 M5 12h22v16H5Z M10 28V16h12v12 M16 16v12 M2 31h28 M12 22h2 M18 22h2',
    E4: 'M16 4v8 M16 12 6 19 M16 12l10 7 M6 19v8 M26 19v8 M3 27h6 M23 27h6 M13 4h6 M13 27h6 M16 19v8',
    S1: 'M8 5c-2 9 4 17 14 15Z M15 12l8-8 M23 3v5 M20 5h6 M15 20l-3 8 M7 28h17 M18 21l3 7',
    S2: 'M10 3c0 11 12 15 12 26 M22 3c0 11-12 15-12 26 M10 6h12 M11 13h10 M11 20h10 M10 26h12',
    S3: 'M11 11h10v10H11Z M16 2v9 M16 21v9 M2 16h9 M21 16h9 M5 5l6 6 M21 21l6 6 M5 27l6-6 M21 11l6-6',
    S4: 'M16 3 27 8v8c0 7-11 13-11 13S5 23 5 16V8Z M10 14l6-4 6 4v7l-6 4-6-4Z M10 14l6 4 6-4 M16 18v7',
    H1: 'M3 17h26l-5 8H8Z M9 17V9h14v8 M12 9V5h8v4 M7 29h18 M13 21h6',
    H2: 'M16 3v26 M3 16h26 M7 7l18 18 M7 25 25 7 M16 8a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
    H3: 'M3 8h26 M7 8v8l9 5 9-5V8 M7 21l9 5 9-5 M7 26l9 5 9-5 M16 21v10',
    soc: 'M16 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M8 27v-6a8 8 0 0 1 16 0v6 M3 27h26 M4 14l3 3 M28 14l-3 3',
    eco: 'M4 27V15h6v12 M13 27V9h6v18 M22 27V3h6v24 M2 30h28',
    prj: 'M16 3 29 10 16 17 3 10Z M3 16l13 7 13-7 M3 22l13 7 13-7 M16 17v12',
    war: 'M16 2v28 M2 16h28 M16 6a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M16 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    log: 'M7 3h18v26H7Z M11 9h10 M11 14h10 M11 19h7 M11 24h4',
    orbit: 'M16 8a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M3 22 29 10 M4 25l-2-5 M28 7l2 5',
    sky: 'M3 23 16 7l13 16-13-6Z M16 17v11',
    ground: 'M3 25h26 M5 25V14h7V7h8v7h7v11 M9 18h2 M21 18h2 M14 25v-6h4v6',
    inside: 'M16 3 27 8v8c0 7-11 13-11 13S5 23 5 16V8Z M16 12v7 M16 23v1'
  };
  function icon(id, extra = '') {
    return paths[id] ? `<svg class="ig-icon ${extra}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id]}"/></svg>` : '';
  }
  const branches = {
    def: ['01', 'Defence', 'Orbital & surface operations', 'defence.webp'],
    end: ['02', 'Endurance', 'Civil protection & continuity', 'endurance.webp'],
    sci: ['03', 'Science', 'Signal & applied research', 'science.webp'],
    emg: ['04', 'Emergent', 'Combined strategic capabilities', 'defence.webp']
  };
  function banner(branch) {
    const b = branches[branch];
    if (!b) return '';
    return `<div class="ig-branch ig-${branch}" style="--branch-art:url('${base + b[3]}')"><div><span class="ig-eyebrow">DIRECTORATE / ${b[0]}</span><b>${b[1]}</b><span>${b[2]}</span></div></div>`;
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function backdrop(c, w, h, now) {
    c.save();
    const haze = c.createRadialGradient(w * .42, h * .52, 0, w * .42, h * .52, Math.max(w, h) * .65);
    haze.addColorStop(0, 'rgba(44,87,108,.26)'); haze.addColorStop(1, 'rgba(8,16,25,0)');
    c.fillStyle = haze; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(118,164,185,.06)'; c.lineWidth = .5;
    c.beginPath();
    for (let x = 12; x < w; x += 24) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = 12; y < h; y += 24) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke(); c.restore();
  }
  function rings(c, {cx, cy, R}, now, year) {
    c.save(); c.lineWidth = .7;
    c.strokeStyle = 'rgba(142,191,209,.19)'; circle(c, cx, cy, R * 1.19); c.stroke();
    c.setLineDash([2, 7]); circle(c, cx, cy, R * 1.75); c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU, r = R * 1.2, len = i % 4 ? 2 : 5;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      c.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len)); c.stroke();
    }
    // A visual countdown arc, using the real preparation year.
    c.strokeStyle = year >= 90 ? '#ed836c' : '#e0a46a'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(cx, cy, R * 1.2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, Math.max(.002, year / 100))); c.stroke();
    c.restore();
  }
  function planet(c, cx, cy, r) {
    if (!earth.complete || !earth.naturalWidth) return false;
    // The generated disc occupies ~86% of the transparent master.
    const d = r * 2 / .86;
    c.drawImage(earth, cx - d / 2, cy - d / 2, d, d);
    return true;
  }
  function ship(c, x, y, angle, hostile, scale = 1) {
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale);
    // Local ship axis points to the right. Hostiles remain unidentified radar contacts.
    const hull = c.createLinearGradient(0, -5, 0, 5);
    hull.addColorStop(0, hostile ? '#e9a18d' : '#dbe4e5');
    hull.addColorStop(.48, hostile ? '#9d4a40' : '#849eac');
    hull.addColorStop(1, hostile ? '#3a2228' : '#243947');
    c.fillStyle = hull; c.strokeStyle = hostile ? '#e68c79' : '#b9cdd5'; c.lineWidth = .65;
    c.beginPath();
    if (hostile) { c.moveTo(8, 0); c.lineTo(-1, 4); c.lineTo(-6, 2); c.lineTo(-3, 0); c.lineTo(-6, -2); c.lineTo(-1, -4); }
    else { c.moveTo(9, 0); c.lineTo(3, 2.5); c.lineTo(-4, 3); c.lineTo(-7, 5); c.lineTo(-5, 0); c.lineTo(-7, -5); c.lineTo(-4, -3); c.lineTo(3, -2.5); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = hostile ? '#ed836c' : '#e0a46a'; c.fillRect(1, -.7, 3, 1.4);
    const flame = c.createLinearGradient(-5, 0, -15, 0);
    flame.addColorStop(0, hostile ? 'rgba(237,131,108,.85)' : 'rgba(160,216,237,.9)'); flame.addColorStop(1, 'rgba(100,174,211,0)');
    c.fillStyle = flame; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-15, 0); c.lineTo(-5, 1); c.fill();
    c.restore();
  }
  function shield(c, cx, cy, r, strength, now) {
    c.save(); circle(c, cx, cy, r); c.clip();
    c.strokeStyle = `rgba(142,191,209,${.13 * strength})`; c.lineWidth = .55;
    const s = Math.max(6, r / 7);
    for (let row = -8; row <= 8; row++) for (let col = -8; col <= 8; col++) {
      const x = cx + col * s * 1.73 + (row % 2 ? s * .865 : 0), y = cy + row * s * 1.5;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6 + 1 / 12) * TAU; const X = x + Math.cos(a) * s, Y = y + Math.sin(a) * s; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      c.closePath(); c.stroke();
    }
    c.restore();
  }
  function impact(c, x, y, k) {
    c.save(); c.globalAlpha = Math.max(0, 1 - k);
    const glow = c.createRadialGradient(x, y, 0, x, y, 4 + k * 12);
    glow.addColorStop(0, '#fff4d4'); glow.addColorStop(.25, '#ed986c'); glow.addColorStop(1, 'rgba(237,131,108,0)');
    c.fillStyle = glow; c.fillRect(x - 17, y - 17, 34, 34);
    c.strokeStyle = '#e0a46a'; c.lineWidth = .7; circle(c, x, y, 3 + k * 14); c.stroke();
    c.restore();
  }
  function decorate(s, game) {
    document.body.dataset.igScreen = s;
    document.body.dataset.igAlert = game && game.year >= 90 ? 'arrival' : 'normal';
    if (game) document.body.dataset.igTab = game.tab;
  }
  function init() {
    document.documentElement.classList.add('command-gfx');
    if (document.querySelector('.hubmap')) document.body.classList.add('ig-hub');
    const title = document.querySelector('#screen-title');
    if (title) {
      const art = document.createElement('div'); art.className = 'ig-title-art'; art.setAttribute('aria-hidden', 'true');
      art.innerHTML = `<span class="ig-reticle"></span><img src="${base}earth.webp" alt="" width="768" height="768"><span class="ig-coordinate">SOL SYSTEM / EARTH</span><span class="ig-contact">HOSTILE SIGNAL<br>100 LIGHT-YEARS</span>`;
      title.prepend(art);
      const manual = title.querySelector('.howto');
      if (manual) {
        const details = document.createElement('details'); details.className = 'ig-manual';
        const summary = document.createElement('summary'); summary.textContent = 'FIELD MANUAL';
        manual.before(details); details.append(summary, manual);
      }
    }
    document.querySelectorAll('#tabs [data-t]').forEach(b => b.insertAdjacentHTML('afterbegin', icon(b.dataset.t)));
    document.querySelectorAll('#dock [data-dk]').forEach(b => {
      const i = b.querySelector('i'); if (i && paths[b.dataset.dk]) i.innerHTML = icon(b.dataset.dk);
    });
    const pause = document.querySelector('#pauseBtn'); if (pause) pause.setAttribute('aria-label', 'Pause or resume time');
    const speed = document.querySelector('#spdBtn'); if (speed) speed.setAttribute('aria-label', 'Change simulation speed');
  }
  window.InvasionGraphics = Object.freeze({ version: 'command-v1', icon, paths, banner, backdrop, rings, planet, ship, shield, impact, decorate, get reducedMotion() { return motion.matches; } });
  init();
})();
