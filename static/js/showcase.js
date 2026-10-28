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
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function onVisible(node, fn) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
    }), { threshold: 0.25 });
    io.observe(node);
  }

  function countUp(node, target, decimals) {
    const start = performance.now();
    const step = (now) => {
      const k = Math.min((now - start) / 1400, 1);
      const v = target * (1 - Math.pow(1 - k, 3));
      node.textContent = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function teaser(data) {
    const video = document.getElementById('teaser-video');
    const tabs = document.getElementById('teaser-tabs');
    const show = (t, button) => {
      video.src = t.mp4;
      video.play().catch(() => {});
      document.getElementById('teaser-url').textContent = `youtube.com/watch?v=${t.id}`;
      tabs.querySelectorAll('.teaser-tab').forEach((b) => b.classList.toggle('is-active', b === button));
    };
    data.teasers.forEach((t, i) => {
      const b = el('button', { class: 'teaser-tab' }, escape(t.category));
      b.onclick = () => show(t, b);
      tabs.appendChild(b);
      if (i === 0) show(t, b);
    });
  }

  function stats(data) {
    const d = data.dataset;
    const best = data.results.reduce((a, b) => (b.target_recall > a.target_recall ? b : a));
    const items = [
      [d.videos, 0, 'videos'], [d.hours, 1, 'hours of lectures'], [d.targets, 0, 'human targets'],
      [Object.keys(data.categories).length, 0, 'subjects'], [100 * best.target_recall, 1, `% targets found (${best.name})`],
    ];
    const grid = document.getElementById('stat-grid');
    items.forEach(([value, decimals, label]) => {
      const card = el('div', { class: 'stat' }, `<div class="stat-value">0</div><div class="stat-label">${escape(label)}</div>`);
      grid.appendChild(card);
      onVisible(card, () => countUp(card.querySelector('.stat-value'), value, decimals));
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
    bars(document.getElementById('subject-bars'), rows, rows[0].x);
    const results = [...data.results].sort((a, b) => b.target_recall - a.target_recall)
      .map((r) => ({ label: r.name, x: r.target_recall, ci: r.ci95, value: pct(r.target_recall) }));
    bars(document.getElementById('result-bars'), results, 1);
    document.querySelector('#result-bars .hbar').classList.add('is-best');
    document.getElementById('results-lead').textContent =
      `Share of human targets whose segment the agent recovered, on ${data.cohort_videos} videos / ` +
      `${data.cohort_targets.toLocaleString()} targets shared by all backbones (bars: 95% bootstrap CI).`;
    const c = data.complementarity;
    document.getElementById('complementarity-caption').textContent =
      `Backbones are complementary: ${pct(c.any_model_recall)} of targets are found by at least one model, ` +
      `but only ${pct(c.all_model_recall)} by all five.`;
    const union = document.getElementById('union-card');
    union.innerHTML = `<div class="union-big">0%</div><div class="union-text">of human targets are found by <b>at least one</b>
      of the five backbones, against ${pct(results[0].x)} for the best single model and only ${pct(c.all_model_recall)} found by all of them.
      Different models miss different moments — the gap is in <b>discovery</b>, not localization.</div>`;
    const big = union.querySelector('.union-big');
    onVisible(union, () => {
      countUp(big, 100 * c.any_model_recall, 1);
      setTimeout(() => { big.textContent += '%'; }, 1450);
    });
  }

  function pairCard(pair, extra, model) {
    const card = el('div', { class: 'pair-card' });
    card.innerHTML = `<img src="${pair.img}" alt="" loading="lazy"><div class="pair-body">
      ${model ? `<span class="pair-tag model">${escape(model)}</span>` : ''}<span class="pair-tag ${pair.hit ? 'hit' : 'miss'}">${pair.hit ? 'in target' : 'outside'}</span>
      <span class="pair-time">${fmt(pair.s)}–${fmt(pair.e)}</span>
      <div class="pair-text">${escape(pair.text)}…</div>${extra || ''}</div>`;
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

    const renderStrip = () => {
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

  // Masonry of in-target pairs (one per backbone per video), filterable by subject, with tilt and a lightbox.
  function gallery(data) {
    const grid = document.getElementById('gallery-grid');
    const filter = document.getElementById('gallery-filter');
    const box = document.getElementById('lightbox');
    const body = document.getElementById('lightbox-body');
    const subject = (v) => v.category.split(' / ')[0].split(',')[0];
    const open = (p, v, model) => {
      body.innerHTML = `<img src="${p.img}" alt=""><div class="lb-text">
        <span class="pair-tag model">${escape(model)}</span><span class="pair-tag hit">in target</span>
        <span class="pair-time">${fmt(p.s)}–${fmt(p.e)}</span>
        <h4><a href="${v.url}&t=${Math.floor(p.s)}s" target="_blank">${escape(v.title.replace(/ - YouTube$/, ''))}</a></h4>
        <div>${escape(p.text)}…</div>
        ${p.verifier ? `<div class="lb-quote">Verifier: “${escape(p.verifier)}”</div>` : ''}</div>`;
      box.classList.add('is-open');
    };
    const close = () => box.classList.remove('is-open');
    document.getElementById('lightbox-close').onclick = close;
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    const cards = [];
    data.videos.forEach((v) => Object.values(v.models).forEach((m, k) => {
      const p = m.pairs.find((q) => q.hit && q.verifier);
      if (!p) return;
      const card = pairCard(p, `<div class="verifier">“${escape(p.verifier)}”</div>`, m.name);
      card.dataset.subject = subject(v);
      card.dataset.model = k;
      card.onclick = () => open(p, v, m.name);
      cards.push(card);
    }));
    // Order by backbone first so neighbouring cards show different lectures.
    cards.map((c, i) => [c, c.dataset.model, i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).forEach(([c]) => grid.appendChild(c));
    if (window.VanillaTilt && matchMedia('(hover: hover)').matches) {
      VanillaTilt.init(cards, { max: 8, speed: 400, glare: true, 'max-glare': 0.15, scale: 1.02 });
    }

    const subjects = ['All', ...new Set(cards.map((c) => c.dataset.subject))];
    subjects.forEach((name, i) => {
      const chip = el('button', { class: `chip${i ? '' : ' is-active'}` }, escape(name));
      chip.onclick = () => {
        filter.querySelectorAll('.chip').forEach((b) => b.classList.toggle('is-active', b === chip));
        cards.forEach((c) => c.classList.toggle('is-hidden', name !== 'All' && c.dataset.subject !== name));
      };
      filter.appendChild(chip);
    });
  }

  // Hero background: rows of real collected pairs drifting in opposite directions.
  function wall(data) {
    const imgs = [];
    data.videos.forEach((v) => Object.values(v.models).forEach((m) => m.pairs.forEach((p) => imgs.push(p.img))));
    for (let i = imgs.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1);
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    }
    const rows = 5;
    const per = 14;
    const wallEl = document.getElementById('pair-wall');
    for (let r = 0; r < rows; r++) {
      const row = el('div', { class: 'wall-row' });
      const pick = imgs.slice(r * per, (r + 1) * per);
      [...pick, ...pick].forEach((src) => row.appendChild(el('img', { src, alt: '', loading: r < 3 ? 'eager' : 'lazy' })));
      wallEl.appendChild(row);
    }
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

  fetch('data/showcase.json').then((r) => r.json()).then((data) => {
    wall(data); teaser(data); stats(data); benchmark(data); viewer(data); gallery(data);
    if (window.AOS) AOS.refresh();
  });
  chrome();
  window.addEventListener('load', () => window.AOS && AOS.init({ duration: 800, once: true, offset: 60, easing: 'ease-out-cubic' }));
})();
