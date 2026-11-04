// Builds the data-driven parts of the page from data/showcase.json (written by scripts/export_showcase.py).
(function () {
  const SVG = 'http://www.w3.org/2000/svg';
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const el = (tag, attrs = {}, html = '') => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (html) node.innerHTML = html;
    return node;
  };
  const svg = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };
  // Subtitles are raw speech recognition; drop filler words for display.
  const clean = (t) => t.replace(/\b(um+|uh+|uh huh|you know)\b[,]?\s*/gi, '').replace(/\s+/g, ' ').trim()
    .replace(/^./, (c) => c.toUpperCase());
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function onVisible(node, fn) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
    }), { threshold: 0.25 });
    io.observe(node);
  }

  function countUp(node, target, decimals, suffix = '') {
    const start = performance.now();
    const step = (now) => {
      const k = Math.min((now - start) / 1400, 1);
      const v = target * (1 - Math.pow(1 - k, 3));
      node.textContent = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Teaser: clean clip; status, kept count and the people/agent timeline follow the video frame by frame.
  function teaser(data) {
    const video = document.getElementById('teaser-video');
    const tabs = document.getElementById('teaser-tabs');
    const thumb = tabs.querySelector('.seg-thumb');
    const human = document.getElementById('lane-human');
    const agent = document.getElementById('lane-agent');
    const play = document.getElementById('tl-play');
    const mode = document.getElementById('teaser-mode');
    const time = document.getElementById('teaser-time');
    const kept = document.getElementById('teaser-kept');
    let clip = null, blocks = [], raf = 0, last = -1;
    const block = (lane, [a, b], d) => {
      const n = el('i', { style: `left:${(100 * a) / d}%;width:${Math.max(0.4, (100 * (b - a)) / d)}%` });
      lane.appendChild(n);
      return n;
    };
    const tick = () => {
      if (clip && clip.frames.length) {
        const i = Math.min(clip.frames.length - 1, Math.floor(video.currentTime * clip.fps));
        if (i !== last) {
          last = i;
          const f = clip.frames[i];
          play.style.left = `${(100 * f.t) / clip.duration}%`;
          time.textContent = fmt(f.t);
          mode.textContent = f.mode;
          mode.classList.toggle('is-capture', f.capture);
          blocks.forEach((b, j) => b.classList.toggle('is-on', j < f.saved));
          kept.querySelector('b').textContent = f.saved;
          kept.classList.toggle('is-bump', f.saved > 0 && f.saved !== +kept.dataset.n);
          kept.dataset.n = f.saved;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const show = (t, button) => {
      clip = t; last = -1;
      video.src = t.mp4;
      video.play().catch(() => {});
      document.getElementById('teaser-url').textContent = `youtube.com/watch?v=${t.id}`;
      document.getElementById('tl-dur').textContent = fmt(t.duration);
      human.innerHTML = ''; agent.innerHTML = '';
      (t.human || []).forEach((h) => block(human, h, t.duration));
      blocks = (t.segments || []).map((g) => block(agent, g, t.duration));
      tabs.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b === button));
      Object.assign(thumb.style, { left: `${button.offsetLeft}px`, width: `${button.offsetWidth}px` });
    };
    data.teasers.forEach((t, i) => {
      const b = el('button', { class: 'seg-btn' }, escape(t.category.split(' / ')[0]));
      b.onclick = () => show(t, b);
      tabs.appendChild(b);
      if (i === 0) requestAnimationFrame(() => show(t, b));
    });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    // The recording grows into place as it scrolls in.
    const wrap = document.getElementById('teaser-wrap');
    const grow = () => {
      const r = wrap.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight * 0.75)));
      wrap.style.setProperty('--k', k.toFixed(3));
    };
    window.addEventListener('scroll', grow, { passive: true });
    grow();
  }

  function stats(data) {
    const d = data.dataset;
    const best = data.results.reduce((a, b) => (b.target_recall > a.target_recall ? b : a));
    const items = [
      [d.videos, 0, 'videos'], [d.hours, 1, 'hours of video'], [d.targets, 0, 'reference moments'],
      [Object.keys(data.categories).length, 0, 'subjects'], [100 * best.target_recall, 1, `moments found by the best agent`, '%'],
    ];
    const grid = document.getElementById('stat-grid');
    items.forEach(([value, decimals, label, suffix]) => {
      const card = el('div', { class: 'stat' }, `<div class="stat-value">0</div><div class="stat-label">${escape(label)}</div>`);
      grid.appendChild(card);
      onVisible(card, () => countUp(card.querySelector('.stat-value'), value, decimals, suffix));
    });
  }

  function bars(container, rows, max, cls) {
    rows.forEach((r) => {
      const row = el('div', { class: `hbar ${cls || ''}` }, `<div class="hbar-label">${escape(r.label)}</div>
        <div class="hbar-track"><div class="hbar-fill"></div>${r.ci ? '<div class="hbar-ci"></div>' : ''}</div>
        <div class="hbar-value">${escape(r.value)}</div>`);
      container.appendChild(row);
      onVisible(row, () => {
        row.querySelector('.hbar-fill').style.width = `${(100 * r.x) / max}%`;
        if (r.ci) Object.assign(row.querySelector('.hbar-ci').style, { left: `${(100 * r.ci[0]) / max}%`, width: `${(100 * (r.ci[1] - r.ci[0])) / max}%` });
        row.classList.add('is-shown');
      });
    });
  }

  function benchmark(data) {
    const rows = Object.entries(data.categories).sort((a, b) => b[1] - a[1])
      .map(([label, n]) => ({ label, x: n, value: `${n}` }));
    const subjects = document.getElementById('subject-bars');
    if (subjects) bars(subjects, rows, rows[0].x);
    const results = [...data.results].sort((a, b) => b.target_recall - a.target_recall)
      .map((r) => ({ label: r.name, x: r.target_recall, ci: r.ci95, value: pct(r.target_recall) }));
    bars(document.getElementById('result-bars'), results, 1);
    document.querySelector('#result-bars .hbar').classList.add('is-best');
    document.getElementById('results-lead').textContent =
      `Share of the moments people kept in which the agent kept a frame, on ${data.cohort_videos} videos / ` +
      `${data.cohort_targets.toLocaleString()} reference moments shared by all backbones (bars: 95% bootstrap CI).`;
    const c = data.complementarity;
    const union = document.getElementById('union-card');
    union.innerHTML = `<div class="union-big">0%</div><div class="union-text">of the moments people kept are found by <b>at least one</b>
      of the ${data.results.length} backbones, against ${pct(results[0].x)} for the best single model and only ${pct(c.all_model_recall)} found by all of them.
      Different models miss different moments — the gap is in <b>discovery</b>, not localization.</div>`;
    const big = union.querySelector('.union-big');
    onVisible(union, () => countUp(big, 100 * c.any_model_recall, 1, '%'));
  }

  function pairCard(pair, extra, model) {
    const card = el('div', { class: 'pair-card' });
    card.innerHTML = `<img src="${pair.img}" alt="" loading="lazy"><div class="pair-body">
      ${model ? `<span class="pair-tag model">${escape(model)}</span>` : ''}<span class="pair-tag ${pair.hit ? 'hit' : 'miss'}">${pair.hit ? 'matches a person' : 'outside'}</span>
      <span class="pair-time">${fmt(pair.s)}–${fmt(pair.e)}</span>
      <div class="pair-text">${escape(clean(pair.text))}…</div>${extra || ''}</div>`;
    return card;
  }

  function viewer(data) {
    const chips = document.getElementById('video-chips');
    const lanes = document.getElementById('lanes');
    const strip = document.getElementById('pair-strip');
    const tip = document.getElementById('tooltip');
    const groupName = { consensus: 'easy', divergent: 'split', hard: 'hard' };
    let current = null;
    let selected = 'qwen35-27b';
    let anim = null;

    const showTip = (pair, evt) => {
      tip.innerHTML = '';
      tip.appendChild(pairCard(pair));
      const x = Math.min(evt.clientX + 16, window.innerWidth - 316);
      const y = evt.clientY + 16 + 300 > window.innerHeight ? evt.clientY - 300 : evt.clientY + 16;
      Object.assign(tip.style, { left: `${x}px`, top: `${Math.max(8, y)}px` });
      tip.classList.add('is-visible');
    };
    const hideTip = () => tip.classList.remove('is-visible');

    // Position-in-video against progress through the session, for the annotator and the selected backbone.
    let pathAnim = 0;
    const drawPath = () => {
      const v = current, m = v.models[selected];
      const box = document.getElementById('path-plot');
      document.getElementById('path-model').textContent = m.name;
      cancelAnimationFrame(pathAnim);
      box.innerHTML = '';
      const W = 1000, H = 340, L = 54, R = 14, T = 14, B = 26;
      const sx = (k) => L + k * (W - L - R);
      const sy = (t) => H - B - (Math.max(0, Math.min(t, v.duration)) / v.duration) * (H - T - B);
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'path-svg' });
      box.appendChild(s);
      v.human.forEach(([a, b]) => s.appendChild(svg('rect', { x: L, width: W - L - R, y: sy(b), height: Math.max(1.5, sy(a) - sy(b)), class: 'path-band' })));
      [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
        s.appendChild(svg('line', { x1: L, x2: W - R, y1: sy(f * v.duration), y2: sy(f * v.duration), class: 'path-grid' }));
        const t = svg('text', { x: L - 8, y: sy(f * v.duration) + 4, class: 'path-tick', 'text-anchor': 'end' });
        t.textContent = fmt(f * v.duration);
        s.appendChild(t);
      });
      [['start of session', L, 'start'], ['end', W - R, 'end']].forEach(([label, x, anchor]) => {
        const t = svg('text', { x, y: H - 6, class: 'path-tick', 'text-anchor': anchor });
        t.textContent = label;
        s.appendChild(t);
      });
      // Both sessions are stretched to the same width so their order of moves can be compared.
      const series = (points) => {
        const end = points[points.length - 1][0] || 1;
        return points.map(([e, t, kind]) => [sx(e / end), sy(t), kind, t]);
      };
      const people = series(v.human_path && v.human_path.length ? v.human_path : [[0, 0, 'play'], [1, v.duration, 'play']]);
      const agent = series(m.trajectory.length ? m.trajectory : [[0, 0, ''], [1, 0, '']]);
      const draw = (pts, cls) => {
        const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        const path = svg('path', { d, class: `path-line ${cls}` });
        s.appendChild(path);
        const backs = [];
        for (let i = 1; i < pts.length; i++) {
          if (pts[i][3] < pts[i - 1][3] - 2) {
            const seg = svg('line', { x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], class: 'path-back' });
            s.appendChild(seg);
            backs.push({ seg, x: pts[i][0] });
          }
        }
        const head = svg('circle', { r: 5.5, class: `path-head-dot ${cls}` });
        s.appendChild(head);
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len} ${len}`;
        return { path, head, len, backs };
      };
      const lines = [draw(people, 'people'), draw(agent, 'agent')];
      const count = (pts, test) => pts.filter((p, i) => i && test(p, pts[i - 1])).length;
      const back = (p, q) => p[3] < q[3] - 2;
      const jump = (p, q) => p[3] > q[3] + 8 && Math.abs(p[0] - q[0]) < 6;
      document.getElementById('path-stats').innerHTML = [
        ['Look-backs', count(people, back), count(agent, back)],
        ['Jumps forward', count(people, jump), count(agent, jump)],
        ['Moments kept', v.human.length, m.pairs_total],
      ].map(([label, a, b]) => `<div><span>${label}</span><b class="c-human">${a}</b><em>people</em><b class="c-agent">${b}</b><em>${escape(m.name)}</em></div>`).join('');
      const t0 = performance.now(), D = 6500;
      const tick = (now) => {
        const k = Math.min((now - t0) / D, 1);
        const e = 1 - Math.pow(1 - k, 2);
        lines.forEach(({ path, head, len, backs }) => {
          path.style.strokeDashoffset = `${len * (1 - e)}`;
          const pt = path.getPointAtLength(len * e);
          head.setAttribute('cx', pt.x); head.setAttribute('cy', pt.y);
          backs.forEach((bk) => bk.seg.classList.toggle('is-on', bk.x <= pt.x + 0.5));
        });
        if (k < 1) pathAnim = requestAnimationFrame(tick);
      };
      pathAnim = requestAnimationFrame(tick);
    };

    const renderStrip = () => {
      drawPath();
      strip.innerHTML = '';
      current.models[selected].pairs.forEach((p) => strip.appendChild(pairCard(p)));
      lanes.querySelectorAll('.lane-name').forEach((n) => n.classList.toggle('is-selected', n.dataset.model === selected));
    };

    const render = (v) => {
      current = v;
      if (anim) cancelAnimationFrame(anim);
      // Lane width in real pixels so dots stay round (viewBox matches the rendered size).
      const W = Math.max(200, Math.round(lanes.getBoundingClientRect().width - (window.innerWidth <= 768 ? 158 : 238)));
      const x = (t) => (W * Math.max(0, Math.min(t, v.duration))) / v.duration;
      document.getElementById('viewer-title').innerHTML = `<a href="${v.url}" target="_blank">${escape(v.title.replace(/ - YouTube$/, ''))}</a>`;
      document.getElementById('viewer-meta').textContent = `${v.category} · ${fmt(v.duration)} · ${v.human.length} human targets`;
      lanes.innerHTML = '';
      const human = el('div', { class: 'lane human' }, '<div class="lane-name">Human</div>');
      const hs = svg('svg', { viewBox: `0 0 ${W} 22`, width: W });
      hs.appendChild(svg('rect', { x: 0, y: 6, width: W, height: 10, rx: 5, fill: 'var(--lane-bg)' }));
      v.human.forEach(([s, e], i) => {
        const k = v.human_hits[i] ?? 0;
        hs.appendChild(svg('rect', { x: x(s), y: 4, width: Math.max(3, x(e) - x(s)), height: 14, rx: 4, fill: 'var(--human)', 'fill-opacity': 0.2 + 0.16 * k }));
      });
      human.appendChild(hs);
      human.appendChild(el('div', { class: 'lane-score' }, ''));
      lanes.appendChild(human);
      const heads = [];
      Object.entries(v.models).forEach(([id, m]) => {
        const lane = el('div', { class: 'lane' }, `<div class="lane-name" data-model="${id}">${escape(m.name)}</div>`);
        lane.querySelector('.lane-name').onclick = () => { selected = id; renderStrip(); };
        const s = svg('svg', { viewBox: `0 0 ${W} 34`, width: W });
        s.appendChild(svg('rect', { x: 0, y: 12, width: W, height: 10, rx: 5, fill: 'var(--lane-bg)' }));
        m.segments.forEach(([a, b]) => s.appendChild(svg('rect', { x: x(a), y: 12, width: Math.max(2, x(b) - x(a)), height: 10, rx: 3, fill: 'var(--agent)', 'fill-opacity': 0.85 })));
        const trail = svg('polyline', { points: '', fill: 'none', stroke: 'var(--jump)', 'stroke-width': 1.5, 'stroke-opacity': 0.35, 'vector-effect': 'non-scaling-stroke' });
        s.appendChild(trail);
        const head = svg('line', { x1: 0, x2: 0, y1: 4, y2: 30, stroke: 'var(--ink)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', opacity: 0 });
        s.appendChild(head);
        m.pairs.forEach((p) => {
          const dot = svg('circle', { cx: x(p.t), cy: 17, r: 6, fill: '#0b0f19', stroke: p.hit ? 'var(--human)' : '#64748b', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', style: 'cursor:pointer' });
          dot.addEventListener('mousemove', (e) => showTip(p, e));
          dot.addEventListener('mouseleave', hideTip);
          dot.addEventListener('click', () => { selected = id; renderStrip(); });
          s.appendChild(dot);
        });
        lane.appendChild(s);
        lane.appendChild(el('div', { class: 'lane-score' }, `${Math.round(100 * m.recall)}%`));
        lanes.appendChild(lane);
        heads.push({ m, head, trail });
      });
      renderStrip();
      play(heads, x);
    };

    // Replays every backbone's real playhead over a common 10-second window
    // (elapsed time normalized per model), drawing a fading trail of its jumps.
    const play = (heads, x) => {
      if (anim) cancelAnimationFrame(anim);
      const start = performance.now();
      const D = 10000;
      const tick = (now) => {
        const k = Math.min((now - start) / D, 1);
        heads.forEach(({ m, head, trail }) => {
          const traj = m.trajectory;
          if (!traj.length) return;
          const end = traj[traj.length - 1][0] || 1;
          let i = 0;
          while (i < traj.length - 1 && traj[i + 1][0] / end <= k) i++;
          const px = x(traj[i][1]);
          head.setAttribute('x1', px); head.setAttribute('x2', px); head.setAttribute('opacity', 1);
          head.setAttribute('stroke', traj[i][2] === 'capture' ? 'var(--agent)' : 'var(--ink)');
          trail.setAttribute('points', traj.slice(Math.max(0, i - 25), i + 1).map((p, j) => `${x(p[1])},${17 + ((j % 2) ? -4 : 4)}`).join(' '));
        });
        if (k < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
      document.getElementById('viewer-play').onclick = () => play(heads, x);
    };

    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => current && render(current), 200); });
    data.videos.forEach((v, i) => {
      const c = el('button', { class: 'chip' }, `<span class="chip-group">${groupName[v.group] || v.group}</span>${escape(v.category.split(' / ')[0].split(',')[0])}`);
      c.onclick = () => {
        chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('is-active', b === c));
        render(v);
      };
      chips.appendChild(c);
      if (i === 0) {
        c.classList.add('is-active');
        render(v);
        onVisible(document.getElementById('lanes'), () => document.getElementById('viewer-play').click());
      }
    });
  }

  // Gallery of a few in-target example pairs, with tilt and a lightbox.
  function gallery(data) {
    const grid = document.getElementById('gallery-grid');
    const box = document.getElementById('lightbox');
    const body = document.getElementById('lightbox-body');
    const subject = (v) => v.category.split(' / ')[0].split(',')[0];
    const open = (p, v, model) => {
      body.innerHTML = `<img src="${p.img}" alt=""><div class="lb-text">
        <span class="pair-tag model">${escape(model)}</span><span class="pair-tag hit">matches a person</span>
        <span class="pair-time">${fmt(p.s)}–${fmt(p.e)}</span>
        <h4><a href="${v.url}&t=${Math.floor(p.s)}s" target="_blank">${escape(v.title.replace(/ - YouTube$/, ''))}</a></h4>
        <div>${escape(clean(p.text))}…</div>
        ${p.verifier ? `<div class="lb-quote">Verifier: “${escape(p.verifier)}”</div>` : ''}</div>`;
      box.classList.add('is-open');
    };
    const close = () => box.classList.remove('is-open');
    document.getElementById('lightbox-close').onclick = close;
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // A few hand-picked examples: one per subject, rotating backbones, English narration only.
    const cards = [];
    const seen = new Set();
    const english = (t) => /^[\x00-\x7F\u2018-\u201d]*$/.test(t);
    data.videos.forEach((v) => {
      if (cards.length >= 6 || seen.has(subject(v))) return;
      const models = Object.values(v.models);
      for (let i = 0; i < models.length; i++) {
        const m = models[(cards.length + i) % models.length];
        const p = m.pairs.find((q) => q.hit && q.verifier && english(q.text));
        if (!p) continue;
        const card = pairCard(p, `<div class="verifier">“${escape(p.verifier)}”</div>`, m.name);
        card.onclick = () => open(p, v, m.name);
        cards.push(card);
        seen.add(subject(v));
        break;
      }
    });
    cards.forEach((c) => grid.appendChild(c));
    if (window.VanillaTilt && matchMedia('(hover: hover)').matches) {
      VanillaTilt.init(cards, { max: 8, speed: 400, glare: true, 'max-glare': 0.15, scale: 1.02 });
    }
  }

  // Hero background: rows of real collected moments drifting in opposite directions.
  function wall(data) {
    const pairs = [];
    data.videos.forEach((v) => Object.values(v.models).forEach((m) => m.pairs.forEach((p) => pairs.push(p))));
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1);
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const rows = 5;
    const per = 14;
    const wallEl = document.getElementById('pair-wall');
    for (let r = 0; r < rows; r++) {
      const row = el('div', { class: 'wall-row' });
      const pick = pairs.slice(r * per, (r + 1) * per);
      [...pick, ...pick].forEach((p) => {
        const cell = el('span', { class: 'wall-cell', 'data-t': p.t },
          `<img src="${p.img}" alt="" loading="${r < 3 ? 'eager' : 'lazy'}"><i class="wall-lock"><b></b><b></b><b></b><b></b><span></span></i>`);
        row.appendChild(cell);
      });
      wallEl.appendChild(row);
    }
  }

  // 3D layer on the hero: the wall leans toward the pointer and the agent locks onto moments at the edges.
  // ?hero=classic shows the plain wall.
  function hero3d() {
    const stage = document.getElementById('top');
    if (new URLSearchParams(location.search).get('hero') === 'classic') stage.classList.remove('hero-3d');
    if (!stage.classList.contains('hero-3d')) return;
    const wallEl = document.getElementById('pair-wall');
    let tx = 0, ty = 0, gx = 0, gy = 0;
    window.addEventListener('mousemove', (e) => {
      gx = (e.clientX / window.innerWidth - 0.5) * 10;
      gy = (0.5 - e.clientY / window.innerHeight) * 8;
    }, { passive: true });
    const lean = () => {
      tx += (gx - tx) * 0.06; ty += (gy - ty) * 0.06;
      wallEl.style.setProperty('--tx', `${tx.toFixed(2)}deg`);
      wallEl.style.setProperty('--ty', `${ty.toFixed(2)}deg`);
      requestAnimationFrame(lean);
    };
    lean();

    const kept = document.getElementById('hero-kept');
    const clock = document.getElementById('hero-clock');
    const t0 = performance.now();
    let n = 0;
    setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      clock.textContent = `T+${[s / 3600, (s / 60) % 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':')}`;
    }, 1000);
    const cells = [...wallEl.querySelectorAll('.wall-cell')];
    const parts = [...stage.querySelectorAll('.hero-title > span, .hero-sub, .publication-links > a')];
    const lock = () => {
      if (window.scrollY < window.innerHeight) {
        const W = window.innerWidth, H = window.innerHeight;
        // Only moments fully on screen and clear of the title block, with room for the lift.
        const rs = parts.map((n) => n.getBoundingClientRect()), pad = 40;
        const box = { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)),
          top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) };
        const free = cells.filter((c) => {
          const r = c.getBoundingClientRect();
          const clear = r.right < box.left - pad || r.left > box.right + pad || r.bottom < box.top - pad || r.top > box.bottom + pad;
          return clear && r.left > 40 && r.right < W - 60 && r.top > 60 && r.bottom < H - 70;
        });
        const c = free[Math.floor(Math.random() * free.length)];
        if (c) {
          c.querySelector('.wall-lock span').textContent = `KEEP · ${fmt(+c.dataset.t)}`;
          c.classList.add('is-lock');
          kept.textContent = String(++n).padStart(4, '0');
          setTimeout(() => c.classList.remove('is-lock'), 2400);
        }
      }
      setTimeout(lock, 1400);
    };
    setTimeout(lock, 900);
  }

  // Abstract: wrap every word, then light words up as the paragraph scrolls through the viewport.
  function scrub() {
    const root = document.getElementById('abstract');
    if (!root) return;
    const wrap = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            frag.appendChild(/\S/.test(part) ? el('span', { class: 'w' }, escape(part)) : document.createTextNode(part));
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          wrap(child);
        }
      });
    };
    wrap(root);
    const words = [...root.querySelectorAll('.w')];
    let lit = -1;
    const update = () => {
      const r = root.getBoundingClientRect();
      const k = Math.min(1, Math.max(0, (window.innerHeight * 0.82 - r.top) / (r.height + window.innerHeight * 0.1)));
      const n = Math.round(k * words.length);
      if (n === lit) return;
      words.forEach((w, i) => w.classList.toggle('lit', i < n));
      lit = n;
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Floating nav (after the hero), active-section highlight and cursor glow.
  function chrome() {
    const nav = document.getElementById('topnav');
    const links = [...nav.querySelectorAll('.topnav-links a')];
    const onScroll = () => {
      nav.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.6);
      let current = null;
      links.forEach((a) => {
        const sec = document.querySelector(a.getAttribute('href'));
        if (sec && sec.getBoundingClientRect().top < window.innerHeight * 0.4) current = a;
      });
      links.forEach((a) => a.classList.toggle('is-active', a === current));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const glow = document.getElementById('cursor-glow');
    window.addEventListener('mousemove', (e) => { glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, { passive: true });
  }

  fetch('data/showcase.json?v=11').then((r) => r.json()).then((data) => {
    wall(data); hero3d(); teaser(data); stats(data); benchmark(data); viewer(data); gallery(data);
    if (window.PRK) { window.PRK.story && window.PRK.story(data); window.PRK.charts && window.PRK.charts(data); }
    if (window.AOS) AOS.refresh();
  });
  chrome();
  scrub();
  window.addEventListener('load', () => window.AOS && AOS.init({ duration: 800, once: true, offset: 60, easing: 'ease-out-cubic' }));
})();
