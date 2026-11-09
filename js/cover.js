// The catalogue cover: a parts bin you can play with forever, filled with parts from my own builds.
// Rigid-body physics (Matter.js) keeps stacks calm: resting parts go to sleep instead of jittering.
// The bin sits beside the lettering, never on top of it.
// Click empty space to drop a part, click a part to flick it, grab one to throw it, hold to
// magnetise, double-click to blast. The sheet lifts away like a cover opening as you scroll.
import { reduced, clamp, coarse, INK, PAPER, expose } from './util.js';
import { audioCtx, out, liveCtx } from './sound.js';

const Z = '#E3B505';
// Real-world colours: plated steel, black oxide, anodised alloy, PCB solder mask, plastic. Ink outlines keep the catalogue look.
const C = {
  steel: '#CBD2D8', steelDk: '#97A3AD', blackOx: '#33363B', alu: '#E6EAED', copper: '#CC7A3E', brass: '#DDB04A',
  pcbGreen: '#1F8E50', pcbBlue: '#2358BA', pcbRed: '#C83232', pcbDark: '#252932', gold: '#F0CC6E',
  servo: '#2F6FE0', tt: '#FFDD55', tyre: '#252525', red: '#E2412F', white: '#FBFBF7', beige: '#ECD9B0',
  cyan: '#7FE6FF', glass: '#10151F',
};
const ANOD = ['#E2412F', '#2F6FE0', '#7D4CDB', '#13A89E', '#F07B1F', '#E04A8C'];
const WIRE = ['#E2412F', '#F07B1F', '#2BB35B', '#2F6FE0', '#7D4CDB', '#FBFBF7', '#1C1C1C'];
const LEDC = ['#FF3B30', '#34C759', '#2F80FF', '#FFFFFF', '#FF9F0A'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// shape: c = circle (r = s), h = hexagon (r = s), r = rectangle (w × h); sizes in bin units
const PARTS = [
  { type: 'hexnut', shape: 'h', s: 1.4, col: C.steel, name: 'M8 hex nut, ISO 4032' },
  { type: 'washer', shape: 'c', s: 1.3, cols: [C.steel, C.brass, C.copper], name: 'M8 plain washer, ISO 7089' },
  { type: 'gear', shape: 'c', s: 2.3, cols: ANOD, name: 'Spur gear, 16 teeth' },
  { type: 'bearing', shape: 'c', s: 1.9, col: C.steel, seals: ['#2E3238', '#2F6FE0', '#E2412F', '#F07B1F'], name: 'Deep-groove ball bearing, 6204' },
  { type: 'sprocket', shape: 'c', s: 2.1, col: C.blackOx, name: 'Chain sprocket, 18 teeth' },
  { type: 'flange', shape: 'c', s: 1.8, cols: [C.alu, ...ANOD], name: 'Six-bolt flange' },
  { type: 'bolthead', shape: 'h', s: 1.45, col: C.blackOx, name: 'Hex bolt M8, class 8.8' },
  { type: 'piston', shape: 'c', s: 2.1, col: C.alu, name: 'Piston crown, Ø70 bore' },
  { type: 'pulley', shape: 'c', s: 1.7, cols: ANOD, name: 'V-belt pulley' },
  { type: 'spring', shape: 'c', s: 1.4, cols: [C.red, '#2F6FE0', '#F07B1F'], name: 'Compression spring, end view' },
  { type: 'stud', shape: 'r', w: 0.5, h: 3.4, col: C.blackOx, name: 'Head stud, M9 × 1.25' },
  { type: 'conrod', shape: 'r', w: 1.2, h: 3.6, col: C.steelDk, name: 'Connecting rod' },
  { type: 'sparkplug', shape: 'r', w: 0.75, h: 2.7, col: C.white, name: 'Spark plug' },
  { type: 'chip', shape: 'r', w: 1.8, h: 1.8, col: '#1E1E1E', name: 'Microcontroller, 32-pin QFP' },
  { type: 'dip', shape: 'r', w: 2.1, h: 0.95, col: '#1E1E1E', name: 'DIP-16 logic chip' },
  { type: 'drv8833', shape: 'r', w: 2.1, h: 1.6, col: C.pcbRed, name: 'DRV8833 dual motor driver' },
  { type: 'esp32', shape: 'r', w: 3.1, h: 1.45, col: C.pcbBlue, name: 'ESP32 board with OLED' },
  { type: 'esp32cam', shape: 'r', w: 1.35, h: 2.1, col: C.pcbDark, name: 'ESP32-CAM' },
  { type: 'oled', shape: 'r', w: 1.6, h: 1.4, col: C.pcbBlue, name: '0.96 in OLED display' },
  { type: 'servo', shape: 'r', w: 1.2, h: 2.3, col: C.servo, name: 'Micro servo, 9 g' },
  { type: 'ttmotor', shape: 'r', w: 2.8, h: 1.1, col: C.tt, name: 'Yellow TT gear motor' },
  { type: 'ttwheel', shape: 'c', s: 1.75, col: C.tyre, name: 'TT wheel, rubber tyre' },
  { type: 'battery', shape: 'r', w: 1.4, h: 2.4, col: C.red, name: '9 V battery' },
  { type: 'resistor', shape: 'r', w: 2.4, h: 0.5, col: C.beige, name: '220 Ω resistor' },
  { type: 'capacitor', shape: 'c', s: 0.8, col: '#2457A6', name: 'Electrolytic capacitor, 100 µF' },
  { type: 'led', shape: 'c', s: 0.6, cols: LEDC, name: '5 mm LED' },
  { type: 'breadboard', shape: 'r', w: 3.4, h: 1.5, col: C.white, name: 'Half breadboard' },
  { type: 'jumper', shape: 'r', w: 3.2, h: 0.34, cols: WIRE, name: 'Dupont jumper wire' },
  { type: 'button', shape: 'r', w: 1.05, h: 1.05, cols: [C.red, '#2F6FE0', '#2BB35B', C.white], name: 'Tactile push button, 12 mm' },
];

function drawPart(ctx, b, u) {
  const p = b.plugin.part;
  const F = p.col || PAPER;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  const r = p.r || 0, w = p.w || 0, h = p.h || 0;
  const LW = Math.max(1.2, u * 0.08);
  ctx.lineWidth = LW;
  ctx.strokeStyle = INK; ctx.fillStyle = F;
  ctx.lineJoin = 'round';
  const circ = (rr, fill = F) => { ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.stroke(); };
  const circAt = (x, y, rr, fill = F) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.stroke(); };
  const dot = (x, y, rr, col = INK) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); };
  const box = (x, y, bw, bh, fill = F) => { ctx.beginPath(); ctx.rect(x - bw / 2, y - bh / 2, bw, bh); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
  const fillRect = (x, y, bw, bh, col) => { ctx.fillStyle = col; ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh); };
  const poly = (n, rr, off = 0, fill = F) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  const bore = (rr, x = 0, y = 0) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fillStyle = Z; ctx.fill(); ctx.stroke(); };
  const holes = (n, pr, hr, off = 0) => { for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2; bore(hr, Math.cos(a) * pr, Math.sin(a) * pr); } };
  const teeth = (n, ro, ri, pointy, fill = F) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, tw = (Math.PI * 2) / n;
      const pts = pointy ? [[ri, a0], [ro, a0 + tw * 0.5], [ri, a0 + tw]] : [[ri, a0], [ro, a0 + tw * 0.15], [ro, a0 + tw * 0.45], [ri, a0 + tw * 0.6], [ri, a0 + tw]];
      pts.forEach(([rr, a], j) => ctx[i === 0 && j === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr));
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  const line = (x0, y0, x1, y1, col = INK, lw = LW) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore(); };
  const pins = (x0, x1, y, n, len, col = C.steel) => { for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; line(x, y, x, y + len, col, LW * 1.4); } };
  const header = (x0, x1, y, n) => { for (let i = 0; i < n; i++) dot(x0 + ((x1 - x0) * (i + 0.5)) / n, y, u * 0.1, C.gold); };
  const thread = (x0, x1, y0, y1, step, col = INK) => { for (let y = y0; y < y1; y += step) line(x0, y, x1, y + step * 0.6, col, Math.max(0.8, u * 0.05)); };
  const text = (s, x, y, size, col = INK) => { ctx.fillStyle = col; ctx.font = `800 ${size}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); };
  const shine = (x, y, rr) => dot(x, y, rr, 'rgba(255,255,255,.75)');

  switch (p.type) {
    case 'hexnut': poly(6, r, Math.PI / 6); circ(r * 0.8, false); bore(r * 0.45); break;
    case 'washer': circ(r); bore(r * 0.48); break;
    case 'gear': teeth(16, r, r * 0.84, false); circ(r * 0.62, false); holes(4, r * 0.48, r * 0.12, 0.4); circ(r * 0.26, C.steel); bore(r * 0.14); break;
    case 'bearing':
      circ(r, C.steel); circ(r * 0.82, p.seal || '#2E3238'); circ(r * 0.5, C.steel); bore(r * 0.36);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; dot(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.12, C.steel); }
      break;
    case 'sprocket': teeth(18, r, r * 0.86, true); circ(r * 0.6, '#45494F'); holes(5, r * 0.42, r * 0.09); bore(r * 0.2); break;
    case 'flange': circ(r); circ(r * 0.55, C.steel); holes(6, r * 0.77, r * 0.1); bore(r * 0.3); break;
    case 'bolthead': poly(6, r, Math.PI / 6); circ(r * 0.82, false); text('8.8', 0, r * 0.03, r * 0.5, C.white); break;
    case 'piston': {
      circ(r); circ(r * 0.93, false);
      [[0.38, 0.32], [-0.38, 0.32], [0.38, -0.32], [-0.38, -0.32]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x * r, y * r, r * 0.2, r * 0.17, 0, 0, Math.PI * 2); ctx.fillStyle = '#C3CAD0'; ctx.fill(); ctx.stroke(); });
      ctx.setLineDash([r * 0.12, r * 0.08]); ctx.beginPath(); ctx.moveTo(-r * 0.93, 0); ctx.lineTo(r * 0.93, 0); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'pulley': circ(r); circ(r * 0.86, false); circ(r * 0.72, C.steel); holes(3, r * 0.45, r * 0.15, 0.3); bore(r * 0.17); break;
    case 'spring': {
      circ(r, '#2B2F36');
      ctx.save(); ctx.strokeStyle = F; ctx.lineWidth = Math.max(2, r * 0.16); ctx.lineCap = 'round';
      ctx.beginPath(); for (let t = 0; t <= Math.PI * 6; t += 0.15) { const rr = r * (0.84 - (t / (Math.PI * 6)) * 0.48); ctx[t ? 'lineTo' : 'moveTo'](Math.cos(t) * rr, Math.sin(t) * rr); } ctx.stroke(); ctx.restore();
      circ(r, false); break;
    }
    case 'stud': box(0, 0, w, h); thread(-w / 2, w / 2, -h / 2 + 2, -h * 0.18, u * 0.22, C.steelDk); thread(-w / 2, w / 2, h * 0.22, h / 2 - 2, u * 0.22, C.steelDk); break;
    case 'conrod': {
      ctx.beginPath(); ctx.moveTo(-w * 0.22, -h * 0.32); ctx.lineTo(w * 0.22, -h * 0.32); ctx.lineTo(w * 0.32, h * 0.26); ctx.lineTo(-w * 0.32, h * 0.26); ctx.closePath(); ctx.fillStyle = F; ctx.fill(); ctx.stroke();
      circAt(0, -h * 0.36, w * 0.3); bore(w * 0.15, 0, -h * 0.36);
      circAt(0, h * 0.3, w * 0.5); bore(w * 0.3, 0, h * 0.3);
      line(0, -h * 0.24, 0, h * 0.12);
      break;
    }
    case 'sparkplug': {
      box(0, -h * 0.38, w * 0.45, h * 0.18, C.steel); box(0, -h * 0.12, w * 0.8, h * 0.36, C.white); box(0, h * 0.12, w, h * 0.14, C.steelDk);
      box(0, h * 0.32, w * 0.62, h * 0.26, C.steel); thread(-w * 0.31, w * 0.31, h * 0.2, h * 0.44, u * 0.18);
      ctx.beginPath(); ctx.moveTo(0, h * 0.45); ctx.lineTo(0, h * 0.5); ctx.lineTo(w * 0.25, h * 0.5); ctx.stroke();
      break;
    }
    case 'chip': {
      const s = w * 0.36;
      for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate((i * Math.PI) / 2); for (let k = -3; k <= 3; k++) line(k * s * 0.27, -s, k * s * 0.27, -w * 0.5, C.steel, LW * 1.3); ctx.restore(); }
      box(0, 0, s * 2, s * 2); dot(-s * 0.62, -s * 0.62, s * 0.12, '#8A8A8A');
      break;
    }
    case 'dip':
      pins(-w * 0.45, w * 0.45, h * 0.3, 8, h * 0.2); pins(-w * 0.45, w * 0.45, -h * 0.5, 8, h * 0.2);
      box(0, 0, w, h * 0.6); ctx.beginPath(); ctx.arc(-w / 2, 0, h * 0.1, -Math.PI / 2, Math.PI / 2); ctx.strokeStyle = C.white; ctx.stroke(); ctx.strokeStyle = INK;
      break;
    case 'drv8833': box(0, 0, w, h); header(-w * 0.45, w * 0.45, -h * 0.36, 6); header(-w * 0.45, w * 0.45, h * 0.36, 6); box(0, -h * 0.02, w * 0.26, h * 0.3, '#1E1E1E'); text('DRV8833', 0, h * 0.2, Math.max(6, u * 0.32), C.white); break;
    case 'esp32': {
      box(0, 0, w, h); header(-w * 0.46, w * 0.46, -h * 0.42, 12); header(-w * 0.46, w * 0.46, h * 0.42, 12);
      box(-w * 0.18, 0, w * 0.34, h * 0.48, C.glass); // OLED glass
      line(-w * 0.31, -h * 0.08, -w * 0.08, -h * 0.08, C.cyan, 1.4); line(-w * 0.31, h * 0.05, -w * 0.16, h * 0.05, C.cyan, 1.4);
      box(w * 0.22, 0, w * 0.26, h * 0.42, C.steel); box(w * 0.46, 0, w * 0.1, h * 0.26, C.steel);
      break;
    }
    case 'esp32cam': box(0, 0, w, h); box(0, -h * 0.12, w * 0.7, h * 0.42, '#1A1A1A'); circAt(0, -h * 0.12, w * 0.22, C.steelDk); dot(0, -h * 0.12, w * 0.1, C.glass); shine(-w * 0.04, -h * 0.16, w * 0.03); header(-w * 0.4, w * 0.4, h * 0.38, 4); break;
    case 'oled': box(0, 0, w, h); box(0, h * 0.06, w * 0.86, h * 0.62, C.glass); header(-w * 0.2, w * 0.2, -h * 0.4, 4); fillRect(-w * 0.14, -h * 0.06, w * 0.4, 2, C.cyan); fillRect(-w * 0.22, h * 0.08, w * 0.24, 2, C.cyan); fillRect(-w * 0.1, h * 0.2, w * 0.48, 2, C.cyan); break;
    case 'servo': box(0, 0, w * 1.5, h * 0.1); box(0, 0, w, h); circAt(0, -h * 0.28, w * 0.3, C.white); box(0, -h * 0.28, w * 0.9, w * 0.14, C.white); break;
    case 'ttmotor': box(-w * 0.2, 0, w * 0.6, h); box(w * 0.28, 0, w * 0.4, h * 0.82, C.steel); circAt(-w * 0.22, 0, h * 0.16, C.white); line(-w * 0.22 - h * 0.08, 0, -w * 0.22 + h * 0.08, 0); break;
    case 'ttwheel': {
      circ(r);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; line(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, Math.cos(a) * r, Math.sin(a) * r, '#5A5A5A', Math.max(1, u * 0.06)); }
      circ(r * 0.66, C.tt);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; line(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); }
      circ(r * 0.2, C.white); break;
    }
    case 'battery': box(0, h * 0.06, w, h * 0.88); box(0, -h * 0.28, w, h * 0.14, '#1E1E1E'); box(-w * 0.22, -h * 0.47, w * 0.2, h * 0.08, C.steel); poly2(w * 0.22, -h * 0.47, w * 0.12); text('9V', 0, h * 0.14, w * 0.42, C.white); break;
    case 'resistor': {
      line(-w / 2, 0, w / 2, 0, C.steelDk, LW * 1.3);
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.28, h * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = F; ctx.fill(); ctx.stroke();
      // 220 Ω: red, red, brown, gold
      [[-0.14, '#D3302A'], [-0.05, '#D3302A'], [0.04, '#7A4A22'], [0.17, '#C9A227']].forEach(([x, col]) => fillRect(x * w, 0, 3, h * 0.84, col));
      break;
    }
    case 'capacitor': {
      circ(r); circ(r * 0.78, C.steel);
      line(-r * 0.5, 0, r * 0.5, 0); line(0, -r * 0.5, 0, r * 0.5);
      ctx.save(); ctx.strokeStyle = '#BFD4F2'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.89, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke(); ctx.restore();
      break;
    }
    case 'led': circ(r, C.steel); circ(r * 0.8); shine(-r * 0.28, -r * 0.28, r * 0.2); break;
    case 'breadboard': {
      box(0, 0, w, h); line(-w / 2, 0, w / 2, 0, '#BDBDB6');
      line(-w * 0.46, -h * 0.43, w * 0.46, -h * 0.43, '#D3302A', 1.6); line(-w * 0.46, h * 0.43, w * 0.46, h * 0.43, '#2F6FE0', 1.6);
      ctx.fillStyle = '#55554F';
      for (let x = -w * 0.44; x <= w * 0.44; x += u * 0.32) for (const y of [-h * 0.3, -h * 0.17, h * 0.17, h * 0.3]) ctx.fillRect(x - 1, y - 1, 2, 2);
      break;
    }
    case 'jumper': box(0, 0, w * 0.72, h); box(-w * 0.43, 0, w * 0.14, h * 1.5, '#1C1C1C'); box(w * 0.43, 0, w * 0.14, h * 1.5, '#1C1C1C'); line(-w * 0.5, 0, -w * 0.56, 0, C.steel, LW * 1.5); line(w * 0.5, 0, w * 0.56, 0, C.steel, LW * 1.5); break;
    case 'button': box(0, 0, w, h, '#2A2A2A'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => dot(sx * w * 0.36, sy * h * 0.36, w * 0.06, C.steel)); circAt(0, 0, w * 0.3); shine(-w * 0.09, -w * 0.09, w * 0.07); break;
    default: circ(r || u);
  }
  ctx.restore();

  function poly2(x, y, rr) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i / 6) * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = C.steel; ctx.fill(); ctx.stroke(); }
}

export function initCover() {
  const cover = document.getElementById('cover');
  const sheet = document.getElementById('cover-sheet');
  const canvas = document.getElementById('cover-bin');
  const label = document.getElementById('bin-label');
  if (!cover || !sheet || !canvas) return;

  /* ---------- cover lift on scroll (works with or without physics) ---------- */
  let scrollP = 0;
  function applyLift() {
    if (reduced) return;
    const p = scrollP;
    sheet.style.transform = p > 0.001 ? `rotateX(${(-p * 24).toFixed(2)}deg) translateY(${(-p * 4).toFixed(2)}%) scale(${(1 - p * 0.05).toFixed(4)})` : '';
    sheet.style.boxShadow = p > 0.01 ? `0 ${Math.round(40 * p)}px ${Math.round(70 * p)}px -30px rgba(17,17,17,${(0.55 * p).toFixed(2)})` : 'none';
  }
  window.addEventListener('scroll', () => { scrollP = clamp(window.scrollY / Math.max(1, cover.offsetHeight), 0, 1); applyLift(); }, { passive: true });

  import('matter-js').then((mod) => startBin(mod.default || mod)).catch((err) => {
    console.warn('Parts bin physics unavailable:', err);
    label.textContent = 'Parts bin';
  });

  function startBin(M) {
    const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = M;
    const ctx = canvas.getContext('2d');
    const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
    engine.gravity.y = 1.35;
    const world = engine.world;

    let W = 1, H = 1, dpr = 1, unit = 20, bin = { x0: 0, x1: 1, y0: 0, y1: 1 }, statics = [], labelBox = null, isWide = true;
    let visible = true, raf = 0, last = performance.now(), acc = 0;
    const ptr = { x: -999, y: -999, vx: 0, vy: 0, t: 0, inside: false };
    let hover = null, magnet = false, magnetT = 0, holdTimer = 0, lastTap = { x: -999, y: -999, t: 0 }, blast = null, grab = null, downAt = null;
    const say = (t) => { label.textContent = t; };
    const HINT = coarse
      ? 'Parts bin · tap to drop · hold to magnetise · double-tap to blast'
      : 'Parts bin · click to drop · hold to magnetise · double-click to blast';
    const parts = () => Composite.allBodies(world).filter((b) => !b.isStatic);

    /* ----- layout: the bin is the art column on wide screens, the band under the text on phones ----- */
    function measure() {
      const r = sheet.getBoundingClientRect();
      W = sheet.offsetWidth; H = sheet.offsetHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const sx = W / r.width || 1, sy = H / r.height || 1;
      const rel = (b) => ({ x0: (b.left - r.left) * sx, y0: (b.top - r.top) * sy, x1: (b.right - r.left) * sx, y1: (b.bottom - r.top) * sy });
      const art = rel(sheet.querySelector('.cover-art').getBoundingClientRect());
      const foot = rel(sheet.querySelector('.cover-foot').getBoundingClientRect());
      const top = rel(sheet.querySelector('.cover-top').getBoundingClientRect());
      const tools = rel(sheet.querySelector('.cover-bintools').getBoundingClientRect());
      const wide = (isWide = art.x0 > W * 0.25);
      bin = wide
        ? { x0: art.x0 - 8, x1: W - 6, y0: top.y1 + 6, y1: foot.y0 }
        : { x0: 6, x1: W - 6, y0: art.y0, y1: foot.y0 };
      unit = clamp(Math.min(bin.x1 - bin.x0, (bin.y1 - bin.y0) * 1.3) / 24, 9, 24);
      statics.forEach((s) => Composite.remove(world, s));
      const T = 400, opt = { isStatic: true, friction: 0.6, restitution: 0.1 };
      // the label and its button sit on the floor as one solid block, so nothing can wedge underneath
      labelBox = { x0: tools.x0 - 3, x1: Math.min(bin.x1, tools.x1 + 3), y0: tools.y0 - 3, y1: bin.y1 };
      statics = [
        Bodies.rectangle((bin.x0 + bin.x1) / 2, bin.y1 + T / 2, bin.x1 - bin.x0 + 2 * T, T, opt), // floor
        Bodies.rectangle(bin.x0 - T / 2, (bin.y0 + bin.y1) / 2 - H, T, (bin.y1 - bin.y0) + 2 * H, opt), // left wall
        Bodies.rectangle(bin.x1 + T / 2, (bin.y0 + bin.y1) / 2 - H, T, (bin.y1 - bin.y0) + 2 * H, opt), // right wall
        Bodies.rectangle((bin.x0 + bin.x1) / 2, bin.y0 - T / 2 - (wide ? 0 : 400), bin.x1 - bin.x0 + 2 * T, T, opt), // lid, high above
        Bodies.rectangle((labelBox.x0 + labelBox.x1) / 2, (labelBox.y0 + labelBox.y1 + 40) / 2, labelBox.x1 - labelBox.x0, labelBox.y1 + 40 - labelBox.y0, opt), // the label, down into the floor
      ];
      Composite.add(world, statics);
      // anything outside the new bin comes back inside
      rescue(true);
    }
    // Matter.js has no continuous collision, so a hard throw can push a thin part into the floor
    // or under the label. Anything that ends up there is lifted back on top.
    // Only real penetration counts (bounds past a wall by more than the solver's slop), so parts
    // resting against a wall or on the label are never nudged.
    function rescue(strict = false) {
      const slop = strict ? 1.5 : 5;
      for (const b of parts()) {
        if (grab && grab.b === b) continue;
        const { min, max } = b.bounds;
        let dx = 0, dy = 0;
        if (min.x < bin.x0 - slop) dx = bin.x0 - min.x + 1;
        else if (max.x > bin.x1 + slop) dx = bin.x1 - max.x - 1;
        if (max.y > bin.y1 + slop) dy = bin.y1 - max.y - 1;
        const cx = b.position.x + dx, cy = b.position.y + dy;
        if (labelBox && cx > labelBox.x0 && cx < labelBox.x1 && cy > labelBox.y0 + 2) dy += labelBox.y0 - 1 - (max.y + dy);
        if (!dx && !dy) continue;
        Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy });
        Body.setVelocity(b, { x: b.velocity.x * 0.3, y: Math.min(0, b.velocity.y) });
        Sleeping.set(b, false);
      }
    }
    // the grab handle stays inside the bin and above the label
    function inBin(x, y) {
      const m = unit * 0.8;
      let cx = clamp(x, bin.x0 + m, bin.x1 - m), cy = clamp(y, bin.y0 - H, bin.y1 - m);
      if (labelBox && cx > labelBox.x0 - m && cy > labelBox.y0 - m) cy = labelBox.y0 - m;
      return { x: cx, y: cy };
    }

    /* ----- parts ----- */
    function makeBody(spec, x, y) {
      const part = { ...spec };
      const opt = { restitution: 0.18, friction: 0.5, frictionAir: 0.012, density: 0.0016, sleepThreshold: 40, chamfer: null };
      let b;
      const k = unit * (0.92 + Math.random() * 0.16);
      if (spec.cols) part.col = pick(spec.cols);
      if (spec.seals) part.seal = pick(spec.seals);
      if (spec.shape === 'c') { part.r = spec.s * k; b = Bodies.circle(x, y, part.r, opt); }
      else if (spec.shape === 'h') { part.r = spec.s * k; b = Bodies.polygon(x, y, 6, part.r, opt); }
      else { part.w = spec.w * k; part.h = spec.h * k; b = Bodies.rectangle(x, y, part.w, part.h, { ...opt, chamfer: { radius: Math.min(part.w, part.h) * 0.12 } }); }
      b.plugin.part = part;
      Body.setAngle(b, Math.random() * Math.PI * 2);
      Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.15);
      return b;
    }
    let deck = [];
    const nextSpec = () => { if (!deck.length) deck = PARTS.slice().sort(() => Math.random() - 0.5); return deck.pop(); };
    function spawn(x, y, spec = nextSpec()) {
      const b = makeBody(spec, x, y);
      Composite.add(world, b);
      const all = parts();
      if (all.length > (W < 600 ? 44 : 80)) Composite.remove(world, all[0]);
      return b;
    }

    /* ----- sound: every impact is heard the moment it happens, voiced by what the part is made of -----
       Parts already touching in a pile never fire a new "collision start", so impacts are read from
       sudden velocity changes after each physics step instead. The loudest few per step play at once
       (no queue, no per-second budget), with a cap on overlapping voices so a rattle never distorts. */
    const MAT = {
      hexnut: 'metal', washer: 'metal', gear: 'metal', bearing: 'metal', sprocket: 'metal', flange: 'metal', bolthead: 'metal',
      piston: 'metal', pulley: 'metal', spring: 'metal', stud: 'metal', conrod: 'metal', sparkplug: 'ceramic',
      chip: 'pcb', dip: 'pcb', drv8833: 'pcb', esp32: 'pcb', esp32cam: 'pcb', oled: 'pcb', resistor: 'pcb',
      servo: 'plastic', ttmotor: 'plastic', battery: 'plastic', capacitor: 'plastic', led: 'plastic', breadboard: 'plastic', jumper: 'plastic', button: 'plastic',
      ttwheel: 'rubber',
    };
    // voices are counted on the audio clock (not timers, which background tabs throttle)
    let voiceEnds = [], binBus = null, noiseBuf = null, lockedHint = false;
    const voicesAt = (now) => { voiceEnds = voiceEnds.filter((e) => e > now); return voiceEnds.length; };
    function busFor(c) {
      if (!binBus) {
        binBus = c.createGain(); binBus.gain.value = 0.9; binBus.connect(out());
        noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return binBus;
    }
    // mat: metal | pcb | plastic | rubber | ceramic; size in bin units (about 1 to 4); strength = speed change
    function voice(mat, size, strength, x = W / 2) {
      const c = liveCtx();
      if (!c || voicesAt(c.currentTime) >= 10) return false;
      const dst = busFor(c), t = c.currentTime;
      const k = clamp((strength - 1.4) / 11, 0, 1), amp = 0.012 + 0.1 * Math.pow(k, 1.3);
      const g = c.createGain(); g.gain.value = amp;
      if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = clamp((x / Math.max(1, W)) * 2 - 1, -1, 1) * 0.6; g.connect(pn).connect(dst); } else g.connect(dst);
      const tone = (f, a, dur, type = 'sine') => {
        const o = c.createOscillator(); o.type = type; o.frequency.value = f;
        const e = c.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(a, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(e).connect(g); o.start(t); o.stop(t + dur + 0.02);
      };
      const hiss = (f, q, a, dur, type = 'bandpass') => {
        const s = c.createBufferSource(); s.buffer = noiseBuf;
        const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const e = c.createGain(); e.gain.setValueAtTime(a, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(fl).connect(e).connect(g); s.start(t, Math.random() * 0.15); s.stop(t + dur + 0.02);
      };
      const jit = 0.9 + Math.random() * 0.2;
      let dur = 0.06;
      if (mat === 'metal') { // a struck plate: inharmonic partials, small parts ring higher and shorter
        const f = (3000 / (0.55 + size * 0.75)) * jit; dur = 0.1 + Math.min(0.32, size * 0.07);
        tone(f, 0.55, dur); tone(f * 2.76, 0.3, dur * 0.6); tone(f * 5.4, 0.16, dur * 0.35); hiss(f * 2, 1.5, 0.25, 0.012);
      } else if (mat === 'pcb') { // fibreglass board: a dry, bright click
        dur = 0.035; hiss(3600 * jit, 1.3, 0.8, dur); tone(1900 * jit, 0.2, 0.025);
      } else if (mat === 'plastic') { // a hollow tock
        const f = (1500 / (0.6 + size * 0.5)) * jit; dur = 0.06; tone(f, 0.6, dur, 'triangle'); hiss(f * 1.6, 1.1, 0.35, 0.025);
      } else if (mat === 'rubber') { // a soft thud
        dur = 0.09; tone(170 * jit, 0.8, dur); hiss(380, 0.8, 0.3, 0.04, 'lowpass');
      } else { // ceramic: a short glassy tink
        dur = 0.07; tone(3200 * jit, 0.5, dur); tone(5100 * jit, 0.25, dur * 0.6);
      }
      voiceEnds.push(t + dur + 0.02);
      return true;
    }
    const sizeU = (b) => Math.sqrt(b.area) / unit;
    const clink = (size, strength) => voice('metal', size, strength);
    // after each physics step: which parts just changed speed abruptly? (gravity alone adds about 0.4)
    function listen() {
      if (!liveCtx()) return;
      const now = performance.now(), thr = magnet ? 6 : 1.8, hits = [];
      for (const b of parts()) {
        if (b.isSleeping) { b.plugin.pv = null; continue; }
        const pv = b.plugin.pv;
        b.plugin.pv = { x: b.velocity.x, y: b.velocity.y };
        if (!pv) continue;
        const dv = Math.hypot(b.velocity.x - pv.x, b.velocity.y - pv.y);
        if (dv > thr && now - (b.plugin.heard || 0) > 70) hits.push([dv, b]);
      }
      if (!hits.length) return;
      hits.sort((p, q) => q[0] - p[0]);
      for (const [dv, b] of hits.slice(0, 3)) if (voice(MAT[b.plugin.part.type] || 'metal', sizeU(b), dv, b.position.x)) b.plugin.heard = now;
    }
    function hum(on) {
      const c = liveCtx(); if (!c) return;
      if (on && !hum.o) {
        hum.o = c.createOscillator(); hum.o.type = 'sawtooth'; hum.o.frequency.value = 100;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
        hum.g = c.createGain(); hum.g.gain.setValueAtTime(0, c.currentTime); hum.g.gain.linearRampToValueAtTime(0.03, c.currentTime + 0.08);
        hum.o.connect(f).connect(hum.g).connect(busFor(c)); hum.o.start();
      } else if (!on && hum.o) { const o = hum.o; hum.g.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => o.stop(), 200); hum.o = null; }
    }

    /* ----- forces ----- */
    const wake = (b) => Sleeping.set(b, false);
    function stepForces() {
      if (magnet) {
        const R = unit * 11;
        for (const b of parts()) {
          const dx = ptr.x - b.position.x, dy = ptr.y - b.position.y, d = Math.hypot(dx, dy) || 1;
          if (d > R) continue;
          wake(b);
          const sp = Math.min(d * 0.18, 16) * (0.4 + 0.6 * (1 - d / R));
          Body.setVelocity(b, { x: b.velocity.x * 0.8 + (dx / d) * sp * 0.2, y: b.velocity.y * 0.8 + (dy / d) * sp * 0.2 - 0.2 });
          Body.setAngularVelocity(b, b.angularVelocity * 0.9);
        }
      } else if (ptr.inside && !grab && Math.hypot(ptr.vx, ptr.vy) > 250) {
        // the pointer sweeping through nudges parts aside
        for (const b of Query.region(parts(), { min: { x: ptr.x - unit, y: ptr.y - unit }, max: { x: ptr.x + unit, y: ptr.y + unit } })) {
          wake(b);
          Body.setVelocity(b, { x: b.velocity.x + ptr.vx * 0.006, y: b.velocity.y + ptr.vy * 0.006 - 0.5 });
        }
      }
      if (grab) { grab.c.pointA = inBin(ptr.x, ptr.y); wake(grab.b); }
    }
    function blastAt(x, y) {
      const R = unit * 13; let n = 0;
      for (const b of parts()) {
        const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const k = (1 - d / R) * 26;
        wake(b);
        Body.setVelocity(b, { x: b.velocity.x + (dx / d) * k, y: b.velocity.y + (dy / d) * k - 6 * (1 - d / R) });
        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.6);
        n++;
      }
      blast = { x, y, t: 0 };
      clink(1.4, 14); clink(2.6, 12);
      say(n ? `Blast: ${n} part${n === 1 ? '' : 's'} sent flying` : 'Blast. Nothing nearby');
    }
    function shake() {
      audioCtx();
      for (const b of parts()) { wake(b); Body.setVelocity(b, { x: (Math.random() - 0.5) * 16, y: -10 - Math.random() * 12 }); Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.5); }
      clink(2, 10);
      if (!reduced) sheet.animate([{ translate: '0 0' }, { translate: '-6px 3px' }, { translate: '7px -2px' }, { translate: '-4px 1px' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
      say(`Shaken: ${parts().length} parts in the air`);
      kick();
    }

    /* ----- drawing ----- */
    function drawBin() {
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      const hgt = Math.min(bin.y1 - bin.y0, unit * 9);
      ctx.beginPath(); ctx.moveTo(bin.x0, bin.y1 - hgt); ctx.lineTo(bin.x0, bin.y1); ctx.stroke();
      ctx.lineWidth = 1;
      for (let y = bin.y1 - hgt; y < bin.y1; y += 8) { ctx.beginPath(); ctx.moveTo(bin.x0, y); ctx.lineTo(bin.x0 - 6, y + 6); ctx.stroke(); }
      ctx.restore();
    }
    function drawHover(b) {
      const name = b.plugin.part.name;
      ctx.save();
      ctx.font = '600 13px Archivo, "Noto Sans TC", sans-serif';
      const tw = ctx.measureText(name).width + 16, th = 24;
      const rad = Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2;
      const dir = b.position.x + rad + tw + 40 > W ? -1 : 1;
      const ax = b.position.x + rad * 0.7 * dir, ay = b.position.y - rad * 0.7;
      const bx = ax + 26 * dir, by = Math.max(th / 2 + 4, ay - 22), x0 = dir > 0 ? bx : bx - tw;
      ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = PAPER; ctx.fillRect(x0, by - th / 2, tw, th); ctx.strokeRect(x0, by - th / 2, tw, th);
      ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(name, x0 + 8, by + 1);
      ctx.restore();
    }
    function drawMagnet() {
      const k = Math.min(1, magnetT / 0.25), R = unit * 11;
      ctx.save(); ctx.translate(ptr.x, ptr.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
      for (let i = 0; i < 3; i++) { const f = (magnetT * 0.8 + i / 3) % 1; ctx.globalAlpha = 0.5 * f * k; ctx.beginPath(); ctx.arc(0, 0, R * (1 - f) + unit, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const r = unit * 1.15 * k;
      ctx.fillStyle = PAPER; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawBin();
      for (const b of parts()) drawPart(ctx, b, unit);
      if (blast) {
        const k = blast.t / 0.35;
        ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2 * (1 - k);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r0 = unit * (1 + k * 6), r1 = r0 + unit * 2.2 * (1 - k); ctx.beginPath(); ctx.moveTo(blast.x + Math.cos(a) * r0, blast.y + Math.sin(a) * r0); ctx.lineTo(blast.x + Math.cos(a) * r1, blast.y + Math.sin(a) * r1); ctx.stroke(); }
        ctx.restore();
      }
      if (magnet) drawMagnet();
      else if (hover && !grab && !coarse && parts().includes(hover)) drawHover(hover);
    }

    /* ----- loop: fixed 60 Hz physics, sleeps when everything rests ----- */
    const STEP = 1000 / 60;
    function frame(now) {
      raf = 0;
      acc += Math.min(100, now - last); last = now;
      let n = 0;
      while (acc >= STEP && n < 4) { stepForces(); Engine.update(engine, STEP); listen(); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      if (n) rescue();
      const dt = n * STEP / 1000;
      if (magnet) magnetT += dt;
      if (blast) { blast.t += dt; if (blast.t > 0.35) blast = null; }
      ptr.vx *= 0.8; ptr.vy *= 0.8;
      draw();
      const busy = magnet || grab || blast || parts().some((b) => !b.isSleeping);
      if (visible && busy) kick();
    }
    const kick = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    /* ----- pointer ----- */
    const local = (ev) => { const r = sheet.getBoundingClientRect(); return [(ev.clientX - r.left) * (W / r.width), (ev.clientY - r.top) * (H / r.height)]; };
    const hit = (x, y) => Query.point(parts(), { x, y }).pop() || null;
    canvas.addEventListener('pointerdown', (ev) => {
      audioCtx();
      const [x, y] = local(ev);
      Object.assign(ptr, { x, y, vx: 0, vy: 0, t: performance.now(), inside: true });
      const b = hit(x, y);
      downAt = { x, y, b, moved: false };
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
      if (b && ev.pointerType === 'mouse') {
        // pointB is the grab offset in world orientation; Matter rotates it with the body from here on
        const c = Constraint.create({ pointA: { x, y }, bodyB: b, pointB: { x: x - b.position.x, y: y - b.position.y }, stiffness: 0.18, damping: 0.1, length: 0 });
        Composite.add(world, c);
        grab = { b, c };
        canvas.style.cursor = 'grabbing';
      } else {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (!downAt || downAt.moved || grab) return;
          magnet = true; magnetT = 0; hum(true);
          say('Electromagnet on · drag it around, let go to drop');
          kick();
        }, 260);
      }
      kick();
    });
    canvas.addEventListener('pointermove', (ev) => {
      const [x, y] = local(ev);
      const now = performance.now(), dt = Math.max(8, now - ptr.t) / 1000;
      ptr.vx = ((x - ptr.x) / dt) * 0.5 + ptr.vx * 0.5; ptr.vy = ((y - ptr.y) / dt) * 0.5 + ptr.vy * 0.5;
      ptr.x = x; ptr.y = y; ptr.t = now; ptr.inside = true;
      if (downAt && Math.hypot(x - downAt.x, y - downAt.y) > 6) downAt.moved = true;
      if (!grab) {
        hover = magnet ? null : hit(x, y);
        if (ev.pointerType === 'mouse') canvas.style.cursor = magnet ? 'none' : hover ? 'grab' : 'crosshair';
      }
      // browsers keep audio off until the first click; say so once if someone sweeps the pile before that
      if (!lockedHint && hover && Math.hypot(ptr.vx, ptr.vy) > 250 && !liveCtx()) { lockedHint = true; say('Click once anywhere to switch the bin’s sound on'); }
      kick();
    });
    canvas.addEventListener('pointerleave', () => { ptr.inside = false; if (hover) { hover = null; kick(); } });
    const up = (ev) => {
      clearTimeout(holdTimer);
      if (!downAt) return;
      const [x, y] = local(ev);
      const moved = downAt.moved, b = downAt.b;
      if (grab) {
        Composite.remove(world, grab.c);
        Body.setVelocity(grab.b, { x: clamp(ptr.vx / 60, -28, 28), y: clamp(ptr.vy / 60, -28, 28) });
        grab = null; canvas.style.cursor = 'grab';
      }
      if (magnet) {
        magnet = false; hum(false);
        const n = parts().filter((q) => Math.hypot(q.position.x - x, q.position.y - y) < unit * 4).length;
        say(n ? `Magnet off: dropped ${n} part${n === 1 ? '' : 's'}` : HINT);
        canvas.style.cursor = 'crosshair';
      } else if (!moved) {
        const now = performance.now();
        const dbl = now - lastTap.t < 340 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30;
        lastTap = dbl ? { x: -999, y: -999, t: 0 } : { x, y, t: now };
        if (dbl) blastAt(x, y);
        else if (b) {
          wake(b);
          Body.setVelocity(b, { x: (Math.random() - 0.5) * 8, y: -14 - Math.random() * 5 });
          Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.5);
          voice(MAT[b.plugin.part.type] || 'metal', sizeU(b), 9, b.position.x);
          say(`Flicked: ${b.plugin.part.name}`);
        } else {
          // on wide screens the bin has a lid just above it, so drops start below the lid
          const sx = clamp(x, bin.x0 + unit * 2, bin.x1 - unit * 2), sy = isWide ? clamp(y, bin.y0 + unit * 1.8, bin.y1 - unit * 3) : Math.min(y, bin.y1 - unit * 3);
          const nb = spawn(sx, sy);
          Body.setVelocity(nb, { x: 0, y: 2 });
          say(`Dropped: ${nb.plugin.part.name} · ${parts().length} in the bin`);
        }
      } else if (b) say(`Thrown: ${b.plugin.part.name}`);
      downAt = null;
      kick();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', () => {
      clearTimeout(holdTimer);
      if (grab) { Composite.remove(world, grab.c); grab = null; }
      if (magnet) { magnet = false; hum(false); }
      downAt = null;
    });
    document.getElementById('cover-shake')?.addEventListener('click', shake);

    /* ----- start ----- */
    measure();
    // A full bin from the first second: a loose layer is already in it, the rest rain in.
    // (They used to be stacked far above the bin, and on wide screens most landed on its lid, out of sight.)
    const n0 = W < 600 ? 22 : 42, first = W < 600 ? 10 : 18;
    const spanX = bin.x1 - bin.x0 - unit * 4, cols = Math.max(3, Math.floor(spanX / (unit * 4.2)));
    for (let i = 0; i < first; i++) {
      const x = bin.x0 + unit * 2 + ((i % cols) + 0.5 + (Math.random() - 0.5) * 0.4) * (spanX / cols);
      const y = bin.y1 - unit * 2.4 - Math.floor(i / cols) * unit * 4.4 - Math.random() * unit;
      spawn(x, Math.max(y, bin.y0 + unit * 2));
    }
    let toRain = n0 - first;
    const rainY = () => (isWide ? bin.y0 + unit * 1.8 : bin.y0 - unit * 2);
    if (reduced) {
      for (let i = 0; i < toRain; i++) spawn(bin.x0 + unit * 2 + Math.random() * spanX, Math.max(bin.y0 + unit * 2, bin.y1 - unit * 3 - (i % 6) * unit * 2.6));
      toRain = 0;
    }
    const rain = () => {
      if (toRain-- <= 0) return;
      spawn(bin.x0 + unit * 2 + Math.random() * (bin.x1 - bin.x0 - unit * 4), rainY());
      kick();
      setTimeout(rain, 55 + Math.random() * 50);
    };
    setTimeout(rain, 200);
    // test harness (?debug): step the physics directly, without waiting on animation frames
    expose('cover', {
      M, engine, parts, ptr, spawn, draw, listen,
      get bin() { return bin; }, get labelBox() { return labelBox; }, get unit() { return unit; }, get voices() { return voiceEnds.length; },
      step(k = 1) { for (let i = 0; i < k; i++) { stepForces(); Engine.update(engine, STEP); listen(); rescue(); ptr.vx *= 0.8; ptr.vy *= 0.8; } },
    });
    if (reduced) for (let k = 0; k < 400; k++) Engine.update(engine, STEP);
    new ResizeObserver(() => { measure(); draw(); kick(); }).observe(sheet);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(cover);
    document.fonts?.ready.then(() => { measure(); kick(); });
    say(HINT);
    draw();
    kick();
  }
}
