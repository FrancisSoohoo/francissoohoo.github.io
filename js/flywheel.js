// Fig. 002: flywheel in 3D. An assumed steel flywheel (Ø160) with a base plate, a rim wall carrying
// the ring gear, and a hub that bolts to the crank. Stress = rotating annular disc (plane stress)
// + the rim's centrifugal pull carried by the plate (Lamé edge load) + Kirsch-style concentration at
// each pocket, evaluated per pixel on the 3D surface. Illustrative, not the team's FEA.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { fitCanvas, whileVisible, clamp, roll, INK, PAPER, reduced, expose } from './util.js';
import { EngineSound, burstSound } from './sound.js';

// assumed burst limit for the model's steel: past this peak von Mises the part lets go (illustrative)
const LIMIT = 350e6;
const RHO = 7850, NU = 0.3, E = 210e9;
const R = 0.080, A = 0.015, HUB_R = 0.026, HUB_T = 0.020;
const W0 = 0.008, H_RIM = 0.022, PITCH = 0.049, KAPPA = 0.6;
const SCALE = 240e6, RPM_MAX = 13000, RPM_LIMIT = 12500, RPM_RATED = 12000;
const K1 = (3 + NU) / 8, K2 = (1 + 3 * NU) / (3 + NU);
const DEFORM = 400, CM = 100; // scene units are centimetres

const w2Of = (rpm) => RHO * (rpm * Math.PI / 30) ** 2;

function geometry(s) {
  const t = s.tMM / 1000, skim = s.skimMM / 1000, w = W0 - skim, Ri = R - w;
  let rp = 0;
  if (s.n) {
    const rpMin = 0.003;
    const rpMax = Math.min(PITCH - HUB_R - 0.003, Ri - PITCH - 0.003, PITCH * Math.sin(Math.PI / s.n) - 0.002);
    rp = rpMin + (s.pocket / 100) * Math.max(0, rpMax - rpMin);
  }
  return { n: s.n, rp, t, w, Ri, skim };
}
function massProps(g) {
  const web = Math.PI * (g.Ri ** 2 - HUB_R ** 2) * g.t - g.n * Math.PI * g.rp ** 2 * g.t;
  const hub = Math.PI * (HUB_R ** 2 - A ** 2) * HUB_T;
  const rim = Math.PI * (R ** 2 - g.Ri ** 2) * H_RIM;
  const I = 0.5 * Math.PI * g.t * (g.Ri ** 4 - HUB_R ** 4) - g.n * Math.PI * g.rp ** 2 * g.t * (g.rp ** 2 / 2 + PITCH ** 2)
    + 0.5 * Math.PI * HUB_T * (HUB_R ** 4 - A ** 4) + 0.5 * Math.PI * H_RIM * (R ** 4 - g.Ri ** 4);
  return { m: RHO * (web + hub + rim), I: RHO * I };
}
const STOCK = massProps({ n: 0, rp: 0, t: 0.008, w: W0, Ri: R - W0 });

function axi(r, g, w2) {
  if (r >= g.Ri) return { st: w2 * r * r * (1 - 0.5 * KAPPA), sr: 0 };
  const b = g.Ri, a = A;
  let st = K1 * w2 * (b * b + a * a + (a * a * b * b) / (r * r) - K2 * r * r);
  let sr = K1 * w2 * (b * b + a * a - (a * a * b * b) / (r * r) - r * r);
  const q = (KAPPA * w2 * ((g.Ri + R) / 2) * g.w * H_RIM) / g.t;
  const kq = (q * b * b) / (b * b - a * a), thin = r < HUB_R ? g.t / HUB_T : 1;
  st += kq * (1 + (a * a) / (r * r)) * thin; sr += kq * (1 - (a * a) / (r * r)) * thin;
  return { st, sr };
}
function vmAt(x, y, g, w2) {
  const r = Math.hypot(x, y);
  if (r < A || r > R) return -1;
  const { st: st0, sr } = axi(r, g, w2);
  let st = st0;
  if (g.n && r < g.Ri) {
    let conc = 0;
    for (let k = 0; k < g.n; k++) {
      const ang = (k / g.n) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const dx = x - c * PITCH, dy = y - s * PITCH, d = Math.hypot(dx, dy);
      if (d < g.rp) return -1;
      const cs = (dx * -s + dy * c) / d;
      conc += (g.rp / d) ** 2 * (2 - 2 * cs * cs);
    }
    const f = (g.n * g.rp) / (Math.PI * PITCH), wgt = Math.exp(-(((r - PITCH) / (g.rp * 1.4 + 0.004)) ** 2));
    st *= (1 + conc) / (1 - f * wgt);
  }
  return Math.sqrt(st * st - st * sr + sr * sr);
}
function peak(g, w2) {
  let best = 0;
  const sector = g.n ? (Math.PI * 2) / g.n : Math.PI / 3;
  for (let i = 0; i <= 50; i++) {
    const r = A + (i / 50) * (R - A) * 0.999 + 1e-5;
    for (let j = 0; j < 24; j++) { const th = (j / 24) * sector; best = Math.max(best, vmAt(Math.cos(th) * r, Math.sin(th) * r, g, w2)); }
  }
  if (g.n) for (let j = 0; j < 36; j++) { const ps = (j / 36) * Math.PI * 2; best = Math.max(best, vmAt(PITCH + Math.cos(ps) * g.rp * 1.002, Math.sin(ps) * g.rp * 1.002, g, w2)); }
  return best;
}
const STOPS = [[0, 30, 60, 200], [0.25, 0, 170, 255], [0.5, 40, 200, 80], [0.75, 255, 215, 0], [1, 225, 25, 25]];
function band(v) {
  const t = Math.min(11, Math.max(0, Math.floor(v * 12))) / 11;
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const [t0, r0, g0, b0] = STOPS[i - 1], [t1, r1, g1, b1] = STOPS[i], u = (t - t0) / (t1 - t0);
    return [r0 + (r1 - r0) * u, g0 + (g1 - g0) * u, b0 + (b1 - b0) * u];
  }
  return [225, 25, 25];
}
const BANDS = Array.from({ length: 12 }, (_, b) => band((b + 0.5) / 12));

/* ---------- shaders: drawing (halftone) and FEA contour, both from the same stress model ---------- */
const VS = /* glsl */`
  varying vec3 vN; varying vec3 vLocal;
  void main() {
    vLocal = position;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FS = /* glsl */`
  precision highp float;
  uniform float uW2; uniform float uRi; uniform float uT; uniform float uRp; uniform float uN; uniform float uWall;
  uniform int uMode; uniform float uDot; uniform vec3 uLight; uniform vec3 uInk; uniform vec3 uBase;
  varying vec3 vN; varying vec3 vLocal;
  const float NU = 0.3; const float A = 0.015; const float R = 0.08; const float HUB_R = 0.026; const float HUB_T = 0.02;
  const float H_RIM = 0.022; const float PITCH = 0.049; const float KAPPA = 0.6; const float SCALE = 240.0;
  vec2 axi(float r) {
    if (r >= uRi) return vec2(uW2 * r * r * (1.0 - 0.5 * KAPPA), 0.0);
    float K1 = (3.0 + NU) / 8.0; float K2 = (1.0 + 3.0 * NU) / (3.0 + NU);
    float b = uRi; float a = A;
    float st = K1 * uW2 * (b*b + a*a + a*a*b*b/(r*r) - K2*r*r);
    float sr = K1 * uW2 * (b*b + a*a - a*a*b*b/(r*r) - r*r);
    float q = KAPPA * uW2 * ((uRi + R) * 0.5) * uWall * H_RIM / uT;
    float kq = q * b*b / (b*b - a*a);
    float thin = r < HUB_R ? uT / HUB_T : 1.0;
    st += kq * (1.0 + a*a/(r*r)) * thin; sr += kq * (1.0 - a*a/(r*r)) * thin;
    return vec2(st, sr);
  }
  float vm(vec2 p) {
    float r = max(length(p), A);
    vec2 s = axi(r); float st = s.x; float sr = s.y;
    if (uN > 0.5 && r < uRi) {
      float conc = 0.0;
      for (int k = 0; k < 8; k++) {
        if (float(k) >= uN) break;
        float ang = 6.2831853 * float(k) / uN;
        vec2 c = vec2(cos(ang), sin(ang));
        vec2 d = p - c * PITCH;
        float dl = max(length(d), uRp);
        float cs = dot(d, vec2(-c.y, c.x)) / max(length(d), 1e-6);
        conc += (uRp / dl) * (uRp / dl) * (2.0 - 2.0 * cs * cs);
      }
      float f = uN * uRp / (3.14159265 * PITCH);
      float x = (r - PITCH) / (uRp * 1.4 + 0.004);
      st *= (1.0 + conc) / (1.0 - f * exp(-x * x));
    }
    return sqrt(max(st*st - st*sr + sr*sr, 0.0));
  }
  vec3 bandColor(float v) {
    float t = clamp(floor(v * 12.0), 0.0, 11.0) / 11.0;
    vec3 c0 = vec3(30.0, 60.0, 200.0) / 255.0; vec3 c1 = vec3(0.0, 170.0, 255.0) / 255.0; vec3 c2 = vec3(40.0, 200.0, 80.0) / 255.0;
    vec3 c3 = vec3(255.0, 215.0, 0.0) / 255.0; vec3 c4 = vec3(225.0, 25.0, 25.0) / 255.0;
    vec3 col = t < 0.25 ? mix(c0, c1, t / 0.25) : t < 0.5 ? mix(c1, c2, (t - 0.25) / 0.25) : t < 0.75 ? mix(c2, c3, (t - 0.5) / 0.25) : mix(c3, c4, (t - 0.75) / 0.25);
    return pow(col, vec3(2.2));
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float l = clamp(dot(n, uLight), 0.0, 1.0);
    if (uMode == 1) {
      float v = vm(vLocal.xy * 0.01) / SCALE;
      gl_FragColor = vec4(bandColor(v) * (0.72 + 0.28 * l), 1.0);
    } else {
      float tone = clamp((1.0 - (0.45 + 0.55 * l)) * 1.25, 0.0, 1.0);
      vec2 p = gl_FragCoord.xy / uDot;
      vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
      vec2 f = fract(q) - 0.5;
      float rr = sqrt(tone) * 0.6;
      float m = 1.0 - smoothstep(rr - 0.07, rr + 0.07, length(f));
      gl_FragColor = vec4(mix(uBase, uInk, m * step(0.02, tone)), 1.0);
    }
    #include <colorspace_fragment>
  }`;

export function initFlywheel() {
  const $ = (id) => document.getElementById(id);
  const stage = $('fw-stage'), canvas = $('flywheel-canvas'), secCanvas = $('flywheel-section');
  const sctx = secCanvas.getContext('2d');
  const pocketSeg = [...document.querySelectorAll('#flywheel-fig .seg [data-n]')];
  const viewSeg = [...document.querySelectorAll('#flywheel-fig .seg [data-view]')];
  const pocketIn = $('pocket-size'), plateIn = $('plate-t'), skimIn = $('wall-skim');
  const revBtn = $('fw-rev'), stopBtn = $('fw-stop'), forcesBtn = $('fw-forces'), deformBtn = $('fw-deform');
  const tachEl = $('fw-tach'), keyEl = $('fw-key'), legendEl = $('fw-legend'), hint = $('fw-hint');

  const s = { n: 6, pocket: +pocketIn.value, tMM: +plateIn.value / 10, skimMM: +skimIn.value / 10, rpm: 0, view: 'halftone', forces: false, deform: false };

  /* ---------- three ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  camera.position.set(0, 0, 80); camera.lookAt(0, 0, 0);
  const pivot = new THREE.Group(); scene.add(pivot);
  const spinner = new THREE.Group(); pivot.add(spinner);

  const lightDir = new THREE.Vector3(-0.45, 0.7, 0.55).normalize();
  const uniforms = {
    uW2: { value: 0 }, uRi: { value: R - W0 }, uT: { value: 0.008 }, uRp: { value: 0.01 }, uN: { value: 6 }, uWall: { value: W0 },
    uMode: { value: 0 }, uDot: { value: 4.4 * dpr }, uLight: { value: lightDir },
    uInk: { value: new THREE.Color(INK) }, uBase: { value: new THREE.Color(PAPER) },
  };
  const solidMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2 });
  const lineMat = new LineMaterial({ color: 0x111111, linewidth: 1.4 });
  const dashMat = new LineMaterial({ color: 0x111111, linewidth: 1.6, dashed: true, dashSize: 0.35, gapSize: 0.22 });
  const lineMats = [lineMat, dashMat];

  const circlePath = (r, cx = 0, cy = 0) => { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); return p; };
  const edges = (geo, mat = lineMat, thr = 30) => new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, thr)), mat);
  const part = new THREE.Group(); spinner.add(part);

  function buildPart() {
    part.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    part.clear();
    const g = geometry(s);
    const Rc = R * CM, Ric = g.Ri * CM, tc = g.t * CM, Hc = H_RIM * CM;
    const rim = new THREE.Shape();
    const T = 72, RT = Rc - 0.3;
    for (let i = 0; i < T; i++) {
      const a0 = (i / T) * Math.PI * 2, a1 = ((i + 0.5) / T) * Math.PI * 2, a2 = ((i + 1) / T) * Math.PI * 2;
      const pt = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
      const p0 = pt(Rc, a0), p1 = pt(Rc, a1), p2 = pt(RT, a1), p3 = pt(RT, a2);
      if (i === 0) rim.moveTo(...p0); else rim.lineTo(...p0);
      rim.lineTo(...p1); rim.lineTo(...p2); rim.lineTo(...p3);
    }
    rim.closePath();
    rim.holes.push(circlePath(Ric));
    const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: Hc, bevelEnabled: false, curveSegments: 48 });
    rimGeo.translate(0, 0, -Hc / 2);
    const web = new THREE.Shape(); web.absarc(0, 0, Ric + 0.02, 0, Math.PI * 2, false);
    web.holes.push(circlePath(HUB_R * CM - 0.02));
    for (let k = 0; k < g.n; k++) { const a = (k / g.n) * Math.PI * 2; web.holes.push(circlePath(g.rp * CM, Math.cos(a) * PITCH * CM, Math.sin(a) * PITCH * CM)); }
    const webGeo = new THREE.ExtrudeGeometry(web, { depth: tc, bevelEnabled: false, curveSegments: 40 });
    webGeo.translate(0, 0, -tc / 2);
    const hub = new THREE.Shape(); hub.absarc(0, 0, HUB_R * CM, 0, Math.PI * 2, false);
    hub.holes.push(circlePath(A * CM));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; hub.holes.push(circlePath(0.22, Math.cos(a) * 2.05, Math.sin(a) * 2.05)); }
    const hubGeo = new THREE.ExtrudeGeometry(hub, { depth: HUB_T * CM, bevelEnabled: false, curveSegments: 32 });
    hubGeo.translate(0, 0, -HUB_T * CM / 2);
    [rimGeo, webGeo, hubGeo].forEach((geo) => {
      const hubPiece = geo === hubGeo, m = new THREE.Mesh(geo, solidMat), e = edges(geo);
      m.userData.hub = e.userData.hub = hubPiece;
      part.add(m, e);
    });
    showWhole(!broken);
    uniforms.uRi.value = g.Ri; uniforms.uT.value = g.t; uniforms.uRp.value = g.rp || 0.001; uniforms.uN.value = g.n; uniforms.uWall.value = g.w;
    buildGhost(g);
    buildArrows(g);
  }

  /* ---------- deformed outline ---------- */
  const ghost = new THREE.Group(); spinner.add(ghost);
  let ghostRings = [];
  function ring(r, z) {
    const pts = [];
    for (let i = 0; i < 64; i++) { const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2; pts.push(Math.cos(a0) * r, Math.sin(a0) * r, z, Math.cos(a1) * r, Math.sin(a1) * r, z); }
    const geo = new LineSegmentsGeometry(); geo.setPositions(pts);
    const l = new LineSegments2(geo, dashMat); l.computeLineDistances();
    return l;
  }
  function buildGhost(g) {
    ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    ghost.clear(); ghostRings = [];
    const Hc = H_RIM * CM;
    [[R, Hc / 2 + 0.05], [R, -Hc / 2 - 0.05], [A, HUB_T * CM / 2 + 0.05]].forEach(([r, z]) => { const l = ring(r * CM, z); ghost.add(l); ghostRings.push({ l, r, kind: 'circle' }); });
    for (let k = 0; k < g.n; k++) {
      const a = (k / g.n) * Math.PI * 2, l = ring(g.rp * CM, g.t * CM / 2 + 0.05);
      ghost.add(l); ghostRings.push({ l, r: PITCH, a, kind: 'pocket' });
    }
  }
  function updateGhost(g, w2) {
    ghost.visible = s.deform && s.rpm > 50;
    if (!ghost.visible) return;
    const u = (r) => { const { st, sr } = axi(r, g, w2); return (r / E) * (st - NU * sr); };
    ghostRings.forEach((gr) => {
      if (gr.kind === 'circle') { const k = (gr.r + u(gr.r * (gr.r > g.Ri ? 0.999 : 1.001)) * DEFORM) / gr.r; gr.l.scale.set(k, k, 1); }
      else { const rr = (gr.r + u(gr.r) * DEFORM) * CM, k = 1 + (u(gr.r) / gr.r) * DEFORM; gr.l.position.set(Math.cos(gr.a) * rr, Math.sin(gr.a) * rr, 0); gr.l.scale.set(k, k, 1); }
    });
  }

  /* ---------- force arrows ---------- */
  const arrows = new THREE.Group(); spinner.add(arrows);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const arrowMatT = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45 });
  const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8); shaftGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(0.2, 0.5, 12); headGeo.translate(0, 0.25, 0);
  let arrowList = [];
  function makeArrow(mat) {
    const grp = new THREE.Group();
    const sh = new THREE.Mesh(shaftGeo, mat), hd = new THREE.Mesh(headGeo, mat);
    grp.add(sh, hd); grp.userData = { sh, hd }; return grp;
  }
  function setArrow(a, len) {
    a.visible = len > 0.15;
    if (!a.visible) return;
    a.userData.sh.scale.set(1, Math.max(0.01, len - 0.45), 1);
    a.userData.hd.position.y = Math.max(0, len - 0.5);
  }
  function buildArrows(g) {
    arrows.clear(); arrowList = [];
    const z = g.t * CM / 2 + 0.1;
    [0.034, 0.06, R - g.w / 2].forEach((r) => {
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * Math.PI * 2 + Math.PI / 12;
        const x = Math.cos(th) * r, y = Math.sin(th) * r;
        if (vmAt(x, y, g, 1) < 0) continue;
        const zz = r > g.Ri ? H_RIM * CM / 2 + 0.1 : z;
        const rad = makeArrow(arrowMat); rad.position.set(x * CM, y * CM, zz); rad.rotation.z = th - Math.PI / 2;
        const tan = makeArrow(arrowMatT); tan.position.set(x * CM, y * CM, zz + 0.02); tan.rotation.z = th;
        arrows.add(rad, tan); arrowList.push({ r, th, rad, tan });
      }
    });
  }
  function updateArrows(w2, alpha) {
    arrows.visible = s.forces && s.rpm > 50;
    if (!arrows.visible) return;
    const w2max = w2Of(RPM_MAX);
    arrowList.forEach(({ r, th, rad, tan }) => {
      setArrow(rad, 2.6 * (w2 * r) / (w2max * R));
      setArrow(tan, 2.0 * (r * Math.abs(alpha)) / (R * 1400));
      tan.rotation.z = th + (alpha >= 0 ? -Math.PI : 0); // inertia resists the change of speed
    });
  }

  /* ---------- burst: the plate cracks through the pockets, the rim and web fly off, the hub stays ---------- */
  let broken = false, burstAt = 0, burstT = 0, shardList = [];
  const shards = new THREE.Group(); pivot.add(shards);
  function showWhole(on) { part.children.forEach((o) => { o.visible = on || o.userData.hub; }); }
  function buildShards(g) {
    shards.traverse((o) => { if (o.geometry && o.geometry !== shaftGeo) o.geometry.dispose(); });
    shards.clear(); shardList = [];
    shards.rotation.z = phi;
    const n = g.n || 3, off = g.n ? 0 : 0.4;
    const cuts = Array.from({ length: n }, (_, k) => off + (k / n) * Math.PI * 2 + (g.n ? 0 : (Math.random() - 0.5) * 0.6));
    const rH = HUB_R * CM, Ric = g.Ri * CM, Rc = R * CM, Pc = PITCH * CM, rp = g.rp * CM;
    const at = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    for (let k = 0; k < n; k++) {
      const a0 = cuts[k], a1 = k + 1 < n ? cuts[k + 1] : cuts[0] + Math.PI * 2;
      // web: the crack runs from the hub, round half of each pocket, out to the rim
      const web = new THREE.Shape();
      web.moveTo(...at(rH, a0));
      if (g.n) { web.lineTo(...at(Pc - rp, a0)); web.absarc(...at(Pc, a0), rp, a0 + Math.PI, a0, true); }
      web.lineTo(...at(Ric + 0.02, a0));
      web.absarc(0, 0, Ric + 0.02, a0, a1, false);
      if (g.n) { web.lineTo(...at(Pc + rp, a1)); web.absarc(...at(Pc, a1), rp, a1, a1 - Math.PI, true); }
      web.lineTo(...at(rH, a1));
      web.absarc(0, 0, rH, a1, a0, true);
      const webGeo = new THREE.ExtrudeGeometry(web, { depth: g.t * CM, bevelEnabled: false, curveSegments: 24 });
      webGeo.translate(0, 0, -g.t * CM / 2);
      const rim = new THREE.Shape();
      rim.moveTo(...at(Ric, a0)); rim.lineTo(...at(Rc, a0)); rim.absarc(0, 0, Rc, a0, a1, false);
      rim.lineTo(...at(Ric, a1)); rim.absarc(0, 0, Ric, a1, a0, true);
      const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: H_RIM * CM, bevelEnabled: false, curveSegments: 24 });
      rimGeo.translate(0, 0, -H_RIM * CM / 2);
      // outer group moves and tumbles about the piece's own centre; the inner one keeps the geometry in
      // flywheel coordinates so the stress shader still reads the right place
      const am = (a0 + a1) / 2, rc = (Ric + rH) / 2 + 1.2, c = at(rc, am);
      const outer = new THREE.Group(), inner = new THREE.Group();
      outer.position.set(c[0], c[1], 0); inner.position.set(-c[0], -c[1], 0);
      [webGeo, rimGeo].forEach((geo) => inner.add(new THREE.Mesh(geo, solidMat), edges(geo)));
      outer.add(inner); shards.add(outer);
      // pieces leave along the tangent (the way they were already going), a little outward
      const speed = (reduced ? 0.2 : 1) * (22 + 14 * (burstAt / RPM_MAX)) * (0.85 + Math.random() * 0.3);
      shardList.push({
        o: outer, x0: c[0], y0: c[1],
        vx: -Math.sin(am) * speed + Math.cos(am) * speed * 0.35, vy: Math.cos(am) * speed + Math.sin(am) * speed * 0.35,
        vz: (Math.random() - 0.5) * speed * 0.6,
        wx: (Math.random() - 0.5) * 9, wy: (Math.random() - 0.5) * 9, wz: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 5),
      });
    }
  }
  function moveShards(dt) {
    burstT += dt;
    shards.visible = broken && burstT < 3;
    if (!shards.visible) return false;
    const slow = burstT < 0.12 ? 0.15 : 1; // a beat where the cracks open before it flies
    shardList.forEach((p) => {
      p.o.position.x += p.vx * dt * slow; p.o.position.y += p.vy * dt * slow; p.o.position.z += p.vz * dt * slow;
      p.o.rotation.x += p.wx * dt * slow; p.o.rotation.y += p.wy * dt * slow; p.o.rotation.z += p.wz * dt * slow;
    });
    return true;
  }

  /* ---------- view: rotate, pan, zoom ---------- */
  const VIEW0 = { rx: -0.72, ry: 0.55, px: 0, py: 0, zoom: 1 };
  const view = { ...VIEW0 };
  let W = 1, H = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    const aspect = W / H, hh = Math.max(11, 11 / aspect);
    camera.left = -hh * aspect; camera.right = hh * aspect; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(W, H));
    sizeSection();
    kick();
  }
  let drag = null;
  stage.addEventListener('contextmenu', (ev) => ev.preventDefault());
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) return;
    drag = { x: ev.clientX, y: ev.clientY, pan: ev.button === 2 || ev.shiftKey };
    try { stage.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (drag.pan) { const k = (camera.right - camera.left) / W / view.zoom; view.px += dx * k; view.py -= dy * k; }
    else { view.ry += dx * 0.008; view.rx = clamp(view.rx + dy * 0.006, -1.5, 1.5); }
    kick();
  });
  const endDrag = () => { drag = null; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  const zoomBy = (f) => { view.zoom = clamp(view.zoom * f, 0.5, 3); kick(); };
  $('fw-zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('fw-zoom-out').addEventListener('click', () => zoomBy(0.8));
  $('fw-zoom-reset').addEventListener('click', () => { Object.assign(view, VIEW0); kick(); });
  stage.addEventListener('dblclick', () => { Object.assign(view, VIEW0); kick(); });

  /* ---------- hold to rev, exactly like the engine ---------- */
  const snd = new EngineSound();
  let pressed = false, throttle = 0, limiterT = 0, killed = false, alpha = 0, phi = 0;
  const setLabel = () => { revBtn.classList.toggle('is-running', pressed); stopBtn.disabled = s.rpm < 20 && !pressed; };
  const press = () => { if (pressed || broken) return; pressed = true; killed = false; snd.build(); setLabel(); kick(); };
  const release = () => { if (!pressed) return; pressed = false; setLabel(); kick(); };
  revBtn.addEventListener('pointerdown', (ev) => { if (ev.button > 0) return; ev.preventDefault(); try { revBtn.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } press(); });
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((e) => revBtn.addEventListener(e, release));
  revBtn.addEventListener('keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); press(); } });
  revBtn.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); release(); } });
  revBtn.addEventListener('contextmenu', (ev) => ev.preventDefault());
  stopBtn.addEventListener('click', () => { pressed = false; killed = true; throttle = 0; snd.stopNow(); setLabel(); kick(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) shutdown(); });

  let tachShown = -1;
  function setTach(v) {
    const n = Math.round(v / 10) * 10;
    if (n === tachShown) return;
    tachShown = n;
    const str = String(n).padStart(5, '0');
    [...tachEl.children].forEach((el, i) => { el.textContent = str[i]; });
    tachEl.parentElement.classList.toggle('is-high', n > 10000);
  }

  /* ---------- section A–A (2D) ---------- */
  let SW = 1, SH = 1, sdpr = 1;
  function sizeSection() { ({ w: SW, h: SH, dpr: sdpr } = fitCanvas(secCanvas)); }
  function drawSection(g, w2) {
    const ctx = sctx;
    ctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, SW, SH);
    ctx.font = '800 12px Archivo, sans-serif'; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('SECTION A–A', 12, 12);
    ctx.font = '600 11px Archivo, sans-serif'; ctx.fillStyle = '#47473F';
    ctx.fillText('Half profile, between pockets', 12, 28);
    const k = Math.max(200, Math.min((SH - 110) / (R + 0.004), (SW - 200) / H_RIM));
    const hT = HUB_T / 2, pT = g.t / 2, rH = H_RIM / 2;
    const zc = 30 + rH * k, r0 = SH - 40;
    const X = (z) => zc + z * k, Y = (r) => r0 - r * k;
    const profile = () => {
      ctx.beginPath();
      ctx.moveTo(X(-hT), Y(A)); ctx.lineTo(X(hT), Y(A)); ctx.lineTo(X(hT), Y(HUB_R)); ctx.lineTo(X(pT), Y(HUB_R)); ctx.lineTo(X(pT), Y(g.Ri));
      ctx.lineTo(X(rH), Y(g.Ri)); ctx.lineTo(X(rH), Y(R)); ctx.lineTo(X(-rH), Y(R)); ctx.lineTo(X(-rH), Y(g.Ri)); ctx.lineTo(X(-pT), Y(g.Ri));
      ctx.lineTo(X(-pT), Y(HUB_R)); ctx.lineTo(X(-hT), Y(HUB_R)); ctx.closePath();
    };
    ctx.save(); profile(); ctx.clip();
    if (s.view === 'contour') {
      const th = g.n ? Math.PI / g.n : 0.3;
      for (let py = Y(R); py <= Y(A); py += 2) {
        const r = (r0 - py) / k, v = vmAt(Math.cos(th) * r, Math.sin(th) * r, g, w2);
        if (v < 0) continue;
        const c = BANDS[Math.min(11, Math.max(0, Math.floor((v / SCALE) * 12)))];
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; ctx.fillRect(X(-rH) - 1, py, H_RIM * k + 2, 2.5);
      }
    } else {
      ctx.strokeStyle = INK; ctx.lineWidth = 0.9;
      for (let d = -SH; d < SW + SH; d += 7) { ctx.beginPath(); ctx.moveTo(d, r0 + 4); ctx.lineTo(d + r0, 0); ctx.stroke(); }
    }
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; profile(); ctx.stroke();
    if (g.n) { ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(X(-pT), Y(PITCH + g.rp), g.t * k, g.rp * 2 * k); ctx.setLineDash([]); }
    if (g.skim > 0.00004) { ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(X(pT), Y(g.Ri), (rH - pT) * k, g.skim * k); ctx.strokeRect(X(-rH), Y(g.Ri), (rH - pT) * k, g.skim * k); ctx.setLineDash([]); }
    ctx.lineWidth = 0.8; ctx.setLineDash([14, 4, 2, 4]);
    ctx.beginPath(); ctx.moveTo(X(-rH) - 16, Y(0)); ctx.lineTo(X(rH) + 40, Y(0)); ctx.moveTo(X(0), Y(0) + 8); ctx.lineTo(X(0), Y(R) - 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 11px "JetBrains Mono", monospace'; ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const lead = (x0, y0, x1, y1, text) => { ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + 8, y1); ctx.stroke(); ctx.beginPath(); ctx.arc(x0, y0, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillText(text, x1 + 12, y1); };
    const labX = X(rH) + 22;
    lead(X(pT), Y((HUB_R + g.Ri) / 2), labX, Y((HUB_R + g.Ri) / 2), `plate ${(g.t * 1000).toFixed(1)}`);
    lead(X(rH), Y(R - g.w / 2), labX, Y(R - g.w / 2) - 4, `wall ${(g.w * 1000).toFixed(1)}`);
    if (g.skim > 0.00004) lead(X((pT + rH) / 2), Y(g.Ri - g.skim / 2), labX, Y(g.Ri - g.skim / 2) + 14, `skim ${(g.skim * 1000).toFixed(1)} each side`);
    lead(X(hT), Y((A + HUB_R) / 2), labX, Y((A + HUB_R) / 2), 'hub, bolts to crank');
    ctx.fillText('R80', 10, Y(R) - 12);
    if (broken) {
      ctx.save(); ctx.translate(SW / 2, SH / 2); ctx.rotate(-0.18);
      ctx.font = '900 22px Archivo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#C8102E'; ctx.fillStyle = '#C8102E'; ctx.lineWidth = 2.5;
      ctx.strokeRect(-92, -20, 184, 40); ctx.fillText('FRACTURED', 0, 1);
      ctx.restore();
    }
  }

  function drawLegend() {
    legendEl.hidden = s.view !== 'contour';
    keyEl.hidden = !s.forces;
    if (!legendEl.hidden && !legendEl.childElementCount) {
      legendEl.innerHTML = '<b>MPa</b><span class="l-bar">' + BANDS.slice().reverse().map((c) => `<i style="background:rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})"></i>`).join('') + '</span><span class="l-lab"><span>240</span><span>120</span><span>0</span></span>';
    }
  }

  /* ---------- readouts ---------- */
  let lastReadout = 0;
  function readouts(force) {
    const now = performance.now();
    if (!force && now - lastReadout < 100) return;
    lastReadout = now;
    const g = geometry(s), mp = massProps(g);
    roll('fw-peak', Math.round(peak(g, w2Of(RPM_RATED)) / 1e6));
    $('fw-peak-now').textContent = broken ? '—' : Math.round(peak(g, w2Of(s.rpm)) / 1e6);
    const br = burstRpm();
    $('fw-burst-at').textContent = br > RPM_MAX ? 'beyond the rev limit' : `${(Math.round(br / 10) * 10).toLocaleString('en-GB')} rpm`;
    $('fw-burst-at').parentElement.classList.toggle('is-warn', br <= RPM_MAX);
    const omega = (s.rpm * Math.PI) / 30;
    $('fw-energy').textContent = ((0.5 * mp.I * omega * omega) / 1000).toFixed(1);
    $('fw-mass').textContent = mp.m.toFixed(2);
    const dm = (mp.m / STOCK.m - 1) * 100, dI = (mp.I / STOCK.I - 1) * 100;
    $('fw-mass-d').textContent = Math.abs(dm) < 0.05 ? '(stock)' : `(${dm > 0 ? '+' : '−'}${Math.abs(dm).toFixed(1)}%)`;
    $('fw-inertia').textContent = Math.abs(dI) < 0.05 ? 'stock' : `${dI > 0 ? '+' : '−'}${Math.abs(dI).toFixed(1)}% vs stock`;
    $('fw-torque').textContent = Math.abs(alpha) > 20 ? `${(mp.I * Math.abs(alpha)).toFixed(1)} N·m` : '—';
    const jobs = [];
    if (g.n) jobs.push(`${g.n} pockets`);
    if (s.skimMM > 0.04) jobs.push(`skim wall ${s.skimMM.toFixed(1)} mm each side`);
    if (Math.abs(s.tMM - 8) > 0.04) jobs.push(s.tMM < 8 ? `face plate to ${s.tMM.toFixed(1)} mm` : 'thicker plate (new part)');
    $('fw-machining').textContent = jobs.length ? `${jobs.join(', ')}, rebalance` : 'None (stock part)';
    $('pocket-size-out').textContent = g.n ? `Ø${(g.rp * 2000).toFixed(0)} mm` : '—';
    $('plate-t-out').textContent = `${s.tMM.toFixed(1)} mm`;
    $('wall-skim-out').textContent = `${s.skimMM.toFixed(1)} mm · ${(g.w * 1000).toFixed(1)} left`;
    pocketIn.disabled = !g.n;
  }

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now(), visible = true, rebuild = true;
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  // peak stress is proportional to ω², so the stress per unit ρω² is fixed for a geometry: cache it
  let perKey = '', perW2 = 0;
  const stressPerW2 = () => {
    const key = `${s.n}|${s.pocket}|${s.tMM}|${s.skimMM}`;
    if (key !== perKey) { perKey = key; perW2 = peak(geometry(s), 1); }
    return perW2;
  };
  const burstRpm = () => (30 / Math.PI) * Math.sqrt(LIMIT / (RHO * stressPerW2()));
  const strain = () => (w2Of(s.rpm) * stressPerW2()) / LIMIT;

  const burstPanel = $('fw-burst'), restoreBtn = $('fw-restore');
  function burst() {
    broken = true; burstAt = s.rpm; burstT = 0;
    pressed = false; killed = true; throttle = 0;
    snd.stopNow(); burstSound();
    buildShards(geometry(s));
    showWhole(false);
    s.rpm *= 0.35; // the hub, now light, spins down on its own
    $('fw-burst-rpm').textContent = Math.round(burstAt).toLocaleString('en-GB');
    burstPanel.hidden = false;
    revBtn.disabled = true;
    stage.classList.remove('is-burst'); void stage.offsetWidth; stage.classList.add('is-burst');
    setLabel(); readouts(true); kick();
  }
  function restore() {
    broken = false; burstT = 0;
    shards.traverse((o) => { if (o.geometry && o.geometry !== shaftGeo) o.geometry.dispose(); });
    shards.clear(); shardList = [];
    s.rpm = 0; killed = false;
    showWhole(true);
    burstPanel.hidden = true;
    revBtn.disabled = false;
    stage.classList.remove('is-burst', 'is-strained');
    setLabel(); setTach(0); readouts(true); kick();
    revBtn.focus({ preventScroll: true });
  }
  restoreBtn.addEventListener('click', restore);

  // the rev maths, separate from drawing so the test harness can step it
  function stepRevs(dt) {
    if (!broken && s.rpm > 0 && strain() >= 1) { burst(); return; }
    if (pressed) {
      throttle = Math.min(1, throttle + dt * 1.35);
      // an S-curve: slow off the mark while the throttle opens, then building (no jump from rest)
      s.rpm += (RPM_MAX - s.rpm) * (1 - Math.exp(-dt * (0.03 + 0.95 * throttle ** 1.6)));
      if (s.rpm > RPM_LIMIT) { limiterT += dt; if (limiterT > 0.08) { limiterT = 0; s.rpm -= 450 + Math.random() * 250; snd.cut(); } }
    } else if (s.rpm > 0) {
      throttle = Math.max(0, throttle - dt * 3);
      s.rpm *= Math.exp(-dt * (killed ? 6 : 0.9));
      if (s.rpm < 20) s.rpm = 0;
    }
  }
  expose('flywheel', {
    press, release, stepRevs, restore, burstRpm, stop: () => stopBtn.click(),
    get broken() { return broken; }, get rpm() { return s.rpm; }, set rpm(v) { s.rpm = v; },
    setGeometry(o) { Object.assign(s, o); rebuild = true; readouts(true); kick(); },
  });
  function frame(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (rebuild) { buildPart(); rebuild = false; }
    const prev = s.rpm;
    stepRevs(dt);
    alpha = dt > 0 ? ((s.rpm - prev) * Math.PI / 30) / dt : 0;
    snd.update(s.rpm, throttle, s.rpm > 20 && !killed ? 'running' : 'off');
    revBtn.style.setProperty('--hold', String(pressed ? clamp(s.rpm / RPM_LIMIT, 0, 1) : 0));
    const spinning = s.rpm > 0;
    if (spinning) phi += (0.3 + 5.2 * (s.rpm / RPM_MAX)) * Math.PI * 2 * dt * (reduced ? 0.25 : 1);
    setTach(s.rpm);
    setLabel();

    const g = geometry(s), w2 = w2Of(s.rpm);
    uniforms.uW2.value = w2 / 1e6; // MPa per m² keeps the shader in float range
    uniforms.uMode.value = s.view === 'contour' ? 1 : 0;
    updateGhost(g, w2);
    updateArrows(w2, alpha);
    spinner.rotation.z = phi;
    const flying = moveShards(dt);
    // close to the limit the part starts to shake on its shaft
    const st = broken ? 0 : strain(), shake = reduced ? 0 : clamp((st - 0.85) / 0.15, 0, 1) * 0.12;
    stage.classList.toggle('is-strained', st > 0.85);
    pivot.rotation.set(view.rx, view.ry, 0);
    pivot.position.set(view.px + (Math.random() - 0.5) * shake, view.py + (Math.random() - 0.5) * shake, 0);
    camera.zoom = view.zoom; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    drawSection(g, w2);
    drawLegend();
    readouts(!spinning);
    if ((spinning || pressed || drag || flying) && visible) kick();
  }

  /* ---------- controls ---------- */
  const radioGroup = (btns, key, apply) => {
    btns.forEach((b) => {
      b.setAttribute('tabindex', b.getAttribute('aria-checked') === 'true' ? '0' : '-1');
      b.addEventListener('click', () => {
        btns.forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.setAttribute('tabindex', x === b ? '0' : '-1'); });
        apply(b.dataset[key]); readouts(true); kick();
      });
    });
    btns[0].parentElement.addEventListener('keydown', (ev) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
      ev.preventDefault();
      const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const nb = btns[(i + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
      nb.focus(); nb.click();
    });
  };
  const geomChanged = () => { rebuild = true; readouts(true); kick(); };
  radioGroup(pocketSeg, 'n', (v) => { s.n = +v; rebuild = true; });
  radioGroup(viewSeg, 'view', (v) => { s.view = v; });
  pocketIn.addEventListener('input', () => { s.pocket = +pocketIn.value; geomChanged(); });
  plateIn.addEventListener('input', () => { s.tMM = +plateIn.value / 10; geomChanged(); });
  skimIn.addEventListener('input', () => { s.skimMM = +skimIn.value / 10; geomChanged(); });
  const toggle = (btn, key) => btn.addEventListener('click', () => { s[key] = !s[key]; btn.setAttribute('aria-pressed', String(s[key])); kick(); });
  toggle(forcesBtn, 'forces');
  toggle(deformBtn, 'deform');

  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => { sizeSection(); kick(); }).observe(secCanvas);
  // scrolled away or tab hidden: stop the flywheel dead, sound and all
  const shutdown = () => {
    pressed = false; throttle = 0;
    if (s.rpm <= 0) return;
    killed = true; s.rpm = 0; snd.stopNow(); setLabel(); setTach(0); readouts(true);
  };
  whileVisible(stage, (v) => { visible = v; if (v) kick(); else shutdown(); }, '0px');
  document.fonts?.ready.then(kick);
  resize();
  readouts(true);
  kick();
}
