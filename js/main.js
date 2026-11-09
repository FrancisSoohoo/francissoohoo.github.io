import { initRoll, roll, onceNear, toast, reduced } from './util.js';
import { initCover } from './cover.js';
import { initPageTurn } from './pageturn.js';
import { getVolume, isMuted, setVolume, onVolume } from './sound.js';
document.documentElement.classList.add('js');

/* ---------- one volume slider for every sound on the page ---------- */
{
  const box = document.querySelector('.vol'), range = document.getElementById('vol-range');
  const btn = document.getElementById('vol-btn'), num = document.getElementById('vol-num');
  const paint = (v, m) => {
    range.value = v; range.style.setProperty('--p', `${v}%`);
    range.setAttribute('aria-valuetext', m ? `Muted (${v}%)` : `${v}%`);
    if (num) num.textContent = m ? 'off' : v;
    box.classList.toggle('is-muted', m || v === 0); box.classList.toggle('is-low', v < 40);
    btn.setAttribute('aria-pressed', String(m)); btn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute all sound');
  };
  if (box && range && btn) {
    paint(getVolume(), isMuted());
    onVolume(paint);
    range.addEventListener('input', () => setVolume(+range.value, false));
    btn.addEventListener('click', () => setVolume(getVolume() || 55, !isMuted()));
  }
}

/* ---------- a refresh always opens on the cover ---------- */
// Browsers restore the old scroll position (or jump to the last #section) on reload. Only a
// fresh visit to a shared #link should land inside the catalogue.
const navType = performance.getEntriesByType?.('navigation')?.[0]?.type;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (navType === 'reload' || navType === 'back_forward') {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
if (!location.hash) {
  let userMoved = false;
  const mark = () => { userMoved = true; };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => window.addEventListener(t, mark, { once: true, passive: true }));
  const toTop = () => { if (!userMoved) window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); };
  toTop();
  window.addEventListener('load', () => { toTop(); setTimeout(toTop, 60); }, { once: true });
}
initCover();

/* ---------- page turns for links inside the catalogue ---------- */
/* ---------- folders: hanging-file tabs that switch panels ---------- */
function initFolders(root) {
  const tabs = [...root.querySelector('.folder-tabs').querySelectorAll('[role="tab"]')];
  const select = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    root.dispatchEvent(new CustomEvent('folderchange', { detail: tab }));
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (ev) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[ev.key];
      if (d === undefined) return;
      ev.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
}
document.querySelectorAll('[data-folders]').forEach(initFolders);
// a closed folder stops whatever video was playing in it
document.addEventListener('folderchange', () => document.querySelectorAll('[role="tabpanel"][hidden] video').forEach((v) => v.pause()), true);
/** If a target sits in a closed folder, open that folder first. */
function revealInFolder(el) {
  const panel = el.closest('[role="tabpanel"]');
  if (panel?.hidden) document.querySelector(`[role="tab"][aria-controls="${panel.id}"]`)?.click();
}
// other modules (the engine callouts) ask for a part by id
window.addEventListener('catalogue:goto', (ev) => {
  const t = document.getElementById(ev.detail);
  if (t) goTo(t, `#${ev.detail}`);
});
if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) { revealInFolder(t); requestAnimationFrame(() => t.scrollIntoView()); } }

const turn = initPageTurn();
function goTo(target, hash, viaKeyboard = false) {
  revealInFolder(target);
  if (turn) turn(target, hash).then(() => { if (viaKeyboard) focusTarget(target); });
  else {
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (hash) history.pushState(null, '', hash);
    if (viaKeyboard) focusTarget(target);
  }
}
function focusTarget(target) {
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}
document.addEventListener('click', (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest('a[href^="#"]');
  if (!a || a.classList.contains('skip')) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(1));
  const target = id && document.getElementById(id);
  if (!target || !target.closest('main')) return;
  ev.preventDefault();
  goTo(target, `#${id}`, ev.detail === 0);
});

/* ---------- rolling digits ---------- */
document.querySelectorAll('.roll').forEach(initRoll);

/* ---------- thumb tabs + page counter ---------- */
const sections = [...document.querySelectorAll('main > section[data-page]')];
const tabs = new Map([...document.querySelectorAll('.thumbs a')].map((a) => [a.dataset.tab, a]));
let current = null;
function setCurrent(sec) {
  if (!sec || sec === current) return;
  current = sec;
  tabs.forEach((a, id) => a.setAttribute('aria-current', id === sec.id ? 'true' : 'false'));
  roll('page-roll', +sec.dataset.page);
  const active = tabs.get(sec.id);
  const bar = active?.parentElement;
  if (active && bar && bar.scrollWidth > bar.clientWidth) {
    // bottom bar on phones: scroll the bar itself, never the page
    bar.scrollTo({ left: active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
  }
}
// The current section is the last one whose top has reached the middle of the screen;
// at the very bottom of the page it is always the last section.
function pickSection() {
  const line = window.innerHeight * 0.5;
  let cur = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top <= line) cur = s;
  const doc = document.documentElement;
  if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) cur = sections[sections.length - 1];
  setCurrent(cur);
}
window.addEventListener('scroll', pickSection, { passive: true });
window.addEventListener('resize', pickSection);
window.addEventListener('hashchange', pickSection);

/* ---------- section lift: like the cover, each page tilts back and greys as the next one slides over ---------- */
if (!reduced) {
  const pages = sections.filter((s) => s.classList.contains('page'));
  let queued = false;
  const lift = () => {
    queued = false;
    const vh = window.innerHeight;
    pages.forEach((s, i) => {
      const next = pages[i + 1];
      if (!next) return;
      const p = Math.min(1, Math.max(0, 1 - s.getBoundingClientRect().bottom / vh));
      if (p <= 0.002) {
        if (s._lift) { s.style.transform = ''; s.style.removeProperty('--lift'); next.style.boxShadow = ''; s._lift = 0; }
        return;
      }
      s._lift = p;
      // hinge on the seam with the next page: the top tilts away from you (safe for very tall sections)
      s.style.transformOrigin = '50% 100%';
      s.style.transform = `perspective(1500px) rotateX(${(p * 22).toFixed(2)}deg) scale(${(1 - p * 0.05).toFixed(4)})`;
      s.style.setProperty('--lift', p.toFixed(3));
      next.style.boxShadow = `0 ${-Math.round(30 * p)}px ${Math.round(50 * p)}px -30px rgba(17,17,17,${(0.5 * p).toFixed(2)})`;
    });
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(lift); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  lift();
}
pickSection();

/* ---------- stamps (route card, disposition) ---------- */
const stampIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('is-stamped');
      stampIO.unobserve(e.target);
    }
  });
}, { threshold: 0.45 });
document.querySelectorAll('.route, .disposition').forEach((el) => stampIO.observe(el));

/* ---------- search ---------- */
const INDEX = [
  { pn: '01', title: 'Siu Tsun Soo-Hoo (Francis)', sub: 'Design engineer, Imperial College London', id: 'engineer', k: 'name about francis siu tsun soo-hoo 司徒兆浚 imperial design engineering meng hong kong 香港 profile' },
  { pn: '02-01', title: 'Flywheel, lightweighted', sub: 'CAD and FEA, rejected on cost', id: 'part-flywheel', k: 'flywheel fea finite element analysis cad inertia stress lightweight machining powertrain formula student' },
  { pn: '02-02', title: 'Cylinder-head stud, custom', sub: 'Ninja 400, ARP, supplier sourcing', id: 'part-studs', k: 'stud bolt head gasket arp clamp torque fastener formula student ifr engine sourcing supplier powertrain kawasaki' },
  { pn: '03-01', title: 'Heart-disease risk classifier', sub: 'Python, scikit-learn decision tree', id: 'part-tree', k: 'machine learning ml python scikit-learn sklearn decision tree classifier data science uci heart cross-validation ai' },
  { pn: '04-01', title: 'The Canvas, human-centred design', sub: 'Y1 HCD: research, co-design, prototypes', id: 'part-hcd', k: 'hcd human centred design ux user research interviews co-design prototype canvas pixel queens lawn stress campus esp32 fusion 360' },
  { pn: '05-01', title: 'RC car “Grand Prix”', sub: 'Electronics 1. Drive it', id: 'track', k: 'rc car electronics mechatronics sensors circuits drive game race track' },
  { pn: '05-02', title: 'Lap-time forecaster', sub: 'Time series in R', id: 'track', k: 'r time series forecast forecasting lap time machine learning ml holt statistics' },
  { pn: '06-01', title: 'MEng Design Engineering', sub: 'Imperial College London, 2025–2029', id: 'rec-imperial', k: 'education degree imperial dyson modules solid mechanics thermofluids electronics accredited imeche iet ied grades' },
  { pn: '06-02', title: 'ML summer schools', sub: 'Imperial, Jun–Jul 2026', id: 'rec-ml', k: 'machine learning summer school time series course' },
  { pn: '06-04', title: 'A Levels', sub: 'St John’s College, Cardiff', id: 'rec-alevel', k: 'a level grades maths further maths physics design technology school cardiff' },
  { pn: '06-05', title: 'Anker Innovations', sub: 'Warehouse operative, part-time', id: 'rec-anker', k: 'anker warehouse logistics work job experience' },
  { pn: '06-06', title: 'Panasonic engineering trainee', sub: 'Cohort lead, environment monitor', id: 'rec-panasonic', k: 'panasonic trainee lead leadership weather monitor cad prototype pitch work experience' },
  { pn: '07-01', title: 'Piano, ARSM diploma', sub: 'Play it, or hear Liebestraum No. 3', id: 'offspec', k: 'piano music abrsm arsm church musician instrument liszt liebestraum demo' },
  { pn: '07-02', title: 'Volleyball', sub: 'Bean volleyball: play a rally', id: 'offspec', k: 'volleyball sport sports basketball football hobby game bean' },
  { pn: '07-03', title: 'Community', sub: 'Youth leader, 60-person summer camp', id: 'offspec', k: 'church youth leader camp community volunteering leadership' },
  { pn: '08', title: 'Contact', sub: 'Email and LinkedIn', id: 'contact', k: 'contact email linkedin hire internship summer 2027 placement quote' },
];

const search = document.querySelector('.search');
const input = document.getElementById('search-input');
const list = document.getElementById('search-results');
const searchBtn = document.querySelector('.search-btn');
let results = [];
let sel = 0;

function renderResults() {
  const q = input.value.trim().toLowerCase();
  if (!q) { closeResults(); return; }
  const terms = q.split(/\s+/);
  results = INDEX
    .map((e) => {
      const hay = `${e.title} ${e.sub} ${e.k} ${e.pn}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const score = (e.title.toLowerCase().includes(terms[0]) ? 2 : 0) + (e.k.includes(terms[0]) ? 1 : 0);
      return { e, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.e);
  sel = 0;
  list.innerHTML = '';
  if (!results.length) {
    const li = document.createElement('li');
    li.className = 'r-none';
    li.textContent = `No parts match “${input.value.trim()}”. Try FEA, Python or piano.`;
    list.appendChild(li);
  } else {
    results.forEach((e, i) => {
      const li = document.createElement('li');
      li.id = `sr-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      li.innerHTML = `<span class="r-pn"></span><span class="r-title"></span><span class="r-sub"></span>`;
      li.querySelector('.r-pn').textContent = e.pn;
      li.querySelector('.r-title').textContent = e.title;
      li.querySelector('.r-sub').textContent = e.sub;
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); go(e); });
      li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; markSel(); } });
      list.appendChild(li);
    });
  }
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  markSel();
}
function markSel() {
  [...list.querySelectorAll('[role=option]')].forEach((li, i) => li.setAttribute('aria-selected', i === sel ? 'true' : 'false'));
  if (results.length) input.setAttribute('aria-activedescendant', `sr-${sel}`);
  else input.removeAttribute('aria-activedescendant');
}
function closeResults() {
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}
function go(e) {
  const target = document.getElementById(e.id);
  if (!target) return;
  if (target.tagName === 'DETAILS') target.open = true;
  closeResults();
  input.value = '';
  input.blur();
  search.classList.remove('is-open');
  searchBtn?.setAttribute('aria-expanded', 'false');
  goTo(target, `#${e.id}`);
}
input.addEventListener('input', renderResults);
input.addEventListener('focus', () => { if (input.value.trim()) renderResults(); });
input.addEventListener('blur', () => setTimeout(() => {
  closeResults();
  if (!input.value) { search.classList.remove('is-open'); searchBtn?.setAttribute('aria-expanded', 'false'); }
}, 120));
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowDown' && results.length) { ev.preventDefault(); sel = (sel + 1) % results.length; markSel(); }
  else if (ev.key === 'ArrowUp' && results.length) { ev.preventDefault(); sel = (sel - 1 + results.length) % results.length; markSel(); }
  else if (ev.key === 'Enter' && results[sel]) { ev.preventDefault(); go(results[sel]); }
  else if (ev.key === 'Escape') { input.value = ''; closeResults(); input.blur(); }
});
searchBtn?.addEventListener('click', () => {
  search.classList.add('is-open');
  searchBtn.setAttribute('aria-expanded', 'true');
  input.focus();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const t = ev.target;
  if (t.closest('input, textarea, [contenteditable], canvas, .piano')) return;
  ev.preventDefault();
  if (searchBtn && getComputedStyle(searchBtn).display !== 'none') searchBtn.click();
  else input.focus();
});

/* ---------- copy email ---------- */
document.getElementById('copy-email')?.addEventListener('click', async (ev) => {
  const v = ev.currentTarget.dataset.copy;
  try {
    await navigator.clipboard.writeText(v);
    toast('Email copied');
  } catch {
    toast(v);
  }
});

/* ---------- interactive parts, loaded as they come near ---------- */
async function bootEngine() {
  const fb = document.getElementById('engine-fallback');
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const { initEngine } = await import('./engine.js');
    initEngine();
  } catch (err) {
    console.warn('Engine figure fell back to the static drawing:', err);
    fb.hidden = false;
    document.getElementById('engine-canvas').hidden = true;
    document.querySelector('.engine-controls').hidden = true;
    document.getElementById('engine-hint').textContent = 'Static drawing';
  }
}
bootEngine();

onceNear(document.getElementById('part-studs'), () => import('./studs.js').then((m) => m.initStuds()));
onceNear(document.getElementById('part-flywheel'), () => import('./flywheel.js').then((m) => m.initFlywheel()));
onceNear(document.getElementById('part-tree'), () => import('./tree.js').then((m) => m.initTree()));
onceNear(document.getElementById('hcd-fig'), () => import('./hcd.js').then((m) => m.initHcd()));
onceNear(document.getElementById('track-fig'), () => import('./track.js').then((m) => m.initTrack()));
onceNear(document.getElementById('offspec'), () => import('./offspec.js').then((m) => m.initOffspec()));
