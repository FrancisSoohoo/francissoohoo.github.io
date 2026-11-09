// Web Audio: one master bus for the whole page (volume slider + limiter), a synthesised
// parallel-twin engine and a simple piano voice.

let ctx = null, busIn = null, master = null;
const VOL_KEY = 'soohoo-volume';
let volume = 55, muted = false;
try { const v = localStorage.getItem(VOL_KEY); if (v !== null && !Number.isNaN(+v)) volume = Math.max(0, Math.min(100, +v)); } catch { /* storage blocked */ }
try { muted = localStorage.getItem(`${VOL_KEY}-muted`) === '1'; } catch { /* storage blocked */ }
const listeners = new Set();
// perceptual curve: the slider's middle sounds like the middle
const gainFor = () => (muted ? 0 : Math.pow(volume / 100, 2));

export function audioCtx() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C({ latencyHint: 'interactive' }); } catch { ctx = new C(); }
    // every sound on the page meets here: a gentle limiter so stacked sounds never clip, then the volume
    busIn = ctx.createGain(); busIn.gain.value = 1;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 10; lim.attack.value = 0.002; lim.release.value = 0.12;
    master = ctx.createGain(); master.gain.value = gainFor();
    busIn.connect(lim).connect(master).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** Where every module connects its sound (instead of ctx.destination). */
export function out() { return audioCtx() ? busIn : null; }
/** The audio context only if it is already running (never creates one, never waits on a resume). */
export const liveCtx = () => (ctx && ctx.state === 'running' ? ctx : null);

export const getVolume = () => volume;
export const isMuted = () => muted;
export function setVolume(v, mute = muted) {
  volume = Math.max(0, Math.min(100, Math.round(v)));
  muted = mute;
  try { localStorage.setItem(VOL_KEY, String(volume)); localStorage.setItem(`${VOL_KEY}-muted`, muted ? '1' : '0'); } catch { /* storage blocked */ }
  if (master) master.gain.setTargetAtTime(gainFor(), ctx.currentTime, 0.03);
  listeners.forEach((fn) => fn(volume, muted));
}
export function onVolume(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Browsers only let audio start after a click or key press. Wake the audio engine on the very first
// one anywhere on the page, so later sounds (even ones caused by just moving the mouse) play at once.
['pointerdown', 'keydown', 'touchend'].forEach((type) => window.addEventListener(type, () => audioCtx(), { capture: true, passive: true }));

function shaperCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export class EngineSound {
  constructor() { this.on = true; this.ready = false; }

  build() {
    if (this.ready) return true;
    const c = audioCtx();
    if (!c) return false;
    this.c = c;

    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    // the waveshaper runs close to full scale, so trim hard before the page bus (it was far too loud)
    const trim = c.createGain(); trim.gain.value = 0.32;
    this.master.connect(comp).connect(trim).connect(out());

    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 500; this.lp.Q.value = 1.1;
    const shaper = c.createWaveShaper(); shaper.curve = shaperCurve(5); shaper.oversample = '2x';
    this.amp = c.createGain(); this.amp.gain.value = 0.55;
    this.amp.connect(shaper).connect(this.lp).connect(this.master);

    const osc = (type, g) => {
      const o = c.createOscillator(); o.type = type;
      const gn = c.createGain(); gn.gain.value = g;
      o.connect(gn).connect(this.amp); o.start();
      return o;
    };
    this.o1 = osc('sawtooth', 0.5);   // firing frequency
    this.o2 = osc('square', 0.32);    // half order: the uneven twin beat
    this.o3 = osc('sawtooth', 0.16);  // 2nd order
    this.o3.detune.value = 9;

    // chug: amplitude modulation at the 4-stroke cycle rate
    this.lfo = c.createOscillator(); this.lfo.type = 'square';
    this.lfoGain = c.createGain(); this.lfoGain.gain.value = 0.25;
    this.lfo.connect(this.lfoGain).connect(this.amp.gain); this.lfo.start();

    // intake / mechanical noise
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    this.bp = c.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.frequency.value = 900; this.bp.Q.value = 0.8;
    this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
    noise.connect(this.bp).connect(this.noiseGain).connect(this.master); noise.start();

    // starter motor whine
    this.starter = c.createOscillator(); this.starter.type = 'triangle'; this.starter.frequency.value = 160;
    this.starterGain = c.createGain(); this.starterGain.gain.value = 0;
    this.starter.connect(this.starterGain).connect(this.master); this.starter.start();

    this.ready = true;
    return true;
  }

  update(rpm, throttle, state) {
    if (!this.ready) return;
    const t = this.c.currentTime, k = 0.035;
    const f = Math.max(rpm, 30) / 60; // twin four-stroke: one firing per crank revolution
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f / 2, t, k);
    this.o3.frequency.setTargetAtTime(f * 2, t, k);
    this.lfo.frequency.setTargetAtTime(f / 2, t, k);
    this.lfoGain.gain.setTargetAtTime(state === 'running' ? 0.3 * (1 - throttle * 0.7) : 0.4, t, k);
    this.lp.frequency.setTargetAtTime(260 + rpm * 0.2 + throttle * 1100, t, k);
    this.bp.frequency.setTargetAtTime(700 + rpm * 0.12, t, k);

    let vol = 0, noise = 0, starter = 0;
    if (state === 'cranking') { vol = 0.07; noise = 0.012; starter = 0.05; }
    else if (state === 'running') { vol = 0.13 + throttle * 0.13; noise = 0.008 + throttle * 0.03; }
    if (!this.on) { vol = 0; noise = 0; starter = 0; }
    this.master.gain.setTargetAtTime(vol > 0 ? 1 : 0, t, state === 'off' ? 0.25 : 0.05);
    this.amp.gain.setTargetAtTime(vol * 4.2, t, 0.15);
    this.noiseGain.gain.setTargetAtTime(noise, t, 0.05);
    this.starterGain.gain.setTargetAtTime(starter, t, 0.12); // the starter fades out as it catches
    this.starter.frequency.setTargetAtTime(150 + Math.sin(t * 40) * 12, t, 0.01);
  }

  /** Kill switch: fade everything out fast. */
  stopNow() {
    if (!this.ready) return;
    const t = this.c.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.04);
    this.starterGain.gain.setTargetAtTime(0, t, 0.02);
  }

  /** Brief ignition cut for the rev limiter. */
  cut() {
    if (!this.ready || !this.on) return;
    const t = this.c.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.25, t);
    this.master.gain.setTargetAtTime(1, t + 0.03, 0.02);
  }
}

/** All piano voices run through one bus, so a demo can be silenced at once. */
let bus = null;
function pianoBus(c) {
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = 1;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    bus.connect(comp).connect(out());
  }
  return bus;
}

/** A plucked-hammer piano-ish voice. `at` schedules it on the audio clock; `ring` lengthens the decay. */
export function pianoNote(freq, vel = 1, at = 0, ring = 1) {
  const c = audioCtx();
  if (!c) return;
  const t = Math.max(c.currentTime, at || 0);
  const len = 2.8 * ring;
  const out = c.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.24 * vel, t + 0.004);
  out.gain.exponentialRampToValueAtTime(0.0006, t + len);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, freq * (5 + 5 * vel)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.6), t + 1.1 * ring);
  out.connect(lp).connect(pianoBus(c));
  const partials = [1, 0.55, 0.3, 0.16, 0.1, 0.05];
  partials.forEach((a, i) => {
    const n = i + 1;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * n * (1 + 0.00035 * n * n);
    const g = c.createGain();
    g.gain.setValueAtTime(a, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (2.6 * ring) / (1 + i * 0.7));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.1);
  });
}

/** Damp everything ringing on the piano bus (the demo's Stop). */
export function pianoDamp() {
  const c = audioCtx();
  if (!c || !bus) return;
  const old = bus, t = c.currentTime;
  bus = null; // new notes get a fresh bus; the old one fades out with whatever is still ringing
  old.gain.cancelScheduledValues(t);
  old.gain.setValueAtTime(old.gain.value, t);
  old.gain.linearRampToValueAtTime(0, t + 0.15);
  setTimeout(() => old.disconnect(), 400);
}
