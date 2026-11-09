// Fig. 005: a real CART decision tree, retrained in the browser whenever a parameter changes.
// The data is a synthetic stand-in for the UCI Cleveland heart-disease set (303 patients,
// the same 13 features), drawn class by class to resemble its published distributions, so the
// figure can retrain live without shipping patient data. The algorithm is the real thing:
// Gini or entropy splits, max depth, min samples per leaf, balanced class weights,
// a stratified train / test split and 5-fold cross-validation for the depth curve.
import { roll, rng, clamp } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

/* ---------- features: numeric splits on value <= t, categorical splits on value == c ---------- */
const FEATURES = [
  { key: 'age', label: 'Age', kind: 'num', fmt: (t) => `Age ≤ ${Math.round(t)}` },
  { key: 'sex', label: 'Sex', kind: 'cat', cats: ['Female', 'Male'], fmt: (c) => (c === 1 ? 'Male' : 'Female') },
  { key: 'cp', label: 'Chest pain', kind: 'cat', cats: ['typical', 'atypical', 'non-anginal', 'none (silent)'], fmt: (c) => `Chest pain: ${['typical', 'atypical', 'non-anginal', 'none'][c]}` },
  { key: 'trestbps', label: 'Resting BP', kind: 'num', fmt: (t) => `Rest BP ≤ ${Math.round(t)}` },
  { key: 'chol', label: 'Cholesterol', kind: 'num', fmt: (t) => `Cholesterol ≤ ${Math.round(t)}` },
  { key: 'fbs', label: 'Fasting sugar', kind: 'cat', cats: ['normal', 'high'], fmt: (c) => (c ? 'High fasting sugar' : 'Normal fasting sugar') },
  { key: 'restecg', label: 'Resting ECG', kind: 'cat', cats: ['normal', 'ST-T', 'LVH'], fmt: (c) => `Rest ECG: ${['normal', 'ST-T', 'LVH'][c]}` },
  { key: 'thalach', label: 'Max heart rate', kind: 'num', fmt: (t) => `Max HR ≤ ${Math.round(t)}` },
  { key: 'exang', label: 'Exercise angina', kind: 'cat', cats: ['no', 'yes'], fmt: (c) => (c ? 'Exercise angina' : 'No exercise angina') },
  { key: 'oldpeak', label: 'ST depression', kind: 'num', fmt: (t) => `ST depression ≤ ${t.toFixed(1)}` },
  { key: 'slope', label: 'ST slope', kind: 'cat', cats: ['up', 'flat', 'down'], fmt: (c) => `ST slope: ${['up', 'flat', 'down'][c]}` },
  { key: 'ca', label: 'Major vessels', kind: 'num', fmt: (t) => `Vessels ≤ ${Math.floor(t)}` },
  { key: 'thal', label: 'Thallium test', kind: 'cat', cats: ['normal', 'fixed', 'reversible'], fmt: (c) => `Thal: ${['normal', 'fixed defect', 'reversible'][c]}` },
];

/* ---------- synthetic patients ---------- */
function makeData(seed = 303) {
  const R = rng(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const N = (m, s, lo, hi) => clamp(m + s * gauss(), lo, hi);
  const pick = (ps) => { let r = R(), i = 0; for (; i < ps.length - 1; i++) { if ((r -= ps[i]) < 0) break; } return i; };
  const rows = [];
  for (let i = 0; i < 303; i++) {
    const y = R() < 0.46 ? 1 : 0;
    rows.push({
      y,
      age: Math.round(y ? N(56.6, 7.9, 29, 77) : N(52.5, 9.5, 29, 77)),
      sex: R() < (y ? 0.82 : 0.56) ? 1 : 0,
      cp: pick(y ? [0.05, 0.07, 0.13, 0.75] : [0.1, 0.25, 0.41, 0.24]),
      trestbps: Math.round(y ? N(134, 19, 94, 200) : N(129, 16, 94, 180)),
      chol: Math.round(y ? N(251, 49, 130, 420) : N(242, 53, 126, 420)),
      fbs: R() < (y ? 0.16 : 0.14) ? 1 : 0,
      restecg: pick(y ? [0.4, 0.02, 0.58] : [0.58, 0.01, 0.41]),
      thalach: Math.round(y ? N(139, 23, 71, 195) : N(158, 19, 96, 202)),
      exang: R() < (y ? 0.55 : 0.14) ? 1 : 0,
      oldpeak: Math.round(Math.abs(y ? N(1.6, 1.3, -5, 6.2) : N(0.6, 0.8, -4, 4.2)) * 10) / 10,
      slope: pick(y ? [0.25, 0.65, 0.1] : [0.65, 0.29, 0.06]),
      ca: pick(y ? [0.33, 0.32, 0.22, 0.13] : [0.79, 0.13, 0.05, 0.03]),
      thal: pick(y ? [0.27, 0.09, 0.64] : [0.79, 0.04, 0.17]),
    });
  }
  return rows;
}

/* ---------- CART ---------- */
const impurity = (p, crit) => {
  if (p <= 0 || p >= 1) return 0;
  return crit === 'entropy' ? -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)) : 2 * p * (1 - p);
};
function fit(rows, w, idx, o, depth = 0, imp = null) {
  let W = 0, Wp = 0;
  for (const i of idx) { W += w[i]; if (rows[i].y) Wp += w[i]; }
  const node = { n: idx.length, w: W, p: W ? Wp / W : 0, depth, idx };
  if (depth >= o.depth || idx.length < 2 * o.minLeaf || node.p === 0 || node.p === 1) return node;
  const parentImp = impurity(node.p, o.crit);
  let best = null;
  for (const f of FEATURES) {
    if (!o.features.has(f.key)) continue;
    if (f.kind === 'cat') {
      for (let c = 0; c < f.cats.length; c++) {
        let wl = 0, wlp = 0, nl = 0;
        for (const i of idx) if (rows[i][f.key] === c) { wl += w[i]; nl++; if (rows[i].y) wlp += w[i]; }
        const nr = idx.length - nl;
        if (nl < o.minLeaf || nr < o.minLeaf) continue;
        const wr = W - wl, wrp = Wp - wlp;
        const gain = W * parentImp - (wl * impurity(wlp / wl, o.crit) + wr * impurity(wrp / wr, o.crit));
        if (!best || gain > best.gain + 1e-12) best = { f, c, gain };
      }
    } else {
      const s = idx.slice().sort((a, b) => rows[a][f.key] - rows[b][f.key]);
      let wl = 0, wlp = 0;
      for (let k = 0; k < s.length - 1; k++) {
        const i = s[k];
        wl += w[i]; if (rows[i].y) wlp += w[i];
        const v = rows[i][f.key], vn = rows[s[k + 1]][f.key];
        if (v === vn || k + 1 < o.minLeaf || s.length - k - 1 < o.minLeaf) continue;
        const wr = W - wl, wrp = Wp - wlp;
        const gain = W * parentImp - (wl * impurity(wlp / wl, o.crit) + wr * impurity(wrp / wr, o.crit));
        if (!best || gain > best.gain + 1e-12) best = { f, t: (v + vn) / 2, gain };
      }
    }
  }
  if (!best || best.gain <= 1e-9) return node;
  const goesYes = (r) => (best.f.kind === 'cat' ? r[best.f.key] === best.c : r[best.f.key] <= best.t);
  const yes = [], no = [];
  for (const i of idx) (goesYes(rows[i]) ? yes : no).push(i);
  node.split = best; node.test = goesYes;
  node.rule = best.f.kind === 'cat' ? best.f.fmt(best.c) : best.f.fmt(best.t);
  node.yes = fit(rows, w, yes, o, depth + 1);
  node.no = fit(rows, w, no, o, depth + 1);
  return node;
}
const predictP = (node, r) => { while (node.split) node = node.test(r) ? node.yes : node.no; return node.p; };
function weights(rows, idx, balanced) {
  const w = new Float64Array(rows.length).fill(1);
  if (balanced) {
    let pos = 0; for (const i of idx) pos += rows[i].y;
    const neg = idx.length - pos;
    for (const i of idx) w[i] = rows[i].y ? idx.length / (2 * Math.max(1, pos)) : idx.length / (2 * Math.max(1, neg));
  }
  return w;
}
function score(tree, rows, idx) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const i of idx) { const yhat = predictP(tree, rows[i]) >= 0.5 ? 1 : 0, y = rows[i].y; if (yhat && y) tp++; else if (yhat) fp++; else if (y) fn++; else tn++; }
  const n = idx.length || 1;
  return { tp, fp, tn, fn, acc: (tp + tn) / n, prec: tp / Math.max(1, tp + fp), rec: tp / Math.max(1, tp + fn), spec: tn / Math.max(1, tn + fp) };
}
function stratSplit(rows, testFrac, seed) {
  const R = rng(seed);
  const by = [[], []];
  rows.forEach((r, i) => by[r.y].push(i));
  const train = [], test = [];
  for (const g of by) {
    for (let k = g.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [g[k], g[j]] = [g[j], g[k]]; }
    const nt = Math.round(g.length * testFrac);
    test.push(...g.slice(0, nt)); train.push(...g.slice(nt));
  }
  return { train, test };
}
function importance(tree) {
  const imp = Object.fromEntries(FEATURES.map((f) => [f.key, 0]));
  const walk = (n) => { if (!n.split) return; imp[n.split.f.key] += n.split.gain; walk(n.yes); walk(n.no); };
  walk(tree);
  const tot = Object.values(imp).reduce((a, b) => a + b, 0) || 1;
  return FEATURES.map((f) => ({ f, v: imp[f.key] / tot })).sort((a, b) => b.v - a.v);
}
const leaves = (n, out = []) => { if (!n.split) out.push(n); else { leaves(n.yes, out); leaves(n.no, out); } return out; };
const depthOf = (n) => (n.split ? 1 + Math.max(depthOf(n.yes), depthOf(n.no)) : 0);

/* ---------- UI ---------- */
export function initTree() {
  const svg = document.getElementById('tree-svg');
  const crumbs = document.getElementById('ml-crumbs');
  const note = document.getElementById('tree-note');
  const curveSvg = document.getElementById('tree-curve');
  const cmSvg = document.getElementById('ml-cm');
  const impEl = document.getElementById('ml-imp');
  const chipsEl = document.getElementById('ml-features');
  const fig = document.getElementById('tree-fig');
  const $ = (id) => document.getElementById(id);

  const o = { depth: 4, minLeaf: 5, crit: 'gini', balanced: true, testFrac: 0.3, seed: 11, features: new Set(FEATURES.map((f) => f.key)) };
  const rows = makeData();
  let tree = null, split = null, viewRoot = null, trace = false, curveTimer = 0;
  const pathTo = new Map(); // node -> [ancestors...]

  // feature chips
  FEATURES.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ml-chip'; b.textContent = f.label; b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', () => {
      if (o.features.has(f.key)) { if (o.features.size <= 1) return; o.features.delete(f.key); } else o.features.add(f.key);
      b.setAttribute('aria-pressed', String(o.features.has(f.key)));
      retrain(true);
    });
    chipsEl.appendChild(b);
  });

  function retrain(curveToo = false) {
    split = stratSplit(rows, o.testFrac, o.seed);
    const w = weights(rows, split.train, o.balanced);
    tree = fit(rows, w, split.train, o);
    pathTo.clear();
    const walk = (n, anc) => { pathTo.set(n, anc); if (n.split) { walk(n.yes, [...anc, [n, 'yes']]); walk(n.no, [...anc, [n, 'no']]); } };
    walk(tree, []);
    viewRoot = tree;
    renderTree(); renderMetrics();
    if (curveToo) { clearTimeout(curveTimer); curveTimer = setTimeout(renderCurve, 60); }
  }

  /* ----- the tree: four readable levels from the node you're looking at; click to drill in ----- */
  function riskPath() {
    const ls = leaves(tree).filter((l) => l.n >= Math.max(5, o.minLeaf));
    ls.sort((a, b) => b.p - a.p || b.n - a.n);
    return ls[0] || null;
  }
  function renderTree() {
    const Wpx = Math.max(300, svg.clientWidth || 900);
    const levels = Wpx < 560 ? 3 : 4;
    const rowH = 92, H = levels * rowH + 8;
    svg.setAttribute('viewBox', `0 0 ${Wpx} ${H}`);
    svg.style.height = `${H}px`;
    svg.textContent = '';
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'ml-dots', width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 2, cy: 2, r: 1.05, fill: 'var(--ink)' }, pat);
    const hot = trace ? riskPath() : null;
    const onPath = new Set();
    if (hot) { onPath.add(hot); for (const [a] of pathTo.get(hot)) onPath.add(a); }
    const gE = el('g', {}, svg), gN = el('g', {}, svg);
    const draw = (n, lvl, slot, px, py, edge) => {
      const slots = 2 ** lvl, sw = Wpx / slots, cx = sw * (slot + 0.5), y = 6 + lvl * rowH;
      const bw = Math.min(sw - 10, 176), bh = 66;
      if (px !== null) {
        el('path', { d: `M${px},${py} C${px},${py + 22} ${cx},${y - 22} ${cx},${y}`, class: `ml-edge${onPath.has(n) ? ' is-hot' : ''}` }, gE);
        const t = el('text', { x: (px + cx) / 2 + (edge === 'yes' ? -6 : 6), y: (py + y) / 2, class: 'ml-edge-t', 'text-anchor': edge === 'yes' ? 'end' : 'start' }, gE);
        t.textContent = edge;
      }
      const g = el('g', { class: `ml-node${n.split ? ' is-split' : ' is-leaf'}${onPath.has(n) ? ' is-hot' : ''}`, transform: `translate(${cx - bw / 2},${y})` }, gN);
      el('rect', { width: bw, height: bh, class: 'ml-box' }, g);
      if (!n.split) el('rect', { x: 3, y: 3, width: bw - 6, height: bh - 6, class: 'ml-leafline' }, g);
      const title = el('text', { x: 8, y: 19, class: 'ml-rule' }, g);
      const fits = (s) => s.length * 6.6 < bw - 14;
      const rule = n.split ? n.rule : `Leaf: ${n.p >= 0.5 ? 'at risk' : 'healthy'}`;
      title.textContent = fits(rule) ? rule : `${rule.slice(0, Math.max(4, Math.floor((bw - 14) / 6.6) - 1))}…`;
      const sub = el('text', { x: 8, y: 36, class: 'ml-sub' }, g);
      sub.textContent = `n ${n.n} · risk ${Math.round(n.p * 100)}%`;
      el('rect', { x: 8, y: 46, width: bw - 16, height: 10, class: 'ml-bar' }, g);
      el('rect', { x: 8, y: 46, width: Math.max(0.5, (bw - 16) * n.p), height: 10, fill: 'url(#ml-dots)', class: 'ml-barfill' }, g);
      const tip = el('title', {}, g); tip.textContent = `${n.split ? n.rule + '?' : 'Leaf'} ${n.n} patients in training, ${Math.round(n.p * 100)}% at risk`;
      if (n.split) {
        if (lvl === levels - 1) {
          const more = el('text', { x: bw / 2, y: bh + 14, class: 'ml-more', 'text-anchor': 'middle' }, g);
          more.textContent = `+${depthOf(n)} more · open`;
        }
        g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `Open the branch under ${n.rule}`);
        const open = () => { if (n !== viewRoot) { viewRoot = n; renderTree(); } };
        g.addEventListener('click', open);
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
        if (lvl < levels - 1) { draw(n.yes, lvl + 1, slot * 2, cx, y + bh, 'yes'); draw(n.no, lvl + 1, slot * 2 + 1, cx, y + bh, 'no'); }
      }
    };
    draw(viewRoot, 0, 0, null, null, null);
    // breadcrumbs back up the tree
    crumbs.textContent = '';
    const anc = pathTo.get(viewRoot) || [];
    const add = (label, node) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ml-crumb'; b.textContent = label;
      if (node === viewRoot) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { viewRoot = node; renderTree(); });
      crumbs.appendChild(b);
    };
    add(`All ${tree.n} training patients`, tree);
    anc.forEach(([a, side], i) => add(`${a.rule}: ${side}`, i + 1 < anc.length ? anc[i + 1][0] : viewRoot));
    svg.setAttribute('aria-label', `Decision tree, depth ${depthOf(tree)}, ${leaves(tree).length} leaves. Showing ${levels} levels from ${viewRoot === tree ? 'the root' : viewRoot.rule}.`);
  }

  /* ----- metrics, confusion matrix, importance ----- */
  const pct = (v) => `${Math.round(v * 100)}`;
  function renderMetrics() {
    const te = score(tree, rows, split.test), tr = score(tree, rows, split.train);
    roll('ml-acc', pct(te.acc)); roll('ml-prec', pct(te.prec)); roll('ml-rec', pct(te.rec)); roll('ml-spec', pct(te.spec));
    $('ml-train').textContent = `${pct(tr.acc)}%`;
    $('ml-leaves').textContent = `${leaves(tree).length} leaves, depth ${depthOf(tree)}`;
    // confusion matrix
    cmSvg.textContent = '';
    const cells = [[te.tn, 'True healthy'], [te.fp, 'False alarm'], [te.fn, 'Missed'], [te.tp, 'Caught']];
    const max = Math.max(...cells.map((c) => c[0]), 1);
    const defs = el('defs', {}, cmSvg);
    cells.forEach(([v, lab], k) => {
      const x = 44 + (k % 2) * 88, y = 22 + Math.floor(k / 2) * 62;
      const pid = `cm${k}`, pat = el('pattern', { id: pid, width: 5, height: 5, patternUnits: 'userSpaceOnUse' }, defs);
      el('circle', { cx: 2.5, cy: 2.5, r: (0.3 + 2 * Math.sqrt(v / max)).toFixed(2), fill: 'var(--ink)' }, pat);
      el('rect', { x, y, width: 84, height: 58, fill: `url(#${pid})`, stroke: 'var(--ink)', 'stroke-width': 1.2 }, cmSvg);
      el('rect', { x: x + 6, y: y + 8, width: 72, height: 40, fill: 'var(--paper)', stroke: 'var(--ink)' }, cmSvg);
      const t = el('text', { x: x + 42, y: y + 27, 'text-anchor': 'middle', class: 'cm-n' }, cmSvg); t.textContent = v;
      const l = el('text', { x: x + 42, y: y + 42, 'text-anchor': 'middle', class: 'cm-l' }, cmSvg); l.textContent = lab;
    });
    [['Predicted healthy', 86], ['Predicted at risk', 174]].forEach(([s, x]) => { const t = el('text', { x, y: 14, 'text-anchor': 'middle', class: 'cm-ax' }, cmSvg); t.textContent = s; });
    [['Healthy', 51], ['At risk', 113]].forEach(([s, y]) => { const t = el('text', { x: 38, y, 'text-anchor': 'end', class: 'cm-ax' }, cmSvg); t.textContent = s; });
    // importance
    impEl.textContent = '';
    importance(tree).slice(0, 6).forEach(({ f, v }) => {
      const row = document.createElement('div'); row.className = 'imp-row';
      row.innerHTML = `<span class="imp-name"></span><span class="imp-bar"><i style="width:${(v * 100).toFixed(1)}%"></i></span><span class="imp-v">${Math.round(v * 100)}%</span>`;
      row.querySelector('.imp-name').textContent = f.label;
      impEl.appendChild(row);
    });
    const hot = riskPath();
    let txt = `Test accuracy ${pct(te.acc)}% against ${pct(tr.acc)}% on training.`;
    if (tr.acc - te.acc > 0.12) txt += ' The gap says it is memorising the training patients: overfitting.';
    else if (depthOf(tree) <= 2) txt += ' Shallow and general, but it misses structure.';
    else txt += ' Training and test agree reasonably: it generalises.';
    if (trace && hot) {
      const rules = (pathTo.get(hot) || []).map(([a, side]) => (side === 'yes' ? a.rule : `not (${a.rule})`));
      txt = `Highest-risk path: ${rules.join(' → ')} → ${Math.round(hot.p * 100)}% at risk (${hot.n} patients).`;
      if (rules.some((r) => r.includes('none'))) txt += ' Note the silent profile: no chest pain at all.';
    }
    note.textContent = txt;
  }

  /* ----- depth curve: 5-fold cross-validation on the training set at every depth ----- */
  function renderCurve() {
    const folds = 5, tr = split.train.slice();
    const R = rng(o.seed * 7 + 3);
    for (let k = tr.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [tr[k], tr[j]] = [tr[j], tr[k]]; }
    const pts = [];
    for (let d = 1; d <= 15; d++) {
      const oo = { ...o, depth: d };
      let cv = 0, trainAcc = 0;
      for (let f = 0; f < folds; f++) {
        const val = tr.filter((_, i) => i % folds === f), fitIdx = tr.filter((_, i) => i % folds !== f);
        const t = fit(rows, weights(rows, fitIdx, o.balanced), fitIdx, oo);
        cv += score(t, rows, val).acc / folds;
        trainAcc += score(t, rows, fitIdx).acc / folds;
      }
      pts.push({ d, cv, train: trainAcc });
    }
    const Wc = 300, Hc = 150, x0 = 34, y0 = 12, x1 = Wc - 10, y1 = Hc - 26;
    curveSvg.setAttribute('viewBox', `0 0 ${Wc} ${Hc}`);
    curveSvg.textContent = '';
    const X = (d) => x0 + ((d - 1) / 14) * (x1 - x0), Y = (a) => y1 - ((a - 0.5) / 0.5) * (y1 - y0);
    el('line', { x1: x0, y1, x2: x1, y2: y1, class: 'cv-axis' }, curveSvg);
    el('line', { x1: x0, y1: y0, x2: x0, y2: y1, class: 'cv-axis' }, curveSvg);
    [0.5, 0.75, 1].forEach((a) => { const t = el('text', { x: x0 - 4, y: Y(a) + 4, 'text-anchor': 'end', class: 'cv-tick' }, curveSvg); t.textContent = `${Math.round(a * 100)}`; });
    [1, 5, 10, 15].forEach((d) => { const t = el('text', { x: X(d), y: y1 + 14, 'text-anchor': 'middle', class: 'cv-tick' }, curveSvg); t.textContent = d; });
    const line = (key, cls) => el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(''), class: cls }, curveSvg);
    line('train', 'cv-train'); line('cv', 'cv-cv');
    const best = pts.reduce((a, b) => (b.cv > a.cv ? b : a));
    el('line', { x1: X(o.depth), y1: y0, x2: X(o.depth), y2: y1, class: 'cv-now' }, curveSvg);
    el('circle', { cx: X(best.d), cy: Y(best.cv), r: 4, class: 'cv-best' }, curveSvg);
    const lb = el('text', { x: X(best.d) + 6, y: Y(best.cv) - 6, class: 'cv-tick' }, curveSvg); lb.textContent = `best CV, depth ${best.d}`;
    const l1 = el('text', { x: x1, y: Y(pts[14].train) - 6, 'text-anchor': 'end', class: 'cv-tick' }, curveSvg); l1.textContent = 'training';
    const l2 = el('text', { x: x1, y: Y(pts[14].cv) + 14, 'text-anchor': 'end', class: 'cv-tick' }, curveSvg); l2.textContent = 'cross-validated';
  }

  /* ----- controls ----- */
  const depthIn = $('tree-depth'), leafIn = $('ml-minleaf');
  depthIn.addEventListener('input', () => { o.depth = +depthIn.value; roll('tree-depth-roll', o.depth); retrain(false); renderCurveNow(); });
  leafIn.addEventListener('input', () => { o.minLeaf = +leafIn.value; roll('ml-minleaf-roll', o.minLeaf); retrain(true); });
  const renderCurveNow = () => { clearTimeout(curveTimer); curveTimer = setTimeout(renderCurve, 30); };
  const seg = (attr, fn) => fig.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
    fig.querySelectorAll(`[data-${attr}]`).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    fn(b.dataset[attr]); retrain(true);
  }));
  seg('crit', (v) => { o.crit = v; });
  seg('cw', (v) => { o.balanced = v === 'balanced'; });
  seg('split', (v) => { o.testFrac = +v; });
  $('ml-reshuffle').addEventListener('click', () => { o.seed = (o.seed * 31 + 7) % 9973; retrain(true); });
  const traceBtn = $('tree-trace');
  traceBtn.addEventListener('click', () => {
    trace = !trace;
    traceBtn.setAttribute('aria-pressed', String(trace));
    if (trace) { const hot = riskPath(); const anc = hot ? pathTo.get(hot) : []; viewRoot = anc.length > 3 ? anc[anc.length - 3][0] : tree; }
    renderTree(); renderMetrics();
  });
  let rw = 0;
  new ResizeObserver(() => { const w = svg.clientWidth; if (w && Math.abs(w - rw) > 4) { rw = w; renderTree(); } }).observe(svg);
  retrain(true);
}
