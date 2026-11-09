// Cover tests: do all the parts settle inside the bin (none on the lid, under the floor or under the
// label), and does sweeping the pointer through the resting pile make sound straight away?
import { ready, spin } from './lib.js';

function census(C) {
  const b = C.bin, L = C.labelBox, out = { total: 0, inBin: 0, aboveLid: 0, underFloor: 0, underLabel: 0, outside: 0, asleep: 0 };
  for (const p of C.parts()) {
    out.total++; if (p.isSleeping) out.asleep++;
    const { x, y } = p.position;
    if (y < b.y0 - 5) out.aboveLid++;
    else if (p.bounds.max.y > b.y1 + 6) out.underFloor++;
    else if (L && x > L.x0 && x < L.x1 && y > L.y0 + 2) out.underLabel++;
    else if (p.bounds.min.x < b.x0 - 6 || p.bounds.max.x > b.x1 + 6) out.outside++;
    else out.inBin++;
  }
  return out;
}

/** Let the bin settle for ~10 s of physics and count where every part ended up. */
export async function settle(steps = 600) {
  const C = await ready('cover');
  C.step(steps);
  return census(C);
}

/** Throw every part hard at the floor and the label, several times; worst counts seen while flying. */
export async function hurl(rounds = 5) {
  const C = await ready('cover'), { Body, Sleeping } = C.M;
  C.step(300);
  const worst = { underFloor: 0, underLabel: 0, outside: 0 };
  for (let k = 0; k < rounds; k++) {
    for (const p of C.parts()) { Sleeping.set(p, false); Body.setPosition(p, { x: p.position.x, y: Math.min(p.position.y, C.labelBox.y0 - 80) }); Body.setVelocity(p, { x: (Math.random() - 0.5) * 20, y: 28 }); }
    for (let s = 0; s < 240; s++) { C.step(1); const c = census(C); for (const key in worst) worst[key] = Math.max(worst[key], c[key]); }
  }
  C.step(300);
  return { worstWhileFlying: worst, settled: census(C) };
}

/**
 * Sweep a pointer through the resting pile and count the sounds started per physics step.
 * Needs one real click on the page first (browsers keep audio off until then).
 */
export async function sweep() {
  const C = await ready('cover');
  const snd = await import('/js/sound.js'), ac = snd.liveCtx();
  if (!ac) return { error: 'Audio is still locked: click anywhere on the page once, then run this again.' };
  C.step(900); spin(400);
  const proto = Object.getPrototypeOf(ac), orig = proto.createOscillator; let started = 0;
  proto.createOscillator = function () { started++; return orig.call(this); };
  const b = C.bin, y = b.y1 - C.unit * 3.5, perStep = [];
  try {
    for (let i = 0; i < 40; i++) {
      const before = started;
      Object.assign(C.ptr, { x: b.x0 + (b.x1 - b.x0) * (0.1 + (0.8 * i) / 40), y, vx: 1200, vy: 0, inside: true });
      C.step(1); perStep.push(started - before); spin(16);
    }
  } finally { proto.createOscillator = orig; }
  return { oscillatorsStarted: started, stepsWithSound: perStep.filter((v) => v > 0).length, firstSoundAtStep: perStep.findIndex((v) => v > 0), perStep: perStep.join('') };
}
