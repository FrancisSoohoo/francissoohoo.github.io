// Head studs.
// Fig. 003: a section through block, gasket and head. Hold to torque the nut: the stud stretches,
//           the gasket compresses and a click-type wrench clicks at target. Assumed M10, illustrative.
// Fig. 004: torque bench. Run the sequence, or click the six fasteners yourself; out-of-order
//           tightening leaves uneven clamp. Bolts vs studs: friction scatter -> clamp scatter.
import { roll, gauss, onceNear, reduced, clamp } from './util.js';
import { audioCtx, out } from './sound.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const INK = '#111', PAPER = '#F2F2EE', ZINC = '#E3B505';

/* =================== Fig. 003: the measured stack, torqued =================== */
// Measured (Francis's sheet): A counterbore Ø20, B head depth 51, C hole Ø10, D head gasket 0.45
// (0.25-0.58), E cylinder body 60.1, F body gasket 0.3, G crankcase thread depth 32.7, H M9x1.25,
// I counterbore depth 15 (20 max). Assumed for the demo: washer 2, nut 9, 2 threads proud,
// 30 mm engagement, 40 N·m target, nut factor 0.12, E = 205 GPa.
const DIM = { A: 20, B: 51, C: 10, E: 60.1, F: 0.3, G: 32.7, D_NOM: 9, PITCH: 1.25 };
const ASSUME = { washer: 2, nut: 9, proud: 2.5, engage: 30, target: 40, K: 0.12, Emod: 205e3, gasketK: 700e3 };
const SHANK_A = Math.PI * 4.5 * 4.5; // mm²

function clickSound() {
  const c = audioCtx(); if (!c) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.04), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const n = c.createBufferSource(); n.buffer = buf;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = c.createGain(); g.gain.value = 0.5;
  n.connect(hp).connect(g).connect(out()); n.start(t);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.value = 2900; og.gain.setValueAtTime(0.06, t); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
  o.connect(og).connect(out()); o.start(t); o.stop(t + 0.1);
}

function initTorque() {
  const svg = document.getElementById('torque-svg');
  const dial = document.getElementById('torque-dial');
  const btn = document.getElementById('tq-hold');
  const resetBtn = document.getElementById('tq-reset');
  const label = document.getElementById('tq-label');
  const status = document.getElementById('tq-status');
  const gasketIn = document.getElementById('tq-gasket');
  const cboreIn = document.getElementById('tq-cbore');
  if (!svg) return;
  const $ = (id) => document.getElementById(id);

  const AX = 62, X0 = 22, X1 = 102;      // axis and block extents (mm)
  const GX = 8;                           // gasket draw exaggeration
  const TEXT = { 'font-family': 'Archivo, sans-serif', 'font-size': 5.2, 'font-weight': 800, fill: INK, style: 'paint-order:stroke;stroke:#F2F2EE;stroke-width:1.6px' };
  const layer = el('g', {}, svg);
  const dial0 = buildDial();

  let T = 0, holding = false, clicked = false, raf = 0, last = 0;
  let gasketD = +gasketIn.value / 100, cboreI = +cboreIn.value / 10;

  function geometry() {
    const grip = DIM.B + gasketD + DIM.E + DIM.F;
    const stack = ASSUME.washer + ASSUME.nut + ASSUME.proud;
    return { grip, studLen: ASSUME.engage + grip + stack, topClear: cboreI - stack };
  }

  function hatchRect(x, y, w, h) { return el('rect', { x, y, width: w, height: h, fill: 'url(#hatch)', stroke: INK, 'stroke-width': 0.7 }, layer); }

  function draw() {
    layer.innerHTML = '';
    const F = T / (ASSUME.K * (DIM.D_NOM / 1000)) ;              // N (T in N·m, d in m)
    const geo = geometry();
    const dL = (F * geo.grip) / (ASSUME.Emod * SHANK_A);          // mm
    const s = T / ASSUME.target;
    const comp = clamp(s, 0, 1) * 0.35;                            // fraction of drawn gasket squeezed
    const dGd = Math.max(1.4, gasketD * GX), fGd = Math.max(1.2, DIM.F * GX);

    // stack, top down (y in mm)
    let y = 8;
    const yHeadTop = y, yCb = y + cboreI, yHeadBot = yCb + DIM.B;
    const yHG = yHeadBot, yBody = yHG + dGd * (1 - comp), yBodyBot = yBody + DIM.E;
    const yBG = yBodyBot, yCase = yBG + fGd * (1 - comp * 0.6), yThreadEnd = yCase + DIM.G, yCaseBot = Math.min(194, yThreadEnd + 9);
    const shift = (dGd + fGd) * comp * 0.6;                        // head creeps down as gaskets squeeze
    const hy = (v) => v + shift;

    // cylinder head with counterbore and hole
    const cb = DIM.A / 2, hole = DIM.C / 2;
    el('path', { d: `M${X0} ${hy(yHeadTop)} H${AX - cb} V${hy(yCb)} H${AX - hole} V${hy(yHeadBot)} H${X0} Z`, fill: 'url(#hatch)', stroke: INK, 'stroke-width': 0.7 }, layer);
    el('path', { d: `M${X1} ${hy(yHeadTop)} H${AX + cb} V${hy(yCb)} H${AX + hole} V${hy(yHeadBot)} H${X1} Z`, fill: 'url(#hatch)', stroke: INK, 'stroke-width': 0.7 }, layer);
    // gaskets
    el('rect', { x: X0, y: hy(yHG), width: AX - hole - X0, height: yBody - yHG, fill: INK }, layer);
    el('rect', { x: AX + hole, y: hy(yHG), width: X1 - AX - hole, height: yBody - yHG, fill: INK }, layer);
    // cylinder body
    hatchRect(X0, yBody + shift * 0.4, AX - hole - X0, yBodyBot - yBody);
    hatchRect(AX + hole, yBody + shift * 0.4, X1 - AX - hole, yBodyBot - yBody);
    el('rect', { x: X0, y: yBG + shift * 0.4, width: AX - hole - X0, height: yCase - yBG, fill: INK }, layer);
    el('rect', { x: AX + hole, y: yBG + shift * 0.4, width: X1 - AX - hole, height: yCase - yBG, fill: INK }, layer);
    // crankcase with threaded blind hole
    const r9 = DIM.D_NOM / 2, rMinor = r9 - 0.68;
    let zl = `M${X0} ${yCase} H${AX - r9}`, zr = `M${X1} ${yCase} H${AX + r9}`;
    for (let yy = yCase, k = 0; yy < yThreadEnd; yy += DIM.PITCH / 2, k++) {
      zl += ` L${AX - (k % 2 ? r9 : rMinor)} ${yy + DIM.PITCH / 2}`;
      zr += ` L${AX + (k % 2 ? r9 : rMinor)} ${yy + DIM.PITCH / 2}`;
    }
    zl += ` L${AX} ${yThreadEnd + 2.6} L${AX} ${yCaseBot} H${X0} Z`;
    zr += ` L${AX} ${yThreadEnd + 2.6} L${AX} ${yCaseBot} H${X1} Z`;
    el('path', { d: zl, fill: 'url(#hatch)', stroke: INK, 'stroke-width': 0.7 }, layer);
    el('path', { d: zr, fill: 'url(#hatch)', stroke: INK, 'stroke-width': 0.7 }, layer);

    // stud (stretch exaggerated x20 at the top)
    const yStudBot = yCase + ASSUME.engage;
    const yWasher = hy(yCb) - ASSUME.washer, yNut = yWasher - ASSUME.nut;
    const yStudTop = yNut - ASSUME.proud - dL * 20;
    const lvl = Math.round(clamp(s, 0, 1) * 4);
    el('rect', { x: AX - r9, y: yStudTop, width: r9 * 2, height: yStudBot - yStudTop, fill: lvl ? `url(#ht-${lvl})` : PAPER, stroke: INK, 'stroke-width': 0.8 }, layer);
    // engaged threads + nut threads
    for (let yy = yCase + 1; yy < yStudBot - 0.5; yy += DIM.PITCH) el('line', { x1: AX - r9, y1: yy, x2: AX + r9, y2: yy + 0.9, stroke: INK, 'stroke-width': 0.35 }, layer);
    for (let yy = yStudTop + 0.6; yy < yWasher; yy += DIM.PITCH) el('line', { x1: AX - r9, y1: yy, x2: AX + r9, y2: yy + 0.9, stroke: INK, 'stroke-width': 0.35 }, layer);
    // washer + nut (and the socket while torquing)
    el('rect', { x: AX - 8, y: yWasher, width: 16, height: ASSUME.washer, fill: PAPER, stroke: INK, 'stroke-width': 0.7 }, layer);
    const nut = el('rect', { x: AX - 7, y: yNut, width: 14, height: ASSUME.nut, fill: ZINC, stroke: INK, 'stroke-width': 0.8, style: 'cursor:pointer' }, layer);
    nut.addEventListener('pointerdown', (ev) => { ev.preventDefault(); press(); });
    const th = (T / ASSUME.target) * 2.25;
    [0, 1].forEach((i) => { const x = AX + Math.cos(th + i * 1.05 + 0.5) * 6.4; el('line', { x1: x, y1: yNut + 0.6, x2: x, y2: yNut + ASSUME.nut - 0.6, stroke: INK, 'stroke-width': 0.4 }, layer); });
    if (holding || clicked) el('rect', { x: AX - 8, y: yNut - 10, width: 16, height: 10 + ASSUME.nut - 1, fill: 'none', stroke: INK, 'stroke-width': 0.5, 'stroke-dasharray': '1.5 1' }, layer);
    // clamp arrows on the counterbore floor
    if (s > 0.02) [AX - 9.4, AX + 9.4].forEach((x) => {
      const len = 2 + s * 7;
      el('line', { x1: x, y1: hy(yCb) - len - 0.6, x2: x, y2: hy(yCb) - 1.4, stroke: INK, 'stroke-width': 0.7 }, layer);
      el('path', { d: `M${x - 1.4} ${hy(yCb) - 2.4} L${x} ${hy(yCb) - 0.4} L${x + 1.4} ${hy(yCb) - 2.4} Z`, fill: INK }, layer);
    });
    // centre line
    el('line', { x1: AX, y1: 2, x2: AX, y2: 195, stroke: INK, 'stroke-width': 0.3, 'stroke-dasharray': '5 1.2 1 1.2' }, layer);

    // dimension tags (letters as on the drawing)
    const tag = (x, y, letter) => { el('circle', { cx: x, cy: y, r: 3.1, fill: PAPER, stroke: INK, 'stroke-width': 0.6 }, layer); const t = el('text', { x, y: y + 1.8, 'text-anchor': 'middle', 'font-family': 'Archivo, sans-serif', 'font-size': 4.6, 'font-weight': 800, fill: INK }, layer); t.textContent = letter; };
    const vdim = (x, ya, yb, letter) => {
      el('line', { x1: x, y1: ya, x2: x, y2: yb, stroke: INK, 'stroke-width': 0.4 }, layer);
      el('path', { d: `M${x - 1} ${ya + 2} L${x} ${ya} L${x + 1} ${ya + 2} M${x - 1} ${yb - 2} L${x} ${yb} L${x + 1} ${yb - 2}`, fill: 'none', stroke: INK, 'stroke-width': 0.4 }, layer);
      tag(x + 4.4, (ya + yb) / 2, letter);
    };
    const hdim = (y, xa, xb, letter) => {
      el('line', { x1: xa, y1: y, x2: xb, y2: y, stroke: INK, 'stroke-width': 0.4 }, layer);
      tag((xa + xb) / 2, y - 4, letter);
    };
    hdim(hy(yHeadTop) + 3, AX - cb, AX + cb, 'A');
    vdim(X1 + 6, hy(yCb), hy(yHeadBot), 'B');
    hdim(hy(yCb) + 26, AX - hole, AX + hole, 'C');
    tag(X1 + 10, hy(yHG) + 1, 'D');
    vdim(X1 + 6, yBody + shift * 0.4, yBodyBot + shift * 0.4, 'E');
    tag(X1 + 10, yBG + 2, 'F');
    vdim(X1 + 6, yCase, yThreadEnd, 'G');
    tag(AX + 14, yCase + 14, 'H');
    vdim(X0 - 6, hy(yHeadTop), hy(yCb), 'I');
    // part names
    const name = (x, y, text) => { const t = el('text', { x, y, ...TEXT }, layer); t.textContent = text; };
    name(X0 + 2, hy(yHeadTop) + 30, 'HEAD');
    name(X0 + 2, yBody + 30, 'BODY');
    name(X0 + 2, yCase + 22, 'CRANKCASE');
    name(AX + 9.5, yNut + 6.5, 'NUT');

    // readouts
    $('tq-t').textContent = T.toFixed(1);
    $('tq-f').textContent = (F / 1000).toFixed(1);
    $('tq-s').textContent = Math.round(dL * 1000);
    $('tq-a').textContent = Math.round((((dL + comp * 0.12) / DIM.PITCH) * 360));
    $('tq-grip').textContent = geo.grip.toFixed(1);
    $('tq-len').textContent = geo.studLen.toFixed(1);
    $('tq-clear').textContent = geo.topClear >= 0 ? `${geo.topClear.toFixed(1)} mm below` : `${(-geo.topClear).toFixed(1)} mm proud`;
    $('tq-clear').classList.toggle('is-bad', geo.topClear < 0);
    $('tq-gasket-out').textContent = `${gasketD.toFixed(2)} mm`;
    $('tq-cbore-out').textContent = `${cboreI.toFixed(1)} mm`;
    dial0(T);
    btn.style.setProperty('--hold', String(clamp(s, 0, 1)));
  }

  function buildDial() {
    const DC = { x: 100, y: 100, r: 78 }, MAX = 50;
    const ang = (v) => Math.PI - (clamp(v, 0, MAX) / MAX) * Math.PI;
    el('path', { d: `M${DC.x - DC.r} ${DC.y} A${DC.r} ${DC.r} 0 0 1 ${DC.x + DC.r} ${DC.y}`, fill: 'none', stroke: INK, 'stroke-width': 2 }, dial);
    for (let v = 0; v <= MAX; v += 5) {
      const a = ang(v), major = v % 10 === 0, r0 = DC.r - (major ? 12 : 6);
      el('line', { x1: DC.x + Math.cos(a) * r0, y1: DC.y - Math.sin(a) * r0, x2: DC.x + Math.cos(a) * DC.r, y2: DC.y - Math.sin(a) * DC.r, stroke: INK, 'stroke-width': major ? 1.8 : 1 }, dial);
      if (major) { const t = el('text', { x: DC.x + Math.cos(a) * (DC.r - 24), y: DC.y - Math.sin(a) * (DC.r - 24) + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: INK, 'font-family': 'JetBrains Mono, monospace' }, dial); t.textContent = v; }
    }
    const at = ang(ASSUME.target);
    el('path', { d: `M${DC.x + Math.cos(at + 0.04) * DC.r} ${DC.y - Math.sin(at + 0.04) * DC.r} A${DC.r} ${DC.r} 0 0 1 ${DC.x + Math.cos(at - 0.04) * DC.r} ${DC.y - Math.sin(at - 0.04) * DC.r}`, fill: 'none', stroke: ZINC, 'stroke-width': 9 }, dial);
    const u = el('text', { x: DC.x, y: DC.y - 26, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: INK, 'font-family': 'Archivo, sans-serif' }, dial); u.textContent = 'N·m';
    const needle = el('line', { x1: DC.x, y1: DC.y, stroke: INK, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, dial);
    el('circle', { cx: DC.x, cy: DC.y, r: 5, fill: INK }, dial);
    return (v) => { const a = ang(v); needle.setAttribute('x2', DC.x + Math.cos(a) * (DC.r - 6)); needle.setAttribute('y2', DC.y - Math.sin(a) * (DC.r - 6)); };
  }

  function frame(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (holding && !clicked) {
      T += dt * (9 + T * 0.45) * (reduced ? 1.5 : 1);
      if (T >= ASSUME.target) {
        T = ASSUME.target; clicked = true; holding = false; clickSound();
        btn.classList.add('is-running'); label.textContent = 'Torqued';
        const F = ASSUME.target / (ASSUME.K * DIM.D_NOM / 1000), geo = geometry();
        status.textContent = `Click. ${ASSUME.target} N·m: about ${(F / 1000).toFixed(0)} kN of clamp through a ${geo.grip.toFixed(1)} mm grip, so the stud stretches ${Math.round((F * geo.grip) / (ASSUME.Emod * SHANK_A) * 1000)} µm and holds the head down like a stiff spring. Loosen to go again.`;
      }
      draw();
    }
    if (holding) raf = requestAnimationFrame(frame);
  }
  function press() {
    if (clicked) return;
    holding = true; audioCtx();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function release() {
    if (!holding) return;
    holding = false;
    if (!clicked && T > 0.5) status.textContent = `${T.toFixed(0)} of ${ASSUME.target} N·m. Keep going: hold again until the wrench clicks.`;
    draw();
  }
  btn.addEventListener('pointerdown', (ev) => { if (ev.button > 0) return; ev.preventDefault(); try { btn.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } press(); });
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((e) => btn.addEventListener(e, release));
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointerleave', release);
  btn.addEventListener('keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); press(); } });
  btn.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); release(); } });
  btn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  resetBtn.addEventListener('click', () => {
    T = 0; clicked = false; holding = false;
    btn.classList.remove('is-running'); label.textContent = 'Hold to torque';
    status.textContent = 'Hold to torque: the wrench clicks at the target. Gaskets are drawn eight times thicker so you can see them.';
    draw();
  });
  gasketIn.addEventListener('input', () => { gasketD = +gasketIn.value / 100; draw(); });
  cboreIn.addEventListener('input', () => { cboreI = +cboreIn.value / 10; draw(); });
  draw();
}

/* =================== Fig. 004: torque bench =================== */
// head plan: x -1.8..1.8, z -0.925..0.925  ->  svg 360 x 230
const SX = (x) => 180 + x * 86;
const SY = (z) => 112 + z * 86;
const BORES = [-0.8, 0.8];
const FAST = [
  { x: 0, z: -0.72, seq: 1 }, { x: 0, z: 0.72, seq: 2 }, { x: -1.55, z: 0.72, seq: 3 },
  { x: 1.55, z: -0.72, seq: 4 }, { x: -1.55, z: -0.72, seq: 5 }, { x: 1.55, z: 0.72, seq: 6 },
];
const SD = { bolt: 0.17, stud: 0.06 };

function initBench() {
  const plan = document.getElementById('bench-plan');
  const strip = document.getElementById('bench-strip');
  const runBtn = document.getElementById('bench-run');
  const resetBtn = document.getElementById('bench-reset');
  const status = document.getElementById('bench-status');
  const segBtns = [...document.querySelectorAll('#stud-bench .seg button')];
  let mode = 'bolt', busy = false, builds = 0;
  const logged = { bolt: [], stud: [] };
  let manual = null; // { order: [], errors, finals }

  /* ---- plan view ---- */
  el('rect', { x: SX(-1.8), y: SY(-0.925), width: 3.6 * 86, height: 1.85 * 86, fill: 'none', stroke: INK, 'stroke-width': 2 }, plan);
  el('line', { x1: 10, y1: SY(0), x2: 350, y2: SY(0), stroke: INK, 'stroke-width': 0.8, 'stroke-dasharray': '14 4 2 4' }, plan);
  const ringSegs = [];
  BORES.forEach((bx) => {
    el('circle', { cx: SX(bx), cy: SY(0), r: 0.6 * 86, fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, plan);
    const N = 40, R = 0.69 * 86;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 0.86) / N) * Math.PI * 2;
      const p = el('path', {
        d: `M${SX(bx) + Math.cos(a0) * R} ${SY(0) + Math.sin(a0) * R} A${R} ${R} 0 0 1 ${SX(bx) + Math.cos(a1) * R} ${SY(0) + Math.sin(a1) * R}`,
        fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-linecap': 'butt',
      }, plan);
      ringSegs.push({ p, x: bx + Math.cos((a0 + a1) / 2) * 0.69, z: Math.sin((a0 + a1) / 2) * 0.69 });
    }
  });
  const fastEls = FAST.map((f, idx) => {
    const g = el('g', { class: 'fast', role: 'button', tabindex: '0', 'aria-label': `Torque fastener ${f.seq}` }, plan);
    const cx = SX(f.x), cy = SY(f.z), r = 11;
    const halo = el('circle', { cx, cy, r: 17, fill: 'none', stroke: INK, 'stroke-width': 1.4, 'stroke-dasharray': '3 3', class: 'fast-halo' }, g);
    el('circle', { cx, cy, r: 18, fill: 'transparent' }, g); // bigger hit area
    const hex = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`; }).join(' ');
    const poly = el('polygon', { points: hex, fill: PAPER, stroke: INK, 'stroke-width': 1.6 }, g);
    el('circle', { cx, cy, r: 4, fill: 'none', stroke: INK, 'stroke-width': 1 }, g);
    const gx = f.x < -1 ? cx + 17 : cx - 23, gy = cy - 18;
    el('rect', { x: gx, y: gy, width: 6, height: 36, fill: 'none', stroke: INK, 'stroke-width': 1 }, g);
    const fill = el('rect', { x: gx, y: gy + 36, width: 6, height: 0, fill: INK }, g);
    el('line', { x1: gx - 2, x2: gx + 8, y1: gy + 36 - 36 / 1.3, y2: gy + 36 - 36 / 1.3, stroke: INK, 'stroke-width': 1 }, g);
    const t = el('text', { x: cx, y: f.z < 0 ? cy - 22 : cy + 30, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: INK }, g);
    t.textContent = f.seq;
    g.addEventListener('click', () => manualTorque(idx));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); manualTorque(idx); } });
    return { g, poly, fill, halo, gx, gy, load: 0 };
  });
  const capt = el('text', { x: 180, y: 224, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#47473F', 'letter-spacing': '0.08em' }, plan);
  capt.textContent = 'NO. = ORDER · BAR = CLAMP · RING = SEAL';

  function drawLoads() {
    fastEls.forEach((f) => {
      const h = Math.min(36, (f.load / 130) * 36);
      f.fill.setAttribute('y', f.gy + 36 - h);
      f.fill.setAttribute('height', h);
      f.poly.setAttribute('fill', f.load > 0 ? ZINC : PAPER);
    });
    ringSegs.forEach((s) => {
      let wsum = 0, v = 0;
      FAST.forEach((f, i) => { const d2 = (f.x - s.x) ** 2 + (f.z - s.z) ** 2 + 0.05; const w = 1 / (d2 * d2); wsum += w; v += w * fastEls[i].load; });
      const c = v / wsum;
      s.p.setAttribute('stroke-width', Math.max(0.6, Math.min(6, (c / 100) * 4.2)).toFixed(2));
      s.p.setAttribute('stroke-dasharray', c > 0 && c < 82 ? '2 2.5' : 'none');
    });
    const loose = manual && !manual.done ? FAST.filter((_, i) => !manual.order.includes(i)).map((x) => x.seq) : [];
    const next = loose.length ? Math.min(...loose) : 0;
    fastEls.forEach((f, i) => f.halo.classList.toggle('is-next', next > 0 && FAST[i].seq === next));
  }

  /* ---- dot strip ---- */
  const X = (v) => 30 + ((v - 55) / 90) * 255;
  function drawStrip() {
    strip.innerHTML = '';
    el('line', { x1: X(100), x2: X(100), y1: 6, y2: 104, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, strip);
    [['Bolts', 34, 'bolt'], ['Studs', 78, 'stud']].forEach(([lbl, y, k]) => {
      el('line', { x1: 30, x2: 285, y1: y, y2: y, stroke: '#C4C4BB', 'stroke-width': 1 }, strip);
      const t = el('text', { x: 0, y: y + 4, 'font-size': 11, 'font-weight': 800, fill: INK }, strip);
      t.textContent = lbl.toUpperCase();
      logged[k].forEach((d) => el('circle', { cx: X(Math.max(55, Math.min(145, d.v))).toFixed(1), cy: (y + d.j).toFixed(1), r: 2.6, fill: d.last ? INK : 'none', stroke: INK, 'stroke-width': 1 }, strip));
    });
    [['−40%', 60], ['target', 100], ['+40%', 140]].forEach(([s, v]) => {
      const t = el('text', { x: X(v), y: 118, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 600, fill: '#47473F' }, strip);
      t.textContent = s;
    });
  }

  const scatter = () => 100 / (1 + SD[mode] * clamp(gauss(), -2.2, 2.2));
  function logBuild(finals) {
    const max = Math.max(...finals), min = Math.min(...finals), mean = finals.reduce((a, b) => a + b, 0) / finals.length;
    document.getElementById('bench-readout')?.classList.remove('is-empty');
    roll('bench-spread', Math.round(((max - min) / mean) * 100));
    builds += 1;
    roll('bench-count', builds);
    Object.values(logged).forEach((arr) => arr.forEach((d) => { d.last = false; }));
    finals.forEach((v) => logged[mode].push({ v, j: (Math.random() - 0.5) * 12, last: true }));
    if (logged[mode].length > 90) logged[mode].splice(0, logged[mode].length - 90);
    drawStrip();
  }
  function animateTo(idx, target, done) {
    const from = fastEls[idx].load, t0 = performance.now(), dur = reduced ? 1 : 320;
    const tick = (now) => {
      const t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
      fastEls[idx].load = from + (target - from) * e;
      drawLoads();
      if (t < 1) requestAnimationFrame(tick); else done?.();
    };
    requestAnimationFrame(tick);
  }

  function reset(msg) {
    manual = null;
    fastEls.forEach((f) => { f.load = 0; });
    drawLoads();
    status.textContent = msg || 'Or do it yourself: click the six fasteners in order, 1 to 6.';
  }

  function manualTorque(idx) {
    if (busy) return;
    if (!manual) { manual = { order: [], errors: 0, finals: [] }; fastEls.forEach((f) => { f.load = 0; }); }
    if (manual.order.includes(idx) || manual.order.length >= 6) return;
    const expected = Math.min(...FAST.filter((_, i) => !manual.order.includes(i)).map((x) => x.seq)), seq = FAST[idx].seq;
    const wrong = seq !== expected;
    if (wrong) manual.errors += 1;
    manual.order.push(idx);
    // out-of-order: the head bows, so this one and its earlier-tightened neighbours end up light
    let fin = scatter() * (wrong ? 0.8 : 1);
    manual.finals[idx] = fin;
    if (wrong) {
      manual.order.slice(0, -1).forEach((j) => {
        const d = Math.hypot(FAST[j].x - FAST[idx].x, FAST[j].z - FAST[idx].z);
        if (d < 1.8) { manual.finals[j] *= 0.9; animateTo(j, manual.finals[j]); }
      });
    }
    clickSound();
    animateTo(idx, fin, () => {
      if (manual && manual.order.length === 6) {
        const finals = FAST.map((_, i) => manual.finals[i]);
        logBuild(finals);
        status.textContent = manual.errors === 0
          ? 'All six in sequence: even clamp, and the gasket seals all the way round.'
          : `${manual.errors} out of sequence: the head bowed, so clamp is uneven. The dashed ring shows where the gasket is light. Reset and try 1 to 6.`;
        manual = { done: true, order: [0, 1, 2, 3, 4, 5], errors: 0, finals: [] };
        drawLoads();
      }
    });
    status.textContent = wrong
      ? `Out of sequence: that was ${seq}, but ${expected} comes first. The head starts to bow.`
      : (manual.order.length < 6 ? `Fastener ${seq} torqued. Next: ${Math.min(...FAST.filter((_, i) => !manual.order.includes(i)).map((x) => x.seq))}.` : 'Last one…');
    drawLoads();
  }

  function run() {
    if (busy) return;
    busy = true; manual = null;
    runBtn.disabled = true;
    const finals = FAST.map(() => scatter());
    fastEls.forEach((f) => { f.load = 0; });
    drawLoads();
    status.textContent = `Running the sequence with ${mode === 'bolt' ? 'OEM bolts' : 'studs and nuts'}…`;
    const order = FAST.map((f, i) => [f.seq, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const step = reduced ? 0 : 230, dur = reduced ? 1 : 320;
    const t0 = performance.now();
    const tick = (now) => {
      let done = true;
      order.forEach((idx, k) => {
        const t = (now - t0 - k * step) / dur;
        const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
        fastEls[idx].load = finals[idx] * e;
        if (t < 1) done = false;
      });
      drawLoads();
      if (!done) { requestAnimationFrame(tick); return; }
      logBuild(finals);
      status.textContent = 'Done. Switch fastener type and run it again to compare the scatter, or click them yourself.';
      busy = false;
      runBtn.disabled = false;
    };
    requestAnimationFrame(tick);
  }

  segBtns.forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    segBtns.forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.setAttribute('tabindex', x === b ? '0' : '-1'); });
    run();
  }));
  segBtns[0].parentElement.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    const i = segBtns.findIndex((b) => b.dataset.mode === mode);
    const n = segBtns[(i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1) + segBtns.length) % segBtns.length];
    n.focus(); n.click();
  });
  segBtns.forEach((b) => b.setAttribute('tabindex', b.getAttribute('aria-checked') === 'true' ? '0' : '-1'));
  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', () => { if (!busy) reset(); });

  drawLoads();
  drawStrip();
  onceNear(plan, run, '-20% 0px');
}

export function initStuds() {
  initTorque();
  initBench();
}
