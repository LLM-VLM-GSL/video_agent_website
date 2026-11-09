// Method section: a scroll-driven walk through one real kept moment (skim, pause, rewind, keep).
// Frames, the moment interval, its subtitles and the verifier's rationale come from data/story.json.
window.PRK = window.PRK || {};
window.PRK.story = function (data) {
  const root = document.getElementById('story');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const clean = (t) => t.replace(/\b(um+|uh+|uh huh|you know)\b[,]?\s*/gi, '').replace(/\s+/g, ' ').trim()
    .replace(/^./, (c) => c.toUpperCase());

  // The first example video and the Qwen3.5-27B moment that tells the story best.
  const video = data.videos.find((v) => v.group === 'consensus') || data.videos[0];
  const own = [...(video.models['qwen35-27b'] || Object.values(video.models)[0]).pairs].sort((a, b) => a.t - b.t);
  // Frame hashes (export_showcase.py) tell whether two kept frames show the same slide.
  const dist = (a, b) => (a && b ? [...(BigInt(`0x${a}`) ^ BigInt(`0x${b}`)).toString(2)].filter((c) => c === '1').length : 0);
  const previous = (i) => {
    for (let j = i - 1; j >= 0; j--) if (dist(own[i].h, own[j].h) >= 15) return j;
    return -1;
  };
  // Tell the story with a verified moment whose start follows a clearly different visual.
  const score = (p, i) => {
    const j = previous(i);
    if (j < 0 || p.s - own[j].t > 120) return -1;
    return (p.hit && p.verifier ? 2 : 0) + (p.e - p.s >= 20 && p.e - p.s <= 90 ? 1 : 0) + dist(p.h, own[j].h) / 64;
  };
  const best = own.map((p, i) => [score(p, i), i]).sort((a, b) => b[0] - a[0])[0];
  const moment = own[best[0] >= 0 ? best[1] : own.length - 1];
  const prior = own[previous(own.indexOf(moment))] || moment;
  const { s, e } = moment;
  // Before the start the old visual stays on screen; from the start on, the kept frame.
  const frameAt = (t) => (t >= s ? moment.img : prior.img);

  // Scripted positions: growing skim jumps past the start, then a bisection back to it.
  const A = Math.max(0, Math.min(s - 80, prior.t));
  // Jumps grow while the screen stays the same; the last one lands just past the start.
  const growth = [1, 1.4, 1.8, 2.2], total = growth.reduce((x, y) => x + y, 0);
  const skim = growth.reduce((pts, g) => [...pts, pts[pts.length - 1] + ((s + 10 - A) * g) / total], [A]);
  const L = skim[skim.length - 1];
  const before = skim[skim.length - 2];
  const bisect = [s - 5, s + 2.5, s - 1.25];
  const W0 = Math.max(0, A - 20), W1 = Math.min(video.duration, Math.max(e, L) + 30);
  const X = (t) => `${(100 * (clamp(t, W0, W1) - W0)) / (W1 - W0)}%`;

  $('stage-url').textContent = `${video.category} lecture`;
  $('tl-start').textContent = fmt(W0);
  $('tl-end').textContent = fmt(W1);
  const probes = $('tl-probes');
  const tick = (t, cls) => {
    const node = document.createElement('i');
    node.className = cls;
    node.style.left = X(t);
    probes.appendChild(node);
    return node;
  };
  const skimTicks = skim.map((t) => tick(t, 'tl-probe skim'));
  const bisectTicks = bisect.map((t) => tick(t, 'tl-probe back'));
  $('triage-before').src = frameAt(before);
  $('triage-after').src = frameAt(L);
  $('moment-img').src = moment.img;
  $('moment-time').textContent = `${fmt(s)}–${fmt(e)}`;
  $('moment-text').textContent = `“${clean(moment.text)}…”`;
  $('moment-verifier').textContent = moment.verifier;

  const layers = [...document.querySelectorAll('.stage-img')];
  let front = 0;
  const show = (src) => {
    if (layers[front].getAttribute('src') === src) return;
    front = 1 - front;
    layers[front].src = src;
    layers[front].classList.add('is-front');
    layers[1 - front].classList.remove('is-front');
  };
  layers[0].src = frameAt(A);
  layers[0].classList.add('is-front');

  const steps = [...root.querySelectorAll('.story-item')];
  const live = [0, 1, 2, 3].map((i) => $(`live-${i}`));
  const head = $('tl-head'), bracket = $('tl-bracket'), record = $('tl-record');
  const mode = $('stage-mode'), time = $('stage-time'), stage = root.querySelector('.story-stage');
  const frame = root.querySelector('.stage-frame');
  const MODES = [['SKIM', '→'], ['PAUSE', '❚❚'], ['REWIND', '←'], ['KEEP', '✓']];

  const place = (t) => { head.style.left = X(t); time.textContent = fmt(t); };
  const walk = (points, k) => {
    // Visit points in order; each hop takes an equal share of k.
    const n = points.length - 1;
    const i = Math.min(n, Math.floor(k * n + 1e-9));
    const f = k * n - i;
    const a = points[i], b = points[Math.min(n, i + 1)];
    return { i, t: f < 0.65 ? a : b };
  };

  let last = -1;
  const render = () => {
    const rect = root.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    const p = clamp(-rect.top / span);
    if (p === last) return;
    last = p;
    const step = Math.min(3, Math.floor(p * 4));
    const k = clamp(p * 4 - step);
    steps.forEach((el, i) => {
      el.classList.toggle('is-active', i === step);
      el.classList.toggle('is-done', i < step);
      el.style.setProperty('--fill', i < step ? 1 : i === step ? k : 0);
    });
    stage.dataset.step = step;
    mode.textContent = `${MODES[step][0]} ${MODES[step][1]}`;

    skimTicks.forEach((el, i) => el.classList.toggle('is-on', step > 0 || i <= walk(skim, k).i));
    bisectTicks.forEach((el, i) => el.classList.toggle('is-on', step > 2 || (step === 2 && k > 0.12 + 0.12 * i)));
    bracket.style.left = X(s);
    bracket.classList.toggle('is-on', step > 2 || (step === 2 && k > 0.5));
    const grow = step > 2 ? 1 : step === 2 ? ease((k - 0.55) / 0.4) : 0;
    record.style.left = X(s);
    record.style.width = `calc(${X(s + grow * (e - s))} - ${X(s)})`;
    record.classList.toggle('is-kept', step === 3);

    const chip = (html) => `<span class="live-dot"></span>${html}`;
    if (step === 0) {
      const w = walk(skim, k);
      place(w.t); show(frameAt(w.t));
      const jump = w.i > 0 ? skim[w.i] - skim[w.i - 1] : 0;
      live[0].innerHTML = chip(w.i > 0 ? `jump <b>+${Math.round(jump)} s</b> · ${w.i} frame${w.i > 1 ? 's' : ''} compared · no change`
        : 'scanning from <b>' + fmt(skim[0]) + '</b>');
    } else if (step === 1) {
      place(L); show(frameAt(L));
      live[1].innerHTML = chip(k > 0.5 ? 'triage: <b>new visual</b> · worth a closer look' : 'comparing <b>2 frames</b>…');
    } else if (step === 2) {
      if (k < 0.5) {
        const w = walk(bisect, clamp((k - 0.1) / 0.4));
        const t = k < 0.1 ? L : w.t;
        place(t); show(frameAt(t));
        const n = k < 0.1 ? 0 : Math.min(bisect.length, walk(bisect, clamp((k - 0.1) / 0.4)).i + 1);
        live[2].innerHTML = chip(n ? `probe <b>${n}/${bisect.length}</b> · ${t < s ? 'old visual' : 'new visual'} at ${fmt(t)}`
          : 'looking back from <b>' + fmt(L) + '</b>');
      } else {
        const t = s + grow * (e - s);
        place(t); show(moment.img);
        mode.textContent = 'RECORDING ●';
        live[2].innerHTML = chip(`start found at <b>${fmt(s)}</b> · recording ${fmt(t - s)}`);
      }
    } else {
      place(moment.t); show(moment.img);
      live[3].innerHTML = chip(k > 0.72 ? '<b>verified</b> · kept ' + fmt(s) + '–' + fmt(e)
        : k > 0.12 ? 'frame chosen at <b>' + fmt(moment.t) + '</b>' : 'choosing the frame…');
    }
    $('stage-triage').classList.toggle('is-on', step === 1 && k > 0.15);
    $('stage-triage').classList.toggle('is-judged', step === 1 && k > 0.5);
    frame.classList.toggle('is-picked', step === 3 && k > 0.12);
    $('stage-moment').classList.toggle('is-on', step === 3 && k > 0.5);
    $('stage-moment').classList.toggle('is-verified', step === 3 && k > 0.72);
  };
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { last = -1; onScroll(); });
  render();
};
