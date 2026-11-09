// Run the whole suite and get back one compact summary.
//   const t = await import('/tools/tests/run.js'); await t.all();          // about 20-40 s
//   await t.all({ quick: true });                                          // a few seconds
// Open the page with ?debug first. The sound tests (track.engineSound, cover.sweep) are not in
// here because they need one real click on the page; run them on their own.
import * as track from './track.js';
import * as volley from './volley.js';
import * as engines from './engines.js';
import * as cover from './cover.js';

export async function all({ quick = false } = {}) {
  const t0 = performance.now(), n = quick ? 12 : 30, out = {};
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e.message || e) }; } };
  await step('walls', () => track.walls());
  await step('crash', () => track.crash({ every: quick ? 20 : 7 }));
  await step('engineRevs', () => engines.engine());
  await step('flywheelRevs', () => engines.flywheel());
  await step('coverSettle', () => cover.settle());
  for (const lvl of ['rookie', 'pro', 'advanced']) await step(`serve_${lvl}`, () => volley.serveReturns(lvl, n));
  await step('spikes_pro', () => volley.attack('pro', { mode: 'spike', n }));
  await step('spikes_pro_casual', () => volley.attack('pro', { mode: 'spike', n, clickAtTop: false, jumpJitter: 0.15 }));
  await step('tips_pro', () => volley.attack('pro', { mode: 'tip', n }));
  out.seconds = +((performance.now() - t0) / 1000).toFixed(1);
  return out;
}

export { track, volley, engines, cover };
