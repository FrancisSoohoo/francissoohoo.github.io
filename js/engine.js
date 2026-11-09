// Fig. 001: a schematic parallel-twin drawn as a halftone-shaded hidden-line illustration.
// Starts as a flat front elevation and lifts into 3D. Hold Start to crank, catch and rev.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EngineSound } from './sound.js';
import { reduced, clamp, lerp, easeOutExpo, easeInOut, expose } from './util.js';

const PAPER = 0xF2F2EE, INK = 0x111111, ZINC = 0xE3B505, PHANTOM = 0x6E6E66;

const VS = /* glsl */`
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FS = /* glsl */`
  uniform vec3 uBase; uniform vec3 uInk; uniform float uDot; uniform vec3 uLight; uniform float uAmb;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float l = clamp(dot(n, uLight), 0.0, 1.0);
    float tone = clamp((1.0 - (uAmb + (1.0 - uAmb) * l)) * 1.25, 0.0, 1.0);
    vec2 p = gl_FragCoord.xy / uDot;
    vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
    vec2 f = fract(q) - 0.5;
    float r = sqrt(tone) * 0.6;
    float m = 1.0 - smoothstep(r - 0.07, r + 0.07, length(f));
    gl_FragColor = vec4(mix(uBase, uInk, m * step(0.02, tone)), 1.0);
    #include <colorspace_fragment>
  }`;

export function initEngine() {
  const stage = document.getElementById('engine-stage');
  const canvas = document.getElementById('engine-canvas');
  const calloutSvg = document.getElementById('engine-callouts');
  const startBtn = document.getElementById('engine-start');
  const startLabel = document.getElementById('engine-start-label');
  const startZh = document.getElementById('engine-start-zh');
  const explodeBtn = document.getElementById('engine-explode');
  const soundBtn = document.getElementById('engine-sound');
  const stopBtn = document.getElementById('engine-stop');
  const tachEl = document.getElementById('tach-digits');
  const tachWrap = tachEl.parentElement;
  const stateEl = document.getElementById('engine-state');
  const hint = document.getElementById('engine-hint');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 40);
  camera.lookAt(0, 0, 0);

  /* ---------- materials ---------- */
  const lightDir = new THREE.Vector3(-0.5, 0.72, 0.48).normalize();
  const fillMats = [];
  const ht = (base, amb = 0.45) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uBase: { value: new THREE.Color(base) },
        uInk: { value: new THREE.Color(INK) },
        uDot: { value: 4.4 * dpr },
        uLight: { value: lightDir },
        uAmb: { value: amb },
      },
      vertexShader: VS, fragmentShader: FS,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2,
    });
    fillMats.push(m);
    return m;
  };
  const lineMats = [];
  const lm = (color = INK, width = 1.55, dashed = false) => {
    const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 0.13, gapSize: 0.08 });
    lineMats.push(m);
    return m;
  };
  const inkLine = lm(INK, 1.55);
  const fineLine = lm(INK, 1.1);
  const phantomLine = lm(PHANTOM, 1.05, true);

  const edges = (geo, mat = inkLine, thr = 28) => {
    const lg = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, thr));
    const l = new LineSegments2(lg, mat);
    if (mat.dashed) l.computeLineDistances();
    return l;
  };
  const solid = (geo, base = PAPER, { line = inkLine, thr = 28, amb } = {}) => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(geo, ht(base, amb));
    g.add(mesh, edges(geo, line, thr));
    g.userData.mesh = mesh;
    return g;
  };
  const phantom = (arr) => {
    const lg = new LineSegmentsGeometry();
    lg.setPositions(arr);
    const l = new LineSegments2(lg, phantomLine);
    l.computeLineDistances();
    return l;
  };
  const boxSegs = (cx, cy, cz, w, h, d) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    return e.flatMap(([a, b]) => [...v[a], ...v[b]]);
  };
  const ringSegsY = (cx, y, cz, r, n = 48) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      out.push(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r);
    }
    return out;
  };

  /* ---------- the engine ---------- */
  const pivot = new THREE.Group();
  const model = new THREE.Group();
  model.position.y = -1.65;
  pivot.add(model);
  scene.add(pivot);

  const BORE_X = [-0.8, 0.8], R_CRANK = 0.5, L_ROD = 1.7;
  const exploders = []; // {obj, base, off}
  const addEx = (obj, off) => { exploders.push({ obj, base: obj.position.clone(), off: new THREE.Vector3(...off) }); return obj; };

  // crankcase + block (phantom castings)
  const caseSegs = [
    ...boxSegs(0, -0.15, 0, 3.6, 1.9, 2.1),
    ...boxSegs(0, 1.8, 0, 3.6, 2.0, 1.85),
    ...BORE_X.flatMap((x) => [...ringSegsY(x, 2.8, 0, 0.64), ...ringSegsY(x, 0.8, 0, 0.64)]),
  ];
  const casing = phantom(caseSegs);
  model.add(addEx(casing, [0, -0.35, 0]));

  // head gasket
  const gShape = new THREE.Shape();
  gShape.moveTo(-1.8, -0.925); gShape.lineTo(1.8, -0.925); gShape.lineTo(1.8, 0.925); gShape.lineTo(-1.8, 0.925); gShape.closePath();
  BORE_X.forEach((x) => { const h = new THREE.Path(); h.absarc(x, 0, 0.66, 0, Math.PI * 2, true); gShape.holes.push(h); });
  const STUDS = [[-1.55, -0.72], [0, -0.72], [1.55, -0.72], [-1.55, 0.72], [0, 0.72], [1.55, 0.72]];
  STUDS.forEach(([x, z]) => { const h = new THREE.Path(); h.absarc(x, -z, 0.09, 0, Math.PI * 2, true); gShape.holes.push(h); });
  const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: 0.06, bevelEnabled: false, curveSegments: 20 });
  gGeo.rotateX(-Math.PI / 2);
  const gasket = solid(gGeo, PAPER, { line: fineLine, amb: 0.6 });
  gasket.position.y = 2.8;
  model.add(addEx(gasket, [0, 0.62, 0]));

  // cylinder head (chamfered profile, extruded front to back)
  const hp = new THREE.Shape();
  hp.moveTo(-1.8, 0); hp.lineTo(1.8, 0); hp.lineTo(1.8, 0.72); hp.lineTo(1.6, 0.95); hp.lineTo(-1.6, 0.95); hp.lineTo(-1.8, 0.72); hp.closePath();
  const hGeo = new THREE.ExtrudeGeometry(hp, { depth: 1.85, bevelEnabled: false });
  hGeo.translate(0, 0, -0.925);
  const head = solid(hGeo);
  head.position.y = 2.86;
  model.add(addEx(head, [0, 1.3, 0]));

  // cam cover
  const cp = new THREE.Shape();
  cp.moveTo(-1.25, 0); cp.lineTo(1.25, 0); cp.lineTo(1.25, 0.24); cp.quadraticCurveTo(1.25, 0.44, 1.05, 0.44); cp.lineTo(-1.05, 0.44); cp.quadraticCurveTo(-1.25, 0.44, -1.25, 0.24); cp.closePath();
  const cGeo = new THREE.ExtrudeGeometry(cp, { depth: 1.1, bevelEnabled: false, curveSegments: 6 });
  cGeo.translate(0, 0, -0.55);
  const cover = solid(cGeo);
  cover.position.y = 3.81;
  model.add(addEx(cover, [0, 2.15, 0]));
  BORE_X.forEach((x) => {
    const coil = solid(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 24));
    coil.position.set(x, 4.43, 0);
    model.add(addEx(coil, [0, 2.75, 0]));
  });

  // studs, nuts and washers (the part I sourced: zinc)
  const studMeshes = [];
  STUDS.forEach(([x, z]) => {
    const shaft = solid(new THREE.CylinderGeometry(0.07, 0.07, 2.85, 14), ZINC, { amb: 0.55 });
    shaft.position.set(x, 1.2 + 2.85 / 2, z);
    model.add(addEx(shaft, [0, 0, 0]));
    const nut = new THREE.Group();
    const washer = solid(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), ZINC, { line: fineLine, amb: 0.55 });
    washer.position.y = 0.015;
    const hex = solid(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 6), ZINC, { amb: 0.55 });
    hex.position.y = 0.11;
    nut.add(washer, hex);
    nut.position.set(x, 3.81, z);
    model.add(addEx(nut, [0, 1.75, 0]));
    studMeshes.push(shaft.userData.mesh, washer.userData.mesh, hex.userData.mesh);
  });

  // crankshaft (rotates about x)
  const crank = new THREE.Group();
  model.add(crank);
  const xCyl = (r, x0, x1, segs = 28) => { const g = new THREE.CylinderGeometry(r, r, x1 - x0, segs); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0); return g; };
  [[-2.12, -1.2], [-0.4, 0.4], [1.2, 1.95]].forEach(([a, b]) => crank.add(solid(xCyl(0.26, a, b))));
  [[-1.12, 1], [-0.48, 1], [0.48, -1], [1.12, -1]].forEach(([x, s]) => {
    const g = xCyl(0.72, x - 0.08, x + 0.08, 44);
    g.translate(0, -0.1 * s, 0);
    crank.add(solid(g));
  });
  const pin1 = xCyl(0.22, -1.04, -0.56); pin1.translate(0, R_CRANK, 0); crank.add(solid(pin1));
  const pin2 = xCyl(0.22, 0.56, 1.04); pin2.translate(0, -R_CRANK, 0); crank.add(solid(pin2));

  // flywheel with lightening pockets and ring gear (part 02-01)
  const fw = new THREE.Shape();
  const TEETH = 64, RO = 1.2, RT = 1.13;
  for (let i = 0; i < TEETH; i++) {
    const a0 = (i / TEETH) * Math.PI * 2, a1 = ((i + 0.5) / TEETH) * Math.PI * 2;
    const p = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    const [x0, y0] = p(RO, a0), [x1, y1] = p(RO, a1), [x2, y2] = p(RT, a1), [x3, y3] = p(RT, ((i + 1) / TEETH) * Math.PI * 2);
    if (i === 0) fw.moveTo(x0, y0); else fw.lineTo(x0, y0);
    fw.lineTo(x1, y1); fw.lineTo(x2, y2); fw.lineTo(x3, y3);
  }
  fw.closePath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const h = new THREE.Path(); h.absarc(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0.19, 0, Math.PI * 2, true); fw.holes.push(h); }
  const hub = new THREE.Path(); hub.absarc(0, 0, 0.26, 0, Math.PI * 2, true); fw.holes.push(hub);
  const fwGeo = new THREE.ExtrudeGeometry(fw, { depth: 0.2, bevelEnabled: false, curveSegments: 18 });
  fwGeo.rotateY(Math.PI / 2);
  fwGeo.translate(-2.42, 0, 0);
  const flywheel = solid(fwGeo, ZINC, { thr: 30, amb: 0.55 });
  const fwHub = solid(xCyl(0.4, -2.3, -2.12, 32));
  const flyGroup = new THREE.Group();
  flyGroup.add(flywheel, fwHub);
  crank.add(addEx(flyGroup, [-1.0, 0, 0]));

  // primary drive gear
  const gear = new THREE.Shape();
  const GT = 18;
  for (let i = 0; i < GT; i++) {
    const a = (i / GT) * Math.PI * 2, w = (Math.PI * 2) / GT;
    const pts = [[0.4, a], [0.5, a + w * 0.18], [0.5, a + w * 0.5], [0.4, a + w * 0.68]];
    pts.forEach(([r, aa], j) => { const x = Math.cos(aa) * r, y = Math.sin(aa) * r; if (i === 0 && j === 0) gear.moveTo(x, y); else gear.lineTo(x, y); });
  }
  gear.closePath();
  const gh = new THREE.Path(); gh.absarc(0, 0, 0.2, 0, Math.PI * 2, true); gear.holes.push(gh);
  const gearGeo = new THREE.ExtrudeGeometry(gear, { depth: 0.18, bevelEnabled: false });
  gearGeo.rotateY(Math.PI / 2);
  gearGeo.translate(1.97, 0, 0);
  crank.add(addEx(solid(gearGeo), [0.7, 0, 0]));

  // pistons and rods
  const lathe = [[0.001, 0.36], [0.6, 0.36], [0.6, 0.29], [0.565, 0.28], [0.565, 0.24], [0.6, 0.23], [0.6, 0.18], [0.565, 0.17], [0.565, 0.13], [0.6, 0.12], [0.6, -0.34], [0.52, -0.34]].map(([x, y]) => new THREE.Vector2(x, y));
  const pistGeo = new THREE.LatheGeometry(lathe, 40);
  const rodShape = new THREE.Shape();
  {
    const L = L_ROD;
    rodShape.moveTo(0.16, 0.3225);
    rodShape.lineTo(0.1, L - 0.1732);
    rodShape.absarc(0, L, 0.2, -Math.PI / 3, (4 * Math.PI) / 3, false);
    rodShape.lineTo(-0.16, 0.3225);
    rodShape.absarc(0, 0, 0.36, Math.atan2(0.3225, -0.16), Math.atan2(0.3225, 0.16) + Math.PI * 2, false);
    const h1 = new THREE.Path(); h1.absarc(0, 0, 0.22, 0, Math.PI * 2, true);
    const h2 = new THREE.Path(); h2.absarc(0, L, 0.1, 0, Math.PI * 2, true);
    rodShape.holes.push(h1, h2);
  }
  const rodGeo = new THREE.ExtrudeGeometry(rodShape, { depth: 0.16, bevelEnabled: false, curveSegments: 20 });
  rodGeo.translate(0, 0, -0.08);
  rodGeo.rotateY(Math.PI / 2);
  const pistons = BORE_X.map((x) => { const p = solid(pistGeo); p.position.x = x; model.add(p); return p; });
  const rods = BORE_X.map((x) => { const r = solid(rodGeo); r.position.x = x; model.add(r); return r; });

  function setCrank(theta) {
    crank.rotation.x = theta;
    for (let i = 0; i < 2; i++) {
      const phi = theta + (i === 0 ? 0 : Math.PI);
      const yc = R_CRANK * Math.cos(phi), zc = R_CRANK * Math.sin(phi);
      const yp = yc + Math.sqrt(L_ROD * L_ROD - zc * zc);
      pistons[i].position.y = yp;
      rods[i].position.set(BORE_X[i], yc, zc);
      rods[i].rotation.x = Math.atan2(-zc, yp - yc);
    }
  }
  setCrank(0.4);

  /* ---------- callouts ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const callouts = [
    { n: 1, label: 'Head stud, custom', target: 'part-studs', anchor: new THREE.Vector3(1.55, 4.0, 0.72), ex: () => 1.75, off: [70, -54], left: false },
    { n: 2, label: 'Flywheel', target: 'part-flywheel', anchor: new THREE.Vector3(-2.5, 0.9, 0.7), ex: () => 0, exX: -1.0, off: [-74, 46], left: true },
    // plain part labels (not clickable), always shown on wide screens
    { label: 'Cam cover', anchor: new THREE.Vector3(-0.6, 4.25, 0.55), ex: () => 2.15, off: [-70, -46], left: true, stat: true },
    { label: 'Cylinder head', anchor: new THREE.Vector3(1.8, 3.4, 0.93), ex: () => 1.3, off: [64, 6], stat: true },
    { label: 'Head gasket', anchor: new THREE.Vector3(1.8, 2.86, 0.6), ex: () => 0.62, off: [72, 30], stat: true },
    { label: 'Piston', anchor: new THREE.Vector3(), dyn: (v) => v.set(0.8, pistons[1].position.y + 0.36, 0), ex: () => 0, off: [96, -18], stat: true },
    { label: 'Conrod', anchor: new THREE.Vector3(), dyn: (v) => v.set(-0.8, (rods[0].position.y + pistons[0].position.y) / 2, rods[0].position.z / 2), ex: () => 0, off: [-96, 12], left: true, stat: true },
    { label: 'Crankshaft', anchor: new THREE.Vector3(1.6, -0.26, 0.2), ex: () => 0, off: [70, 52], stat: true },
    { label: 'Primary gear', anchor: new THREE.Vector3(2.06, -0.45, 0), ex: () => 0, exX: 0.7, off: [44, 86], stat: true },
    { label: 'Crankcase', anchor: new THREE.Vector3(-1.8, -1.1, 1.05), ex: () => -0.35, off: [-40, 52], left: true, stat: true },
  ];
  callouts.forEach((c) => {
    c.line = document.createElementNS(NS, 'line');
    c.dot = document.createElementNS(NS, 'circle'); c.dot.setAttribute('r', '3');
    calloutSvg.append(c.line, c.dot);
    if (c.stat) {
      const d = document.createElement('div');
      d.className = 'callout callout--static';
      d.setAttribute('aria-hidden', 'true');
      d.innerHTML = `<span class="callout-n">${c.n}</span><span class="callout-t"></span>`;
      d.querySelector('.callout-t').textContent = c.label;
      stage.appendChild(d);
      c.btn = d;
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `callout${c.left ? ' is-left' : ''}`;
    b.innerHTML = `<span class="callout-n">${c.n}</span><span class="callout-t"></span>`;
    b.querySelector('.callout-t').textContent = c.label;
    b.setAttribute('aria-label', `${c.label}: go to part`);
    b.addEventListener('click', () => goTo(c.target));
    b.addEventListener('pointerenter', () => highlight(c.target));
    b.addEventListener('pointerleave', () => highlight(null));
    b.addEventListener('focus', () => highlight(c.target));
    b.addEventListener('blur', () => highlight(null));
    stage.appendChild(b);
    c.btn = b;
  });
  function goTo(id) {
    window.dispatchEvent(new CustomEvent('catalogue:goto', { detail: id }));
  }
  const flyMeshes = [flywheel.userData.mesh];
  let hl = null;
  function highlight(target) {
    if (hl === target) return;
    hl = target;
    flyMeshes.forEach((m) => m.material.uniforms.uBase.value.set(target === 'part-flywheel' ? 0xF4CF3A : ZINC));
    studMeshes.forEach((m) => m.material.uniforms.uBase.value.set(target === 'part-studs' ? 0xF4CF3A : ZINC));
    stage.style.cursor = target ? 'pointer' : '';
    invalidate();
  }

  const tmp = new THREE.Vector3();
  function updateCallouts(w, h, alpha) {
    const placed = [];
    if (!c0w) c0w = callouts.map((c) => c.btn.offsetWidth || 150);
    callouts.forEach((c) => {
      if (c.dyn) c.dyn(c.anchor);
      tmp.copy(c.anchor);
      tmp.y += c.ex() * exE;
      if (c.exX) tmp.x += c.exX * exE;
      tmp.applyMatrix4(model.matrixWorld).project(camera);
      c.ax = (tmp.x * 0.5 + 0.5) * w; c.ay = (-tmp.y * 0.5 + 0.5) * h;
      const cw0 = c0w[callouts.indexOf(c)];
      c.lx = clamp(c.ax + c.off[0], c.left ? cw0 - 15 + 8 : 8 + 15, c.left ? w - 8 - 15 : w - cw0 + 15 - 8);
      c.ly = clamp(c.ay + c.off[1], 24, h - 24);
      c.a = c.stat ? (w >= 520 ? alpha * 0.999 : 0) : alpha;
      if (c.a > 0.05) placed.push(c);
    });
    // keep visible labels from stacking on top of each other
    if (!c0w) c0w = callouts.map((c) => c.btn.offsetWidth || 150);
    placed.sort((p, q) => p.ly - q.ly);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < placed.length; i++) {
        for (let j = 0; j < i; j++) {
          const p = placed[j], q = placed[i];
          const pw = c0w[callouts.indexOf(p)], qw = c0w[callouts.indexOf(q)];
          const px0 = p.left ? p.lx - pw : p.lx, px1 = p.left ? p.lx : p.lx + pw;
          const qx0 = q.left ? q.lx - qw : q.lx, qx1 = q.left ? q.lx : q.lx + qw;
          if (px0 < qx1 && qx0 < px1 && Math.abs(q.ly - p.ly) < 32) q.ly = Math.min(h - 18, p.ly + 32);
        }
      }
    }
    callouts.forEach((c) => {
      c.line.setAttribute('x1', c.ax); c.line.setAttribute('y1', c.ay);
      c.line.setAttribute('x2', c.lx); c.line.setAttribute('y2', c.ly);
      c.dot.setAttribute('cx', c.ax); c.dot.setAttribute('cy', c.ay);
      c.btn.style.left = `${c.lx}px`; c.btn.style.top = `${c.ly}px`;
      c.btn.classList.toggle('is-on', c.a > 0.5);
      c.line.style.opacity = c.dot.style.opacity = c.a;
    });
  }
  let c0w = null;
  window.addEventListener('resize', () => { c0w = null; });

  /* ---------- sizing ---------- */
  let W = 1, H = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    const aspect = W / H;
    const hh = Math.max(9.2 / 2, 8.6 / 2 / aspect);
    camera.left = -hh * aspect; camera.right = hh * aspect; camera.top = hh; camera.bottom = -hh;
    camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(W, H));
    calloutSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    invalidate();
  }
  new ResizeObserver(resize).observe(stage);

  /* ---------- interaction: drag to rotate ---------- */
  const ISO = { x: 0.46, y: -0.64 };
  let rotX = 0, rotY = 0, vX = 0, vY = 0, introT = reduced ? 1 : 0, introDone = reduced, touched = false;
  if (reduced) { rotX = ISO.x; rotY = ISO.y; }
  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0, lastT = 0;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([...studMeshes, ...flyMeshes], false);
    if (!hits.length) return null;
    return studMeshes.includes(hits[0].object) ? 'part-studs' : 'part-flywheel';
  }
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.callout')) return;
    dragging = true; touched = true;
    if (!introDone) { introDone = true; introT = 1; }
    lastX = downX = ev.clientX; lastY = downY = ev.clientY; lastT = performance.now();
    vX = vY = 0;
    try { stage.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
    stage.classList.add('is-dragging');
    hint.textContent = 'Drag to rotate';
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragging) {
      if (ev.pointerType === 'mouse' && !ev.target.closest('.callout')) highlight(pick(ev));
      return;
    }
    const now = performance.now(), dt = Math.max(1, now - lastT);
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    rotY += dx * 0.009; rotX = clamp(rotX + dy * 0.007, -0.25, 1.25);
    vY = clamp((dx * 0.009) / Math.max(dt, 8) * 16, -0.18, 0.18); vX = clamp((dy * 0.007) / Math.max(dt, 8) * 16, -0.1, 0.1);
    lastX = ev.clientX; lastY = ev.clientY; lastT = now;
    invalidate();
  });
  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (performance.now() - lastT > 70) { vX = 0; vY = 0; }
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < 5) {
      const t = pick(ev);
      if (t) goTo(t);
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { if (!dragging) highlight(null); });

  /* ---------- explode ---------- */
  let exploded = false, exT = 0, exE = 0;
  explodeBtn.addEventListener('click', () => {
    exploded = !exploded;
    explodeBtn.setAttribute('aria-pressed', String(exploded));
    if (!introDone) { introT = Math.max(introT, 0.6); introDelay = 0; }
    invalidate();
  });

  /* ---------- start / rev ---------- */
  const sound = new EngineSound();
  let state = 'off', pressed = false, crankT = 0, rpm = 0, throttle = 0, theta = 0.4, idleT = 0, limiterT = 0, killed = false, flareT = 9;
  stopBtn.addEventListener('click', () => {
    if (state === 'off') return;
    state = 'off'; killed = true; pressed = false; throttle = 0;
    sound.stopNow();
    setLabel(); invalidate();
  });
  soundBtn.addEventListener('click', () => {
    sound.on = !sound.on;
    soundBtn.setAttribute('aria-pressed', String(sound.on));
    soundBtn.setAttribute('aria-label', sound.on ? 'Engine sound on' : 'Engine sound off');
  });
  const press = () => {
    if (pressed) return;
    pressed = true;
    sound.build();
    if (!introDone) { introT = Math.max(introT, 0.6); introDelay = 0; }
    if (state === 'off') { state = 'cranking'; crankT = 0; killed = false; setLabel(); }
    idleT = 0;
    invalidate();
  };
  const release = () => { pressed = false; };
  startBtn.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    ev.preventDefault();
    try { startBtn.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
    press();
  });
  startBtn.addEventListener('pointerup', release);
  startBtn.addEventListener('pointercancel', release);
  startBtn.addEventListener('lostpointercapture', release);
  startBtn.addEventListener('keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); press(); } });
  startBtn.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); release(); } });
  startBtn.addEventListener('blur', release);
  startBtn.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function setLabel() {
    const map = {
      off: ['Hold to start', '按住啟動'],
      cranking: ['Cranking', '起動中'],
      running: ['Hold to rev', '按住加油'],
    };
    startLabel.textContent = map[state][0];
    startZh.textContent = map[state][1];
    startBtn.classList.toggle('is-running', state === 'running');
    stopBtn.disabled = state === 'off';
    stateEl.textContent = state === 'running' ? 'Engine running. Hold the button to rev.' : state === 'off' ? 'Engine stopped.' : '';
  }

  let tachShown = -1, tachClock = 0;
  function setTach(v) {
    const n = Math.round(v / 10) * 10;
    if (n === tachShown) return;
    tachShown = n;
    const s = String(n).padStart(5, '0');
    [...tachEl.children].forEach((el, i) => { el.textContent = s[i]; });
    tachWrap.classList.toggle('is-high', n > 9500);
  }

  /* ---------- loop ---------- */
  let running = false, visible = true, dirty = true, last = performance.now(), introDelay = 0.35;
  function invalidate() { dirty = true; if (!running && visible) start(); }
  function start() { running = true; last = performance.now(); requestAnimationFrame(frame); }

  // the rev maths, separate from drawing so the test harness can step it
  function stepRevs(dt) {
    if (state === 'cranking') {
      if (pressed) {
        crankT += dt;
        rpm = 230 + Math.sin(crankT * 26) * 60;
        // it catches: the revs climb from cranking speed into a short flare, then settle to idle
        if (crankT > 1.15) { state = 'running'; flareT = 0; throttle = 0; setLabel(); }
      } else { state = 'off'; setLabel(); }
      startBtn.style.setProperty('--hold', String(Math.min(1, crankT / 1.15)));
    } else if (state === 'running') {
      flareT += dt;
      // the throttle only opens once the catch has settled, so holding the button through the start
      // does not pile a rev onto the flare
      throttle = pressed && flareT > 0.9 ? Math.min(1, throttle + dt * 1.35) : Math.max(0, throttle - dt * 2.6);
      // the first 0.9 s after catching: the revs ease up from cranking speed to a small flare
      // (about 1,500), then settle to idle
      const flaring = flareT < 0.9;
      const tgt = Math.max(flaring ? 1650 : 0, 1350 + throttle * (11800 - 1350));
      const k = flaring ? 2.8 * Math.min(1, flareT / 0.3) + 0.4 : pressed ? 2.34 : 1.62;
      // never faster than 5,500 rpm a second up (about 90 a frame) or 7,000 down: a climb, never a jump
      rpm += clamp((tgt - rpm) * (1 - Math.exp(-dt * k)), -7000 * dt, 5500 * dt);
      if (rpm > 11400 && pressed) {
        limiterT += dt;
        if (limiterT > 0.07) { limiterT = 0; rpm -= 700 + Math.random() * 300; sound.cut(); }
      }
      idleT = pressed ? 0 : idleT + dt;
      if (idleT > 12) { state = 'off'; setLabel(); }
      startBtn.style.setProperty('--hold', String(throttle));
    } else {
      rpm *= Math.exp(-dt * (killed ? 10 : 3.2));
      if (rpm < 5) rpm = 0;
      startBtn.style.setProperty('--hold', '0');
    }
  }
  expose('engine', { press, release, stepRevs, stop: () => stopBtn.click(), get rpm() { return rpm; }, get state() { return state; }, get throttle() { return throttle; } });
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    let active = false;

    // intro: flat elevation -> isometric
    if (!introDone) {
      introDelay -= dt;
      if (introDelay <= 0) {
        introT = Math.min(1, introT + dt / 1.7);
        const e = easeOutExpo(introT);
        rotX = ISO.x * e; rotY = ISO.y * e;
        if (introT >= 1) introDone = true;
      }
      active = true;
    } else if (!dragging && (Math.abs(vX) > 1e-4 || Math.abs(vY) > 1e-4)) {
      const fr = dt * 60;
      rotY += vY * fr; rotX = clamp(rotX + vX * fr, -0.25, 1.25);
      const decay = Math.pow(0.92, fr); vX *= decay; vY *= decay;
      active = true;
    }

    // explode easing
    const target = exploded ? 1 : 0;
    if (exT !== target) {
      exT = target > exT ? Math.min(1, exT + dt / 0.9) : Math.max(0, exT - dt / 0.7);
      active = true;
    }
    exE = easeInOut(exT);
    exploders.forEach(({ obj, base, off }) => obj.position.copy(base).addScaledVector(off, exE));
    camera.zoom = lerp(1, 0.74, exE);
    camera.updateProjectionMatrix();

    stepRevs(dt);
    sound.update(rpm, throttle, state);
    if (rpm > 0) {
      // drawn crank speed (slowed for the eye), continuous from cranking through idle to the limiter
      const rev = rpm < 230 ? (rpm / 230) * 0.84 : rpm < 1350 ? 0.84 + 0.66 * ((rpm - 230) / 1120) : 1.5 + 7.5 * clamp((rpm - 1350) / 10450, 0, 1);
      theta += rev * Math.PI * 2 * dt * (reduced ? 0.4 : 1);
      setCrank(theta);
      active = true;
    }
    tachClock += dt;
    if (tachClock > 0.04) { tachClock = 0; setTach(rpm); }

    // vibration when running
    if (state === 'running' && !reduced) {
      const a = 0.012 * (1 - throttle * 0.6);
      model.position.x = Math.sin(theta * 2) * a;
      model.position.y = -1.65 + Math.cos(theta * 2) * a * 0.6;
    } else { model.position.x = 0; model.position.y = -1.65; }

    pivot.rotation.set(rotX, rotY, 0);
    if (active || dirty || dragging) {
      scene.updateMatrixWorld();
      renderer.render(scene, camera);
      updateCallouts(W, H, introDone ? 1 : clamp((introT - 0.6) / 0.4, 0, 1));
      dirty = false;
    }

    if ((active || dragging || state !== 'off') && visible) requestAnimationFrame(frame);
    else running = false;
  }

  // leaving the engine (scrolling away, switching tab) shuts it down: no endless revving off-screen
  function shutdown() {
    pressed = false; throttle = 0;
    if (state === 'off' && rpm <= 0) return;
    state = 'off'; killed = true; rpm = 0; idleT = 0;
    sound.stopNow();
    setLabel(); setTach(0);
    dirty = true;
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) invalidate(); else shutdown();
  });
  io.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { shutdown(); visible = false; } else { visible = true; invalidate(); }
  });

  if (!touched) hint.textContent = 'Drag to rotate · hold Start';
  setLabel();
  resize();
  invalidate();
}
