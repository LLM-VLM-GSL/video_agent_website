// First pass through the page moves one screen per wheel or key press, with a light sweep between screens.
// Inside the method story each press advances one step. Once the reader reaches the end, scrolling is free.
(function () {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { if (sessionStorage.getItem('prk-snap-done') === '1') return; } catch (e) { /* storage blocked: snap anyway */ }

  const sweep = document.createElement('div');
  sweep.className = 'snap-sweep';
  document.body.appendChild(sweep);
  const dots = document.createElement('nav');
  dots.className = 'snap-dots';
  document.body.appendChild(dots);

  const top = (n) => n.getBoundingClientRect().top + window.scrollY;
  const sections = () => [...document.querySelectorAll('main > section')];

  // Scroll positions a press can land on, top to bottom.
  function stops() {
    const vh = window.innerHeight;
    const out = [];
    sections().forEach((sec) => {
      const y = top(sec), h = sec.offsetHeight;
      out.push(y);
      const story = sec.querySelector('#story');
      if (story) {
        const st = top(story), span = story.offsetHeight - vh;
        for (let k = 0; k < 4; k++) out.push(st + (span * (k + 0.5)) / 4);
        out.push(st + span);
        return;
      }
      for (let p = y + vh * 0.85; p < y + h - vh * 0.6; p += vh * 0.85) out.push(p);
    });
    out.push(document.documentElement.scrollHeight - vh);
    return out.sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1] > 40);
  }

  function buildDots() {
    dots.innerHTML = '';
    sections().forEach((sec) => {
      const b = document.createElement('button');
      b.setAttribute('aria-label', sec.id || 'section');
      b.onclick = () => go(top(sec), top(sec) > window.scrollY ? 1 : -1);
      dots.appendChild(b);
    });
  }

  function markDots() {
    const mid = window.scrollY + window.innerHeight * 0.4;
    let at = 0;
    sections().forEach((sec, i) => { if (top(sec) <= mid) at = i; });
    [...dots.children].forEach((b, i) => b.classList.toggle('is-on', i === at));
  }

  let busy = false, raf = 0;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function go(target, dir) {
    busy = true;
    cancelAnimationFrame(raf);
    const from = window.scrollY, dist = target - from, t0 = performance.now();
    const dur = Math.min(1300, 750 + Math.abs(dist) * 0.25);
    sweep.classList.remove('up', 'down');
    void sweep.offsetWidth;
    sweep.classList.add(dir > 0 ? 'down' : 'up');
    sweep.style.animationDuration = `${dur}ms`;
    const step = (now) => {
      const k = Math.min((now - t0) / dur, 1);
      // 'instant': the template's smooth scroll-behavior would restart on every frame.
      window.scrollTo({ top: from + dist * ease(k), behavior: 'instant' });
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      markDots();
      // Hold briefly so trackpad inertia does not trigger the next screen.
      setTimeout(() => { busy = false; }, 380);
      if (dir > 0 && target >= document.documentElement.scrollHeight - window.innerHeight - 4) finish();
    };
    raf = requestAnimationFrame(step);
  }

  function move(dir) {
    const y = window.scrollY, list = stops();
    const target = dir > 0 ? list.find((p) => p > y + 8) : [...list].reverse().find((p) => p < y - 8);
    if (target === undefined) { if (dir > 0) finish(); return; }
    go(target, dir);
  }

  const lightboxOpen = () => document.querySelector('.lightbox.is-open');
  function onWheel(e) {
    if (lightboxOpen() || e.ctrlKey) return;
    e.preventDefault();
    if (busy || Math.abs(e.deltaY) < 4) return;
    move(e.deltaY > 0 ? 1 : -1);
  }
  const KEYS = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };
  function onKey(e) {
    const dir = KEYS[e.key];
    if (!dir || lightboxOpen() || /input|textarea|select|button/i.test(document.activeElement.tagName)) return;
    e.preventDefault();
    if (!busy) move(e.shiftKey && e.key === ' ' ? -1 : dir);
  }

  function finish() {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', markDots);
    dots.classList.add('is-gone');
    try { sessionStorage.setItem('prk-snap-done', '1'); } catch (e) { /* ignore */ }
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', markDots, { passive: true });
  window.addEventListener('load', () => { buildDots(); markDots(); });
})();
