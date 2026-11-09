// Shared helpers for the browser test scripts. The page must be open with ?debug, which makes each
// interactive part hand its internals to window.__soohoo (see expose() in js/util.js).

export const hooks = () => window.__soohoo || {};

/** Wait for a part to load and expose itself (with ?debug every part loads straight away). */
export async function ready(name, timeout = 10000) {
  const t0 = performance.now();
  while (!hooks()[name]) {
    if (!new URLSearchParams(location.search).has('debug')) throw new Error('Open the page with ?debug first, e.g. http://localhost:5173/?debug');
    if (performance.now() - t0 > timeout) throw new Error(`"${name}" did not load within ${timeout / 1000} s`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return hooks()[name];
}

/** Run fn with the page's sound muted, restoring the visitor's setting afterwards. */
export async function muted(fn) {
  const snd = await import('/js/sound.js');
  const vol = snd.getVolume(), was = snd.isMuted();
  snd.setVolume(vol, true);
  try { return await fn(snd); } finally { snd.setVolume(vol, was); }
}

/** Busy-wait (timers are throttled in a hidden tab; the audio clock still runs). */
export const spin = (ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* wait */ } };

export const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
export const summary = (a) => (a.length ? { count: a.length, min: Math.round(Math.min(...a)), median: Math.round(median(a)), max: Math.round(Math.max(...a)) } : { count: 0 });
export const cyc = (a, b, n) => { const d = Math.abs(a - b); return Math.min(d, n - d); };

/** Segment intersection (proper crossing only). */
export function crosses(a, b, c, d) {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]), d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Save a canvas as a JPEG on disk, for looking at when the preview pane is hidden and screenshots
 * fail. Needs the receiver running: powershell -ExecutionPolicy Bypass -File tools/snap.ps1
 * (it writes into tools/snaps/).
 */
export async function snap(name, canvas, quality = 0.88) {
  await fetch(`http://localhost:5179/${name}`, { method: 'POST', mode: 'no-cors', body: canvas.toDataURL('image/jpeg', quality) });
  return `tools/snaps/${name}.jpg`;
}
