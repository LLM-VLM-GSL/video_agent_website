// Native dark-theme charts built from data/showcase.json: findings, subject heatmap, complementarity, benchmark histograms.
window.PRK = window.PRK || {};
window.PRK.charts = function (data) {
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  };
  const text = (parent, x, y, str, attrs = {}) => {
    const t = svg('text', { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  };
  const results = [...data.results].sort((a, b) => b.target_recall - a.target_recall);
  const name = Object.fromEntries(data.results.map((r) => [r.id, r.name]));
  const SHORT = {
    'Medicine / Medical Imaging': 'Medicine', 'Earth / Geospatial Sciences': 'Earth', 'Life Sciences': 'Life Sci.',
    'Art': 'Art', 'Geometry & Visual Computing': 'Geometry', 'Chemistry / Materials Science': 'Chemistry',
    'Physics & Astronomy': 'Physics', 'Engineering': 'Engineering', 'Archaeology': 'Archaeology',
    'Architecture & Design': 'Architecture', 'Humanities, History & Social Sciences': 'Humanities',
  };

  // One floating tooltip shared by every chart.
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);
  const hover = (node, html) => {
    node.addEventListener('mousemove', (ev) => {
      tip.innerHTML = html;
      tip.style.left = `${Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
      tip.style.top = `${ev.clientY + 14}px`;
      tip.classList.add('is-on');
    });
    node.addEventListener('mouseleave', () => tip.classList.remove('is-on'));
  };
  const reveal = (node) => {
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { node.classList.add('is-in'); io.disconnect(); }
    }), { threshold: 0.3 });
    io.observe(node);
  };

  // Validated dark-mode one-hue blue ramp (dataviz reference), light = high.
  const RAMP = ['#104281', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ramp = (x) => {
    const f = Math.min(0.9999, Math.max(0, x)) * (RAMP.length - 1);
    const i = Math.floor(f), a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * (f - i))).join(',')})`;
  };

  // Finding 1: time precision against moment recall on one shared percentage scale.
  function scatter() {
    const box = $('chart-scatter');
    if (!box) return;
    const W = 460, H = 360, m = { l: 52, r: 120, t: 16, b: 46 };
    const lo = 0.4, hi = 0.8;
    const sx = (v) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
    const sy = (v) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, box);
    [0.4, 0.5, 0.6, 0.7, 0.8].forEach((v) => {
      svg('line', { x1: sx(lo), x2: sx(hi), y1: sy(v), y2: sy(v), class: 'grid' }, s);
      svg('line', { x1: sx(v), x2: sx(v), y1: sy(lo), y2: sy(hi), class: 'grid' }, s);
      text(s, m.l - 8, sy(v) + 4, `${v * 100}%`, { class: 'tick', 'text-anchor': 'end' });
      text(s, sx(v), H - m.b + 18, `${v * 100}%`, { class: 'tick', 'text-anchor': 'middle' });
    });
    const rnd = 0.614;
    svg('line', { x1: sx(rnd), x2: sx(rnd), y1: sy(lo), y2: sy(hi), class: 'ref' }, s);
    text(s, sx(rnd) - 6, sy(lo) - 8, 'random placement', { class: 'ref-label', 'text-anchor': 'end' });
    text(s, (sx(lo) + sx(hi)) / 2, H - 6, 'Time precision: share of kept time inside human moments', { class: 'axis', 'text-anchor': 'middle' });
    text(s, 14, (sy(lo) + sy(hi)) / 2, 'Moment recall', { class: 'axis', 'text-anchor': 'middle', transform: `rotate(-90 14 ${(sy(lo) + sy(hi)) / 2})` });
    // Labels sit right of the dot; models whose recall nearly ties a more precise one go left.
    const left = new Set();
    results.forEach((a) => results.forEach((b) => {
      if (a !== b && Math.abs(a.target_recall - b.target_recall) < 0.012 && a.time_precision < b.time_precision) left.add(a.id);
    }));
    results.forEach((r, i) => {
      const g = svg('g', { class: 'dot-g', style: `--d:${i * 70}ms` }, s);
      const best = i === 0;
      svg('circle', { cx: sx(r.time_precision), cy: sy(r.target_recall), r: best ? 7 : 5.5, class: best ? 'dot best' : 'dot' }, g);
      const onLeft = left.has(r.id);
      text(g, sx(r.time_precision) + (onLeft ? -11 : 11), sy(r.target_recall) + 4, r.name, { class: 'dot-label', 'text-anchor': onLeft ? 'end' : 'start' });
      hover(g, `<b>${esc(r.name)}</b><br>Moment recall ${pct(r.target_recall)}<br>Time precision ${pct(r.time_precision)}`);
    });
    reveal(box);
  }

  // Finding 2: where each backbone's missed moments were lost.
  function attribution() {
    const box = $('chart-attribution');
    const A = data.attribution;
    if (!box || !A) return;
    const stages = A.stages;
    const colors = ['#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb'];
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.innerHTML = stages.map((st, i) => `<span><i style="background:${colors[i]}"></i>${esc(st.label)}</span>`).join('');
    const rows = document.createElement('div');
    rows.className = 'stack-rows';
    results.forEach((r, i) => {
      const a = A.models[r.id];
      if (!a) return;
      const row = document.createElement('div');
      row.className = 'stack-row';
      row.style.setProperty('--d', `${i * 60}ms`);
      row.innerHTML = `<div class="stack-name">${esc(r.name)}</div><div class="stack-bar"></div>`;
      const bar = row.querySelector('.stack-bar');
      stages.forEach((st, j) => {
        const v = a.share[st.id];
        const seg = document.createElement('div');
        seg.className = 'stack-seg';
        seg.style.cssText = `flex:${v} 0 0;background:${colors[j]};color:${j >= 3 ? '#0b1220' : '#fff'}`;
        if (v >= 0.12) seg.textContent = `${Math.round(100 * v)}`;
        hover(seg, `<b>${esc(r.name)}</b><br>${esc(st.label)}: ${pct(v)} of ${a.missed.toLocaleString()} missed moments`);
        bar.appendChild(seg);
      });
      rows.appendChild(row);
    });
    box.appendChild(legend);
    box.appendChild(rows);
    reveal(box);
  }

  // Finding 3: median moment length, people against each backbone.
  function lengths() {
    const box = $('chart-lengths');
    const G = data.granularity;
    if (!box || !G) return;
    const human = Object.values(G)[0].human_median_s;
    const rows = Object.entries(G).map(([id, g]) => ({ id, v: g.agent_median_s })).sort((a, b) => a.v - b.v);
    const max = Math.ceil(human / 5) * 5 + 5;
    const wrap = document.createElement('div');
    wrap.className = 'len-rows';
    wrap.style.setProperty('--hf', human / max);
    wrap.innerHTML = `<div class="len-human-line"><span>People ${human.toFixed(0)} s</span></div>`;
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'len-row';
      row.style.setProperty('--d', `${i * 60}ms`);
      row.style.setProperty('--w', `${(100 * r.v) / max}%`);
      row.innerHTML = `<div class="len-name">${esc(name[r.id] || r.id)}</div><div class="len-track"><div class="len-fill"></div></div><div class="len-val">${r.v.toFixed(1)} s</div>`;
      hover(row, `<b>${esc(name[r.id] || r.id)}</b><br>Median kept moment ${r.v.toFixed(1)} s, people ${human.toFixed(0)} s`);
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
    reveal(box);
  }

  // Results: moment recall per backbone (rows) and subject (columns).
  function heatmap() {
    const box = $('chart-heatmap');
    if (!box || !data.subjects) return;
    const cats = Object.entries(data.subjects).filter(([c]) => SHORT[c]).sort((a, b) => b[1].videos - a[1].videos);
    const vals = cats.flatMap(([, v]) => Object.values(v.recall));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const grid = document.createElement('div');
    grid.className = 'heat';
    grid.style.gridTemplateColumns = `150px repeat(${cats.length}, minmax(0, 1fr))`;
    grid.innerHTML = '<div></div>' + cats.map(([c, v]) => `<div class="heat-col">${SHORT[c]}<small>${v.videos}</small></div>`).join('');
    const rows = window.PRK.byFamily(data.results);
    rows.forEach((r, i) => {
      const label = document.createElement('div');
      // A hairline above the first row of each model family.
      const first = i && window.PRK.family(rows[i - 1].id)[0] !== window.PRK.family(r.id)[0];
      label.className = `heat-row${first ? ' is-family' : ''}`;
      label.textContent = r.name;
      grid.appendChild(label);
      cats.forEach(([c, v], j) => {
        const x = v.recall[r.id];
        const cell = document.createElement('div');
        const f = (x - lo) / (hi - lo);
        cell.className = `heat-cell${first ? ' is-family' : ''}`;
        cell.style.cssText = `background:${ramp(f)};color:${f > 0.55 ? '#0b1220' : '#e8edf5'};--d:${(i + j) * 25}ms`;
        cell.textContent = Math.round(100 * x);
        hover(cell, `<b>${esc(r.name)}</b> · ${esc(c)}<br>Moment recall ${pct(x)} on ${v.videos} videos`);
        grid.appendChild(cell);
      });
    });
    const scale = document.createElement('div');
    scale.className = 'heat-scale';
    scale.innerHTML = `<span>${Math.round(100 * lo)}%</span><i style="background:linear-gradient(90deg,${RAMP.join(',')})"></i><span>${Math.round(100 * hi)}%</span>`;
    box.appendChild(grid);
    box.appendChild(scale);
    reveal(box);
  }

  // Results: how many backbones found each reference moment.
  function complementarity() {
    const box = $('chart-k');
    const c = data.complementarity;
    if (!box || !c) return;
    const entries = Object.entries(c.hit_by_k_models);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const max = Math.max(...entries.map(([, v]) => v));
    box.innerHTML = '<div class="kbars"></div><div class="kbars-axis">Reference moments found by k of ' +
      `${entries.length - 1} backbones</div>`;
    const bars = box.querySelector('.kbars');
    entries.forEach(([k, v], i) => {
      const col = document.createElement('div');
      col.className = `kbar${k === '0' ? ' none' : ''}`;
      col.style.setProperty('--k', v / max);
      col.style.setProperty('--d', `${i * 50}ms`);
      col.innerHTML = `<span>${Math.round((100 * v) / total)}%</span><div></div><em>${k}</em>`;
      hover(col, k === '0' ? `${v} moments (${pct(v / total)}) found by no backbone`
        : `${v} moments (${pct(v / total)}) found by exactly ${k}`);
      bars.appendChild(col);
    });
    reveal(box);
  }

  // Subject colours, in donut order (most videos first); the typical-video strip reuses them.
  const COLORS = ['#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#fb923c', '#fbbf24'];
  const subjectColor = (cat) => {
    const order = Object.entries(data.category_stats || {}).sort((a, b) => b[1].videos - a[1].videos).map(([c]) => c);
    return COLORS[Math.max(0, order.indexOf(cat)) % COLORS.length];
  };

  // Benchmark: one real video close to the medians; a playhead sweeps and the moments people kept light up.
  function typical() {
    const box = $('typical');
    const T = data.typical, D = data.dataset;
    if (!box || !T) return;
    const color = subjectColor(T.category);
    box.style.setProperty('--c', color);
    const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    $('typical-title').innerHTML = `${esc(T.title)} <span><i></i>${esc(T.category)}</span>`;
    $('typical-end').textContent = clock(T.duration);
    $('typical-note').textContent = `${T.human.length} moments kept · ${Math.round(100 * T.covered)}% of the video`;
    const track = $('typical-track'), play = $('typical-play');
    const blocks = T.human.map(([a, b]) => {
      const n = document.createElement('i');
      n.style.cssText = `left:${(100 * a) / T.duration}%;width:${(100 * (b - a)) / T.duration}%`;
      hover(n, `Moment ${clock(a)}–${clock(b)} · ${Math.round(b - a)} s`);
      track.appendChild(n);
      return { n, a, b };
    });
    const stats = [
      [D.median_video_min, 1, 'min', 'median video'], [D.targets_per_video, 1, '', 'moments per video'],
      [D.target_len_median, 0, 's', 'median moment'], [100 * D.time_coverage, 0, '%', 'of video time kept'],
    ];
    $('typical-stats').innerHTML = stats.map(([, , unit, label]) =>
      `<div class="typical-stat"><div class="typical-num"><b>0</b><small>${unit}</small></div><div class="typical-label">${label}</div></div>`).join('');
    const nums = [...box.querySelectorAll('.typical-num b')];
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      const t0 = performance.now(), dur = 3600;
      const step = (now) => {
        const k = Math.min((now - t0) / dur, 1);
        const t = k * T.duration;
        play.style.left = `${100 * k}%`;
        blocks.forEach((bl) => {
          const f = Math.max(0, Math.min(1, (t - bl.a) / (bl.b - bl.a)));
          bl.n.style.transform = `scaleX(${f})`;
          bl.n.classList.toggle('is-done', f >= 1);
        });
        nums.forEach((n, i) => {
          const f = Math.min(1, Math.max(0, k * 1.6 - i * 0.18));
          const v = stats[i][0] * (1 - Math.pow(1 - f, 3));
          n.textContent = v.toFixed(stats[i][1]);
        });
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    $('typical-replay').onclick = run;
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { run(); io.disconnect(); }
    }), { threshold: 0.4 });
    io.observe(box);
  }

  // Benchmark: subjects as an animated donut; hover or the auto tour lifts one slice and fills the centre.
  function donut() {
    const box = $('chart-donut');
    const stats = data.category_stats;
    if (!box || !stats) return;
    const rows = Object.entries(stats).sort((a, b) => b[1].videos - a[1].videos);
    const total = rows.reduce((a, [, v]) => a + v.videos, 0);
    const hours = data.dataset.hours, targets = data.dataset.targets;
    const R = 150, SW = 46, C = 2 * Math.PI * R, GAP = 3, LAYERS = 14;
    // A thick ring: the same slices stacked in depth, darker towards the bottom, tilted in CSS 3D.
    const solid = document.createElement('div');
    solid.className = 'donut-3d';
    box.querySelector('.donut-stage').appendChild(solid);
    const layers = [];
    for (let l = LAYERS - 1; l >= 0; l--) {
      const s = svg('svg', { viewBox: '0 0 400 400', class: `donut-layer${l === 0 ? ' is-top' : ''}` }, solid);
      s.style.transform = `translateZ(${-l * 2.2}px)`;
      if (l) s.style.filter = `brightness(${(0.32 + 0.4 * (1 - l / LAYERS)).toFixed(2)})`;
      layers.unshift(svg('g', { transform: 'translate(200 200)' }, s));
    }
    svg('circle', { r: R, class: 'donut-track', 'stroke-width': SW }, layers[0]);
    let start = 0;
    const slices = rows.map(([cat, v], i) => {
      const len = (C * v.videos) / total;
      const mid = ((start + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
      const color = COLORS[i % COLORS.length];
      const parts = layers.map((layer) => {
        const g = svg('g', { class: 'donut-slice', style: `--dx:${(Math.cos(mid) * 14).toFixed(1)}px;--dy:${(Math.sin(mid) * 14).toFixed(1)}px` }, layer);
        const c = svg('circle', {
          r: R, 'stroke-width': SW, stroke: color, fill: 'none', transform: 'rotate(-90)',
          'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': -start, style: `transition-delay:${i * 70}ms`,
        }, g);
        return { g, c };
      });
      start += len;
      return { cat, v, g: parts[0].g, parts, len, color };
    });
    const big = box.querySelector('.donut-big'), label = box.querySelector('.donut-label'), sub = box.querySelector('.donut-sub');
    const legend = box.querySelector('.donut-legend');
    let shown = total, raf = 0;
    const count = (to) => {
      cancelAnimationFrame(raf);
      const from = shown, t0 = performance.now();
      const step = (now) => {
        const k = Math.min((now - t0) / 500, 1);
        shown = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        big.textContent = shown.toLocaleString();
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const focus = (i) => {
      slices.forEach((sl, j) => {
        sl.parts.forEach(({ g }) => {
          g.classList.toggle('is-focus', j === i);
          g.classList.toggle('is-dim', i !== null && j !== i);
        });
        sl.row.classList.toggle('is-focus', j === i);
      });
      if (i === null) {
        count(total); label.textContent = 'videos';
        sub.textContent = `${rows.length} subjects · ${hours.toFixed(1)} h · ${targets.toLocaleString()} moments`;
        box.style.setProperty('--focus', '#a78bfa');
      } else {
        const { cat, v, color } = slices[i];
        count(v.videos); label.textContent = cat;
        sub.textContent = `${pct(v.videos / total)} · ${v.hours.toFixed(1)} h · ${v.targets.toLocaleString()} moments`;
        box.style.setProperty('--focus', color);
      }
    };
    slices.forEach((sl, i) => {
      const row = document.createElement('div');
      row.className = 'donut-row';
      row.style.setProperty('--c', sl.color);
      row.style.setProperty('--d', `${300 + i * 60}ms`);
      row.innerHTML = `<i></i><span>${esc(sl.cat)}</span><b>${sl.v.videos}</b><em>${pct(sl.v.videos / total, 0)}</em>`;
      legend.appendChild(row);
      sl.row = row;
    });
    // Auto tour through the subjects until the reader takes over.
    let tour = null, at = -1, held = false;
    const startTour = () => {
      clearInterval(tour);
      tour = setInterval(() => { if (!held) { at = (at + 1) % slices.length; focus(at); } }, 2200);
    };
    const hold = (i) => { held = true; box.classList.add('is-held'); focus(i); };
    const release = () => { held = false; box.classList.remove('is-held'); focus(null); };
    slices.forEach((sl, i) => {
      [sl.g, sl.row].forEach((n) => { n.addEventListener('mouseenter', () => hold(i)); n.addEventListener('mouseleave', release); });
    });
    focus(null);
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) {
        box.classList.add('is-in');
        slices.forEach((sl) => sl.parts.forEach(({ c }) => c.setAttribute('stroke-dasharray', `${Math.max(0, sl.len - GAP)} ${C}`)));
        setTimeout(startTour, 1800);
      } else {
        clearInterval(tour);
      }
    }), { threshold: 0.35 });
    io.observe(box);
  }

  // Headline numbers inside the finding cards.
  const tps = results.map((r) => r.time_precision);
  const recalls = results.map((r) => r.target_recall);
  const fill = (id, str) => { const n = $(id); if (n) n.textContent = str; };
  fill('f1-big', `${Math.round(100 * Math.min(...tps))}–${Math.round(100 * Math.max(...tps))}%`);
  fill('f1-recall', `${Math.round(100 * Math.min(...recalls))}% to ${Math.round(100 * Math.max(...recalls))}%`);
  if (data.attribution) {
    const never = Object.values(data.attribution.models).map((a) => a.share.never_observed);
    fill('f2-big', `≤ ${Math.ceil(100 * Math.max(...never))}%`);
  }
  if (data.granularity) {
    const g = Object.values(data.granularity);
    fill('f3-big', `${g[0].human_median_s.toFixed(0)} s`);
    fill('f3-agents', `${Math.round(Math.min(...g.map((x) => x.agent_median_s)))}–${Math.round(Math.max(...g.map((x) => x.agent_median_s)))} s`);
  }

  scatter(); attribution(); lengths(); heatmap(); complementarity(); donut(); typical();
};
