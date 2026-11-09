// Volleyball tests: how the CPU handles your serve, and a scripted player that bumps, sets, then
// jumps and spikes or tips on the third touch. Everything is stepped directly (no animation
// frames), so a 30-rally run takes a second or two.
import { ready, summary } from './lib.js';

const DT = 1 / 180;

function run(B, sec, until) {
  for (let i = 0; i < sec / DT; i++) { B.step(DT); if (until && until()) return true; }
  return false;
}

/** Serve n balls at the CPU; how many does it return (and does it ever take four touches)? */
export async function serveReturns(level = 'pro', n = 30) {
  const B = await ready('ball'), { FLOOR } = B.C;
  B.setLevel(level);
  const res = { level, serves: n, returned: 0, cpuError: 0, fourTouch: 0, cpuLabels: {} };
  for (let k = 0; k < n; k++) {
    B.newMatch(); run(B, 0.3); B.play(560 + Math.random() * 380);
    run(B, 2.5, () => B.ball.vy > 0 && B.ball.y > FLOOR - 145); B.play(560 + Math.random() * 380);
    run(B, 0.3, () => B.touches.n > 0);
    let maxN = 0;
    run(B, 5, () => { const t = B.touches; if (t.side === 1) maxN = Math.max(maxN, t.n); return B.state !== 'play' || (t.side === 1 && B.ball.x < 480 && B.ball.vx < 0); });
    for (const p of B.pops) if (p.x > 480) res.cpuLabels[p.text] = (res.cpuLabels[p.text] || 0) + 1;
    if (maxN > 3) res.fourTouch++;
    if (B.state === 'play' && B.ball.x < 480) res.returned++; else if (B.score.you > 0) res.cpuError++;
  }
  return res;
}

/**
 * A scripted player. It serves, moves under the ball, bumps and sets on the ground, then on the
 * third touch jumps (with optional timing error) and attacks.
 *   mode: 'spike' or 'tip'
 *   clickAtTop: wait for the top of the jump before clicking (true), or click as soon as it is near
 *   jumpJitter: random error in the jump timing, seconds
 *   aim: 'short' (just over the net), 'deep', or null (let the game choose)
 * Reports your attack labels and speeds, and what happened to each attack.
 */
export async function attack(level = 'pro', { mode = 'spike', n = 30, clickAtTop = true, jumpJitter = 0.05, aim = null } = {}) {
  const B = await ready('ball'), { FLOOR, G_BALL, T_HIT, AIR_Y } = B.C;
  B.setLevel(level);
  const sim = (t) => { let { x, y, vx, vy } = B.ball; for (let k = 0; k < t * 120; k++) { vy += G_BALL / 120; x += vx / 120; y += vy / 120; } return { x, y, vy }; };
  const landX = (yl) => { let { x, y, vx, vy } = B.ball; for (let k = 0; k < 400; k++) { vy += G_BALL / 120; x += vx / 120; y += vy / 120; if (vy > 0 && y >= yl) return x; } return x; };
  const aimX = () => (aim === 'short' ? 520 + Math.random() * 120 : aim === 'deep' ? 720 + Math.random() * 200 : null);
  const out = { level, mode, attacks: 0, labels: {}, speeds: [], outcome: { point: 0, dug: 0, blocked: 0, touched: 0, returned: 0 }, cpuDives: 0, rallies: n };
  for (let m = 0; m < n; m++) {
    B.newMatch(); run(B, 0.3); B.play(800);
    let jumped = false, jumpAt = null, phase = 0, dove = false;
    for (let i = 0; i < 10 / DT; i++) {
      const you = B.you, t = B.touches, mine = t.side === -1 ? t.n : 0, ball = B.ball;
      if (B.state !== 'play' && B.state !== 'serve') break;
      let tx = you.x;
      if (ball.x < 500 || ball.vx < 0) tx = mine === 2 ? landX(AIR_Y) - 12 : landX(FLOOR - 115) - 8;
      if (B.state === 'serve' || (t.side === -1 && t.n === 0)) tx = you.x;
      tx = Math.min(460, Math.max(40, tx));
      B.keys = [tx < you.x - 6, tx > you.x + 6];
      const zx = you.x + you.face * (you.ground ? 8 : 12), zy = you.y - (you.ground ? 80 : 96), d = Math.hypot(ball.x - zx, ball.y - zy);
      if (B.state === 'play' && ball.x < 517 && phase === 0) {
        if (mine === 2 && you.ground && !jumped && jumpAt === null) {
          const p = sim(T_HIT);
          if (Math.abs(p.x - (you.x + you.face * 12)) < 46 && Math.abs(p.y - AIR_Y) < 46) jumpAt = i + Math.round(((Math.random() - 0.5) * 2 * jumpJitter) / DT);
        }
        if (jumpAt !== null && i >= jumpAt && !jumped) { B.hop(); jumped = true; }
        if (you.ground && d < 70 && ball.vy > -150 && you.swing <= 0 && you.cool <= 0 && mine < 2) B.play(800);
        const go = clickAtTop ? d < 105 && you.vy > -220 : d < 110;
        if (!you.ground && jumped && go && you.swing <= 0) { if (mode === 'tip') B.second(aimX()); else B.play(aimX()); phase = 1; }
      }
      if (B.state === 'play' && t.side === -1 && t.n === 0 && ball.vy > 0 && ball.y > FLOOR - 155 && you.swing <= 0) B.play(800);
      B.step(DT);
      if (phase === 2 && B.cpu.dive > 0 && !dove) { dove = true; out.cpuDives++; }
      const fresh = B.pops.filter((p) => p.t <= DT * 1.01);
      if (phase === 1) {
        const mineLbl = fresh.find((p) => p.x < 520 && /SPIKE|HIT|TIP|ROLL|EARLY|LATE/.test(p.text));
        if (mineLbl) { out.attacks++; out.labels[mineLbl.text] = (out.labels[mineLbl.text] || 0) + 1; out.speeds.push(Math.hypot(B.ball.vx, B.ball.vy)); phase = 2; }
      } else if (phase === 2) {
        const f = fresh.find((p) => p.x > 470);
        if (f) { const k = f.text === 'DIG!' ? 'dug' : f.text === 'BLOCK!' ? 'blocked' : f.text === 'TOUCHED' ? 'touched' : 'returned'; out.outcome[k]++; phase = 3; }
        else if (B.state === 'point') { if (B.score.you > 0) out.outcome.point++; phase = 3; }
      }
    }
    B.keys = [false, false];
  }
  out.speeds = summary(out.speeds);
  return out;
}

/** Find a moment (e.g. your slow-motion jump, a spike, a block) and save the canvas with snap(). */
export async function capture(name, when = (B) => B.drama && B.drama.slow) {
  const { snap } = await import('./lib.js');
  const B = await ready('ball'), { FLOOR, G_BALL, T_HIT, AIR_Y } = B.C;
  const sim = (t) => { let { x, y, vx, vy } = B.ball; for (let k = 0; k < t * 120; k++) { vy += G_BALL / 120; x += vx / 120; y += vy / 120; } return { x, y, vy }; };
  const landX = (yl) => { let { x, y, vx, vy } = B.ball; for (let k = 0; k < 400; k++) { vy += G_BALL / 120; x += vx / 120; y += vy / 120; if (vy > 0 && y >= yl) return x; } return x; };
  for (let m = 0; m < 30; m++) {
    B.newMatch(); run(B, 0.3); B.play(800);
    let jumped = false;
    for (let i = 0; i < 10 / DT; i++) {
      const you = B.you, t = B.touches, mine = t.side === -1 ? t.n : 0, ball = B.ball;
      if (B.state !== 'play' && B.state !== 'serve') break;
      let tx = you.x; if (ball.x < 500 || ball.vx < 0) tx = mine === 2 ? landX(AIR_Y) - 12 : landX(FLOOR - 115) - 8;
      if (B.state === 'serve' || (t.side === -1 && t.n === 0)) tx = you.x;
      tx = Math.min(460, Math.max(40, tx)); B.keys = [tx < you.x - 6, tx > you.x + 6];
      const zx = you.x + you.face * (you.ground ? 8 : 12), zy = you.y - (you.ground ? 80 : 96), d = Math.hypot(ball.x - zx, ball.y - zy);
      if (B.state === 'play' && ball.x < 517) {
        if (mine === 2 && you.ground && !jumped) { const p = sim(T_HIT); if (Math.abs(p.x - (you.x + you.face * 12)) < 46 && Math.abs(p.y - AIR_Y) < 46) { B.hop(); jumped = true; } }
        if (you.ground && d < 70 && ball.vy > -150 && you.swing <= 0 && you.cool <= 0 && mine < 2) B.play(800);
        if (!you.ground && jumped && d < 105 && you.vy > -220 && you.swing <= 0) B.play(820);
      }
      if (B.state === 'play' && t.side === -1 && t.n === 0 && ball.vy > 0 && ball.y > FLOOR - 155 && you.swing <= 0) B.play(800);
      if (t.side === 1) jumped = false;
      B.step(DT);
      if (when(B)) { B.keys = [false, false]; B.draw(); return snap(name, B.canvas); }
    }
  }
  B.keys = [false, false];
  return 'moment not found';
}
