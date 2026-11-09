// Page turn between sections: following a link inside the catalogue, a sheet carrying the
// section's page number sweeps across, the page jumps underneath it, and the sheet sweeps off.
// Forward links turn right-to-left, links back up the catalogue turn the other way.
import { reduced } from './util.js';

export function initPageTurn() {
  if (reduced || !Element.prototype.animate) return null;
  const el = document.createElement('div');
  el.className = 'page-turn';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="pt-sheet"><div class="pt-edge"></div><span class="pt-cat">Soo-Hoo · Catalogue 2027</span><span class="pt-no"></span><span class="pt-name"></span><span class="pt-rule"></span></div>';
  document.body.appendChild(el);
  const sheet = el.querySelector('.pt-sheet');
  const noEl = el.querySelector('.pt-no');
  const nameEl = el.querySelector('.pt-name');
  let busy = false;
  const ease = 'cubic-bezier(.66,0,.34,1)';

  const nameOf = (sec) => document.querySelector(`.thumbs a[data-tab="${sec.id}"] .en`)?.textContent || 'Cover';

  return async function turn(target, hash) {
    if (busy) return;
    const sec = target.closest('section[data-page]') || target;
    const top = target.getBoundingClientRect().top;
    const dir = top >= 0 ? 1 : -1;
    busy = true;
    noEl.textContent = String(sec.dataset.page || 0).padStart(2, '0');
    nameEl.textContent = nameOf(sec);
    sheet.classList.toggle('is-back', dir < 0);
    el.classList.add('is-on');
    const inFrom = dir > 0 ? 'translateX(104%) rotateY(-26deg)' : 'translateX(-104%) rotateY(26deg)';
    const outTo = dir > 0 ? 'translateX(-104%) rotateY(20deg)' : 'translateX(104%) rotateY(-20deg)';
    sheet.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
    try {
      await sheet.animate([{ transform: inFrom }, { transform: 'none' }], { duration: 360, easing: ease, fill: 'forwards' }).finished;
      const html = document.documentElement, sb = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      target.scrollIntoView({ block: 'start' });
      html.style.scrollBehavior = sb;
      if (hash) history.pushState(null, '', hash);
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 110));
      sheet.style.transformOrigin = dir > 0 ? '100% 50%' : '0% 50%';
      await sheet.animate([{ transform: 'none' }, { transform: outTo }], { duration: 420, easing: ease, fill: 'forwards' }).finished;
    } finally {
      el.classList.remove('is-on');
      sheet.getAnimations().forEach((a) => a.cancel());
      busy = false;
    }
  };
}
