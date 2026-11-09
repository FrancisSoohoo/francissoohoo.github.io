// Rev-up tests for the hero engine (Fig. 001) and the flywheel (Fig. 002): the revs at set times
// after pressing, and the biggest jump between two frames (a smooth rev-up keeps it small).
import { ready, muted } from './lib.js';

const FRAME = 1 / 60;

/** Hold the engine's start button: crank, catch, then hold to rev. */
export async function engine({ holdAfterCatch = 2 } = {}) {
  const E = await ready('engine');
  return muted(() => {
    E.stop(); E.release();
    E.press();
    const at = {}, marks = [0.5, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0];
    let t = 0, prev = E.rpm, biggest = 0, caughtAt = null;
    while (t < 1.15 + holdAfterCatch + 0.4) {
      E.stepRevs(FRAME); t += FRAME;
      if (E.state === 'running' && caughtAt === null) caughtAt = +t.toFixed(2);
      biggest = Math.max(biggest, Math.abs(E.rpm - prev)); prev = E.rpm;
      for (const m of marks) if (Math.abs(t - m) < FRAME / 2) at[`${m}s`] = Math.round(E.rpm);
    }
    E.release(); E.stop();
    return { caughtAt, rpmAt: at, biggestJumpPerFrame: Math.round(biggest) };
  });
}

/** Hold the flywheel's rev button from rest. */
export async function flywheel({ hold = 3 } = {}) {
  const F = await ready('flywheel');
  return muted(() => {
    F.stop(); F.release(); F.rpm = 0;
    F.press();
    const at = {}, marks = [0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0];
    let t = 0, prev = 0, biggest = 0;
    while (t < hold) {
      F.stepRevs(FRAME); t += FRAME;
      biggest = Math.max(biggest, Math.abs(F.rpm - prev)); prev = F.rpm;
      for (const m of marks) if (Math.abs(t - m) < FRAME / 2) at[`${m}s`] = Math.round(F.rpm);
    }
    F.release(); F.stop();
    return { rpmAt: at, biggestJumpPerFrame: Math.round(biggest) };
  });
}
