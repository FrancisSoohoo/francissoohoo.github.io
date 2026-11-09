// Off-spec parts: a playable piano (with a bigger keyboard and a Liebestraum demo)
// and a bean volleyball game against a CPU bean.
import { pianoNote, audioCtx, out as busOut } from './sound.js';
import { roll, fitCanvas, whileVisible, clamp, INK, PAPER, ZINC, coarse, expose } from './util.js';

/* =====================================================================
   Piano
   ===================================================================== */
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const KEYS = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
const KEYLABEL = { 0: 'A', 1: 'W', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T', 7: 'G', 8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K', 13: 'O', 14: 'L', 15: 'P', 16: ';', 17: "'" };
const RANGE = { small: [60, 83], big: [24, 84] }; // C4–B5, or C1–C6
const C4 = 60;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const nameOf = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const NOTE = (s) => {
  const m = /^([A-G])(b|#)?(\d)$/.exec(s);
  return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
};

function initPiano() {
  const piano = document.getElementById('piano');
  const scroller = document.getElementById('piano-scroll');
  const fig = document.getElementById('piano-fig');
  const nameEl = document.getElementById('note-name');
  const rangeEl = document.getElementById('piano-range');
  const sizeBtn = document.getElementById('piano-size');
  const demoBtn = document.getElementById('piano-demo');
  const demoLabel = document.getElementById('piano-demo-label');
  const demoIco = document.getElementById('piano-demo-ico');
  const statusEl = document.getElementById('piano-demo-status');
  let els = new Map(); // midi -> key element
  let big = false;
  const held = new Map();

  function build() {
    const [lo, hi] = big ? RANGE.big : RANGE.small;
    piano.textContent = '';
    els = new Map();
    let whites = 0;
    for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites++;
    const blackW = (0.62 / whites) * 100;
    let wi = 0;
    const blacks = [];
    for (let m = lo; m <= hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.dataset.m = m;
      b.setAttribute('aria-label', nameOf(m));
      const s = m - C4;
      if (!coarse && KEYLABEL[s] !== undefined) b.textContent = KEYLABEL[s];
      else if (big && m % 12 === 0) { b.textContent = `C${Math.floor(m / 12) - 1}`; b.classList.add('is-octave'); }
      if (black) {
        b.className += ' key-b';
        b.style.left = `calc(${(wi / whites) * 100}% - ${blackW / 2}%)`;
        b.style.width = `${blackW}%`;
        blacks.push(b);
      } else {
        b.className += ' key-w';
        piano.appendChild(b);
        wi++;
      }
      els.set(m, b);
    }
    blacks.forEach((b) => piano.appendChild(b));
    rangeEl.textContent = big ? 'Keyboard, C1 to C6' : 'Keyboard, C4 to B5';
    piano.setAttribute('aria-label', big ? 'Playable piano keyboard, five octaves' : 'Playable piano keyboard, two octaves');
  }

  function setBig(v) {
    if (big === v) return;
    big = v;
    fig.classList.toggle('is-big', big);
    sizeBtn.setAttribute('aria-pressed', String(big));
    sizeBtn.textContent = big ? 'Smaller keyboard' : 'Bigger keyboard';
    build();
    if (big) requestAnimationFrame(() => {
      const k = els.get(C4);
      if (k && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = k.offsetLeft - scroller.clientWidth / 2;
    });
  }

  const press = (m, cls = 'is-down') => {
    const k = els.get(m);
    if (!k) return;
    const key = `${m}|${cls}`;
    held.set(key, (held.get(key) || 0) + 1);
    k.classList.add(cls);
  };
  const lift = (m, cls = 'is-down') => {
    const key = `${m}|${cls}`, n = (held.get(key) || 0) - 1;
    if (n > 0) { held.set(key, n); return; }
    held.delete(key);
    els.get(m)?.classList.remove(cls);
  };
  const liftAll = () => { held.clear(); els.forEach((k) => k.classList.remove('is-down', 'is-soft')); };

  const play = (m) => {
    pianoNote(mtof(m));
    nameEl.textContent = nameOf(m);
    press(m);
  };

  let down = false, lastM = null;
  piano.addEventListener('pointerdown', (ev) => {
    const k = ev.target.closest('button');
    if (!k) return;
    ev.preventDefault();
    piano.focus({ preventScroll: true });
    down = true; lastM = +k.dataset.m; play(lastM);
  });
  piano.addEventListener('pointerover', (ev) => {
    if (!down) return;
    const k = ev.target.closest('button');
    if (!k || +k.dataset.m === lastM) return;
    if (lastM !== null) lift(lastM);
    lastM = +k.dataset.m; play(lastM);
  });
  const up = () => { down = false; if (lastM !== null) lift(lastM); lastM = null; };
  window.addEventListener('pointerup', up);
  piano.addEventListener('pointercancel', up);
  piano.addEventListener('keydown', (ev) => {
    const s = KEYS[ev.code];
    if (s === undefined || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    if (!ev.repeat) play(C4 + s);
  });
  piano.addEventListener('keyup', (ev) => { const s = KEYS[ev.code]; if (s !== undefined) lift(C4 + s); });
  piano.addEventListener('blur', () => { if (audio.paused) liftAll(); });

  sizeBtn.addEventListener('click', () => setBig(!big));

  /* ---------- the recording: a real performance, its live spectrum lighting the keys ---------- */
  const RECS = {
    clean: {
      src: ['https://upload.wikimedia.org/wikipedia/commons/transcoded/0/02/Franz_Liszt_-_Liebestraum%2C_Ab_Major.ogg/Franz_Liszt_-_Liebestraum%2C_Ab_Major.ogg.mp3', 'https://upload.wikimedia.org/wikipedia/commons/0/02/Franz_Liszt_-_Liebestraum%2C_Ab_Major.ogg'],
      label: 'Recording: Al Goldstein collection, CC BY-SA 2.0',
    },
  };
  const progress = document.getElementById('piano-progress');
  const timeEl = document.getElementById('piano-time');
  const audio = new Audio();
  audio.crossOrigin = 'anonymous'; audio.preload = 'none';
  let rec = 'clean', srcIdx = 0, analyser = null, spectrum = null, vizRaf = 0;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const setSrc = (key) => { rec = key; srcIdx = 0; audio.src = RECS[key].src[0]; };
  function setDemoUi(playing) {
    demoLabel.textContent = playing ? 'Pause' : 'Play Liebestraum No. 3';
    demoIco.setAttribute('d', playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5v11l9-5.5z');
    demoBtn.setAttribute('aria-pressed', String(playing));
    fig.classList.toggle('is-playing', playing);
  }
  function graph() {
    if (analyser) return;
    const ac = audioCtx();
    if (!ac) return;
    try {
      const node = ac.createMediaElementSource(audio);
      analyser = ac.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55;
      node.connect(analyser); analyser.connect(busOut());
      spectrum = new Float32Array(analyser.frequencyBinCount);
    } catch (e) { analyser = null; }
  }
  function viz() {
    vizRaf = 0;
    if (audio.duration) { progress.value = Math.round((audio.currentTime / audio.duration) * 1000); timeEl.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`; }
    if (audio.paused) return;
    if (analyser) {
      analyser.getFloatFrequencyData(spectrum);
      const bin = audioCtx().sampleRate / analyser.fftSize, [lo, hi] = big ? RANGE.big : RANGE.small, mags = [];
      let peak = -200;
      for (let m = lo; m <= hi; m++) {
        const i = Math.round(mtof(m) / bin); let v = -200;
        for (let k = i - 1; k <= i + 1; k++) v = Math.max(v, spectrum[k] ?? -200);
        mags.push(v); peak = Math.max(peak, v);
      }
      const thr = Math.max(peak - 13, -64);
      let best = null, bestV = -200;
      mags.forEach((v, j) => {
        const k = els.get(lo + j);
        if (!k) return;
        const on = v > thr && v >= (mags[j - 1] ?? -200) && v >= (mags[j + 1] ?? -200);
        k.classList.toggle('is-soft', on); k.classList.remove('is-down');
        if (on && v > bestV) { bestV = v; best = lo + j; }
      });
      if (best !== null) { els.get(best).classList.add('is-down'); nameEl.textContent = nameOf(best); }
    }
    vizRaf = requestAnimationFrame(viz);
  }
  function playRec() {
    audioCtx(); graph();
    if (!audio.src) setSrc(rec);
    setBig(true);
    statusEl.textContent = 'Loading the recording…';
    audio.play().catch(() => { statusEl.textContent = 'The recording could not play here.'; setDemoUi(false); });
    setDemoUi(true);
  }
  function pauseRec() { audio.pause(); setDemoUi(false); liftAll(); }
  audio.addEventListener('playing', () => { statusEl.textContent = RECS[rec].label; if (!vizRaf) vizRaf = requestAnimationFrame(viz); });
  audio.addEventListener('ended', () => { setDemoUi(false); liftAll(); progress.value = 0; });
  audio.addEventListener('error', () => {
    const list = RECS[rec].src;
    if (srcIdx + 1 < list.length) { audio.src = list[++srcIdx]; audio.play().catch(() => {}); }
    else { statusEl.textContent = 'The recording could not load. Check your connection.'; setDemoUi(false); }
  });
  demoBtn.addEventListener('click', () => (audio.paused ? playRec() : pauseRec()));
  progress.addEventListener('input', () => { if (audio.duration) { audio.currentTime = (progress.value / 1000) * audio.duration; if (audio.paused) viz(); } });

  build();
}

/* =====================================================================
   Bean volleyball
   ===================================================================== */
const WW = 1000, WH = 625, FLOOR = 545, NET_X = 500, NET_TOP = 345, NET_HALF = 4;
// a jump peaks about 230 px up (the net is 200), so hands meet the ball well above the tape
const BALL_R = 17, G_BALL = 1250, G_BEAN = 2100, JUMP = -980, WIN = 7;
const T_HIT = -JUMP / G_BEAN - 0.06; // just before the top of the jump
const AIR_Y = FLOOR + JUMP * T_HIT + 0.5 * G_BEAN * T_HIT * T_HIT - 96; // where the attack zone is then
const NET_H = FLOOR - NET_TOP, DEPTH = 46, SHEAR = 20;
// The court is drawn in 3D: x along it, z across it (-1 far sideline, +1 near), h above the floor.
// Play happens on the centre plane (z = 0), so the physics stays two-dimensional.
const P3 = (x, z, h = 0) => [x + z * SHEAR + (x - NET_X) * z * 0.05, FLOOR + z * DEPTH - h];
// Computer levels. Advanced moves faster, reacts sooner, reads where you are, aims for the open
// corners, tips it short when you sit deep, blocks often and times more perfect spikes.
const LEVELS = {
  rookie: { name: 'Rookie', speed: 400, react: 0.2, missP: 0.3, missMag: 120, spikeP: 0.4, softP: 0.55, jumpServe: 0.08, block: 0.12, stuff: 0.3, dive: 0.03, aimAway: 0.3, spikeV: 920, wobble: 45, smart: false, perfect: -0.38, save: 0.25 },
  pro: { name: 'Pro', speed: 490, react: 0.1, missP: 0.2, missMag: 110, spikeP: 0.6, softP: 0.35, jumpServe: 0.4, block: 0.4, stuff: 0.38, dive: 0.08, aimAway: 0.65, spikeV: 1100, wobble: 0, smart: false, perfect: -0.22, save: 0.55 },
  advanced: { name: 'Advanced', speed: 615, react: 0.03, missP: 0.04, missMag: 80, spikeP: 0.93, softP: 0.15, jumpServe: 0.75, block: 0.6, stuff: 0.7, dive: 0.18, aimAway: 0.95, spikeV: 1260, wobble: 0, smart: true, perfect: -0.02, save: 0.85 },
};

/* ---------- sound: arcade-punchy, in a gym. Contacts hit hard and clean, power spikes boom, the
   ball whooshes away, soles squeak, and the hall answers everything ---------- */
let noiseBuf = null, hallIn = null;
function hall(ac) {
  if (hallIn) return hallIn;
  const len = Math.floor(ac.sampleRate * 1.5), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { const t = i / ac.sampleRate; d[i] = t < 0.016 ? 0 : (Math.random() * 2 - 1) * Math.exp(-t * 3.3) * 0.5; }
    [0.019, 0.031, 0.046, 0.067, 0.09].forEach((t, k) => { const i = Math.floor((t + ch * 0.004) * ac.sampleRate); if (i < len) d[i] += 0.55 / (k + 1); });
  }
  const conv = ac.createConvolver(); conv.buffer = ir;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
  const g = ac.createGain(); g.gain.value = 0.28;
  conv.connect(lp).connect(g).connect(busOut());
  hallIn = conv;
  return conv;
}
function sfx(type, power = 1, x = WW / 2) {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const out = ac.createGain(); out.gain.value = 0.85;
  if (ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = clamp((x / WW) * 2 - 1, -1, 1) * 0.55; out.connect(pn).connect(busOut()); }
  else out.connect(busOut());
  const wet = ac.createGain(); wet.gain.value = 0; out.connect(wet).connect(hall(ac));
  const send = (v) => { wet.gain.value = v; };
  const noise = (dur, freq, q, gain, kind = 'bandpass', delay = 0) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = kind; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain, t + delay + 0.002); g.gain.exponentialRampToValueAtTime(0.0006, t + delay + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t + delay, Math.random() * 0.4); s.stop(t + delay + dur + 0.02);
  };
  // a whoosh: band-passed noise whose centre slides from f0 to f1, swelling in and out
  const sweep = (dur, f0, f1, q, gain, delay = 0) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t + delay); f.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain, t + delay + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0006, t + delay + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t + delay, Math.random() * 0.3); s.stop(t + delay + dur + 0.02);
  };
  const tone = (type2, f0, f1, dur, gain, delay = 0) => {
    const o = ac.createOscillator(); o.type = type2;
    o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain, t + delay + 0.004); g.gain.exponentialRampToValueAtTime(0.0006, t + delay + dur);
    o.connect(g).connect(out); o.start(t + delay); o.stop(t + delay + dur + 0.02);
  };
  // rubber sole stick-slipping on a varnished floor: a bright, buzzy chirp that bends in pitch
  const squeak = (k, delay = 0) => {
    const f0 = 950 + Math.random() * 850, dur = 0.06 + Math.random() * 0.11, t0 = t + delay;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.86, t0); o.frequency.linearRampToValueAtTime(f0 * 1.14, t0 + dur * 0.45); o.frequency.linearRampToValueAtTime(f0 * (0.92 + Math.random() * 0.1), t0 + dur);
    const vib = ac.createOscillator(); vib.frequency.value = 38 + Math.random() * 45;
    const vg = ac.createGain(); vg.gain.value = f0 * 0.045; vib.connect(vg).connect(o.frequency);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 2.3; bp.Q.value = 2.2;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.045 * k, t0 + 0.008); g.gain.setValueAtTime(0.045 * k, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(bp).connect(hp).connect(g).connect(out);
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.02); vib.stop(t0 + dur + 0.02);
    noise(0.03, 3600, 1, 0.016 * k, 'bandpass', delay);
  };
  const p = clamp(power, 0.2, 1.6);
  switch (type) {
    case 'perfect': // the shing of a perfect contact and a thunderclap, on top of the spike
      tone('sine', 2480, 2460, 0.55, 0.05); tone('sine', 3720, 3700, 0.42, 0.035); tone('sine', 62, 34, 0.5, 0.45);
      tone('sine', 48, 26, 0.8, 0.5); noise(0.5, 260, 0.6, 0.3, 'lowpass', 0.02); sweep(0.5, 3400, 400, 1.2, 0.1, 0.02);
    // falls through: a perfect spike is a spike, and then some
    case 'spike': // power spike: a crack, a chest-thump boom, and the ball tearing away
      noise(0.01, 4200, 0.7, 0.75 * p, 'highpass'); noise(0.05, 1700, 1, 0.42 * p);
      tone('sine', 150, 46, 0.32, 0.6 * p); tone('triangle', 430, 190, 0.11, 0.18 * p);
      sweep(0.38, 2600, 520, 1.4, 0.13 * p, 0.03);
      send(0.55);
      break;
    case 'hit': // an off-speed attack or roll shot: a clean palm, no boom
      noise(0.012, 3000, 0.8, 0.42 * p, 'highpass'); noise(0.04, 1400, 1.1, 0.3 * p); tone('sine', 230, 120, 0.1, 0.38 * p);
      send(0.42);
      break;
    case 'serve':
      noise(0.012, 2800, 0.8, 0.45 * p, 'highpass'); noise(0.04, 1300, 1.1, 0.32 * p); tone('sine', 210, 110, 0.12, 0.42 * p);
      sweep(0.3, 1500, 600, 1.2, 0.06 * p, 0.03); send(0.45);
      break;
    case 'tip': // fingertips pushing it over the block: a soft pok and a breath of air
      tone('sine', 640, 460, 0.05, 0.14 * p); noise(0.02, 2600, 1.4, 0.1 * p); sweep(0.22, 900, 1800, 1.2, 0.035);
      send(0.2);
      break;
    case 'set': // fingertips: a light, quick pok
      tone('sine', 560, 390, 0.05, 0.17 * p); noise(0.02, 2400, 1.4, 0.12 * p); noise(0.018, 2100, 1.4, 0.08 * p, 'bandpass', 0.008);
      send(0.2);
      break;
    case 'bump': // forearm platform: a solid, low thup
      tone('sine', 210, 105, 0.13, 0.48 * p); noise(0.035, 850, 1, 0.3 * p, 'lowpass'); tone('triangle', 540, 420, 0.06, 0.07 * p);
      send(0.32);
      break;
    case 'block': // two hands slamming shut on it
      noise(0.03, 1900, 0.9, 0.5); tone('sine', 175, 70, 0.17, 0.55); noise(0.025, 1500, 1, 0.35, 'bandpass', 0.022); tone('sine', 900, 860, 0.1, 0.05);
      send(0.5);
      break;
    case 'net': for (let k = 0; k < 4; k++) noise(0.05, 650 + k * 140, 2.2, 0.14 * p, 'bandpass', k * 0.03); send(0.15); break;
    case 'floor': tone('sine', 115, 52, 0.2, 0.45 * p); noise(0.025, 1200, 0.8, 0.2 * p); send(0.7 * p); break;
    case 'slam': // a spike buried in the court
      tone('sine', 96, 32, 0.5, 0.7 * p); noise(0.26, 650, 0.7, 0.32 * p, 'lowpass'); noise(0.03, 1150, 0.9, 0.32 * p);
      send(0.85);
      break;
    case 'wall': tone('sine', 150, 70, 0.08, 0.16 * p); noise(0.02, 1500, 1, 0.1 * p); send(0.3); break;
    case 'squeak': squeak(p); if (Math.random() < 0.35) squeak(p * 0.7, 0.05 + Math.random() * 0.06); send(0.25); break;
    case 'land': tone('sine', 95, 58, 0.08, 0.14 * p); noise(0.04, 320, 0.7, 0.07 * p, 'lowpass'); send(0.2); break;
    case 'takeoff': tone('sine', 110, 55, 0.12, 0.22 * p); noise(0.12, 340, 0.7, 0.16 * p, 'lowpass'); send(0.2); break;
    case 'charge': // the run-up to a third-touch attack: a rising rush and a heartbeat
      sweep(0.55, 260, 2900, 1.8, 0.11); tone('sine', 190, 380, 0.5, 0.04); tone('sine', 58, 44, 0.16, 0.38); tone('sine', 58, 44, 0.16, 0.3, 0.2);
      send(0.3);
      break;
    case 'dive': noise(0.22, 480, 0.7, 0.16, 'lowpass'); squeak(0.8, 0.02); send(0.25); break;
    case 'win': tone('triangle', 659, 659, 0.14, 0.16); tone('triangle', 880, 880, 0.26, 0.16, 0.12); break;
    case 'lose': tone('triangle', 440, 440, 0.14, 0.14); tone('triangle', 330, 330, 0.28, 0.14, 0.12); break;
    case 'whistle': case 'whistle-short': {
      const len = type === 'whistle' ? 0.6 : 0.24;
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 2500;
      const lfo = ac.createOscillator(); lfo.frequency.value = 28; const lg = ac.createGain(); lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02); g.gain.setValueAtTime(0.09, t + len - 0.08); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
      o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
      send(0.3);
      break;
    }
    default: break;
  }
}

/* ---------- bean volleyball ----------
   A / D move, Space jumps, left click plays the ball, right click dives.
   On the ground a click is a bump or a set that stays on your side (a third touch goes over).
   In the air a click is an attack over the net (click the CPU's half to aim it); at the top of the
   jump it is a perfect spike. At the net against a ball coming over, it is a block. */
function initBall() {
  const canvas = document.getElementById('ball-canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('ball-status');
  const resetBtn = document.getElementById('ball-reset');
  const pads = document.getElementById('ball-pads');
  const fig = canvas.closest('figure');
  if (coarse) {
    document.getElementById('ball-hint').textContent = 'Arrows move · Jump · Hit plays the ball · Dive';
    statusEl.textContent = 'First to 7. Tap the court to serve.';
  }

  let level = 'pro';
  try { const v = localStorage.getItem('soohoo-volley-level'); if (LEVELS[v]) level = v; } catch { /* storage blocked */ }
  let L = LEVELS[level];

  let cw = 1, chh = 1, dpr = 1, S = 1;
  const mkBean = (side) => ({ side, x: side < 0 ? 250 : 750, y: FLOOR, vx: 0, vy: 0, pvx: 0, ground: true, swing: 0, cool: 0, dive: 0, recover: 0, face: -side, squash: 0, blink: 0, lastDir: 0, sqT: 0, pose: '', poseT: 0, aim: null, tx: side < 0 ? 250 : 760 });
  const you = mkBean(-1), cpu = mkBean(1);
  const ball = { x: 250, y: 300, vx: 0, vy: 0, spin: 0, rot: 0, power: 0, trail: [] };
  let state = 'idle'; // idle | serve | play | point | over
  let server = you, hang = true, serveTouch = false, stateT = 0, score = { you: 0, cpu: 0 }, touches = { side: 0, n: 0, last: -1 }, clock = 0;
  let keyL = false, keyR = false, aiErr = 0, flash = null, msg = '', msgSub = '', rally = 0, lastScorer = null;
  let hitStop = 0, shake = 0, pops = [], cpuPlan = null;
  // effects and camera
  let puffs = [], rings = [], cracks = [], whiteFlash = 0, punch = 0, drama = null, timeScale = 1, zoom = 1, camX = WW / 2, camY = WH / 2;

  const say = (t) => { statusEl.textContent = t; };
  const cpuMiss = () => (Math.random() < L.missP + Math.min(0.2, rally * 0.015) * (L.smart ? 0.25 : 1)
    ? (Math.random() < 0.5 ? -1 : 1) * (L.missMag + Math.random() * L.missMag)
    : (Math.random() - 0.5) * (L.smart ? 16 : 60));
  const pop = (text, x, y, big = false) => pops.push({ text, x, y, t: 0, big });
  function puff(x, y, n, big = false) {
    for (let i = 0; i < n; i++) puffs.push({ x: x + (Math.random() - 0.5) * (big ? 50 : 30), y: y - Math.random() * 6, vx: (Math.random() - 0.5) * (big ? 300 : 150), vy: -15 - Math.random() * (big ? 110 : 45), r: (big ? 8 : 5) + Math.random() * (big ? 10 : 5), t: 0, life: 0.4 + Math.random() * (big ? 0.45 : 0.25) });
    if (puffs.length > 90) puffs.splice(0, puffs.length - 90);
  }
  const endDrama = () => { if (drama) drama.done = true; };
  function serveBy(b) {
    server = b; state = 'serve'; stateT = 0; hang = true; serveTouch = false; endDrama();
    ball.x = b.x + b.face * 26; ball.y = FLOOR - 255; ball.vx = ball.vy = 0; ball.spin = 0; ball.power = 0; ball.trail = [];
    touches = { side: 0, n: 0, last: -1 }; rally = 0; msg = ''; msgSub = ''; cpuPlan = null;
    if (b === you) say(coarse ? 'Your serve. Tap Hit to toss, Hit again to serve.' : 'Your serve. Click to toss, click again to serve. Jump with Space first for a jump serve.');
    else say('CPU serves.');
  }
  function newMatch() {
    score = { you: 0, cpu: 0 }; roll('score-you', 0); roll('score-cpu', 0);
    Object.assign(you, mkBean(-1)); Object.assign(cpu, mkBean(1));
    puffs = []; rings = [];
    serveBy(you); kick();
  }
  function pointTo(b, why) {
    if (state !== 'play') return;
    state = 'point'; stateT = 0; lastScorer = b; endDrama();
    if (b === you) score.you++; else score.cpu++;
    roll('score-you', score.you); roll('score-cpu', score.cpu);
    msg = b === you ? 'Point, you' : 'Point, CPU'; msgSub = `${why}${rally > 6 ? ` · ${rally}-touch rally` : ''}`;
    if (score.you >= WIN || score.cpu >= WIN) {
      state = 'over';
      msg = score.you > score.cpu ? 'You win' : 'CPU wins';
      msgSub = `${score.you} : ${score.cpu} against ${L.name}${score.you > score.cpu ? '. Good rally.' : '. Rematch?'}`;
      say(`${msg}, ${score.you} to ${score.cpu} against the ${L.name} CPU. Press New match to play again.`);
      sfx('whistle');
    } else {
      const mp = Math.max(score.you, score.cpu) === WIN - 1 ? ' Match point.' : '';
      say(`${msg}: ${why}. ${score.you} : ${score.cpu}.${mp}`);
      sfx('whistle-short'); setTimeout(() => sfx(b === you ? 'win' : 'lose'), 260);
    }
  }

  /* ----- where each bean can reach the ball ----- */
  const head = (b) => (b.dive > 0 ? { x: b.x + b.face * 12, y: b.y - 24, r: 34 } : { x: b.x, y: b.y - 54, r: 42 });
  // on the ground: forearms to just over the head; in the air: hand height at the top of the jump
  const zone = (b) => (b.ground ? { x: b.x + b.face * 8, y: b.y - 80, r: 74 } : { x: b.x + b.face * 12, y: b.y - 96, r: 82 });
  const inZone = (b, k = 1) => { const z = zone(b); return Math.hypot(ball.x - z.x, ball.y - z.y) < z.r * k + BALL_R * 0.5; };
  const onSide = (b) => (ball.x - NET_X) * b.side > -BALL_R;
  function touch(b) {
    const side = b.side;
    if (touches.side === side && clock - touches.last < 0.14) { touches.last = clock; return true; }
    if (touches.side === side) touches.n++; else { touches.side = side; touches.n = 1; }
    touches.last = clock; rally++;
    if (touches.n > 3) { pointTo(b === you ? cpu : you, 'four touches'); return false; }
    return true;
  }
  // Ballistic aim over the net: of all flight times that clear the tape and stay under vmax,
  // take the one closest to T0 (short T0 = a flat, fast hit; long T0 = a floated arc).
  function solve(xt, T0, vmax) {
    const yt = FLOOR - BALL_R;
    let best = null;
    for (let T = 0.22; T <= 2.2; T += 0.02) {
      const vx = (xt - ball.x) / T, vy = (yt - ball.y - 0.5 * G_BALL * T * T) / T;
      if (Math.hypot(vx, vy) > vmax) continue;
      const tn = (NET_X - ball.x) / vx;
      if (tn > 0 && ball.y + vy * tn + 0.5 * G_BALL * tn * tn > NET_TOP - BALL_R - 16) continue;
      if (!best || Math.abs(T - T0) < Math.abs(best.T - T0)) best = { T, vx, vy };
    }
    if (!best) { const T = 1.5; best = { T, vx: (xt - ball.x) / T, vy: (yt - ball.y - 0.5 * G_BALL * T * T) / T }; }
    best.v = Math.hypot(best.vx, best.vy); best.x = xt;
    return best;
  }
  const launch = (sol) => { ball.vx = sol.vx; ball.vy = sol.vy; ball.spin = Math.sign(sol.vx) * 18; return sol.v; };
  function attackTo(xt, T0, vmax) { return launch(solve(xt, T0, vmax)); }
  // A spike must be fast. Aim close to the net and the only way over the tape and down is a slow
  // lob, so the target slides deeper until the ball can go at least vmin (or as fast as it can).
  function spikeTo(b, xt, T0, vmax, vmin) {
    const far = b.side < 0 ? WW - 45 : 45, step = b.side < 0 ? 25 : -25;
    let fastest = null;
    for (let x = xt; b.side < 0 ? x <= far : x >= far; x += step) {
      const sol = solve(x, T0, vmax);
      if (sol.v >= vmin) return launch(sol);
      if (!fastest || sol.v > fastest.v) fastest = sol;
    }
    return launch(fastest || solve(far, T0, vmax));
  }
  // a pass that stays on your own side: up to an apex, dropping where the next touch happens.
  // A ball that arrives hot (a power spike) comes off the arms less accurately.
  const PASS = { set: [115, 22, NET_TOP - 245, 15, AIR_Y], bump: [170, 70, NET_TOP - 175, 40, FLOOR - 115], dig: [200, 90, NET_TOP - 130, 40, FLOOR - 115] };
  function passTo(b, kind) {
    const [dist, jitter0, apex0, apexJ, yh] = PASS[kind];
    const jitter = jitter0 * (1 + ball.power * 1.3) * (b === cpu && L.smart ? 0.6 : 1);
    let xs = NET_X + b.side * (dist + (Math.random() - 0.5) * 2 * jitter);
    xs = b.side < 0 ? clamp(xs, 60, NET_X - 60) : clamp(xs, NET_X + 60, WW - 60);
    const apex = Math.min(apex0 + (Math.random() - 0.5) * 2 * apexJ, ball.y - 50);
    const vy = -Math.sqrt(2 * G_BALL * (ball.y - apex));
    const ta = -vy / G_BALL, tf = Math.sqrt((2 * Math.max(20, yh - apex)) / G_BALL);
    ball.vx = clamp((xs - ball.x) / (ta + tf), -460, 460); ball.vy = vy; ball.spin = ball.vx / 60; ball.power = 0;
  }
  // where on the other side to send it: your click if it was on the CPU's half; the CPU aims away from you
  function targetFor(b, deep = false) {
    const d0 = deep ? 190 : 70, lo = b.side < 0 ? NET_X + d0 : 60, hi = b.side < 0 ? WW - 45 : NET_X - d0;
    if (b === you && b.aim !== null && b.aim > NET_X + 20) return clamp(b.aim + (Math.random() - 0.5) * 40, NET_X + 70, WW - 45); // your click wins, even a short tip
    if (b === cpu && Math.random() < L.aimAway) {
      const yx = you.x + (L.smart ? you.vx * 0.3 : 0); // Advanced reads where you are going
      const cands = L.smart ? [lo + Math.random() * 45, hi - Math.random() * 45, (lo + hi) / 2 + (Math.random() - 0.5) * 90] : [0, 1, 2, 3].map(() => lo + Math.random() * (hi - lo));
      return cands.reduce((a, c) => (Math.abs(c - yx) > Math.abs(a - yx) ? c : a));
    }
    return lo + Math.random() * (hi - lo);
  }
  // How clean an attack is, mostly timing. Any decent swing at a ball above the tape is a full
  // spike; meeting it near the top of the jump (about a 0.25 s window) is a perfect spike.
  function quality(b) {
    const z = zone(b), dz = Math.hypot(ball.x - z.x, ball.y - z.y) / z.r, ap = Math.min(1, Math.abs(b.vy) / 700);
    const skill = b === cpu ? L.perfect + (Math.random() - 0.5) * 0.3 : 0;
    return clamp(1 - 0.55 * ap - 0.1 * Math.max(0, dz - 0.6) + skill, 0, 1);
  }
  // a jump at the net against a ball coming over: it goes straight back down, and is not a touch
  function block(b) {
    // not every touch at the net is a stuff block: often it only glances off the hands and stays
    // alive on the blocker's side (which then has three touches). Perfect spikes are harder to stop.
    const stuffP = (b === cpu ? L.stuff : 0.6) * (ball.power > 1 ? 0.6 : 1);
    if (Math.random() > stuffP) {
      ball.vx *= 0.5; ball.vy = -Math.abs(ball.vy) * 0.25 - 260; ball.spin *= -0.5; ball.power = 0;
      touches = { side: b.side, n: 0, last: clock };
      b.swing = 0; b.cool = 0.25; b.pose = 'block'; b.poseT = 0.3;
      sfx('set', 0.9, ball.x); pop('TOUCHED', ball.x, ball.y - 30);
      endDrama();
      return;
    }
    ball.vx = -b.side * (240 + Math.random() * 140); ball.vy = 220 + Math.random() * 120; ball.spin = -b.side * 14; ball.power = 0.45;
    touches = { side: -b.side, n: 0, last: clock };
    b.swing = 0; b.cool = 0.25; b.pose = 'block'; b.poseT = 0.32;
    sfx('block', 1, ball.x); pop('BLOCK!', ball.x, ball.y - 34, true); shake = 0.8; hitStop = 0.05;
    rings.push({ x: ball.x, y: ball.y, t: 0, big: false });
    if (b === you) aiErr = cpuMiss();
    endDrama();
  }
  function contact(b) {
    const fromOther = touches.side !== b.side && !serveTouch;
    if (!b.ground && fromOther && Math.abs(ball.x - NET_X) < 80 && ball.y < NET_TOP + 24) { block(b); return; }
    b.swing = 0; b.cool = 0.25;
    const serving = serveTouch && b === server;
    if (!touch(b)) return;
    serveTouch = false;
    let kind;
    if (serving) kind = b.ground ? 'serve' : 'jumpserve';
    else if (!b.ground) kind = b.tipMode ? 'tip' : 'attack';
    else if (touches.n >= 3) kind = 'free';
    else kind = ball.y < b.y - 100 ? 'set' : 'bump';
    const incoming = Math.hypot(ball.vx, ball.vy), bx = ball.x, by = ball.y;
    let big = false;
    switch (kind) {
      case 'serve': attackTo(targetFor(b), 0.95, 760); ball.power = 0.2; sfx('serve', 1, bx); pop('SERVE', bx, by - 30); break;
      case 'jumpserve': case 'attack': {
        const q = quality(b);
        // weak only when the ball has dropped below the tape (nothing to hit down on), or a fumbled swing
        const weak = ball.y > NET_TOP - 6 || q < 0.12;
        const tip = kind === 'attack' && b === cpu && L.smart && you.x < NET_X - 280 && Math.random() < 0.35;
        const soft = kind === 'attack' && b === cpu && Math.random() < L.softP; // the CPU's off-speed roll shots
        const spike = !weak && !tip && !soft;
        const perfect = spike && q > 0.77; // click as the jump tops out
        const base = (b === cpu ? L.spikeV : 1180) * (kind === 'jumpserve' ? 0.9 : 1);
        if (tip) attackTo(NET_X - 85 - Math.random() * 45, 0.8, 560);
        else if (spike) { const vmax = base * (perfect ? (b === cpu ? 1.18 : 1.25) : 1); spikeTo(b, targetFor(b, true), perfect ? 0.26 : 0.34, vmax, vmax * (perfect ? 0.82 : 0.72)); }
        else attackTo(targetFor(b), 0.7, 760);
        ball.power = perfect ? 1.3 : spike ? 0.85 : 0.25;
        if (perfect) { // the top tier: everything the old perfect spike had, and more
          big = true;
          sfx('perfect', 1.4, bx);
          pop('PERFECT SPIKE!', bx, by - 40, true);
          hitStop = 0.15; shake = 2; whiteFlash = 0.8; punch = 0.14;
          rings.push({ x: bx, y: by, t: 0, big: true }, { x: bx, y: by, t: -0.08, big: true });
          puff(bx, by, 10, true);
        } else if (spike) { // a normal attack is a real spike now
          big = true;
          sfx('spike', 1.2, bx);
          pop(kind === 'jumpserve' ? 'JUMP SERVE!' : 'SPIKE!', bx, by - 36, true);
          hitStop = 0.08; shake = 1.2; whiteFlash = 0.4; punch = 0.05;
          rings.push({ x: bx, y: by, t: 0, big: true });
        } else { sfx('hit', 0.85, bx); pop(tip ? 'TIP' : soft ? 'ROLL SHOT' : kind === 'jumpserve' ? 'SERVE' : 'HIT', bx, by - 30); }
        break;
      }
      case 'free': attackTo(targetFor(b), 1.05, 700); ball.power = 0; sfx('bump', clamp(incoming / 700, 0.5, 1), bx); pop('OVER', bx, by - 26); break;
      case 'tip': tipTo(b); ball.power = 0; sfx('tip', 1, bx); pop('TIP!', bx, by - 30); break;
      case 'set': passTo(b, 'set'); sfx('set', 1, bx); pop('SET', bx, by - 26); break;
      default: passTo(b, 'bump'); sfx('bump', clamp(incoming / 700, 0.45, 1.1), bx); pop('BUMP', bx, by - 26);
    }
    b.pose = kind === 'set' ? 'set' : (kind === 'bump' || kind === 'free') ? 'bump' : 'hit'; b.poseT = 0.28;
    flash = { x: bx, y: by + (kind === 'set' ? 0 : BALL_R * 0.6), t: big ? 0.2 : 0.12, big };
    if (drama && drama.b === b) endDrama();
    if (b === you) aiErr = cpuMiss();
    if (b === cpu && touches.side === 1 && touches.n === 2) cpuPlan = Math.random() < L.spikeP ? 'spike' : 'free';
  }
  function jump(b, k = 1) {
    if (!b.ground || b.dive > 0 || b.recover > 0) return;
    b.vy = JUMP * k; b.ground = false; b.squash = 0;
    b.blockJump = k < 1; // a block jump commits: no steering in the air, a beat to recover on landing
    // the take-off for a third-touch attack (or a jump serve) is the big moment
    const big = k === 1 && state === 'play' && ((touches.side === b.side && touches.n === 2 && onSide(b)) || (serveTouch && b === server));
    puff(b.x, FLOOR, big ? 16 : 5, big);
    if (big) { drama = { b, t: 0, slow: false, done: false }; sfx('charge', 1, b.x); sfx('takeoff', 1.3, b.x); }
    else sfx('takeoff', 0.6, b.x);
    if (b === you && Math.random() < 0.6) sfx('squeak', 0.8, b.x);
  }
  // A tip: soft over the net into a spot the other bean cannot reach on foot in time, so only a dive
  // saves it. Click on their half to place it yourself (right on top of them, and they will dig it).
  function tipTo(b) {
    const opp = b === you ? cpu : you, lo = b.side < 0 ? NET_X + 40 : 45, hi = b.side < 0 ? WW - 45 : NET_X - 40;
    // a blocker at the net: the tip has to pass above the reach of its hands (up now, or if it jumps)
    const threat = Math.abs(opp.x - NET_X) < 150;
    // in the air: above where its hands will peak; standing: just over its head (it may still jump, and block it)
    const apexY = opp.vy < 0 ? opp.y - (opp.vy * opp.vy) / (2 * G_BEAN) : opp.y;
    const ceil = !threat ? null : opp.ground ? FLOOR - 80 - 74 - 30 : apexY - 96 - 82 - 14;
    const tipSolve = (x) => {
      for (let T = 0.3; T <= 1.5; T += 0.02) {
        const vx = (x - ball.x) / T, vy = (FLOOR - BALL_R - ball.y - 0.5 * G_BALL * T * T) / T;
        if (Math.hypot(vx, vy) > 800) continue;
        let ok = true;
        for (let k = 1; k <= 40 && ok; k++) {
          const tt = (T * k) / 40, bx = ball.x + vx * tt, by = ball.y + vy * tt + 0.5 * G_BALL * tt * tt, past = (bx - NET_X) * opp.side;
          if (Math.abs(bx - NET_X) < BALL_R + 6 && by > NET_TOP - BALL_R - 10) ok = false; // the tape
          if (ceil !== null && past > -10 && past < 110 && by > ceil) ok = false; // the blocker's hands
        }
        if (ok) return { T, vx, vy, v: Math.hypot(vx, vy), x };
      }
      return null;
    };
    if (b === you && b.aim !== null && b.aim > NET_X + 20) { const sol = tipSolve(clamp(b.aim, lo, hi)) || solve(clamp(b.aim, lo, hi), 0.6, 760); launch(sol); return; }
    const speed = opp === cpu ? L.speed : 580, react = opp === cpu ? L.react : 0.15;
    // a bean in the air cannot start running until it lands
    const busy = opp.ground ? Math.max(0, opp.recover) : (opp.vy + Math.sqrt(opp.vy * opp.vy + 2 * G_BEAN * Math.max(0, FLOOR - opp.y))) / G_BEAN + (opp.blockJump ? 0.15 : 0);
    let pick = null, far = null;
    for (let x = lo; x <= hi; x += 15) {
      const sol = tipSolve(x);
      if (!sol) continue;
      const startX = opp.x + opp.vx * Math.min(react, 0.15); // it keeps moving the way it was going for a moment
      const need = Math.abs(x - startX) - 85, onFoot = speed * Math.max(0, sol.T - react - busy - 0.08);
      const gap = need - onFoot; // > 0: they cannot get there running; up to about 80 px a well-timed dive still can
      if (!far || gap > far.gap) far = { sol, gap };
      if (gap > 25 && gap < 80 && (!pick || sol.T < pick.T)) pick = sol; // the quickest drop that beats them on foot
    }
    launch(pick || (far && far.sol) || solve(b.side < 0 ? NET_X + 120 : NET_X - 120, 0.7, 760));
  }
  function dive(b, dir) {
    if (!b.ground || b.dive > 0 || b.recover > 0) return;
    b.face = dir || b.face; b.dive = 0.42; b.vx = b.face * 950;
    sfx('dive', 1, b.x); puff(b.x, FLOOR, 6);
  }
  function stepBean(b, dt, wantX) {
    if (b.recover > 0) b.recover -= dt;
    if (b.cool > 0) b.cool -= dt;
    if (b.poseT > 0) b.poseT -= dt;
    b.pvx = b.vx;
    if (b.dive > 0) {
      b.dive -= dt; b.vx *= Math.exp(-2.4 * dt);
      if (Math.random() < dt * 30) puff(b.x - b.face * 20, FLOOR, 1);
      if (b.dive <= 0) { b.recover = 0.32; b.vx = 0; }
    } else if (b.blockJump && !b.ground) {
      b.vx *= Math.exp(-2 * dt);
    } else if (b.recover <= 0) {
      const sp = b === you ? 580 : L.speed, dx = wantX - b.x, v = clamp(dx * 9, -sp, sp);
      b.vx += (v - b.vx) * Math.min(1, 14 * dt);
      if (Math.abs(dx) > 4) b.face = Math.sign(dx);
    } else b.vx *= Math.exp(-8 * dt);
    b.x += b.vx * dt;
    // shoe squeaks: on a hard start, a stop, a change of direction, and now and then while running
    b.sqT -= dt;
    if (b.ground && b.dive <= 0 && state !== 'idle') {
      const speed = Math.abs(b.vx), acc = Math.abs(b.vx - b.pvx) / Math.max(dt, 1e-4);
      const dirNow = speed > 140 ? Math.sign(b.vx) : 0;
      const flip = dirNow && b.lastDir && dirNow !== b.lastDir;
      if (b.sqT <= 0 && (flip || (acc > 4200 && speed > 40) || (speed > 320 && Math.random() < dt * 1.8))) {
        sfx('squeak', (b === you ? 1 : 0.55) * clamp(0.5 + speed / 600, 0.5, 1.2), b.x);
        if (flip || acc > 4200) puff(b.x, FLOOR, 2);
        b.sqT = 0.16 + Math.random() * 0.12;
      }
      if (dirNow) b.lastDir = dirNow;
    }
    if (!b.ground) {
      b.vy += G_BEAN * dt; b.y += b.vy * dt;
      if (b.y >= FLOOR) {
        b.y = FLOOR; b.vy = 0; b.ground = true; b.squash = 0.18;
        if (b.blockJump) { b.blockJump = false; b.recover = Math.max(b.recover, 0.15); }
        sfx('land', b === you ? 1 : 0.6, b.x); puff(b.x, FLOOR, 3);
        if (b.sqT <= 0 && Math.random() < 0.45) { sfx('squeak', b === you ? 0.8 : 0.45, b.x); b.sqT = 0.2; }
      }
    }
    const lo = b.side < 0 ? 34 : NET_X + 38, hi = b.side < 0 ? NET_X - 38 : WW - 34;
    b.x = clamp(b.x, lo, hi);
    if (b.swing > 0) b.swing -= dt; else b.tipMode = false;
    if (b.ground) b.tipMode = false;
    b.squash = Math.max(0, b.squash - dt);
    b.blink -= dt; if (b.blink < -3 - Math.random() * 3) b.blink = 0.12;
  }
  function collideBean(b) {
    // diving: a ball reaching the outstretched bean is dug back up on its own side
    if (b.dive > 0 && state === 'play' && b.cool <= 0 && onSide(b)) {
      const dz = { x: b.x + b.face * 16, y: b.y - 26 };
      // arms flung out at full stretch; a hard-hit spike is much harder to get a clean arm on
      if (Math.hypot(ball.x - dz.x, ball.y - dz.y) < 70 - 32 * Math.min(1, ball.power) + BALL_R) {
        b.cool = 0.25;
        if (!touch(b)) return;
        if (touches.n >= 3) attackTo(targetFor(b), 1.1, 700); else passTo(b, 'dig');
        sfx('bump', 0.9, ball.x); pop('DIG!', ball.x, ball.y - 24); puff(ball.x, FLOOR, 5);
        flash = { x: ball.x, y: ball.y + BALL_R, t: 0.12 };
        if (b === you) aiErr = cpuMiss();
        return;
      }
    }
    // just after playing the ball, the bean's own body lets it go (the hand zone overlaps the head)
    if (b.cool > 0 && state === 'play') return;
    const h = head(b);
    const dx = ball.x - h.x, dy = ball.y - h.y, d = Math.hypot(dx, dy), reach = h.r + BALL_R;
    if (d >= reach || d < 1e-3) return;
    const nx = dx / d, ny = dy / d;
    ball.x = h.x + nx * reach; ball.y = h.y + ny * reach;
    if (state !== 'play' || serveTouch) return;
    const comingOver = Math.sign(ball.vx) === b.side && Math.abs(ball.vx) > 200;
    if (!b.ground && Math.abs(b.x - NET_X) < 90 && comingOver && ball.y < NET_TOP + 30) { block(b); return; }
    // no click: the ball just glances off, which still counts as a touch
    const rvx = ball.vx - b.vx, rvy = ball.vy - b.vy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      if (!touch(b)) return;
      ball.vx = b.vx + rvx - 1.55 * vn * nx; ball.vy = b.vy + rvy - 1.55 * vn * ny;
      if (ball.vy > -320) ball.vy = -320 - Math.random() * 90;
      ball.vx = clamp(ball.vx, -420, 420); ball.spin = ball.vx / 40; ball.power = 0;
      sfx('bump', clamp(-vn / 900, 0.25, 0.7), ball.x);
      if (b === you) aiErr = cpuMiss();
    }
  }
  function stepBall(dt) {
    if (state === 'serve' && hang) { ball.x = server.x + server.face * 26 + Math.sin(clock * 3) * 2; ball.y = FLOOR - 255 + Math.sin(clock * 2.4) * 4; return; }
    ball.vy += G_BALL * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    ball.rot += ball.spin * dt; ball.spin *= Math.exp(-0.6 * dt);
    ball.power = Math.max(0, ball.power - dt * 0.25);
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.75; sfx('wall', 0.5, ball.x); }
    if (ball.x > WW - BALL_R) { ball.x = WW - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.75; sfx('wall', 0.5, ball.x); }
    if (Math.abs(ball.x - NET_X) < NET_HALF + BALL_R && ball.y > NET_TOP) {
      const s = Math.sign(ball.x - NET_X) || (ball.vx > 0 ? -1 : 1);
      ball.x = NET_X + s * (NET_HALF + BALL_R); ball.vx = s * Math.abs(ball.vx) * 0.35; sfx('net', 0.8, ball.x);
    } else {
      const dx = ball.x - NET_X, dy = ball.y - NET_TOP, d = Math.hypot(dx, dy);
      if (d < BALL_R + NET_HALF && d > 1e-3) {
        const nx = dx / d, ny = dy / d, vn = ball.vx * nx + ball.vy * ny;
        ball.x = NET_X + nx * (BALL_R + NET_HALF); ball.y = NET_TOP + ny * (BALL_R + NET_HALF);
        if (vn < 0) { ball.vx -= 1.5 * vn * nx; ball.vy -= 1.5 * vn * ny; sfx('net', 0.6, ball.x); }
      }
    }
    if (ball.y > FLOOR - BALL_R) {
      ball.y = FLOOR - BALL_R;
      if (state === 'play') {
        if (ball.power > 1) { // a perfect spike: the court cracks
          sfx('slam', 1.5, ball.x); puff(ball.x, FLOOR, 24, true); shake = Math.max(shake, 1.8); punch = Math.max(punch, 0.06);
          rings.push({ x: ball.x, y: FLOOR, t: 0, big: true, floor: true }, { x: ball.x, y: FLOOR, t: -0.1, big: true, floor: true });
          cracks.push({ x: ball.x, t: 0, seed: Math.random() * 1000 });
        } else if (ball.power > 0.5) { // a spike buried in the court
          sfx('slam', 1.1, ball.x); puff(ball.x, FLOOR, 16, true); rings.push({ x: ball.x, y: FLOOR, t: 0, big: true, floor: true }); shake = Math.max(shake, 1.2);
        } else { sfx('floor', clamp(ball.vy / 900, 0.3, 1.2), ball.x); puff(ball.x, FLOOR, 5); }
        const youLose = ball.x < NET_X;
        if (rally === 1 && touches.side === (youLose ? 1 : -1)) pop('ACE!', ball.x, ball.y - 40, true);
        pointTo(youLose ? cpu : you, youLose ? 'it landed on your side' : 'it landed on the CPU side');
      }
      ball.vy = -Math.abs(ball.vy) * 0.45; ball.vx *= 0.7; ball.power = 0;
      if (Math.abs(ball.vy) < 60) ball.vy = 0;
    }
    if (state === 'play') { ball.trail.push([ball.x, ball.y]); if (ball.trail.length > 16) ball.trail.shift(); } else ball.trail = [];
  }
  function predict(yLine) {
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    for (let k = 0; k < 300; k++) {
      const h = 1 / 60; vy += G_BALL * h; x += vx * h; y += vy * h;
      if (x < BALL_R) { x = BALL_R; vx = -vx * 0.75; }
      if (x > WW - BALL_R) { x = WW - BALL_R; vx = -vx * 0.75; }
      if (vy > 0 && y >= yLine) return x;
    }
    return x;
  }
  function predictPos(tAhead) {
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    const h = 1 / 120;
    for (let k = 0; k < tAhead * 120; k++) {
      vy += G_BALL * h; x += vx * h; y += vy * h;
      if (x < BALL_R) { x = BALL_R; vx = -vx * 0.75; }
      if (x > WW - BALL_R) { x = WW - BALL_R; vx = -vx * 0.75; }
    }
    return { x, y, vy };
  }
  // jumping now puts the hand at AIR_Y in T_HIT seconds: spike if the ball will be there then
  const spikeTiming = (b) => { const p = predictPos(T_HIT); return p.vy > -250 && Math.abs(p.x - (b.x + b.face * 12)) < 46 && Math.abs(p.y - AIR_Y) < 46; };
  // the CPU plays three-touch volleyball with the same moves: bump, set, then jump and spike
  function cpuThink() {
    if (state === 'serve' && server === cpu) return cpu.x;
    if (state !== 'play') return 760;
    if (serveTouch && server === cpu) {
      if (cpu.ground && cpuPlan === 'jump' && cpu.cool <= 0 && spikeTiming(cpu)) jump(cpu);
      if (cpu.cool <= 0 && ball.vy > -100 && inZone(cpu, 0.8)) cpu.swing = 0.15;
      return cpu.x;
    }
    const mine = touches.side === 1 ? touches.n : 0;
    // reaction time: after your touch it keeps going where it was going for a moment (longer off a hot spike)
    const react = L.react + (L.smart ? 0 : ball.power * 0.08);
    if (touches.side === -1 && clock - touches.last < react) return cpu.tx;
    let tx = 760;
    const land = predict(FLOOR - 118);
    if (land > NET_X + 6 || ball.x > NET_X) {
      if (mine === 2 && cpuPlan === 'spike') tx = clamp(predict(AIR_Y) + 12, NET_X + 40, WW - 36);
      else tx = clamp(land + (mine === 1 ? -4 : 20) + aiErr * 0.5 + Math.sin(clock * 1.7) * L.wobble, NET_X + 40, WW - 36);
    }
    // a ball it cannot reach running (a tip, a short roll): decide once whether to throw itself at it
    if (mine < 3 && ball.x > NET_X && ball.vy > 0 && cpu.ground && cpu.dive <= 0 && cpu.recover <= 0 && cpu.diveFor !== touches.last) {
      const dy = FLOOR - 30 - ball.y, tl = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * G_BALL * Math.max(0, dy))) / G_BALL;
      const lx = predict(FLOOR - 30), dist = Math.abs(lx - cpu.x);
      const run = L.speed * Math.max(0, tl - 0.06) + 80; // how far it gets on foot, plus its reach
      const slide = (950 * (1 - Math.exp(-2.4 * Math.min(tl, 0.42)))) / 2.4 + 16 + 66; // how far a dive carries, plus the dig
      // launch when the slide will end right at the ball (too early and it slides past); a near-hopeless dive is still worth it
      if (tl <= 0.4 && dist > run && slide - dist >= -20 && slide - dist <= 45) { cpu.diveFor = touches.last; if (Math.random() < L.save * (1 - 0.35 * Math.min(1, ball.power))) dive(cpu, Math.sign(lx - cpu.x)); }
      else if (tl < 0.1) cpu.diveFor = touches.last; // too late now
    }
    if (mine < 3 && ball.x > NET_X - BALL_R && cpu.recover <= 0 && cpu.dive <= 0 && cpu.cool <= 0) {
      if (cpu.ground) {
        if (mine === 2 && cpuPlan === 'spike' && Math.abs(cpu.x - NET_X) < 320) {
          if (spikeTiming(cpu)) jump(cpu);
          else if (ball.vy > 120 && ball.y > cpu.y - 120 && inZone(cpu, 0.7)) cpu.swing = 0.15; // too late to jump: free ball
        } else if (ball.vy > -150 && inZone(cpu, 0.8)) cpu.swing = 0.15;
      } else if (inZone(cpu, 0.9)) cpu.swing = 0.12;
    }
    // blocking: on your third touch near the net it shuffles over and jumps with you
    const yourAttack = touches.side === -1 && touches.n >= 2 && ball.x < NET_X;
    if (yourAttack && you.x > NET_X - 200) tx = NET_X + 52;
    // it decides once per attack whether to go up (Rookie rarely, Advanced more often and better timed)
    if (yourAttack && !you.ground && you.x > NET_X - 190 && cpu.ground && Math.abs(cpu.x - NET_X) < 130 && cpu.blockFor !== touches.last) {
      const timed = L.smart ? you.vy > -600 && you.vy < -180 : you.vy > -760;
      if (timed) { cpu.blockFor = touches.last; if (Math.random() < L.block) jump(cpu, 0.86); }
    }
    // in the air at the net with the ball coming over: get the hands on it
    if (!cpu.ground && cpu.cool <= 0 && Math.abs(cpu.x - NET_X) < 110 && ball.vx > 150 && inZone(cpu, 0.95)) cpu.swing = 0.12;
    cpu.tx = tx;
    return tx;
  }
  function toss() {
    if (!(state === 'serve' && server === you && hang)) return;
    hang = false; ball.vy = -600; state = 'play'; serveTouch = true; touches = { side: -1, n: 0, last: -1 };
    say(coarse ? 'Tap Hit as it drops to serve, or Jump then Hit.' : 'Click as it drops to serve, or jump with Space and click for a jump serve.');
  }
  function cpuToss() {
    hang = false; ball.vy = -600; state = 'play'; serveTouch = true; touches = { side: 1, n: 0, last: -1 };
    cpuPlan = Math.random() < L.jumpServe ? 'jump' : 'float';
  }
  function step(dt) {
    clock += dt; stateT += dt;
    if (state === 'serve' && server === cpu && hang && stateT > 0.9) cpuToss();
    if (state === 'serve' && server === you && hang && stateT > 8) toss();
    if (state === 'point' && stateT > 1.5) serveBy(lastScorer);
    const live = state !== 'over' && state !== 'idle';
    const wantX = live && (keyL || keyR) ? you.x + ((keyR ? 1 : 0) - (keyL ? 1 : 0)) * 200 : you.x;
    stepBean(you, dt, wantX);
    stepBean(cpu, dt, live ? cpuThink() : cpu.x);
    stepBall(dt);
    if (state === 'play') for (const b of [you, cpu]) if (b.swing > 0 && b.cool <= 0 && b.dive <= 0 && onSide(b) && inZone(b)) contact(b);
    if (state === 'play' || state === 'serve') { collideBean(you); collideBean(cpu); }
    // the big moment: as the attacker rises to the ball, time slows
    if (drama) {
      drama.t += dt;
      if (!drama.done) {
        const z = zone(drama.b);
        drama.slow = !drama.b.ground && Math.hypot(ball.x - z.x, ball.y - z.y) < 190 && drama.t < 1.1;
        if ((drama.b.ground && drama.t > 0.12) || drama.t > 1.3) drama.done = true;
      }
    }
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
    pops.forEach((p) => { p.t += dt; }); pops = pops.filter((p) => p.t < 0.9);
    for (const p of puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-3.2 * dt); p.vy *= Math.exp(-3.2 * dt); p.r += dt * 16; }
    puffs = puffs.filter((p) => p.t < p.life);
    for (const r of rings) r.t += dt;
    for (const c of cracks) c.t += dt;
    cracks = cracks.filter((c) => c.t < 1.4);
    rings = rings.filter((r) => r.t < 0.4);
    shake *= Math.exp(-7 * dt);
  }

  /* ----- drawing: a gym wall, a court in perspective, a net with depth ----- */
  const X = (x) => x * S, Y = (y) => y * S;
  const bg = document.createElement('canvas');
  function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](X(x), Y(y))); g.closePath(); }
  function line3(g, a, b) { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke(); }
  function paintCourt() {
    bg.width = Math.max(1, Math.round(cw * dpr)); bg.height = Math.max(1, Math.round(chh * dpr));
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, cw, chh);
    const farY = FLOOR - DEPTH;
    // the wall: halftone getting denser towards the floor, a rail, and three banners
    g.fillStyle = INK;
    for (let y = farY - 150; y < farY; y += 6) {
      const k = (y - (farY - 150)) / 150, r = 0.25 + k * 1.05;
      for (let x = ((y / 6) % 2) * 3; x < WW; x += 6) { g.beginPath(); g.arc(X(x), Y(y), r * S * 1.2, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(farY - 150)); g.lineTo(cw, Y(farY - 150)); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, Y(farY)); g.lineTo(cw, Y(farY)); g.stroke();
    const banner = (x, w, text, fill) => {
      const y = farY - 214, h = 40;
      g.fillStyle = fill; g.fillRect(X(x), Y(y), X(w), Y(h)); g.lineWidth = 1.5; g.strokeRect(X(x), Y(y), X(w), Y(h));
      g.fillStyle = fill === INK ? PAPER : INK; g.font = `900 ${Math.max(9, 18 * S)}px Archivo, "Noto Sans TC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, X(x + w / 2), Y(y + h / 2 + 1));
    };
    // the banners keep clear of the net (it stands at x 455 to 545 on screen, posts and antenna included)
    banner(55, 175, 'SOO-HOO CUP', PAPER); banner(265, 165, '排球 · 2027', ZINC); banner(570, 165, 'CATALOGUE', INK); banner(770, 175, '香港 · HONG KONG', PAPER);
    // the floor: free zone, then the court in zinc, in perspective
    poly(g, [P3(-80, -1), P3(1080, -1), P3(1080, 1.3), P3(-80, 1.3)]); g.fillStyle = 'rgba(17,17,17,.05)'; g.fill();
    poly(g, [P3(40, -1), P3(960, -1), P3(960, 1), P3(40, 1)]); g.fillStyle = 'rgba(227,181,5,.32)'; g.fill();
    g.strokeStyle = INK; g.lineWidth = 2;
    line3(g, P3(40, -1), P3(960, -1)); line3(g, P3(40, 1), P3(960, 1));
    line3(g, P3(40, -1), P3(40, 1)); line3(g, P3(960, -1), P3(960, 1));
    g.lineWidth = 1.5; line3(g, P3(NET_X, -1), P3(NET_X, 1));
    g.setLineDash([6, 5]); line3(g, P3(333, -1), P3(333, 1)); line3(g, P3(667, -1), P3(667, 1)); g.setLineDash([]);
    // floor boards: faint lines running along the court
    g.strokeStyle = 'rgba(17,17,17,.12)'; g.lineWidth = 1;
    for (let z = -0.75; z < 1.2; z += 0.25) line3(g, P3(-80, z), P3(1080, z));
    // the far net post
    g.strokeStyle = INK; g.lineWidth = 3; line3(g, P3(NET_X, -1.15), P3(NET_X, -1.15, NET_H + 8));
  }
  function drawNet() {
    // the net is a vertical plane across the court; seen from a little above and to the side it has depth
    const a = P3(NET_X, -1.15, NET_H), b = P3(NET_X, 1.15, NET_H), c = P3(NET_X, 1.15, NET_H - 110), d = P3(NET_X, -1.15, NET_H - 110);
    ctx.save();
    poly(ctx, [a, b, c, d]); ctx.fillStyle = 'rgba(242,242,238,.35)'; ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(17,17,17,.55)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 14; k++) { const z = -1.15 + (2.3 * k) / 14; line3(ctx, P3(NET_X, z, NET_H), P3(NET_X, z, NET_H - 110)); }
    for (let h = NET_H - 110; h <= NET_H; h += 11) line3(ctx, P3(NET_X, -1.15, h), P3(NET_X, 1.15, h));
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; poly(ctx, [a, b, c, d]); ctx.stroke();
    // the white tape along the top
    ctx.lineWidth = Math.max(3, 5 * S); line3(ctx, a, b); ctx.strokeStyle = PAPER; ctx.lineWidth = Math.max(1.5, 2.5 * S); line3(ctx, a, b);
    // antenna on the near side
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); line3(ctx, b, P3(NET_X, 1.15, NET_H + 70)); ctx.setLineDash([]);
  }
  function shadow(x, h, w) {
    const k = clamp(1 - h / 320, 0.25, 1);
    ctx.fillStyle = `rgba(17,17,17,${(0.22 * k).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(X(x), Y(FLOOR) + 1, X(w) * (0.6 + 0.4 * k), Y(w) * 0.2 * (0.6 + 0.4 * k), 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawBean(b) {
    const isYou = b === you;
    ctx.save(); ctx.translate(X(b.x), Y(b.y));
    let sx = 1, sy = 1, rot = 0;
    if (b.dive > 0) { sx = 1.32; sy = 0.56; rot = b.face * 0.25; }
    else if (!b.ground) { const st = clamp(-b.vy / 980, -0.3, 1); sx = 1 - 0.12 * st; sy = 1 + 0.14 * st; }
    else if (b.squash > 0) { const k = b.squash / 0.18; sx = 1 + 0.18 * k; sy = 1 - 0.16 * k; }
    else { const w = Math.sin(clock * 9 + (isYou ? 0 : 1.7)) * Math.min(1, Math.abs(b.vx) / 400) * 0.05; sx = 1 + w; sy = 1 - w; rot = -b.vx * 0.00012; }
    ctx.rotate(rot); ctx.scale(sx * S, sy * S);
    const path = new Path2D();
    path.moveTo(-30, -6); path.bezierCurveTo(-36, -50, -26, -96, 4, -98); path.bezierCurveTo(30, -99, 38, -70, 30, -46);
    path.bezierCurveTo(24, -30, 34, -14, 30, -4); path.bezierCurveTo(26, 4, -26, 4, -30, -6);
    ctx.fillStyle = isYou ? ZINC : PAPER; ctx.fill(path);
    if (!isYou) {
      ctx.save(); ctx.clip(path); ctx.fillStyle = INK;
      for (let y = -100; y < 6; y += 6) for (let x = -40; x < 40; x += 6) { const t = ((x + 40) / 80) * 0.8 + ((y + 100) / 106) * 0.4 - 0.55; if (t > 0) { ctx.beginPath(); ctx.arc(x + ((y / 6) % 2 ? 3 : 0), y, Math.min(2.2, t * 3.2), 0, Math.PI * 2); ctx.fill(); } }
      ctx.restore();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(path);
    const ex = (ball.x - b.x) / S, ey = (ball.y - (b.y - 64)) / S, el = Math.hypot(ex, ey) || 1, lx = (ex / el) * 2.6, ly = (ey / el) * 2.6;
    const fierce = drama && drama.b === b && !drama.done;
    for (const ox of [-6, 10]) {
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(ox + b.face * 3, -66, 6, b.blink > 0 && !fierce ? 1 : fierce ? 5 : 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
      if (b.blink <= 0 || fierce) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ox + b.face * 3 + lx, -66 + ly, 2.8, 0, Math.PI * 2); ctx.fill(); }
    }
    if (fierce) { ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-14 + b.face * 3, -78); ctx.lineTo(-1 + b.face * 3, -74); ctx.moveTo(18 + b.face * 3, -78); ctx.lineTo(5 + b.face * 3, -74); ctx.stroke(); }
    // arms: a platform for a bump, hands overhead for a set or a block, one arm whipping through for an attack
    const pose = b.poseT > 0 ? b.pose : b.swing > 0 ? (b.ground ? 'bump' : 'hit') : fierce ? 'cock' : '';
    if (pose && b.dive <= 0) {
      const f = b.face;
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.beginPath();
      if (pose === 'set') { ctx.moveTo(-22, -52); ctx.lineTo(-12 + f * 4, -104); ctx.moveTo(24, -52); ctx.lineTo(14 + f * 4, -104); }
      else if (pose === 'block') { ctx.moveTo(-20, -56); ctx.lineTo(-12 + f * 8, -122); ctx.moveTo(22, -56); ctx.lineTo(16 + f * 8, -122); }
      else if (pose === 'bump') { ctx.moveTo(-22, -48); ctx.lineTo(f * 30, -28); ctx.moveTo(24, -48); ctx.lineTo(f * 32, -26); }
      else if (pose === 'cock') { ctx.moveTo(-f * 18, -60); ctx.lineTo(-f * 34, -104); ctx.moveTo(f * 20, -58); ctx.lineTo(f * 34, -90); } // arm drawn back, ready
      else { ctx.moveTo(f * 20, -58); ctx.lineTo(f * 30, -114); ctx.moveTo(-f * 22, -52); ctx.lineTo(-f * 34, -78); }
      ctx.stroke();
      if (pose === 'set' || pose === 'block') { ctx.fillStyle = isYou ? ZINC : PAPER; const hy = pose === 'block' ? -125 : -107, hx = pose === 'block' ? [-12 + f * 8, 16 + f * 8] : [-12 + f * 4, 14 + f * 4]; for (const x of hx) { ctx.beginPath(); ctx.arc(x, hy, 4, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); } }
    }
    ctx.restore();
  }
  function drawBall() {
    const x = X(ball.x), y = Y(ball.y), r = BALL_R * S;
    // a spiked ball drags a hot streak behind it; anything else leaves a dotted trail
    if (ball.power > 0.3 && ball.trail.length > 2) {
      const tr = ball.trail, n = tr.length;
      const layers = ball.power > 1 ? [[INK, 1.7], [ZINC, 1.25], [PAPER, 0.5]] : [[INK, 1.25], [ZINC, 0.85]];
      for (const [col, wMul] of layers) {
        ctx.strokeStyle = col; ctx.lineCap = 'round';
        for (let i = 1; i < n; i++) { const k = i / n; ctx.lineWidth = r * 1.7 * k * wMul * Math.min(1, ball.power + 0.2); ctx.beginPath(); ctx.moveTo(X(tr[i - 1][0]), Y(tr[i - 1][1])); ctx.lineTo(X(tr[i][0]), Y(tr[i][1])); ctx.stroke(); }
      }
    } else {
      ctx.fillStyle = INK;
      ball.trail.forEach(([tx, ty], i) => { const k = i / ball.trail.length; ctx.beginPath(); ctx.arc(X(tx), Y(ty), r * 0.22 * k, 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = INK;
    const st = Math.max(3, r / 4.5);
    for (let yy = -r; yy <= r; yy += st) for (let xx = -r; xx <= r; xx += st) { const t = (xx + yy) / (2 * r); if (t > 0.05) { ctx.beginPath(); ctx.arc(xx, yy, Math.min(st * 0.4, t * st * 0.55), 0, Math.PI * 2); ctx.fill(); } }
    ctx.rotate(ball.rot); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.075);
    for (let k = 0; k < 3; k++) { ctx.rotate((Math.PI * 2) / 3); ctx.beginPath(); ctx.arc(r * 0.9, 0, r * 0.95, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = Math.max(1.5, r * 0.11); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function label(text, sub) {
    ctx.save();
    const fs = clamp(cw / 22, 15, 30);
    ctx.font = `900 ${fs}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w1 = ctx.measureText(text.toUpperCase()).width;
    ctx.font = `600 ${fs * 0.5}px Archivo, sans-serif`;
    const w = Math.min(cw - 16, Math.max(w1, sub ? ctx.measureText(sub).width : 0) + fs * 1.4), h = sub ? fs * 2.3 : fs * 1.5, cx = cw / 2, cy = Y(130);
    ctx.fillStyle = INK; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = PAPER; ctx.font = `900 ${fs}px Archivo, sans-serif`;
    ctx.fillText(text.toUpperCase(), cx, sub ? cy - fs * 0.38 : cy + 1);
    if (sub) { ctx.font = `600 ${fs * 0.5}px Archivo, sans-serif`; ctx.fillText(sub, cx, cy + fs * 0.62, w - 12); }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cw, chh);
    ctx.save();
    // camera: shake, and a push-in during the big moment
    const shx = shake > 0.02 ? (Math.random() - 0.5) * shake * 9 : 0, shy = shake > 0.02 ? (Math.random() - 0.5) * shake * 7 : 0;
    const zz = zoom + punch;
    ctx.translate(X(camX) + shx, Y(camY) + shy); ctx.scale(zz, zz); ctx.translate(-X(camX), -Y(camY));
    ctx.drawImage(bg, 0, 0, cw, chh);
    // speed lines behind everything while time is slowed
    if (drama && drama.slow && !drama.done) {
      const k = clamp((1 - timeScale) / 0.65, 0, 1), ox = X(drama.b.x), oy = Y(drama.b.y - 90);
      ctx.strokeStyle = `rgba(17,17,17,${(0.32 * k).toFixed(3)})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2 + clock * 0.4, r0 = 120 * S + (i % 3) * 30 * S, r1 = r0 + 260 * S; ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0); ctx.lineTo(ox + Math.cos(a) * r1, oy + Math.sin(a) * r1); ctx.stroke(); }
    }
    // where it's coming down
    if (state === 'play' && ball.vy > -900) {
      const lx = predict(FLOOR - BALL_R);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; const mx = X(lx), my = Y(FLOOR) + 2, s = 6 * Math.max(0.6, S * 1.4);
      ctx.beginPath(); ctx.moveTo(mx - s, my - s * 0.35); ctx.lineTo(mx + s, my + s * 0.35); ctx.moveTo(mx + s, my - s * 0.35); ctx.lineTo(mx - s, my + s * 0.35); ctx.stroke();
    }
    for (const b of [you, cpu]) shadow(b.x, FLOOR - b.y, 34);
    shadow(ball.x, FLOOR - ball.y, BALL_R * 1.2);
    // floor rings (a spike landing) under the players
    // floor cracks under a perfect spike, drawn flat on the court in perspective
    for (const c of cracks) {
      const a = 1 - c.t / 1.4; let sd = c.seed;
      const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
      ctx.strokeStyle = `rgba(17,17,17,${(0.85 * a).toFixed(3)})`; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + rnd() * 0.5, len = 45 + rnd() * 85;
        ctx.beginPath(); ctx.moveTo(X(c.x), Y(FLOOR));
        for (let j = 1; j <= 4; j++) { const d = (len * j) / 4, wob = (rnd() - 0.5) * 0.5; ctx.lineTo(X(c.x + Math.cos(ang + wob) * d), Y(FLOOR + Math.sin(ang + wob) * d * 0.22)); }
        ctx.stroke();
      }
    }
    for (const r of rings) if (r.floor && r.t >= 0) { const k = r.t / 0.4; ctx.strokeStyle = `rgba(17,17,17,${(1 - k).toFixed(3)})`; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(X(r.x), Y(r.y), X(30 + 150 * k), Y(30 + 150 * k) * 0.22, 0, 0, Math.PI * 2); ctx.stroke(); }
    drawNet();
    drawBean(you); drawBean(cpu);
    // dust and smoke
    for (const p of puffs) {
      const a = 1 - p.t / p.life;
      ctx.fillStyle = `rgba(242,242,238,${(0.92 * a).toFixed(3)})`; ctx.strokeStyle = `rgba(17,17,17,${(0.75 * a).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), X(p.r), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    drawBall();
    // the near net post stands in front of the players
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, 4 * S); line3(ctx, P3(NET_X, 1.15), P3(NET_X, 1.15, NET_H + 8));
    for (const r of rings) if (!r.floor && r.t >= 0) { const k = r.t / 0.4; ctx.strokeStyle = `rgba(17,17,17,${(1 - k).toFixed(3)})`; ctx.lineWidth = (r.big ? 4 : 2.5) * (1 - k) + 0.5; ctx.beginPath(); ctx.arc(X(r.x), Y(r.y), X((r.big ? 30 : 20) + (r.big ? 120 : 70) * k), 0, Math.PI * 2); ctx.stroke(); }
    if (flash) {
      ctx.save(); ctx.translate(X(flash.x), Y(flash.y)); ctx.strokeStyle = INK; ctx.lineWidth = flash.big ? 2.5 : 1.8;
      const nn = flash.big ? 12 : 7, r0 = BALL_R * S * 1.2, r1 = r0 + (flash.big ? 30 : 14) * S * 1.6 * (1 - flash.t * 3);
      for (let k = 0; k < nn; k++) { const a = (k / nn) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
      ctx.restore();
    }
    for (const p of pops) {
      const k = p.t / 0.9, fs = (p.big ? 22 : 15) * Math.max(0.7, S * 1.3) * (1 + (1 - Math.min(1, p.t * 6)) * 0.4);
      ctx.save(); ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4; ctx.font = `900 ${fs}px Archivo, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = clamp(X(p.x), 80, cw - 80), ty = Y(p.y) - k * 30, tw = ctx.measureText(p.text).width + 12;
      ctx.fillStyle = p.big ? INK : PAPER; ctx.fillRect(tx - tw / 2, ty - fs * 0.62, tw, fs * 1.24);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(tx - tw / 2, ty - fs * 0.62, tw, fs * 1.24);
      ctx.fillStyle = p.big ? ZINC : INK; ctx.fillText(p.text, tx, ty + 1);
      ctx.restore();
    }
    ctx.restore();
    if (whiteFlash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${whiteFlash.toFixed(3)})`; ctx.fillRect(0, 0, cw, chh); }
    // corner labels and the touch count stay put while the camera moves
    ctx.font = `800 ${clamp(cw / 60, 10, 13)}px Archivo, sans-serif`; ctx.textBaseline = 'top'; ctx.fillStyle = INK;
    ctx.textAlign = 'left'; ctx.fillText('YOU', X(20), Y(14)); ctx.textAlign = 'right'; ctx.fillText(`CPU · ${L.name.toUpperCase()}`, X(980), Y(14));
    if (state === 'idle') label(coarse ? 'Tap to play' : 'Click to play', coarse ? `First to 7 · ${L.name} CPU · pads move, jump, hit and dive` : `First to 7 · ${L.name} CPU · A/D move · Space jump · click plays the ball · right click dives or tips`);
    else if (state === 'point' || state === 'over') label(msg, msgSub);
    else if (state === 'serve' && server === you && hang && stateT > 0.2) label('Your serve', coarse ? 'Hit to toss, Hit again to serve' : 'Click to toss, click to serve · Space first for a jump serve');
    if (state === 'play' && touches.n > 0) {
      const left = touches.side < 0, x0 = left ? X(20) : X(980);
      ctx.font = `700 ${clamp(cw / 70, 10, 12)}px "JetBrains Mono", monospace`; ctx.textBaseline = 'top'; ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText(`TOUCH ${touches.n}/3 · RALLY ${rally}`, x0, Y(34));
    }
  }

  /* ----- loop: time can slow for the big moment, the camera eases in and out ----- */
  let visible = false, raf = 0, last = 0;
  function frame(now) {
    const real = Math.max(0, Math.min(0.033, (now - last) / 1000 || 0));
    last = now;
    const slow = drama && drama.slow && !drama.done;
    // your own big moments slow further than the CPU's
    timeScale += ((slow ? (drama.b === you ? 0.36 : 0.55) : 1) - timeScale) * Math.min(1, real * (slow ? 10 : 6));
    zoom += ((slow ? 1.12 : 1) - zoom) * Math.min(1, real * 5);
    const fx = slow ? (drama.b.x + ball.x) / 2 : WW / 2, fy = slow ? Math.min(drama.b.y - 80, ball.y + 40) : WH / 2;
    camX += (fx - camX) * Math.min(1, real * 5); camY += (fy - camY) * Math.min(1, real * 5);
    if (drama && drama.done && timeScale > 0.97 && zoom < 1.01) drama = null;
    whiteFlash = Math.max(0, whiteFlash - real * 3.5);
    punch *= Math.exp(-real * 7); // the camera punch on a big hit snaps back
    if (hitStop > 0) hitStop -= real; // a beat of stillness on big hits
    else { const dt = real * timeScale; for (let k = 0; k < 3; k++) step(dt / 3); }
    draw();
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  /* ----- input: A / D move, Space jumps, left click plays the ball, right click dives ----- */
  // undo the camera push-in so a click aims where it looks like it aims
  const toWorldX = (ev) => { const r = canvas.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * cw; return ((sx - X(camX)) / zoom + X(camX)) / S; };
  const diveDir = () => (keyL ? -1 : keyR ? 1 : Math.sign(ball.x - you.x) || you.face);
  function play(aim = null) {
    if (state === 'idle') { newMatch(); return; }
    if (state === 'serve' && server === you && hang) { toss(); return; }
    if (state !== 'play' || you.dive > 0 || you.recover > 0) return;
    you.aim = aim; you.swing = 0.3; you.tipMode = false;
  }
  // right click: a dive on the ground, a tip in the air
  function second(aim = null) {
    if (you.ground) { dive(you, diveDir()); return; }
    if (you.dive > 0 || you.recover > 0) return;
    you.aim = aim; you.swing = 0.3; you.tipMode = true;
  }
  const hop = () => { if (state === 'idle') newMatch(); else if (state === 'play' || state === 'serve') jump(you); };
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); canvas.focus({ preventScroll: true }); audioCtx();
    if (state === 'over') return;
    if (ev.button === 2) { if (state === 'idle') newMatch(); else if (state === 'play') second(toWorldX(ev)); return; }
    if (ev.button === 0) play(toWorldX(ev));
  });
  canvas.addEventListener('keydown', (ev) => {
    const c = ev.code;
    if (c === 'KeyA' || c === 'ArrowLeft') { keyL = true; ev.preventDefault(); }
    else if (c === 'KeyD' || c === 'ArrowRight') { keyR = true; ev.preventDefault(); }
    else if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') { ev.preventDefault(); if (!ev.repeat && state !== 'over') hop(); }
    else if (c === 'KeyJ' || c === 'Enter') { ev.preventDefault(); if (!ev.repeat && state !== 'over') play(); }
    else if (c === 'KeyS' || c === 'ArrowDown' || c === 'KeyK') { ev.preventDefault(); if (state === 'play' && !ev.repeat) second(); }
  });
  canvas.addEventListener('keyup', (ev) => { if (['ArrowLeft', 'KeyA'].includes(ev.code)) keyL = false; if (['ArrowRight', 'KeyD'].includes(ev.code)) keyR = false; });
  canvas.addEventListener('blur', () => { keyL = keyR = false; });
  pads?.querySelectorAll('button').forEach((b) => {
    const a = b.dataset.act;
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      try { b.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
      b.classList.add('is-down'); audioCtx();
      if (state === 'idle') { newMatch(); return; }
      if (state === 'over') return;
      if (a === 'left') keyL = true;
      if (a === 'right') keyR = true;
      if (a === 'jump') hop();
      if (a === 'hit') play();
      if (a === 'dive' && state === 'play') second();
    });
    const up = () => { b.classList.remove('is-down'); if (a === 'left') keyL = false; if (a === 'right') keyR = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
  resetBtn.addEventListener('click', () => { newMatch(); canvas.focus({ preventScroll: true }); });
  // computer level: changing it mid-match starts a fresh match
  fig?.querySelectorAll('[data-level]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.level === level));
    btn.addEventListener('click', () => {
      if (!LEVELS[btn.dataset.level]) return;
      level = btn.dataset.level; L = LEVELS[level];
      try { localStorage.setItem('soohoo-volley-level', level); } catch { /* storage blocked */ }
      fig.querySelectorAll('[data-level]').forEach((o) => o.setAttribute('aria-checked', String(o === btn)));
      if (state !== 'idle') newMatch();
      say(`CPU level: ${L.name}. ${state === 'idle' ? 'Click the court to play.' : 'New match.'}`);
      draw();
    });
  });

  const size = () => { ({ w: cw, h: chh, dpr } = fitCanvas(canvas)); S = cw / WW; paintCourt(); };
  new ResizeObserver(() => { size(); draw(); }).observe(canvas);
  whileVisible(canvas, (v) => { visible = v; if (v) kick(); });
  document.fonts?.ready.then(() => { paintCourt(); draw(); });
  size();
  ball.x = you.x + 26; ball.y = FLOOR - 255;
  draw();
  // test harness (?debug): step the game directly and play it from a script
  expose('ball', {
    step, draw, you, cpu, ball, newMatch, play, hop, second, canvas,
    get state() { return state; }, get touches() { return touches; }, get score() { return score; }, get pops() { return pops; }, get drama() { return drama; },
    set keys(v) { keyL = v[0]; keyR = v[1]; }, setLevel(v) { level = v; L = LEVELS[v]; }, LEVELS,
    C: { FLOOR, NET_X, NET_TOP, BALL_R, G_BALL, G_BEAN, JUMP, T_HIT, AIR_Y, WW },
  });
}

export function initOffspec() {
  initPiano();
  initBall();
}
