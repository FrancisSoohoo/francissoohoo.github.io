// Fig. 006: The Canvas, playable. A shared pixel wall with the rules of our HCD web prototype:
// tap your card for five pixels, placing on an empty cell or erasing costs one, recolouring is
// free, and after your five there is a short break before the next tap (a co-design request).
// The wall is seeded from a canvas students drew during testing, redrawn in the catalogue's inks.
import { roll, clamp, coarse, INK, PAPER, ZINC } from './util.js';
import { audioCtx, out } from './sound.js';

const COLS = 64, ROWS = 20, PER_TAP = 5, BREAK_S = 8;

export function initHcd() {
  const canvas = document.getElementById('hcd-canvas');
  const ctx = canvas.getContext('2d');
  const tapBtn = document.getElementById('hcd-tap');
  const tapLabel = document.getElementById('hcd-tap-label');
  const statusEl = document.getElementById('hcd-status');
  const dotsEl = document.getElementById('hcd-dots');
  const fig = document.getElementById('hcd-fig');
  if (coarse) document.getElementById('hcd-hint').textContent = 'Tap your card, then tap or drag on the wall';

  const grid = new Uint8Array(COLS * ROWS); // 0 empty, 1 ink, 2 dense dots, 3 light dots, 4 zinc
  const mine = new Uint8Array(COLS * ROWS);
  let left = 0, tone = 1, breakUntil = 0, cursor = { c: 8, r: 6 }, showCursor = false, painting = false, lastCell = -1;
  let cw = 1, chh = 1, dpr = 1, cell = 10, ox = 0, oy = 0;

  // keep a visitor's own pixels between visits (a convenience; the wall works without it)
  const KEY = 'soohoo-canvas-v1';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...grid].map((v, i) => (mine[i] ? v : -1)))); } catch { /* storage off */ } };
  function restore() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(a) && a.length === grid.length) a.forEach((v, i) => { if (v >= 0) { grid[i] = v; mine[i] = 1; } });
    } catch { /* storage off */ }
  }

  /* ---------- seed from the test canvas ---------- */
  function seedFrom(src, c0, cols) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas'); off.width = cols; off.height = ROWS;
        const g = off.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, cols, ROWS);
        const d = g.getImageData(0, 0, cols, ROWS).data;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
          const k = (r * cols + c) * 4, R = d[k], G = d[k + 1], B = d[k + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B), L = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
          const sat = mx ? (mx - mn) / mx : 0;
          if (L > 0.86 && sat < 0.18) continue; // background
          const yellowish = R > 150 && G > 110 && B < 110 && R > B + 60;
          const t = yellowish ? 4 : L < 0.42 ? 1 : L < 0.66 ? 2 : 3;
          const i = r * COLS + c0 + c;
          if (!mine[i]) grid[i] = t;
        }
        resolve();
      };
      img.onerror = resolve;
      img.src = src;
    });
  }

  /* ---------- drawing ---------- */
  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.max(1, r.width); chh = Math.max(1, r.height);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    cell = Math.min(cw / COLS, chh / ROWS);
    ox = (cw - cell * COLS) / 2; oy = (chh - cell * ROWS) / 2;
  }
  function paintCell(c, r, t, own) {
    const x = ox + c * cell, y = oy + r * cell, s = cell;
    if (t === 1) { ctx.fillStyle = INK; ctx.fillRect(x, y, s, s); }
    else if (t === 4) { ctx.fillStyle = ZINC; ctx.fillRect(x, y, s, s); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); }
    else if (t === 2 || t === 3) {
      ctx.fillStyle = INK;
      const step = s / 3, rad = t === 2 ? step * 0.42 : step * 0.24;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.arc(x + step * (a + 0.5), y + step * (b + 0.5), rad, 0, Math.PI * 2); ctx.fill(); }
    }
    if (own && t) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cw, chh);
    // the grid lines of the wall
    ctx.strokeStyle = 'rgba(17,17,17,.12)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) { const x = Math.round(ox + c * cell) + 0.5; ctx.moveTo(x, oy); ctx.lineTo(x, oy + ROWS * cell); }
    for (let r = 0; r <= ROWS; r++) { const y = Math.round(oy + r * cell) + 0.5; ctx.moveTo(ox, y); ctx.lineTo(ox + COLS * cell, y); }
    ctx.stroke();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const i = r * COLS + c; if (grid[i]) paintCell(c, r, grid[i], mine[i]); }
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, COLS * cell, ROWS * cell);
    if (showCursor) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(ox + cursor.c * cell - 1, oy + cursor.r * cell - 1, cell + 2, cell + 2); }
  }

  /* ---------- the rules ---------- */
  function tick(f = 1400) {
    const ac = audioCtx(); if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.05);
    g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    o.connect(g).connect(out()); o.start(t); o.stop(t + 0.08);
  }
  function setLeft(n) {
    left = n; roll('hcd-left', left);
    dotsEl.textContent = '';
    for (let k = 0; k < PER_TAP; k++) { const s = document.createElement('i'); if (k < left) s.className = 'on'; dotsEl.appendChild(s); }
  }
  function tap() {
    const now = performance.now();
    if (now < breakUntil) { statusEl.textContent = `Break first: ${Math.ceil((breakUntil - now) / 1000)} s. Look up from the screen.`; return; }
    if (left > 0) { statusEl.textContent = `You still have ${left} pixel${left === 1 ? '' : 's'}.`; return; }
    setLeft(PER_TAP);
    tick(900); setTimeout(() => tick(1300), 90);
    statusEl.textContent = 'Card accepted. Five pixels: make something.';
    tapBtn.classList.add('is-tapped'); setTimeout(() => tapBtn.classList.remove('is-tapped'), 400);
    canvas.focus({ preventScroll: true });
  }
  function startBreak() {
    breakUntil = performance.now() + BREAK_S * 1000;
    tapBtn.disabled = true;
    const iv = setInterval(() => {
      const s = Math.ceil((breakUntil - performance.now()) / 1000);
      if (s <= 0) { clearInterval(iv); tapBtn.disabled = false; tapLabel.textContent = 'Tap your card'; statusEl.textContent = 'Break over. Tap again for five more.'; return; }
      tapLabel.textContent = `Break · ${s} s`;
    }, 250);
    statusEl.textContent = 'All five placed. Take a short break; the wall keeps them.';
  }
  function place(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const i = r * COLS + c;
    if (i === lastCell) return;
    lastCell = i;
    const cur = grid[i];
    const costs = (cur === 0 && tone !== 0) || (cur !== 0 && tone === 0);
    if (cur === 0 && tone === 0) return;
    if (costs && left <= 0) { statusEl.textContent = performance.now() < breakUntil ? 'On a break. The wall will wait.' : 'Tap your card for pixels.'; return; }
    if (cur === tone) return;
    grid[i] = tone; mine[i] = tone ? 1 : 0;
    if (costs) { setLeft(left - 1); if (left === 0) startBreak(); }
    tick(tone === 0 ? 600 : 1200 + tone * 120);
    save(); draw();
  }

  /* ---------- input ---------- */
  const cellAt = (ev) => { const r = canvas.getBoundingClientRect(); return { c: Math.floor((ev.clientX - r.left - ox) / cell), r: Math.floor((ev.clientY - r.top - oy) / cell) }; };
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); canvas.focus({ preventScroll: true }); audioCtx();
    painting = true; lastCell = -1; showCursor = false;
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
    const p = cellAt(ev); place(p.c, p.r);
  });
  canvas.addEventListener('pointermove', (ev) => { if (!painting) return; const p = cellAt(ev); place(p.c, p.r); });
  const stop = () => { painting = false; lastCell = -1; };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('keydown', (ev) => {
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (mv) { ev.preventDefault(); showCursor = true; cursor.c = clamp(cursor.c + mv[0], 0, COLS - 1); cursor.r = clamp(cursor.r + mv[1], 0, ROWS - 1); draw(); return; }
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); showCursor = true; lastCell = -1; place(cursor.c, cursor.r); draw(); return; }
    if (ev.key === 't' || ev.key === 'T') { ev.preventDefault(); tap(); }
  });
  canvas.addEventListener('blur', () => { if (showCursor) { showCursor = false; draw(); } });
  tapBtn.addEventListener('click', () => { audioCtx(); tap(); });
  fig.querySelectorAll('[data-tone]').forEach((b) => b.addEventListener('click', () => {
    fig.querySelectorAll('[data-tone]').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    tone = +b.dataset.tone;
  }));

  new ResizeObserver(() => { size(); draw(); }).observe(canvas);
  restore(); setLeft(0); size(); draw();
  Promise.all([seedFrom('assets/hcd/hcd-test-canvas-1.jpg', 0, 32), seedFrom('assets/hcd/hcd-test-canvas-2.jpg', 32, 32)]).then(draw);
}
