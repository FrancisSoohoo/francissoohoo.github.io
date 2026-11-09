// Shared helpers: reduced-motion flag, rolling digits, visibility, toast.

export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = window.matchMedia('(pointer: coarse)').matches;

/* Test harness. Open the page with ?debug and every interactive part hands its internals to
   window.__soohoo (see tools/tests). Without ?debug, expose() does nothing. */
export const DEBUG = new URLSearchParams(location.search).has('debug');
export function expose(name, api) { if (DEBUG) (window.__soohoo ||= {})[name] = api; }

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Odometer-style digits with fixed positions. */
export function initRoll(el) {
  if (!el || el._roll) return el?._roll;
  const digits = Math.max(1, +el.dataset.digits || 1);
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'vh';
  const box = document.createElement('span');
  box.setAttribute('aria-hidden', 'true');
  box.style.display = 'inline-flex';
  const strips = [], cells = [];
  const blank = el.dataset.blank === '1';
  for (let i = 0; i < digits; i++) {
    const d = document.createElement('span');
    d.className = 'd';
    cells.push(d);
    const s = document.createElement('span');
    s.className = 'strip';
    for (let k = 0; k <= 9; k++) {
      const n = document.createElement('span');
      n.textContent = String(k);
      s.appendChild(n);
    }
    d.appendChild(s);
    box.appendChild(d);
    strips.push(s);
  }
  el.append(sr, box);
  const api = {
    value: null,
    set(v) {
      const n = Math.max(0, Math.round(+v || 0));
      if (n === api.value) return;
      api.value = n;
      const str = String(n).padStart(digits, '0').slice(-digits);
      let lead = blank;
      for (let i = 0; i < digits; i++) {
        strips[i].style.transform = `translateY(${-(+str[i]) * 1.2}em)`;
        if (lead && str[i] === '0' && i < digits - 1) cells[i].classList.add('is-blank');
        else { lead = false; cells[i].classList.remove('is-blank'); }
      }
      sr.textContent = String(n);
    },
  };
  el._roll = api;
  api.set(+el.dataset.value || 0);
  return api;
}

export function roll(id, v) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  (el._roll || initRoll(el)).set(v);
}

/** Run a callback while an element is on screen (for animation loops). */
export function whileVisible(el, onChange, margin = '120px') {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) onChange(e.isIntersecting);
  }, { rootMargin: margin });
  io.observe(el);
  return io;
}

/** Fire once when an element first comes near the viewport. */
export function onceNear(el, fn, margin = '300px') {
  if (!el) return;
  if (DEBUG) { fn(); return; } // tests need every part loaded, whether or not it has been scrolled to
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { rootMargin: margin });
  io.observe(el);
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 1800);
}

/** Size a canvas to its CSS box at device pixel ratio; returns {w,h,dpr}. */
export function fitCanvas(canvas, maxDpr = 2) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

export const INK = '#111111';
export const PAPER = '#F2F2EE';
export const ZINC = '#E3B505';

/** Seeded RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
