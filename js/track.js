// Fig. 006: drive a model of the RC car round the Circuit de Monaco, in 3D.
// Layout: the real circuit centreline (open GeoJSON from bacinger/f1-circuits, MIT), scaled down.
// Handling: a bicycle model with load-sensitive tyres, so weight distribution, tyre grip, the rear
// spoiler and the grip / drift set-up genuinely change how it drives. Power goes through an
// eight-speed sequential gearbox (auto or manual) with a real recorded F1 V10 voice and shift sounds, and an
// F1-style five-light start with your reaction time.
// Lap times feed a Holt (double exponential) smoothing forecast of the next lap.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { whileVisible, clamp, lerp, rng, coarse, reduced, expose } from './util.js';
import { audioCtx, out } from './sound.js';

const PAPER = 0xF2F2EE, INK = 0x111111, ZINC = 0xE3B505, GREY = 0x8A8A80;

/* ---------- halftone shader: screen dots for solids, world dots for land, wave lines for water ---------- */
const VS = /* glsl */`
  varying vec3 vN; varying float vD; varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w;
    vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FS = /* glsl */`
  uniform vec3 uBase; uniform vec3 uInk; uniform vec3 uLight;
  uniform float uDot; uniform float uAmb; uniform float uTone; uniform float uFade;
  uniform float uMode; uniform float uCell; uniform float uTime;
  uniform sampler2D uMask; uniform vec4 uMaskBox;
  varying vec3 vN; varying float vD; varying vec3 vW;
  float dotsWorld(float tone, float cell) {
    vec2 p = vW.xz / cell;
    vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
    vec2 f = fract(q) - 0.5;
    tone *= 1.0 - smoothstep(0.16, 0.38, fwidth(q.x));
    float r = sqrt(tone) * 0.6, len = length(f), aa = max(fwidth(len), 0.03);
    return (1.0 - smoothstep(r - aa, r + aa, len)) * step(0.02, tone);
  }
  float waves(float tone, float cell) {
    float y = vW.z / cell + sin(vW.x * 0.11 + uTime * 0.9) * 0.22 + sin(vW.x * 0.37 - uTime * 1.3) * 0.08;
    float h = abs(fract(y) - 0.5), w = fwidth(y);
    tone *= 1.0 - smoothstep(0.2, 0.45, w);
    float hw = tone * 0.5;
    return (1.0 - smoothstep(hw - w, hw + w, h)) * step(0.02, tone);
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float l = clamp(dot(n, uLight), 0.0, 1.0);
    float tone = clamp((1.0 - (uAmb + (1.0 - uAmb) * l)) * 1.25 + uTone, 0.0, 1.0);
    tone *= 1.0 - smoothstep(uFade * 0.35, uFade, vD);
    float m = 0.0;
    if (uMode < 0.5) {
      vec2 p = gl_FragCoord.xy / uDot;
      vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
      vec2 f = fract(q) - 0.5;
      float r = sqrt(tone) * 0.6;
      m = (1.0 - smoothstep(r - 0.07, r + 0.07, length(f))) * step(0.02, tone);
    } else if (uMode < 1.5) {
      m = dotsWorld(tone, uCell);
    } else {
      vec2 uv = (vW.xz - uMaskBox.xy) / uMaskBox.zw;
      float water = 1.0 - texture2D(uMask, uv).r;
      m = water > 0.5 ? waves(0.34, 1.7) : dotsWorld(tone, uCell);
    }
    gl_FragColor = vec4(mix(uBase, uInk, m), 1.0);
    #include <colorspace_fragment>
  }`;

/* ---------- the Circuit de Monaco centreline, [lon, lat], in race direction from the line ---------- */
const MONACO = [[7.427191,43.739404],[7.427171,43.739494],[7.427199,43.739575],[7.427271,43.739686],[7.427339,43.739764],[7.427551,43.739958],[7.428628,43.741015],[7.428703,43.741091],[7.428814,43.741114],[7.428949,43.741086],[7.429043,43.74103],[7.429111,43.740942],[7.429125,43.740843],[7.429128,43.740761],[7.429139,43.740694],[7.429195,43.740614],[7.42926,43.740553],[7.429381,43.74043],[7.429463,43.740321],[7.429495,43.740255],[7.429536,43.740216],[7.429601,43.740203],[7.429676,43.740219],[7.429732,43.740261],[7.429749,43.740321],[7.429712,43.740372],[7.429617,43.740422],[7.429336,43.74068],[7.429296,43.740742],[7.429295,43.740802],[7.429317,43.740848],[7.429347,43.740891],[7.429479,43.74094],[7.429683,43.740978],[7.429794,43.741008],[7.429908,43.741041],[7.430066,43.741081],[7.430238,43.74109],[7.430329,43.741057],[7.430363,43.740955],[7.430331,43.740359],[7.430204,43.739746],[7.430072,43.739356],[7.429925,43.739078],[7.429673,43.73876],[7.429383,43.738491],[7.428963,43.73816],[7.428362,43.737894],[7.428004,43.737767],[7.427314,43.737534],[7.42685,43.737418],[7.426165,43.737301],[7.425724,43.737251],[7.42549,43.737219],[7.42545,43.73717],[7.425447,43.737127],[7.425433,43.737077],[7.425403,43.737028],[7.425304,43.737003],[7.425164,43.736986],[7.425009,43.73705],[7.424924,43.737054],[7.42369,43.736937],[7.423077,43.736873],[7.422513,43.736809],[7.422357,43.736792],[7.422253,43.736779],[7.422178,43.736723],[7.42206,43.736555],[7.42196,43.736392],[7.42188,43.736229],[7.421845,43.736113],[7.421808,43.735911],[7.421805,43.735565],[7.42181,43.735479],[7.421845,43.73542],[7.421915,43.735363],[7.42207,43.735281],[7.422174,43.735212],[7.422219,43.735138],[7.422237,43.735031],[7.422413,43.734295],[7.422458,43.734166],[7.422472,43.734125],[7.422468,43.73407],[7.422423,43.734026],[7.422324,43.733976],[7.422225,43.733941],[7.422202,43.733891],[7.422221,43.733786],[7.422334,43.733547],[7.422437,43.733367],[7.422542,43.733225],[7.422722,43.733039],[7.422948,43.732874],[7.423114,43.732805],[7.4233,43.732742],[7.423393,43.732712],[7.42344,43.732674],[7.423494,43.732557],[7.423468,43.732495],[7.423384,43.732459],[7.423011,43.732388],[7.422803,43.732364],[7.422666,43.732362],[7.422544,43.732375],[7.422467,43.732417],[7.42242,43.732452],[7.422418,43.732534],[7.4224,43.7326],[7.422364,43.732681],[7.422154,43.732868],[7.422,43.733047],[7.42188,43.733181],[7.421753,43.733435],[7.421472,43.734142],[7.421395,43.73437],[7.421341,43.734614],[7.421271,43.73497],[7.421216,43.735433],[7.421216,43.735735],[7.421234,43.735966],[7.421269,43.736206],[7.421331,43.736373],[7.421401,43.736523],[7.421435,43.736615],[7.421452,43.736696],[7.421444,43.736819],[7.421441,43.736895],[7.421475,43.73694],[7.421562,43.73697],[7.421774,43.737007],[7.421963,43.737013],[7.422222,43.737036],[7.422583,43.737069],[7.422903,43.73711],[7.423717,43.737283],[7.424172,43.737373],[7.424589,43.737422],[7.424875,43.737439],[7.425098,43.737497],[7.425743,43.737718],[7.426026,43.737802],[7.426439,43.737869],[7.426784,43.737904],[7.427113,43.737944],[7.427298,43.737991],[7.427523,43.738093],[7.427718,43.73824],[7.427828,43.738364],[7.427877,43.738494],[7.427869,43.73863],[7.427837,43.738758],[7.427767,43.738899],[7.427674,43.739033],[7.427528,43.739115],[7.427388,43.73921],[7.42732,43.739253],[7.427257,43.739299]];
// the harbour and the sea beyond the tunnel, roughly; the track always gets a quay of land around it
const SEA = [[7.4228,43.7330],[7.4228,43.7362],[7.4256,43.7367],[7.4268,43.7371],[7.4297,43.7389],[7.4316,43.7404],[7.4360,43.7425],[7.4360,43.7260],[7.4185,43.7260],[7.4205,43.7310]];
const TUNNEL = [43, 50]; // control-point range of the tunnel along the coast
const SCALE = 0.62, HALF = 4.2, KERB = 0.85, RUNOFF = 2.4, CAR_R = 1.05;
const LON0 = 7.4258, LAT0 = 43.7368, KX = Math.cos((LAT0 * Math.PI) / 180) * 111320 * SCALE, KZ = 110574 * SCALE;
const toXZ = ([lon, lat]) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];

function buildTrack() {
  const ctrl = MONACO.map((p) => { const [x, z] = toXZ(p); return new THREE.Vector3(x, 0, z); });
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  // measure the curve finely: Three's default (200 chunks for the whole lap) spaces the samples
  // anywhere from 0.1 to 1.5 apart, which bunches them up in some corners and folds the walls
  curve.arcLengthDivisions = 20000;
  const length = curve.getLength();
  const pts = curve.getSpacedPoints(Math.round(length / 0.75));
  pts.pop();
  const n = pts.length, ds = length / n;
  const P = pts.map((p, i) => ({ i, x: p.x, z: p.z, tx: 1, tz: 0, rx: 0, rz: 1, k: 0, hl: HALF, hr: HALF }));
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    P[i].tx = tx / l; P[i].tz = tz / l; P[i].rx = -P[i].tz; P[i].rz = P[i].tx;
  }
  for (let i = 0; i < n; i++) {
    const a = P[(i - 3 + n) % n], b = P[(i + 3) % n];
    let d = Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    P[i].k = d / (6 * ds); // + = turning right
  }
  // on the inside of a tight corner, keep the edges from folding over themselves
  for (const p of P) {
    const R = 1 / Math.max(1e-4, Math.abs(p.k)), inner = Math.min(HALF, R * 0.82);
    if (p.k > 0) p.hr = inner; else p.hl = inner;
  }
  // tunnel samples: nearest to the control points that bound it
  const near = (c) => { let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  const tunnel = [near(ctrl[TUNNEL[0]]), near(ctrl[TUNNEL[1]])];
  return { P, n, length, ds, tunnel };
}

/* Barrier offsets, worked out once. Each Armco sits at the run-off line unless that would put it
   past the halfway line to another stretch of track (so the walls of a hairpin's two legs, or of a
   chicane's two corners, meet instead of crossing), past the inside of a tight corner (where an
   offset line folds over itself), or doubling back on itself. Returns positive distances. */
function wallOffsets(P, n) {
  const L = new Float32Array(n), R = new Float32Array(n);
  const CELL = 3, grid = new Map(), key = (cx, cz) => `${cx},${cz}`;
  P.forEach((p, i) => { const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const cyc = (a, b) => { const d = Math.abs(a - b); return Math.min(d, n - d); };
  // other stretches of track near sample i (samples within 12 of it are its own stretch; its own
  // corners are capped by curvature instead). Most samples have none, which keeps this quick.
  const others = (i) => {
    const p = P[i], cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL), r = Math.ceil((HALF + RUNOFF + 8) / CELL), out = [];
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
      const list = grid.get(key(gx, gz));
      if (list) for (const j of list) if (cyc(i, j) > 12) out.push(P[j]);
    }
    return out;
  };
  // is (x, z), which is t from its own sample, within half a unit of being nearer one of those?
  const pastMedial = (x, z, near, t) => { const t2 = (t + 0.5) * (t + 0.5); for (const q of near) { const dx = q.x - x, dz = q.z - z; if (dx * dx + dz * dz < t2) return true; } return false; };
  for (let i = 0; i < n; i++) {
    const p = P[i], near = others(i);
    for (const side of [-1, 1]) {
      const inside = side * p.k > 0 ? 0.85 / Math.max(1e-4, Math.abs(p.k)) : 1e9; // + k turns right, so the right side is the inside
      let want = Math.min((side < 0 ? p.hl : p.hr) + RUNOFF, inside);
      if (near.length) for (let t = 0.6; t <= want; t += 0.25) if (pastMedial(p.x + p.rx * side * t, p.z + p.rz * side * t, near, t)) { want = Math.max(0.4, t - 0.3); break; }
      (side < 0 ? L : R)[i] = want;
    }
  }
  // a short running minimum, so a pinch never shows up as a one-sample spike
  const smooth = (A) => { const B = A.slice(); for (let i = 0; i < n; i++) { let m = A[i]; for (let k = -3; k <= 3; k++) m = Math.min(m, A[(i + k + n) % n]); B[i] = m; } return B; };
  const out = { L: smooth(L), R: smooth(R) };
  // untangle: inside the tightest corners a wall can still loop over itself a few samples later.
  // Find each place a wall segment crosses a later one on the same wall, and pull that stretch in.
  const cross = (a, b, c, d) => {
    const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]), d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (const [A, side] of [[out.L, -1], [out.R, 1]]) {
    const at = (i) => { const k = (i + n) % n, p = P[k]; return [p.x + p.rx * side * A[k], p.z + p.rz * side * A[k]]; };
    for (let pass = 0; pass < 80; pass++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 2; j <= i + 16; j++) {
          if (!cross(at(i), at(i + 1), at(j), at(j + 1))) continue;
          for (let k = i - 1; k <= j + 2; k++) A[(k + n) % n] *= 0.93;
          changed = true; break;
        }
      }
      if (!changed) break;
    }
  }
  // round off the teeth the untangling leaves: a running minimum then a running mean over the same
  // window, which can only ever move a wall inwards, so it cannot bring a crossing back
  for (const A of [out.L, out.R]) {
    const M = A.slice(), K = 5;
    for (let i = 0; i < n; i++) { let m = A[i]; for (let k = -K; k <= K; k++) m = Math.min(m, A[(i + k + n) % n]); M[i] = m; }
    for (let i = 0; i < n; i++) { let s2 = 0; for (let k = -K; k <= K; k++) s2 += M[(i + k + n) % n]; A[i] = s2 / (2 * K + 1); }
  }
  return out;
}

function holtForecast(times, alpha = 0.5, beta = 0.3) {
  const fc = [];
  if (times.length < 2) return { fc, next: null, sd: null };
  let l = times[1], b = times[1] - times[0];
  const res = [];
  for (let i = 2; i < times.length; i++) {
    const f = l + b;
    fc[i] = f; res.push(times[i] - f);
    const nl = alpha * times[i] + (1 - alpha) * (l + b);
    b = beta * (nl - l) + (1 - beta) * b;
    l = nl;
  }
  b = clamp(b, -3, 3);
  const sd = res.length >= 2 ? Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (res.length - 1)) : null;
  return { fc, next: l + b, sd };
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/* ---------- sound: a deep, raw V10 (or V12) through a sequential gearbox, plus tyres and kerbs ----------
   Source and filter, like a real engine. The source is one four-stroke cycle of combustion pulses
   (10 or 12, each cylinder slightly different, which is what gives the lumpy crank-order rumble),
   played at the engine's speed. The filter is a set of fixed resonances (chest, exhaust box, pipe)
   that do not move with the revs, so it sounds like one engine getting faster rather than a tone
   sliding up. The model car revs to 18,400, but its voice is mapped to a big engine's 1,600 to
   7,700 rpm, so it stays deep. */
const voiceRpm = (rpm) => 1600 + Math.max(0, rpm - 4000) * 0.42;

/* The real thing: a 2005 Red Bull-Cosworth RB1 (3.0 litre V10) revving on the start line at the
   Goodwood Festival of Speed 2010, recorded by Edvvc (CC BY-SA 3.0, Wikimedia Commons). Analysed in
   the browser, 18.6 to 19.85 s is its steadiest stretch: level within 2 dB, a clear note at about
   642 Hz (one bank of five cylinders at roughly 15,400 rpm). That stretch is cut into a seamless
   loop and played faster or slower with the car's revs, so the top of the rev range is the
   recording's own pitch. If it cannot load, the synthesised engine below plays instead. */
const REC = {
  urls: ['https://upload.wikimedia.org/wikipedia/commons/8/86/Red_Bull-Cosworth_RB1_%282005%29.ogg',
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/86/Red_Bull-Cosworth_RB1_%282005%29.ogg/Red_Bull-Cosworth_RB1_%282005%29.ogg.mp3'],
  from: 18.6, len: 1.25, xf: 0.12, hz: 642,
};
let recPromise = null;
function loadRecording() {
  if (!recPromise) recPromise = (async () => {
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!C) return null;
    const dec = new C(1, 1, 44100);
    for (const u of REC.urls) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        return cutLoop(await dec.decodeAudioData(await r.arrayBuffer()));
      } catch { /* try the next format */ }
    }
    return null;
  })();
  return recPromise;
}
function cutLoop(ab) {
  const sr = ab.sampleRate, s0 = Math.round(REC.from * sr), n = Math.round(REC.len * sr), xf = Math.round(REC.xf * sr);
  const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
  const mono = (i) => (L[s0 + i] + R[s0 + i]) / 2;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = mono(i);
  // bake the seam: the start is blended (equal power) with what follows the end, so the loop never clicks
  for (let i = 0; i < xf; i++) { const a = (i / xf) * Math.PI / 2; y[i] = mono(i) * Math.sin(a) + mono(n + i) * Math.cos(a); }
  let ss = 0; for (let i = 0; i < n; i++) ss += y[i] * y[i];
  const k = 0.25 / Math.sqrt(ss / n);
  for (let i = 0; i < n; i++) y[i] *= k;
  const out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
  out.copyToChannel(y, 0);
  return out;
}
const COEF = {};
function cycleCoeffs(cyl) {
  if (COEF[cyl]) return COEF[cyl];
  const N = 4096, H = 200, x = new Float32Array(N), rnd = rng(cyl * 977 + 13);
  for (let c = 0; c < cyl; c++) {
    const amp = (cyl === 12 ? 0.88 : 0.78) + (cyl === 12 ? 0.24 : 0.44) * rnd();
    const start = (c + (rnd() - 0.5) * 0.08) / cyl, decay = 3.2 + rnd() * 1.4;
    for (let i = 0; i < N; i++) {
      let ph = i / N - start; if (ph < 0) ph += 1;
      const tp = ph * cyl; // time since this cylinder fired, in firing intervals
      if (tp > 3) continue;
      // a hard pressure push, then the suck-back after it
      x[i] += amp * (Math.exp(-tp * decay) - 0.3 * Math.exp(-tp * 1.3)) * Math.min(1, tp * 40);
    }
  }
  let mean = 0; for (let i = 0; i < N; i++) mean += x[i]; mean /= N;
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let k = 1; k <= H; k++) {
    let a = 0, b = 0; const w = (2 * Math.PI * k) / N;
    for (let i = 0; i < N; i++) { const v = x[i] - mean; a += v * Math.cos(w * i); b += v * Math.sin(w * i); }
    re[k] = a / N; im[k] = b / N;
  }
  return (COEF[cyl] = { re, im });
}
// worked out while the page is idle, so pressing the throttle never stutters
const cycleWave = (ac, cyl) => { const { re, im } = cycleCoeffs(cyl); return ac.createPeriodicWave(re, im); };
function grit(k) {
  const c = new Float32Array(2048), norm = Math.tanh(k) + 0.08;
  for (let i = 0; i < 2048; i++) { const x = (i * 2) / 2048 - 1; c[i] = (Math.tanh(k * x) + 0.08 * x * x) / norm; }
  return c;
}
class RaceSound {
  constructor() { this.mode = 'rec'; }
  get cyl() { return 10; }
  start() {
    const ac = audioCtx();
    if (!ac) return;
    if (!this.ac) {
      this.ac = ac;
      const t = ac.currentTime;
      this.waves = { v10: cycleWave(ac, 10) };
      this.out = ac.createGain(); this.out.gain.value = 0; this.out.connect(out());
      // the source: combustion pulses at the engine's cycle rate
      this.osc = ac.createOscillator(); this.osc.setPeriodicWave(this.waves.v10); this.osc.frequency.value = 14;
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.buf = buf;
      // cycle-to-cycle wander: slow random pitch drift, scaled to the pitch
      const wander = ac.createBufferSource(); wander.buffer = buf; wander.loop = true; wander.playbackRate.value = 0.5;
      const wlp = ac.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 9;
      this.wanderG = ac.createGain(); this.wanderG.gain.value = 0;
      wander.connect(wlp).connect(this.wanderG).connect(this.osc.frequency); wander.start(t);
      this.osc.start(t);
      this.drive = ac.createGain(); this.drive.gain.value = 1.5;
      // crank-order and half-order layers, saturated with the pulses so they growl as one engine
      this.crank = ac.createOscillator(); this.crank.type = 'sawtooth';
      this.crankG = ac.createGain(); this.crankG.gain.value = 0.22;
      this.half = ac.createOscillator(); this.half.type = 'triangle';
      this.halfG = ac.createGain(); this.halfG.gain.value = 0.2;
      this.crank.connect(this.crankG).connect(this.drive); this.half.connect(this.halfG).connect(this.drive);
      this.crank.start(t); this.half.start(t);
      const sh = ac.createWaveShaper(); sh.curve = grit(2.2); sh.oversample = '4x';
      // the filter: fixed resonances of the car, not of the note
      const peak = (f, q, g) => { const b = ac.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
      this.hp = ac.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 28;
      this.chest = peak(105, 0.9, 6); this.box = peak(380, 1.1, 4); this.pipe = peak(950, 1.6, 2.5);
      this.lp = ac.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.Q.value = 0.6;
      this.eng = ac.createGain(); this.eng.gain.value = 0;
      // combustion roughness: amplitude flutter from filtered noise, scaled to the engine's own level
      this.rough = ac.createGain(); this.rough.gain.value = 1;
      const flut = ac.createBufferSource(); flut.buffer = buf; flut.loop = true;
      const flp = ac.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 40;
      const fg = ac.createGain(); fg.gain.value = 0.3;
      flut.connect(flp).connect(fg).connect(this.rough.gain); flut.start(t, 0.7);
      this.osc.connect(this.drive).connect(sh).connect(this.hp).connect(this.chest).connect(this.box).connect(this.pipe).connect(this.lp).connect(this.eng).connect(this.rough).connect(this.out);
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.start(t, 0.3);
      // exhaust rasp: low band-passed noise chopped at the firing rate
      this.rf = ac.createBiquadFilter(); this.rf.type = 'bandpass'; this.rf.frequency.value = 600; this.rf.Q.value = 0.8;
      this.chop = ac.createGain(); this.chop.gain.value = 0.5;
      this.chopOsc = ac.createOscillator(); this.chopOsc.type = 'square';
      const chopDepth = ac.createGain(); chopDepth.gain.value = 0.5;
      this.chopOsc.connect(chopDepth).connect(this.chop.gain); this.chopOsc.start(t);
      this.rg = ac.createGain(); this.rg.gain.value = 0;
      src.connect(this.rf).connect(this.chop).connect(this.rg).connect(this.out);
      // intake roar: a deep whoosh that opens up with the throttle
      this.inf = ac.createBiquadFilter(); this.inf.type = 'bandpass'; this.inf.frequency.value = 300; this.inf.Q.value = 0.7;
      this.ig = ac.createGain(); this.ig.gain.value = 0;
      src.connect(this.inf).connect(this.ig).connect(this.out);
      // tyres: a low scrub; kerbs: a rumble
      this.tf = ac.createBiquadFilter(); this.tf.type = 'bandpass'; this.tf.frequency.value = 820; this.tf.Q.value = 2.2;
      this.tg = ac.createGain(); this.tg.gain.value = 0;
      src.connect(this.tf).connect(this.tg).connect(this.out);
      this.kf = ac.createBiquadFilter(); this.kf.type = 'lowpass'; this.kf.frequency.value = 180;
      this.kg = ac.createGain(); this.kg.gain.value = 0;
      src.connect(this.kf).connect(this.kg).connect(this.out);
      // the recorded V10: loop → throttle-opened low-pass → a touch of chest → level
      this.recLp = ac.createBiquadFilter(); this.recLp.type = 'lowpass'; this.recLp.frequency.value = 2500; this.recLp.Q.value = 0.5;
      this.recShelf = ac.createBiquadFilter(); this.recShelf.type = 'lowshelf'; this.recShelf.frequency.value = 160; this.recShelf.gain.value = 4;
      this.recG = ac.createGain(); this.recG.gain.value = 0;
      this.recLp.connect(this.recShelf).connect(this.recG).connect(this.out);
      loadRecording().then((buf) => {
        if (!buf || !this.ac) return;
        const src = this.ac.createBufferSource(); src.buffer = buf; src.loop = true;
        src.playbackRate.value = 0.5; src.connect(this.recLp); src.start();
        this.recSrc = src;
      });
    }
    this.out.gain.setTargetAtTime(0.9, this.ac.currentTime, 0.12);
  }
  setEngine(kind) { this.mode = kind === 'synth' ? 'synth' : 'rec'; }
  stop() { if (this.ac) this.out.gain.setTargetAtTime(0, this.ac.currentTime, 0.05); }
  update(rpm, throttle, slip, rough, cut) {
    if (!this.ac) return;
    const t = this.ac.currentTime, fc = voiceRpm(rpm) / 120, ff = fc * this.cyl, r = clamp((rpm - 4000) / 14400, 0, 1);
    this.osc.frequency.setTargetAtTime(fc, t, 0.015);
    this.crank.frequency.setTargetAtTime(fc * 2, t, 0.015);
    this.half.frequency.setTargetAtTime(fc, t, 0.015);
    this.chopOsc.frequency.setTargetAtTime(ff, t, 0.015);
    this.wanderG.gain.setTargetAtTime(fc * (0.014 - 0.007 * r), t, 0.1); // a lazy idle wanders more than a flat-out run
    // load opens it up: on throttle harder and a little brighter, off throttle a muffled burble
    this.drive.gain.setTargetAtTime(1.3 + 2.2 * throttle, t, 0.04);
    this.lp.frequency.setTargetAtTime(700 + 3200 * throttle * (0.4 + 0.6 * r) + 1300 * r, t, 0.05);
    const g = cut ? 0.025 : 0.07 + 0.17 * throttle * (0.5 + 0.5 * r) + 0.05 * r;
    const rec = this.mode === 'rec' && this.recSrc;
    if (rec) { // the real engine: pitch follows the revs; off the throttle it is muffled and quieter
      const real = 4800 + Math.max(0, rpm - 4000) * 0.72; // the car's revs on a real V10's scale
      this.recSrc.playbackRate.setTargetAtTime(clamp(real / 24 / REC.hz, 0.25, 1.35), t, 0.02);
      this.recG.gain.setTargetAtTime(cut ? 0.12 : 0.32 + 0.6 * throttle, t, cut ? 0.006 : 0.04);
      this.recLp.frequency.setTargetAtTime(1300 + 9500 * throttle * (0.35 + 0.65 * r) + 1500 * r, t, 0.05);
    } else if (this.recG) this.recG.gain.setTargetAtTime(0, t, 0.05);
    this.eng.gain.setTargetAtTime(rec ? 0 : g, t, cut ? 0.006 : 0.035);
    this.rf.frequency.setTargetAtTime(500 + 700 * r, t, 0.05);
    this.rg.gain.setTargetAtTime(rec ? 0 : 0.006 + throttle * (0.015 + 0.025 * r), t, 0.04);
    this.ig.gain.setTargetAtTime(throttle * (rec ? 0.008 : 0.015 + 0.025 * r), t, 0.05);
    this.inf.frequency.setTargetAtTime(260 + 450 * r, t, 0.05);
    this.tg.gain.setTargetAtTime(clamp((slip - 0.12) * 0.12, 0, 0.035), t, 0.05);
    this.kg.gain.setTargetAtTime(rough, t, 0.03);
    // lifting off at high revs: the odd overrun crackle
    if (throttle < 0.05 && rpm > 9000 && Math.random() < 0.04) this.pop(0.5 + Math.random() * 0.5);
  }
  burst(dur, freq, q, gain, type = 'bandpass', at = 0) {
    const ac = this.ac, t = ac.currentTime + at;
    const s = ac.createBufferSource(); s.buffer = this.buf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  pop(k) { if (this.ac) { this.burst(0.04, 700 + Math.random() * 600, 1.1, 0.14 * k); this.burst(0.03, 160, 0.8, 0.12 * k, 'lowpass'); } }
  upshift() { if (!this.ac) return; this.burst(0.06, 220, 0.8, 0.22, 'lowpass'); this.burst(0.025, 3200, 1.5, 0.04); }
  downshift() { if (!this.ac) return; this.burst(0.05, 240, 0.8, 0.18, 'lowpass'); for (let k = 0; k < 3; k++) this.burst(0.035, 800 + k * 300, 1.3, 0.12, 'bandpass', 0.05 + k * 0.05); }
  thump(v) { if (this.ac) this.burst(0.22, 380, 0.7, clamp(v * 0.035, 0.04, 0.28), 'lowpass'); }
  // start lights: a short tone per light, like the broadcast graphic
  beep() {
    const ac = audioCtx(); if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 880;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.005); g.gain.setValueAtTime(0.05, t + 0.11); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
    o.connect(lp).connect(g).connect(out()); o.start(t); o.stop(t + 0.18);
  }
}

export function initTrack() {
  // fetch and cut the recorded engine (about 1 MB from Wikimedia Commons), and prepare the fallback, while idle
  (window.requestIdleCallback || ((fn) => setTimeout(fn, 400)))(() => { cycleCoeffs(10); loadRecording(); });
  const stage = document.getElementById('track-stage');
  const canvas = document.getElementById('track-canvas');
  const wrapEl = canvas.closest('.track-wrap');
  const pads = document.getElementById('track-pads');
  const hintEl = document.getElementById('track-hint');
  const tbody = document.querySelector('#lap-table tbody');
  const forecastEl = document.getElementById('forecast');
  const hudEl = document.getElementById('track-hud');
  const speedEl = document.getElementById('track-speed');
  const ctaMain = document.getElementById('track-cta-main');
  const ctaEl = document.getElementById('track-cta');
  const noteEl = document.getElementById('rc-note');
  const fig = document.getElementById('track-fig');
  const $ = (id) => document.getElementById(id);

  if (coarse) {
    hintEl.textContent = 'Tap the track, then use the pads';
    ctaMain.textContent = 'Tap to take the wheel';
    $('track-cta-sub').textContent = 'Steer, brake and throttle with the pads below';
  }

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { stage.classList.add('no-webgl'); hudEl.textContent = 'This figure needs WebGL'; ctaEl.hidden = true; return; }
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let pr = DPR;
  renderer.setPixelRatio(pr);
  renderer.setClearColor(PAPER, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 2, 0.25, 1400);

  /* ---------- materials ---------- */
  const T = buildTrack();
  const { P, n } = T;
  const WALL = wallOffsets(P, n);
  // where two stretches run so close that a barrier had to come in, the road narrows to meet it
  for (const p of P) { p.hl = Math.max(1.2, Math.min(p.hl, WALL.L[p.i] - 0.3)); p.hr = Math.max(1.2, Math.min(p.hr, WALL.R[p.i] - 0.3)); }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const PAD = 320, box = { x: minX - PAD, z: minZ - PAD, w: maxX - minX + 2 * PAD, h: maxZ - minZ + 2 * PAD };
  // land / water mask, drawn once: sea polygon in black, a quay of land around the whole circuit in white
  const mask = document.createElement('canvas'); mask.width = mask.height = 1024;
  {
    const g = mask.getContext('2d');
    const mx = (x) => ((x - box.x) / box.w) * 1024, mz = (z) => ((z - box.z) / box.h) * 1024;
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = '#000'; g.beginPath();
    SEA.forEach((c, i) => { const [x, z] = toXZ(c); g[i ? 'lineTo' : 'moveTo'](mx(x), mz(z)); }); g.closePath(); g.fill();
    g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = ((HALF + 16) * 2 / box.w) * 1024;
    g.beginPath(); P.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](mx(p.x), mz(p.z))); g.closePath(); g.stroke();
  }
  const maskData = mask.getContext('2d').getImageData(0, 0, 1024, 1024).data;
  const isWater = (x, z) => { const px = Math.floor(((x - box.x) / box.w) * 1024), pz = Math.floor(((z - box.z) / box.h) * 1024); if (px < 0 || pz < 0 || px > 1023 || pz > 1023) return false; return maskData[(pz * 1024 + px) * 4] < 128; };
  const maskTex = new THREE.CanvasTexture(mask);
  maskTex.flipY = false; maskTex.minFilter = THREE.LinearFilter;

  const light = new THREE.Vector3(-0.45, 0.78, 0.45).normalize();
  const fillMats = [];
  const matCache = new Map();
  const ht = (base = PAPER, { amb = 0.45, tone = 0, fade = 380, mode = 0, cell = 1, off = 1.5 } = {}) => {
    const key = [base, amb, tone, fade, mode, cell, off].join('|');
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uBase: { value: new THREE.Color(base) }, uInk: { value: new THREE.Color(INK) }, uLight: { value: light },
        uDot: { value: 4.2 * pr }, uAmb: { value: amb }, uTone: { value: tone }, uFade: { value: fade },
        uMode: { value: mode }, uCell: { value: cell }, uTime: { value: 0 },
        uMask: { value: maskTex }, uMaskBox: { value: new THREE.Vector4(box.x, box.z, box.w, box.h) },
      },
      vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, extensions: { derivatives: true },
      polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off * 2,
    });
    fillMats.push(m); matCache.set(key, m);
    return m;
  };
  const lineMats = [];
  const lm = (color, width) => { const m = new LineMaterial({ color, linewidth: width }); lineMats.push(m); return m; };
  const inkLine = lm(INK, 1.5), fineLine = lm(INK, 1.0), farLine = lm(0x47473F, 0.8);
  const edges = (geo, mat = inkLine, thr = 30) => new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, thr)), mat);
  const solid = (geo, base = PAPER, { line = inkLine, thr = 30, ...o } = {}) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, ht(base, o)));
    if (line) g.add(edges(geo, line, thr));
    return g;
  };
  const inkMat = new THREE.MeshBasicMaterial({ color: INK });
  const zincMat = new THREE.MeshBasicMaterial({ color: ZINC });
  const kerbAt = P.map((p) => Math.abs(p.k) > 1 / 24);

  /* ---------- ground, circuit, paint ---------- */
  const groundMat = ht(PAPER, { amb: 1, tone: 0.1, mode: 2, cell: 0.7, fade: 1400, off: 6 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(box.w, box.h).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(box.x + box.w / 2, -0.04, box.z + box.h / 2);
  scene.add(ground);

  const ribbon = (offL, offR, y) => {
    const pos = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i <= n; i++) {
      const p = P[i % n], o0 = offL(p), o1 = offR(p);
      pos.set([p.x + p.rx * o0, y, p.z + p.rz * o0, p.x + p.rx * o1, y, p.z + p.rz * o1], i * 6);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  scene.add(new THREE.Mesh(ribbon((p) => -p.hl, (p) => p.hr, 0), ht(PAPER, { amb: 1, tone: 0, off: 3 })));
  const segs = (off, y) => { const a = []; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; const o0 = off(p), o1 = off(q); a.push(p.x + p.rx * o0, y, p.z + p.rz * o0, q.x + q.rx * o1, y, q.z + q.rz * o1); } return a; };
  scene.add(new LineSegments2(new LineSegmentsGeometry().setPositions([...segs((p) => -p.hl, 0.03), ...segs((p) => p.hr, 0.03)]), inkLine));

  // Armco barriers just beyond the run-off, the Monaco way: very little room
  const wallL = (p) => -WALL.L[p.i];
  const wallR = (p) => WALL.R[p.i];
  const wallGeo = (off) => {
    const pos = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i <= n; i++) { const p = P[i % n], o = off(p); pos.set([p.x + p.rx * o, 0, p.z + p.rz * o, p.x + p.rx * o, 0.95, p.z + p.rz * o], i * 6); if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const wallMat = ht(PAPER, { amb: 0.55, fade: 300 });
  scene.add(new THREE.Mesh(wallGeo(wallL), wallMat), new THREE.Mesh(wallGeo(wallR), wallMat));
  scene.add(new LineSegments2(new LineSegmentsGeometry().setPositions([...segs(wallL, 0.95), ...segs(wallR, 0.95)]), fineLine));

  const paint = { pos: [], col: [] };
  const cInk = new THREE.Color(INK), cPap = new THREE.Color(PAPER), cGrey = new THREE.Color(GREY);
  const pushQuad = (c4, col, y) => { [0, 1, 2, 0, 2, 3].forEach((k) => { paint.pos.push(c4[k][0], y, c4[k][1]); paint.col.push(col.r, col.g, col.b); }); };
  const band = (i, o0f, o1f, col, y = 0.02) => {
    const p = P[i], q = P[(i + 1) % n], a0 = o0f(p), a1 = o1f(p), b0 = o0f(q), b1 = o1f(q);
    pushQuad([[p.x + p.rx * a0, p.z + p.rz * a0], [q.x + q.rx * b0, q.z + q.rz * b0], [q.x + q.rx * b1, q.z + q.rz * b1], [p.x + p.rx * a1, p.z + p.rz * a1]], col, y);
  };
  for (let i = 0; i < n; i++) {
    if (i % 6 < 3 && i > 4) band(i, () => -0.09, () => 0.09, cGrey);
    if (kerbAt[i]) {
      const col = Math.floor(i / 2) % 2 ? cInk : cPap;
      band(i, (p) => p.hr, (p) => p.hr + KERB, col);
      band(i, (p) => -p.hl - KERB, (p) => -p.hl, col);
    }
  }
  { const p = P[0]; for (let row = 0; row < 2; row++) for (let c = 0; c < 9; c++) { if ((row + c) % 2) continue; const along = row - 1, across = -HALF + c * (2 * HALF / 9); const w = (2 * HALF) / 9; const corner = (u, v) => [p.x + p.tx * (along + u) + p.rx * (across + v), p.z + p.tz * (along + u) + p.rz * (across + v)]; pushQuad([corner(0, 0), corner(1, 0), corner(1, w), corner(0, w)], cInk, 0.025); } }
  const paintGeo = new THREE.BufferGeometry();
  paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(paint.pos, 3));
  paintGeo.setAttribute('color', new THREE.Float32BufferAttribute(paint.col, 3));
  scene.add(new THREE.Mesh(paintGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  /* ---------- the tunnel: walls, a roof and strip lights that streak past ---------- */
  {
    const [t0, t1] = T.tunnel, H = 4.6, darkMat = new THREE.MeshBasicMaterial({ color: 0x2b2b27, side: THREE.DoubleSide });
    const pos = [], idxs = [];
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.06, 1.6), new THREE.MeshBasicMaterial({ color: PAPER }), Math.ceil((t1 - t0) / 6) + 2);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(1, 1, 1), v4 = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0);
    let li = 0;
    for (let i = t0; i <= t1; i++) {
      const p = P[i], l = wallL(p), r = wallR(p);
      const base = pos.length / 3;
      pos.push(p.x + p.rx * l, 0, p.z + p.rz * l, p.x + p.rx * l, H, p.z + p.rz * l, p.x + p.rx * r, H, p.z + p.rz * r, p.x + p.rx * r, 0, p.z + p.rz * r);
      if (i < t1) idxs.push(base, base + 4, base + 1, base + 1, base + 4, base + 5, base + 1, base + 5, base + 2, base + 2, base + 5, base + 6, base + 2, base + 6, base + 3, base + 3, base + 6, base + 7);
      if ((i - t0) % 6 === 0 && li < lights.count) { q4.setFromAxisAngle(yA, -Math.atan2(p.tz, p.tx)); v4.set(p.x, H - 0.05, p.z); m4.compose(v4, q4, s4); lights.setMatrixAt(li++, m4); }
    }
    lights.count = li;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idxs);
    scene.add(new THREE.Mesh(g, darkMat), lights);
    // portals, so the mouth reads from outside
    for (const i of [t0, t1]) {
      const p = P[i], l = wallL(p), r = wallR(p), w = r - l + 1.6;
      const portal = solid(new THREE.BoxGeometry(1.2, 1.4, w), PAPER, { amb: 0.4 });
      portal.position.set(p.x + p.rx * ((l + r) / 2), H + 0.7, p.z + p.rz * ((l + r) / 2)); portal.rotation.y = -Math.atan2(p.tz, p.tx);
      scene.add(portal);
    }
  }

  /* ---------- scenery: a hillside of towers, yachts in the harbour, a start gantry ---------- */
  const distToTrack = (x, z) => { let bd = Infinity; for (let i = 0; i < n; i += 3) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
  const R = rng(1929);
  const towerMats = { amb: 0.5, fade: 420 };
  let placed = 0;
  for (let k = 0; k < 900 && placed < 110; k++) {
    const x = box.x + 60 + R() * (box.w - 120), z = box.z + 60 + R() * (box.h - 120);
    if (isWater(x, z) || distToTrack(x, z) < HALF + RUNOFF + 7) continue;
    const w = 6 + R() * 9, d = 6 + R() * 9, h = 10 + Math.pow(R(), 1.5) * 46;
    const t = solid(new THREE.BoxGeometry(w, h, d), PAPER, towerMats); t.position.set(x, h / 2, z); t.rotation.y = R() * 0.6; scene.add(t);
    if (R() < 0.3) { const c = solid(new THREE.BoxGeometry(w * 0.6, h * 0.14, d * 0.6), PAPER, towerMats); c.position.set(x, h * 1.07, z); c.rotation.y = t.rotation.y; scene.add(c); }
    placed++;
  }
  const yachtGeo = [new THREE.BoxGeometry(9, 1.1, 2.8), new THREE.BoxGeometry(4.5, 1.2, 2.2)];
  const yachts = [];
  for (let k = 0, made = 0; k < 600 && made < 16; k++) {
    const x = box.x + R() * box.w, z = box.z + R() * box.h;
    if (!isWater(x, z) || distToTrack(x, z) < 20 || distToTrack(x, z) > 140) continue;
    const g = new THREE.Group();
    g.add(solid(yachtGeo[0], PAPER, { amb: 0.5 }));
    const c = solid(yachtGeo[1], PAPER, { amb: 0.6, line: fineLine }); c.position.set(-0.8, 1.1, 0); g.add(c);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6, 0.12), inkMat); mast.position.set(0.6, 3.6, 0); if (R() < 0.5) g.add(mast);
    g.position.set(x, -0.1, z); g.rotation.y = R() * Math.PI; scene.add(g);
    yachts.push({ g, ph: R() * 6 }); made++;
  }
  {
    const p = P[0], ry = -Math.atan2(p.tz, p.tx), g = new THREE.Group();
    for (const s of [-1, 1]) { const post = solid(new THREE.BoxGeometry(0.35, 5.6, 0.35), PAPER, { line: fineLine }); post.position.set(0, 2.8, s * (HALF + 1.4)); g.add(post); }
    const beam = solid(new THREE.BoxGeometry(0.8, 0.9, 2 * HALF + 3.2), PAPER, { amb: 0.5 }); beam.position.set(0, 5.6, 0); g.add(beam);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 3.2), inkMat); lights.position.set(-0.42, 5.55, 0); g.add(lights);
    g.position.set(p.x, 0, p.z); g.rotation.y = ry; scene.add(g);
  }

  /* ---------- the car, modelled on the build ---------- */
  const carG = new THREE.Group(), body = new THREE.Group(); carG.add(body);
  const part = (geo, base, x, y, z, opt = {}) => { const s = solid(geo, base, { line: fineLine, ...opt }); s.position.set(x, y, z); body.add(s); return s; };
  part(new THREE.BoxGeometry(2.7, 0.14, 1.1), INK, 0, 0.45, 0, { line: null });
  part(new THREE.BoxGeometry(0.6, 0.12, 0.7), INK, 1.5, 0.42, 0, { line: null });
  part(new THREE.BoxGeometry(0.55, 0.28, 0.24), ZINC, -0.95, 0.42, 0.36, { amb: 0.6 });
  part(new THREE.BoxGeometry(0.55, 0.28, 0.24), ZINC, -0.95, 0.42, -0.36, { amb: 0.6 });
  part(new THREE.BoxGeometry(0.75, 0.5, 0.8), INK, -0.95, 0.75, 0, { line: null });
  const ballast = new THREE.Group(); body.add(ballast);
  for (const s of [-1, 1]) { const w = solid(new THREE.BoxGeometry(0.5, 0.14, 0.1), ZINC, { amb: 0.7, line: fineLine }); w.position.set(0, 0.59, s * 0.5); ballast.add(w); }
  part(new THREE.BoxGeometry(0.95, 0.22, 0.8), INK, 0.25, 0.62, 0, { line: null });
  part(new THREE.BoxGeometry(0.8, 0.05, 0.5), PAPER, 0.25, 0.75, 0, { amb: 0.6 });
  part(new THREE.BoxGeometry(0.38, 0.24, 0.22), PAPER, 1.12, 0.62, 0, { amb: 0.5 });
  part(new THREE.BoxGeometry(0.1, 0.9, 0.1), INK, 0.82, 0.95, 0, { line: null });
  part(new THREE.BoxGeometry(0.16, 0.42, 0.34), INK, 0.84, 1.5, 0, { line: null });
  part(new THREE.BoxGeometry(0.03, 0.3, 0.24), PAPER, 0.93, 1.5, 0, { amb: 0.5 });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12).rotateZ(Math.PI / 2), inkMat); lens.position.set(0.97, 1.56, 0); body.add(lens);
  const wing = new THREE.Group(); body.add(wing);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.06), inkMat); st.position.set(-1.2, 0.8, s * 0.36); wing.add(st); }
  { const w = solid(new THREE.BoxGeometry(0.55, 0.05, 1.75), PAPER, { amb: 0.3, line: inkLine }); w.position.set(-1.28, 1.12, 0); wing.add(w); }
  for (const s of [-1, 1]) { const e = solid(new THREE.BoxGeometry(0.6, 0.32, 0.04), PAPER, { amb: 0.5, line: fineLine }); e.position.set(-1.28, 1.05, s * 0.88); wing.add(e); }
  part(new THREE.BoxGeometry(0.36, 0.04, 1.8), PAPER, 1.55, 0.22, 0, { amb: 0.3, line: inkLine });
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.42, 0.16, 0.04), PAPER, 1.55, 0.27, s * 0.9, { amb: 0.5 });
  const WR = 0.36;
  const tyreG = [new THREE.CylinderGeometry(WR, WR, 0.32, 18).rotateX(Math.PI / 2), new THREE.CylinderGeometry(WR, WR, 0.2, 18).rotateX(Math.PI / 2)];
  const hubG = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12).rotateX(Math.PI / 2), spokeG = new THREE.BoxGeometry(0.42, 0.06, 0.29);
  const wheels = [];
  for (const [x, z, front] of [[0.95, 0.72, 1], [0.95, -0.72, 1], [-0.95, 0.72, 0], [-0.95, -0.72, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, WR, z);
    const spin = new THREE.Group(); pivot.add(spin);
    spin.add(new THREE.Mesh(tyreG[front], inkMat), new THREE.Mesh(hubG, zincMat), new THREE.Mesh(spokeG, inkMat));
    body.add(pivot); wheels.push({ pivot, spin, front });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9).rotateX(-Math.PI / 2), ht(PAPER, { amb: 1, tone: 0.5, off: -1 }));
  shadow.position.y = 0.04; carG.add(shadow);
  scene.add(carG);

  const SKIDS = 1600;
  const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.3, depthWrite: false }), SKIDS);
  skidMesh.count = 0; skidMesh.frustumCulled = false; scene.add(skidMesh);
  let skidHead = 0;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  function addSkid(x, z, yaw) {
    tmpQ.setFromAxisAngle(yAxis, -yaw); tmpP.set(x, 0.035, z); tmpM.compose(tmpP, tmpQ, tmpS);
    skidMesh.setMatrixAt(skidHead, tmpM); skidHead = (skidHead + 1) % SKIDS;
    skidMesh.count = Math.min(SKIDS, skidMesh.count + 1); skidMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- set-up and presets ---------- */
  const PRESETS = {
    grip: { wf: 0.48, grip: 1.15, wing: true, tyre: 'grip' },
    drift: { wf: 0.42, grip: 1.0, wing: false, tyre: 'drift' },
  };
  const setup = { ...PRESETS.grip, preset: 'grip', manual: false };
  const weightIn = $('rc-weight'), gripIn = $('rc-grip');
  function syncControls() {
    weightIn.value = Math.round(setup.wf * 100); $('rc-weight-out').textContent = `${Math.round(setup.wf * 100)}%`;
    gripIn.value = Math.round(setup.grip * 100); $('rc-grip-out').textContent = `${setup.grip.toFixed(2)} μ`;
    const set = (attr, v) => fig.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === v)));
    set('preset', setup.preset); set('wing', setup.wing ? 'on' : 'off'); set('gearbox', setup.manual ? 'manual' : 'auto');
    fig.classList.toggle('is-manual', setup.manual); // shows the P / I key guide next to the gear
  }
  function describe() {
    const wf = Math.round(setup.wf * 100);
    let s = setup.preset === 'grip' ? 'Grip set-up: rubber tyres, traction control, spoiler on. Planted and forgiving. ' : setup.preset === 'drift' ? 'Drift set-up: hard tyres, rear-biased weight, no spoiler, with a little counter-steer help. Lift or tap the handbrake to start a slide. ' : 'Custom set-up. ';
    s += wf <= 40 ? 'Rear-heavy: lots of traction, and the tail steps out easily.' : wf < 52 ? 'Close to balanced: rotates on a lift, then gathers up.' : 'Front-heavy: stable, but it pushes wide in the tight corners.';
    if (setup.grip < 0.85) s += ' Low grip: brake early.';
    s += setup.wing ? ' Spoiler on: rear grip grows with speed, for a little drag.' : ' Spoiler off: less drag, a lighter rear at speed.';
    noteEl.textContent = s;
    wing.visible = setup.wing;
    ballast.position.x = lerp(-0.85, 0.75, (setup.wf - 0.3) / 0.35);
  }

  /* ---------- physics: bicycle model, per unit mass ---------- */
  const G = 30, L = 1.9, HCG = 0.28, IZ = 0.95, POWER = 1500;
  const GEARS = 8, K8 = 18000 / 80, Q = 1.25, KG = Array.from({ length: GEARS + 1 }, (_, g) => (g ? K8 * Math.pow(Q, GEARS - g) : 0));
  const SURF = { track: { mu: 1, roll: 0.6 }, kerb: { mu: 0.9, roll: 1.8 }, runoff: { mu: 0.7, roll: 3.5 } };
  const car = { x: 0, z: 0, psi: 0, vx: 0, vy: 0, r: 0, delta: 0, ax: 0, ay: 0, spin: 0, slip: 0, gear: 1, rpm: 4000, cutT: 0, shiftT: 0 };
  const inp = { thr: 0, brk: 0, axis: null };
  const keys = { up: false, down: false, left: false, right: false, hand: false };
  let loc = { i: n - 14, off: 0, d: 0 }, surface = 'track', shiftEvent = 0;

  function locate(x, z, hint) {
    let best = hint, bd = Infinity;
    const scan = (a, b) => { for (let j = a; j <= b; j++) { const i = ((j % n) + n) % n, dx = x - P[i].x, dz = z - P[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } };
    scan(hint - 40, hint + 40);
    if (bd > 400) { bd = Infinity; scan(0, n - 1); }
    const p = P[best];
    return { i: best, off: (x - p.x) * p.rx + (z - p.z) * p.rz, d: Math.sqrt(bd) };
  }
  // nearest centreline sample along this stretch only, so it can never jump to the other leg of a hairpin
  function locateNear(x, z, hint) {
    let best = hint, bd = Infinity;
    for (let j = hint - 10; j <= hint + 10; j++) { const i = ((j % n) + n) % n, dx = x - P[i].x, dz = z - P[i].z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    const p = P[best];
    return { i: best, off: (x - p.x) * p.rx + (z - p.z) * p.rz, d: Math.sqrt(bd) };
  }
  function placeAt(i) {
    const p = P[((i % n) + n) % n];
    Object.assign(car, { x: p.x, z: p.z, psi: Math.atan2(p.tz, p.tx), vx: 0, vy: 0, r: 0, delta: 0, ax: 0, ay: 0, gear: 1, rpm: 4000 });
    loc = locate(car.x, car.z, i); snapCam = true;
  }
  const powerCurve = (rpm) => clamp(0.32 + 0.68 * clamp((rpm - 5000) / 10500, 0, 1), 0, 1) * (rpm > 17600 ? 0.92 : 1);
  function shift(dir) {
    const g = clamp(car.gear + dir, 1, GEARS);
    if (g === car.gear || car.shiftT > 0) return;
    car.gear = g; car.shiftT = dir > 0 ? 0.12 : 0.16;
    if (dir > 0) { car.cutT = 0.05; shiftEvent = 1; } else shiftEvent = -1;
  }

  const tyre = (a, D, B, C) => D * Math.sin(C * Math.atan(B * a));
  function sub(h) {
    inp.thr += clamp((keys.up ? 1 : 0) - inp.thr, -8 * h, 6 * h);
    inp.brk += clamp((keys.down ? 1 : 0) - inp.brk, -10 * h, 10 * h);
    const st = inp.axis !== null ? inp.axis : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    // full lock at walking pace, a fraction of it at speed, so on/off keys stay drivable
    const maxSteer = lerp(0.55, 0.075, clamp(car.vx / 42, 0, 1) ** 0.8);
    let target = st * maxSteer;
    const beta = car.vx > 3 ? Math.atan2(car.vy, car.vx) : 0;
    if (setup.tyre === 'drift') target = clamp(target + beta * (st ? 0.5 : 1.0), -0.6, 0.6); // counter-steer help
    const rate = st === 0 ? 5 : 2.6;
    car.delta += clamp(target - car.delta, -rate * h, rate * h);
    const d = car.delta;

    loc = locateNear(car.x, car.z, loc.i);
    if (loc.d > 12) loc = locate(car.x, car.z, loc.i); // far off (a reset): search the whole circuit
    const p = P[loc.i];
    const inL = -loc.off, inR = loc.off;
    surface = (loc.off >= 0 ? inR <= p.hr : inL <= p.hl) ? 'track' : kerbAt[loc.i] && Math.abs(loc.off) <= (loc.off >= 0 ? p.hr : p.hl) + KERB ? 'kerb' : 'runoff';
    const S = SURF[surface];

    const b = setup.wf * L, a = L - b, v2 = car.vx * car.vx;
    const downR = (setup.wing ? 0.0095 : 0.003) * v2, downF = 0.004 * v2;
    const Nf = Math.max(0.5, (G * b) / L - (car.ax * HCG) / L + downF);
    const Nr = Math.max(0.5, (G * a) / L + (car.ax * HCG) / L + downR);
    const ls = (N) => clamp(1 - 0.45 * (N / (G / 2) - 1), 0.5, 1.35);
    const drift = setup.tyre === 'drift';
    const Df = setup.grip * S.mu * Nf * ls(Nf);
    const Dr = setup.grip * S.mu * Nr * ls(Nr) * (drift ? 1.0 : 1.14);

    // engine and gearbox
    car.shiftT = Math.max(0, car.shiftT - h);
    car.cutT = Math.max(0, car.cutT - h);
    const wheelRpm = Math.max(0, car.vx) * KG[car.gear];
    const rpmTarget = car.vx < 3 ? Math.max(4000 + 9000 * inp.thr, wheelRpm) : Math.max(4000, wheelRpm);
    car.rpm += (Math.min(18400, rpmTarget) - car.rpm) * Math.min(1, (car.vx < 3 ? 6 : 30) * h);
    if (!setup.manual && car.shiftT === 0) {
      if (inp.thr > 0.2 && car.rpm > 17500 && car.gear < GEARS) shift(1);
      else if (car.gear > 1 && (car.rpm < (inp.brk > 0.1 ? 11000 : 8200))) shift(-1);
    }
    const limiter = car.rpm > 18100;
    let Fxr = 0, Fxf = 0;
    if (inp.thr > 0 && car.cutT === 0 && !limiter) Fxr += (POWER * powerCurve(car.rpm) * inp.thr) / Math.max(car.vx, 5);
    if (inp.brk > 0) {
      if (car.vx > 0.6) { Fxf -= 34 * inp.brk; Fxr -= 22 * inp.brk; }
      else if (car.vx > -7) Fxr -= 7 * inp.brk;
    }
    if (!keys.up && car.vx > 2) Fxr -= 2.5 + 0.0006 * car.rpm * (car.gear < 4 ? 1.5 : 1); // engine braking
    if (keys.hand && car.vx > 0.3) Fxr -= 10;
    const tc = drift ? 0.78 : 0.45; // drift keeps some rear grip on full throttle so slides stay steerable
    Fxr = clamp(Fxr, -Dr * tc, Dr * tc);
    Fxf = clamp(Fxf, -Df, Df);
    const DrLat = Math.sqrt(Math.max(0, Dr * Dr - Fxr * Fxr)) * (keys.hand ? 0.38 : 1);
    const DfLat = Math.sqrt(Math.max(0, Df * Df - Fxf * Fxf));

    const vxa = Math.max(Math.abs(car.vx), 0.5);
    const af = Math.atan2(car.vy + a * car.r, vxa) - d, ar = Math.atan2(car.vy - b * car.r, vxa);
    const Fyf = -tyre(af, DfLat, drift ? 8.5 : 10, drift ? 1.3 : 1.2);
    const Fyr = -tyre(ar, DrLat, drift ? 7.5 : 10, drift ? 1.35 : 1.2);
    const cd = Math.cos(d), sd = Math.sin(d);
    const drag = (setup.wing ? 0.0042 : 0.0034) * car.vx * Math.abs(car.vx) + S.roll * Math.sign(car.vx) * Math.min(1, Math.abs(car.vx));
    const ax = Fxr + Fxf * cd - Fyf * sd - drag, ay = Fyr + Fyf * cd + Fxf * sd;
    const yaw = (a * (Fyf * cd + Fxf * sd) - b * Fyr) / IZ;
    car.vx += (ax + car.vy * car.r) * h;
    car.vy += (ay - car.vx * car.r) * h;
    car.r = clamp(car.r + yaw * h, -7, 7);
    if (drift) { // yaw damping keeps slides catchable, and more of it past ~35 degrees so it doesn't spin round
      const over = Math.max(0, Math.abs(beta) - 0.6);
      car.r *= Math.exp(-(1.1 + over * 9) * h);
    }
    else if (car.vx > 4) { // grip set-up: stability control pulls the yaw rate toward what the steering asks for
      const rIdeal = (car.vx * Math.tan(d)) / (L * (1 + 0.00035 * v2)), e = 1 - Math.exp(-2.6 * h);
      car.r += (rIdeal - car.r) * e; car.vy *= 1 - e * 0.5;
    }
    car.ax += (ax - car.ax) * Math.min(1, 10 * h); car.ay += (ay - car.ay) * Math.min(1, 10 * h);
    const k = clamp((car.vx - 1.5) / 3, 0, 1);
    if (k < 1) { const rKin = (car.vx * Math.tan(d)) / L, e = Math.exp(-(1 - k) * 14 * h); car.r = rKin + (car.r - rKin) * e; car.vy *= e; }
    if (!keys.up && !keys.down && Math.abs(car.vx) < 0.25) car.vx = 0;
    const c = Math.cos(car.psi), s = Math.sin(car.psi);
    car.x += (car.vx * c - car.vy * s) * h; car.z += (car.vx * s + car.vy * c) * h; car.psi += car.r * h;
    car.slip = Math.max(Math.abs(ar), Math.abs(af) * 0.6) * clamp(car.vx / 4, 0, 1);

    // Armco: push back inside and lose speed
    const pl = locateNear(car.x, car.z, loc.i), pp = P[pl.i];
    const lim = pl.off >= 0 ? wallR(pp) - CAR_R * 0.9 : -wallL(pp) - CAR_R * 0.9;
    if (Math.abs(pl.off) > lim) {
      const sgn = Math.sign(pl.off), push = Math.abs(pl.off) - lim;
      car.x -= pp.rx * sgn * push; car.z -= pp.rz * sgn * push;
      const wx = car.vx * c - car.vy * s, wz = car.vx * s + car.vy * c, vn = (wx * pp.rx + wz * pp.rz) * sgn;
      if (vn > 0) {
        const nx = wx - 1.3 * vn * pp.rx * sgn, nz = wz - 1.3 * vn * pp.rz * sgn;
        car.vx = (nx * c + nz * s) * 0.85; car.vy = (-nx * s + nz * c) * 0.6; car.r *= 0.5;
        if (vn > 2) bump = Math.max(bump, vn);
      }
    }
    if (race.phase === 'lights') { car.x = race.gx; car.z = race.gz; car.vx = car.vy = car.r = 0; }
    clock += h;
    lapLogic();
  }

  // test harness (?debug): the car's physics and the circuit
  expose('track', { car, keys, inp, sub, placeAt, locateNear, P, n, WALL, setup, wallOffsets, buildTrack, RaceSound, loadRecording, REC });
  /* ---------- laps ---------- */
  let clock = 0, lapStart = null, prevI = n - 14, cp1 = false, cp2 = false, best = null, bump = 0;
  const laps = [];
  function lapLogic() {
    const i = loc.i;
    if (Math.abs(i - Math.round(n / 3)) < 40) cp1 = true;
    if (cp1 && Math.abs(i - Math.round((2 * n) / 3)) < 40) cp2 = true;
    if (prevI > n - 60 && i < 60) {
      if (lapStart !== null) { if (cp1 && cp2) lapDone(clock - lapStart); else flash('Lap not counted: a sector was missed'); }
      lapStart = clock; cp1 = cp2 = false;
    } else if (prevI < 60 && i > n - 60) { cp1 = cp2 = false; lapStart = null; }
    prevI = i;
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  function lapDone(t) {
    laps.push(t);
    const pb = best === null || t < best;
    best = best === null ? t : Math.min(best, t);
    flash(`Lap ${laps.length}: ${fmt(t)}${pb && laps.length > 1 ? ' · best yet' : ''}`);
    renderLaps();
  }
  function renderLaps() {
    const { fc, next, sd } = holtForecast(laps);
    tbody.innerHTML = '';
    for (let i = laps.length - 1; i >= Math.max(0, laps.length - 8); i--) {
      const tr = document.createElement('tr');
      if (i === laps.length - 1) tr.className = 'is-new';
      const err = fc[i] !== undefined ? laps[i] - fc[i] : null;
      [String(i + 1), fmt(laps[i]), fc[i] !== undefined ? fmt(fc[i]) : '–', err !== null ? `${err >= 0 ? '+' : '−'}${Math.abs(err).toFixed(2)}` : '–']
        .forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    }
    forecastEl.innerHTML = next === null ? 'Next lap forecast: <b>one more lap needed</b>' : `Next lap forecast: <b>${fmt(next)}</b>${sd ? ` ± ${(1.96 * sd).toFixed(2)} s` : ''}`;
  }

  /* ---------- overlays ---------- */
  const msgEl = document.createElement('div'); msgEl.className = 'track-msg'; msgEl.setAttribute('role', 'status'); stage.appendChild(msgEl);
  let msgT = 0;
  function flash(text) { msgEl.textContent = text; msgEl.classList.add('is-on'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('is-on'), 2200); }
  const map = document.createElement('canvas'); map.className = 'track-map'; map.setAttribute('aria-hidden', 'true'); stage.appendChild(map);
  const mctx = map.getContext('2d');
  const MW = 150, MH = Math.round(MW * (maxZ - minZ + 40) / (maxX - minX + 40)), mdpr = Math.min(2, window.devicePixelRatio || 1);
  map.width = MW * mdpr; map.height = MH * mdpr;
  const mx = (x) => ((x - minX + 20) / (maxX - minX + 40)) * MW, mz = (z) => ((z - minZ + 20) / (maxZ - minZ + 40)) * MH;
  const mapBase = document.createElement('canvas'); mapBase.width = map.width; mapBase.height = map.height;
  {
    const g = mapBase.getContext('2d'); g.scale(mdpr, mdpr);
    g.fillStyle = '#F2F2EE'; g.fillRect(0, 0, MW, MH); g.lineJoin = 'round';
    g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(mx(p.x), mz(p.z)) : g.moveTo(mx(p.x), mz(p.z)))); g.closePath();
    g.strokeStyle = '#111'; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#F2F2EE'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); for (let i = T.tunnel[0]; i <= T.tunnel[1]; i++) g[i === T.tunnel[0] ? 'moveTo' : 'lineTo'](mx(P[i].x), mz(P[i].z)); g.stroke();
    const p = P[0]; g.lineWidth = 2.2; g.beginPath(); g.moveTo(mx(p.x + p.rx * 8), mz(p.z + p.rz * 8)); g.lineTo(mx(p.x - p.rx * 8), mz(p.z - p.rz * 8)); g.stroke();
  }
  function drawMap() {
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.drawImage(mapBase, 0, 0); mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
    mctx.save(); mctx.translate(mx(car.x), mz(car.z)); mctx.rotate(car.psi);
    mctx.fillStyle = '#E3B505'; mctx.strokeStyle = '#111'; mctx.lineWidth = 1.4;
    mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-2, 0); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
  }
  // speed, gear and shift lights
  speedEl.innerHTML = '<span class="gear" id="trk-gear">1</span><span class="shift-keys" aria-hidden="true"><b>P</b> up<br><b>I</b> down</span><span class="spd"><b id="trk-spd">0</b>km/h</span><span class="revs" aria-hidden="true"><i id="trk-revs"></i></span><span class="slide" id="trk-slide">slide 0°</span>';
  const gearEl = $('trk-gear'), spdEl = $('trk-spd'), revEl = $('trk-revs'), slideEl = $('trk-slide');

  /* ---------- camera ---------- */
  let camMode = 'chase', camYaw = 0, snapCam = true, driven = false, focused = false, orbitT = 0, shake = 0;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tv = new THREE.Vector3();
  function updateCamera(dt) {
    const c = Math.cos(car.psi), s = Math.sin(car.psi);
    const fwdX = body.position.x + 0.95;
    if (camMode === 'esp32' || camMode === 'cockpit') {
      const esp = camMode === 'esp32', fov = esp ? 92 : 80;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const j = esp ? Math.min(0.05, Math.abs(car.vx) * 0.0015) + shake * 0.02 : shake * 0.01;
      const h = esp ? 1.56 : 1.02, fx = car.x + c * (esp ? fwdX : 0.35), fz = car.z + s * (esp ? fwdX : 0.35);
      camera.position.set(fx + (Math.random() - 0.5) * j, h + (Math.random() - 0.5) * j, fz);
      camera.lookAt(car.x + c * 16, h - 0.5 + (Math.random() - 0.5) * j * 4, car.z + s * 16);
      return;
    }
    if (!driven && !reduced) {
      orbitT += dt * 0.16; const a = orbitT + 2.2;
      camera.position.set(car.x + Math.cos(a) * 13, 5.2, car.z + Math.sin(a) * 13); camera.lookAt(car.x, 0.8, car.z);
      if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
      camYaw = car.psi; snapCam = true; return;
    }
    const wx = car.vx * c - car.vy * s, wz = car.vx * s + car.vy * c, sp = Math.hypot(wx, wz);
    const velYaw = car.vx > 2 ? Math.atan2(wz, wx) : car.psi, tgt = car.psi + angDiff(velYaw, car.psi) * 0.55;
    camYaw = snapCam ? tgt : camYaw + angDiff(tgt, camYaw) * (1 - Math.exp(-3.5 * dt));
    const dist = 6.4 + Math.min(4, sp * 0.06), hgt = 2.5 + Math.min(1, sp * 0.02);
    tv.set(car.x - Math.cos(camYaw) * dist, hgt, car.z - Math.sin(camYaw) * dist);
    if (snapCam) camPos.copy(tv); else camPos.lerp(tv, 1 - Math.exp(-8 * dt));
    snapCam = false;
    camera.position.copy(camPos); camera.position.y += (Math.random() - 0.5) * shake * 0.12;
    look.set(car.x + Math.cos(camYaw) * 3, 0.7, car.z + Math.sin(camYaw) * 3); camera.lookAt(look);
    const fov = 56 + Math.min(18, sp * 0.22);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function setCam(mode) {
    camMode = mode;
    const low = mode === 'esp32';
    stage.classList.toggle('is-fpv', low); canvas.classList.toggle('is-fpv', low);
    pr = low ? 0.34 : DPR; renderer.setPixelRatio(pr);
    fillMats.forEach((m) => { m.uniforms.uDot.value = low ? 2.2 : 4.2 * pr; });
    resize();
    fig.querySelectorAll('[data-cam]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cam === mode)));
    snapCam = true;
    if (low) flash('ESP32-CAM view: low-res and a little laggy, like the real stream');
    else if (mode === 'cockpit') flash('Cockpit view: a clear camera at driver height');
    dirty = true;
  }

  /* ---------- render ---------- */
  const snd = new RaceSound();
  let soundOn = true, lastHud = '', skidAcc = 0, fpvAcc = 1, time = 0, lastGear = 1, lastSpd = -1;

  /* ---------- F1 start: five red lights, one a second, a random hold, then lights out ---------- */
  const startEl = document.createElement('div');
  startEl.className = 'f1-start'; startEl.hidden = true;
  startEl.innerHTML = `<div class="f1-gantry" aria-hidden="true">${'<span class="f1-pod"><i></i><i></i></span>'.repeat(5)}</div><p class="f1-msg" aria-live="polite"></p>`;
  stage.appendChild(startEl);
  const pods = [...startEl.querySelectorAll('.f1-pod')], startMsg = startEl.querySelector('.f1-msg');
  const race = { phase: 'none', t: 0, lit: 0, hold: 0, outAt: 0, thrAtOut: false, reacted: false, gx: 0, gz: 0, started: false };
  function gridStart() {
    placeAt(n - 14); race.gx = car.x; race.gz = car.z;
    Object.assign(race, { phase: 'lights', t: 0, lit: 0, hold: 0.3 + Math.random() * 2.6, reacted: false });
    lapStart = null; cp1 = cp2 = false; prevI = loc.i; // the lap clock starts when you cross the line
    pods.forEach((p) => p.classList.remove('is-on'));
    startEl.hidden = false; startEl.classList.remove('is-out');
    startMsg.textContent = 'On the grid · rev it up, go on lights out';
  }
  function stepRace(dt) {
    if (race.phase === 'lights') {
      race.t += dt;
      const want = clamp(Math.floor((race.t - 0.6) / 1.0) + 1, 0, 5);
      if (want > race.lit) { race.lit = want; pods[want - 1].classList.add('is-on'); if (soundOn) snd.beep(); }
      if (race.lit === 5 && race.t >= 0.6 + 4 + race.hold) {
        race.phase = 'go'; race.outAt = time; race.thrAtOut = keys.up; race.started = true;
        pods.forEach((p) => p.classList.remove('is-on')); startEl.classList.add('is-out');
        startMsg.textContent = 'Lights out and away you go';
      }
    } else if (race.phase === 'go') {
      const since = time - race.outAt;
      if (!race.reacted && race.thrAtOut) { race.reacted = true; startMsg.textContent = 'Lights out · launched on the revs'; }
      else if (!race.reacted && keys.up) { race.reacted = true; startMsg.textContent = `Lights out · reaction ${since.toFixed(3)} s`; }
      if (since > 2.8) { race.phase = 'none'; startEl.hidden = true; }
    }
  }
  function sync(dt) {
    carG.position.set(car.x, 0, car.z); carG.rotation.y = -car.psi;
    const b = setup.wf * L, a = L - b;
    body.position.x = a - 0.95;
    body.rotation.x = clamp(-car.ay * 0.003, -0.08, 0.08); body.rotation.z = clamp(car.ax * 0.002, -0.05, 0.05);
    car.spin -= (car.vx / WR) * dt;
    for (const w of wheels) { w.spin.rotation.z = car.spin; if (w.front) w.pivot.rotation.y = -car.delta; }
    for (const y of yachts) { y.g.position.y = -0.1 + Math.sin(time * 0.8 + y.ph) * 0.12; y.g.rotation.z = Math.sin(time * 0.6 + y.ph) * 0.02; }
    groundMat.uniforms.uTime.value = time;
  }
  function hud() {
    const cur = lapStart !== null ? clock - lapStart : 0, lapN = laps.length + (lapStart !== null ? 1 : 0);
    const text = `Lap ${lapN} · ${fmt(cur)} · Best ${best !== null ? fmt(best) : '-:--.--'}`;
    if (text !== lastHud) { hudEl.textContent = text; lastHud = text; }
    const kmh = Math.round(Math.abs(car.vx) * 3.6);
    if (kmh !== lastSpd) { spdEl.textContent = kmh; lastSpd = kmh; }
    const g = car.vx < -0.5 ? 'R' : String(car.gear) + (setup.manual ? '' : '');
    if (g !== lastGear) { gearEl.textContent = g; lastGear = g; }
    const rf = clamp((car.rpm - 4000) / 14000, 0, 1);
    revEl.style.width = `${(rf * 100).toFixed(1)}%`;
    revEl.classList.toggle('is-shift', car.rpm > 16800);
    const beta = car.vx > 3 ? Math.round(Math.abs(Math.atan2(car.vy, car.vx)) * 57.3) : 0;
    slideEl.textContent = `slide ${beta}°`; slideEl.classList.toggle('is-on', beta > 12);
  }

  let visible = false, raf = 0, last = 0, acc = 0, dirty = true;
  const SUB = 1 / 120;
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
    last = now; time += dt;
    if (focused) {
      stepRace(dt);
      acc += dt; let steps = 0;
      while (acc >= SUB && steps < 10) { sub(SUB); acc -= SUB; steps++; }
      if (steps === 10) acc = 0;
      skidAcc += dt;
      if (skidAcc > 0.03) {
        skidAcc = 0;
        if (car.slip > 0.16 || (keys.down && car.vx > 10) || (keys.hand && car.vx > 3)) {
          const c = Math.cos(car.psi), s = Math.sin(car.psi), bx = car.x - c * (setup.wf * L), bz = car.z - s * (setup.wf * L);
          for (const side of [-0.72, 0.72]) addSkid(bx - s * side, bz + c * side, car.psi);
        }
      }
      if (shiftEvent) { if (soundOn && engineLive) (shiftEvent > 0 ? snd.upshift() : snd.downshift()); shiftEvent = 0; }
      if (bump > 0) { if (soundOn && engineLive) snd.thump(bump); shake = Math.min(1, bump / 10); bump = 0; }
      shake *= Math.exp(-6 * dt);
      if (soundOn && !engineLive && (keys.up || keys.down || Math.abs(car.vx) > 0.5)) { engineLive = true; snd.start(); }
      if (soundOn && engineLive) snd.update(car.rpm, car.cutT > 0 ? 0 : inp.thr, car.slip, surface === 'kerb' ? 0.08 : surface === 'runoff' ? 0.03 * clamp(car.vx / 10, 0, 1) : 0, car.cutT > 0 || car.rpm > 18100);
      if (loc.d > 30) { placeAt(loc.i); flash('Back on the circuit'); }
    }
    if (focused || (!driven && !reduced) || dirty) {
      sync(dt); updateCamera(dt);
      fpvAcc += dt;
      if (camMode !== 'esp32' || fpvAcc > 1 / 14 || dirty) { renderer.render(scene, camera); fpvAcc = 0; }
      drawMap(); hud(); dirty = false;
    }
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  whileVisible(canvas, (v) => {
    visible = v;
    if (v && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!v) { snd.stop(); release(); }
  });
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(w, h)); dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);

  /* ---------- input ---------- */
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hand' };
  const take = () => canvas.focus({ preventScroll: true });
  canvas.addEventListener('pointerdown', take);
  ctaEl.addEventListener('click', take);
  // The engine stays silent when you click into the game; it fires up on your first throttle or brake.
  let engineLive = false;
  const engage = () => {
    if (focused) return;
    focused = true; driven = true; wrapEl.classList.add('is-driving');
    last = performance.now();
    if (!race.started && race.phase === 'none') gridStart(); // the first drive starts from the grid
  };
  const release = () => {
    if (!focused) return;
    focused = false; wrapEl.classList.remove('is-driving');
    Object.keys(keys).forEach((k) => { keys[k] = false; }); inp.thr = inp.brk = 0;
    snd.stop(); engineLive = false;
    if (race.phase === 'lights') { race.phase = 'none'; startEl.hidden = true; } // let go mid-countdown: it starts again next time
    ctaMain.textContent = coarse ? 'Tap to keep driving' : 'Click to keep driving';
  };
  canvas.addEventListener('focus', engage);
  canvas.addEventListener('blur', release);
  const setManual = (on) => { setup.manual = on; syncControls(); };
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { canvas.blur(); release(); return; }
    engage();
    if (ev.code === 'KeyR') { placeAt(loc.i); return; }
    if (ev.code === 'KeyG' && !ev.repeat) { gridStart(); return; }
    if (ev.code === 'KeyC' && !ev.repeat) { const order = ['chase', 'cockpit', 'esp32']; setCam(order[(order.indexOf(camMode) + 1) % order.length]); return; }
    // manual shifting like F1 paddles: P (right hand) shifts up, I (left of it) shifts down
    if ((ev.code === 'KeyP' || ev.code === 'KeyI') && !ev.repeat) { if (!setup.manual) setManual(true); shift(ev.code === 'KeyP' ? 1 : -1); return; }
    const k = KEYMAP[ev.code];
    if (k) { keys[k] = true; ev.preventDefault(); }
  });
  canvas.addEventListener('keyup', (ev) => { const k = KEYMAP[ev.code]; if (k) { keys[k] = false; ev.preventDefault(); } });
  pads?.querySelectorAll('button').forEach((b) => {
    const k = b.dataset.key;
    const on = (ev) => { ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ } keys[k] = true; b.classList.add('is-down'); if (!focused) take(); };
    const off = () => { keys[k] = false; b.classList.remove('is-down'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  });

  const keepWheel = (elx) => elx.addEventListener('mousedown', (ev) => { if (focused) ev.preventDefault(); });
  const radio = (attr, fn) => fig.querySelectorAll(`[data-${attr}]`).forEach((b) => {
    keepWheel(b);
    b.addEventListener('click', () => { fig.querySelectorAll(`[data-${attr}]`).forEach((o) => o.setAttribute('aria-checked', String(o === b))); fn(b.dataset[attr]); });
  });
  radio('cam', (v) => { if (v !== camMode) setCam(v); });
  radio('preset', (v) => { if (PRESETS[v]) Object.assign(setup, PRESETS[v]); setup.preset = v; syncControls(); describe(); dirty = true; });
  radio('wing', (v) => { setup.wing = v === 'on'; setup.preset = 'custom'; syncControls(); describe(); dirty = true; });
  radio('gearbox', (v) => setManual(v === 'manual'));
  radio('tsound', (v) => { soundOn = v === 'on'; if (!soundOn) { snd.stop(); engineLive = false; } });
  radio('engine', (v) => snd.setEngine(v));
  let wasDriving = 0;
  for (const [inEl, fn] of [[weightIn, (v) => { setup.wf = v / 100; }], [gripIn, (v) => { setup.grip = v / 100; }]]) {
    inEl.addEventListener('pointerdown', () => { wasDriving = focused ? performance.now() : 0; });
    inEl.addEventListener('input', () => { fn(+inEl.value); setup.preset = 'custom'; syncControls(); describe(); dirty = true; });
    inEl.addEventListener('change', () => { if (wasDriving && performance.now() - wasDriving < 15000) take(); wasDriving = 0; });
  }

  placeAt(n - 14);
  syncControls(); describe(); resize();
}
