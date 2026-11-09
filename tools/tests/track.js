// Test-track tests: the barriers (do any cross, how close do different stretches get, how narrow
// does the road get), a crash test that fires the car into the walls all round the lap, and a
// measurement of the engine sound (level and where its energy sits) at a few rev points.
import { ready, muted, crosses, cyc, summary } from './lib.js';

/** Wall geometry: crossings (should be 0), closest walls of different stretches, narrowest road. */
export async function walls() {
  const T = await ready('track'), { P, n, WALL } = T;
  const pts = (A, side) => P.map((p, i) => [p.x + p.rx * side * A[i], p.z + p.rz * side * A[i]]);
  const segs = [];
  for (const [W, tag] of [[pts(WALL.L, -1), 'L'], [pts(WALL.R, 1), 'R']]) for (let i = 0; i < n; i++) segs.push({ a: W[i], b: W[(i + 1) % n], tag, i });
  const CELL = 4, grid = new Map();
  segs.forEach((s, si) => { for (const q of [s.a, s.b]) { const k = `${Math.floor(q[0] / CELL)},${Math.floor(q[1] / CELL)}`; if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(si); } });
  let crossings = 0, minGap = Infinity; const where = [];
  segs.forEach((s, si) => {
    const cx = Math.floor(s.a[0] / CELL), cz = Math.floor(s.a[1] / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const set = grid.get(`${gx},${gz}`); if (!set) continue;
      for (const sj of set) {
        const o = segs[sj], d = cyc(o.i, s.i, n);
        if (sj > si && !(o.tag === s.tag && d <= 1) && crosses(s.a, s.b, o.a, o.b)) { crossings++; if (where.length < 10) where.push(`${s.tag}${s.i}×${o.tag}${o.i}`); }
        if (d > 20) minGap = Math.min(minGap, Math.hypot(s.a[0] - o.a[0], s.a[1] - o.a[1]));
      }
    }
  });
  let narrowest = Infinity, at = -1, spMin = Infinity, spMax = 0;
  for (let i = 0; i < n; i++) {
    const w = P[i].hl + P[i].hr; if (w < narrowest) { narrowest = w; at = i; }
    const q = P[(i + 1) % n], sp = Math.hypot(q.x - P[i].x, q.z - P[i].z); spMin = Math.min(spMin, sp); spMax = Math.max(spMax, sp);
  }
  return { samples: n, sampleSpacing: [+spMin.toFixed(3), +spMax.toFixed(3)], crossings, where, closestWallsOfDifferentStretches: +minGap.toFixed(2), narrowestRoad: +narrowest.toFixed(2), narrowestAt: at };
}

/** Fire the car into the walls at every `every`-th sample, both sides, three angles, three speeds. */
export async function crash({ every = 7, speeds = [15, 35, 55], angles = [0.5, 1.0, 1.5] } = {}) {
  const T = await ready('track'), { P, n, WALL } = T;
  const nearestAll = (x, z) => { let bi = 0, bd = Infinity; for (let j = 0; j < n; j++) { const d = (P[j].x - x) ** 2 + (P[j].z - z) ** 2; if (d < bd) { bd = d; bi = j; } } return bi; };
  let runs = 0, through = 0, jumped = 0; const fails = [];
  for (let i = 0; i < n; i += every) for (const side of [-1, 1]) for (const ang of angles) for (const speed of speeds) {
    runs++;
    T.placeAt(i);
    const p = P[i];
    Object.assign(T.car, { psi: Math.atan2(p.tz, p.tx) + side * ang, vx: speed, vy: 0, r: 0 });
    let hint = i, worst = 0, jump = false;
    for (let k = 0; k < 120; k++) {
      T.sub(1 / 120);
      const l = T.locateNear(T.car.x, T.car.z, hint); hint = l.i;
      worst = Math.max(worst, Math.abs(l.off) - (l.off >= 0 ? WALL.R[l.i] : WALL.L[l.i]));
      if (k % 15 === 14 && cyc(nearestAll(T.car.x, T.car.z), l.i, n) > 30 && l.d > 2) jump = true;
    }
    if (worst > 0.3) { through++; if (fails.length < 10) fails.push(`through at sample ${i}, side ${side}, angle ${ang}, speed ${speed} (${worst.toFixed(2)} past)`); }
    if (jump) { jumped++; if (fails.length < 10) fails.push(`jumped to another stretch at sample ${i}, side ${side}, angle ${ang}, speed ${speed}`); }
  }
  T.placeAt(n - 14);
  return { runs, wentThroughWall: through, jumpedToOtherStretch: jumped, fails };
}

/**
 * Engine sound, measured with the page muted: level, spectral centroid and how the energy splits
 * across bands at a few rev points. Needs one real click on the page first (browsers keep audio
 * off until then). mode: 'rec' (the recorded V10) or 'synth'.
 */
export async function engineSound(mode = 'rec', points = [[4000, 0], [9000, 1], [14000, 1], [18400, 1], [15000, 0]]) {
  const T = await ready('track');
  return muted(async (snd) => {
    if (!snd.liveCtx()) return { error: 'Audio is still locked: click anywhere on the page once, then run this again.' };
    const rs = new T.RaceSound(); rs.setEngine(mode); rs.start();
    for (let i = 0; i < 60 && mode === 'rec' && !rs.recSrc; i++) await new Promise((r) => setTimeout(r, 50));
    const ac = rs.ac, an = ac.createAnalyser(); an.fftSize = 8192; rs.out.connect(an);
    const fd = new Float32Array(an.frequencyBinCount), td = new Float32Array(an.fftSize), hz = ac.sampleRate / an.fftSize;
    const rows = [];
    for (const [rpm, thr] of points) {
      for (let i = 0; i < 5; i++) { rs.update(rpm, thr, 0, 0, false); await new Promise((r) => setTimeout(r, 70)); }
      an.getFloatFrequencyData(fd); an.getFloatTimeDomainData(td);
      let ss = 0; for (const v of td) ss += v * v;
      const band = (lo, hi) => { let e = 0; for (let i = Math.floor(lo / hz); i < Math.min(fd.length, hi / hz); i++) e += 10 ** (fd[i] / 10); return e; };
      const b = [band(20, 300), band(300, 1500), band(1500, 5000), band(5000, 16000)], tot = b.reduce((x, y) => x + y, 0) || 1;
      let num = 0, den = 0; for (let i = 1; i < fd.length; i++) { const e = 10 ** (fd[i] / 10); num += e * i * hz; den += e; }
      rows.push(`${rpm} rpm, throttle ${thr}: ${(10 * Math.log10(ss / td.length)).toFixed(1)} dB, centroid ${Math.round(num / den)} Hz, <300 / 300-1.5k / 1.5-5k / >5k = ${b.map((v) => `${Math.round((100 * v) / tot)}%`).join(' / ')}${rs.recSrc && mode === 'rec' ? `, loop rate ${rs.recSrc.playbackRate.value.toFixed(2)}` : ''}`);
    }
    rs.stop();
    return { mode, recordingLoaded: !!rs.recSrc, rows };
  });
}

export { summary };
