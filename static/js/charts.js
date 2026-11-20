// Native dark-theme charts built from data/core.json: findings, subject heatmap and the benchmark charts.
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

  // Finding 1: for the backbones in the paper's browsing table, the share of reference anchors seen against anchor recall.
  function scatter() {
    const box = $('chart-scatter');
    const B = data.browse;
    if (!box || !B) return;
    const rows = window.PRK.byFamily(data.results).filter((r) => B[r.id]);
    const W = 460, row = 34, m = { l: 150, r: 18, t: 30, b: 40 };
    const H = m.t + rows.length * row + m.b;
    const lo = 0.4, hi = 1;
    const sx = (v) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, box);
    [0.4, 0.6, 0.8, 1].forEach((v) => {
      svg('line', { x1: sx(v), x2: sx(v), y1: m.t - 8, y2: H - m.b, class: 'grid' }, s);
      text(s, sx(v), H - m.b + 18, `${Math.round(v * 100)}%`, { class: 'tick', 'text-anchor': 'middle' });
    });
    text(s, m.l, 14, '● anchor recall', { class: 'axis ar-key' });
    text(s, m.l + 120, 14, '● seen', { class: 'axis seen-key' });
    rows.forEach((r, i) => {
      const y = m.t + i * row + row / 2;
      const seen = B[r.id].seen, ar = r.target_recall;
      const g = svg('g', { class: 'dot-g', style: `--d:${i * 70}ms` }, s);
      text(g, m.l - 12, y + 4, r.name, { class: 'dot-label', 'text-anchor': 'end' });
      svg('line', { x1: sx(ar), x2: sx(seen), y1: y, y2: y, class: 'gap-line' }, g);
      svg('circle', { cx: sx(ar), cy: y, r: 6, class: 'dot' }, g);
      svg('circle', { cx: sx(seen), cy: y, r: 6, class: 'dot seen' }, g);
      hover(g, `<b>${esc(r.name)}</b><br>Seen ${pct(seen)}<br>Anchor recall ${pct(ar)}`);
    });
    text(s, (sx(lo) + sx(hi)) / 2, H - 6, 'Share of human reference anchors', { class: 'axis', 'text-anchor': 'middle' });
    reveal(box);
  }

  // Finding 2: the last stage each reference anchor reaches; the found share is anchor recall.
  function attribution() {
    const box = $('chart-attribution');
    const A = data.attribution;
    if (!box || !A) return;
    const stages = A.stages;
    const colors = ['#3b82f6', '#7dd3fc', '#c084fc', '#fdba74', '#f9a8d4', '#94a3b8'];
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
        seg.style.cssText = `flex:${v} 0 0;background:${colors[j]};color:${j ? '#0b1220' : '#fff'}`;
        if (v >= 0.12) seg.textContent = `${Math.round(100 * v)}`;
        hover(seg, `<b>${esc(r.name)}</b><br>${esc(st.label)}: ${pct(v)} of reference anchors`);
        bar.appendChild(seg);
      });
      rows.appendChild(row);
    });
    box.appendChild(legend);
    box.appendChild(rows);
    reveal(box);
  }

  // Finding 3: median anchor length, people against the backbones of the paper's browsing table.
  function lengths() {
    const box = $('chart-lengths');
    const B = data.browse;
    if (!box || !B) return;
    const human = data.human_anchor_median_s;
    const rows = Object.entries(B).map(([id, g]) => ({ id, v: g.median_len_s })).sort((a, b) => a.v - b.v);
    const max = Math.ceil(human / 5) * 5 + 5;
    const wrap = document.createElement('div');
    wrap.className = 'len-rows';
    wrap.style.setProperty('--hf', human / max);
    wrap.innerHTML = `<div class="len-human-line"><span>People ${human.toFixed(1)} s</span></div>`;
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'len-row';
      row.style.setProperty('--d', `${i * 60}ms`);
      row.style.setProperty('--w', `${(100 * r.v) / max}%`);
      row.innerHTML = `<div class="len-name">${esc(name[r.id] || r.id)}</div><div class="len-track"><div class="len-fill"></div></div><div class="len-val">${r.v.toFixed(1)} s</div>`;
      hover(row, `<b>${esc(name[r.id] || r.id)}</b><br>Median anchor ${r.v.toFixed(1)} s, people ${human.toFixed(1)} s<br>Split ${pct(B[r.id].split)}, merge ${pct(B[r.id].merge)}`);
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
    reveal(box);
  }

  // Results: anchor recall on each subject; one row per subject, one dot per backbone, coloured by family.
  const FAMILY_COLORS = ['#a78bfa', '#22d3ee', '#4ade80', '#fbbf24', '#f472b6', '#fb7185', '#e2e8f0', '#60a5fa'];
  function heatmap() {
    const box = $('chart-heatmap');
    if (!box || !data.subjects) return;
    const cats = Object.entries(data.subjects).filter(([c]) => SHORT[c]).sort((a, b) => b[1].videos - a[1].videos);
    const rows = window.PRK.byFamily(data.results);
    const fams = [...new Set(rows.map((r) => r.family))];
    const color = (r) => FAMILY_COLORS[fams.indexOf(r.family) % FAMILY_COLORS.length];
    const legend = document.createElement('div');
    legend.className = 'chart-legend fam-legend';
    legend.innerHTML = fams.map((f, i) => `<span><i style="background:${FAMILY_COLORS[i]}"></i>${esc(f)}</span>`).join('');
    box.appendChild(legend);
    const W = 960, rowH = 36, m = { l: 150, r: 24, t: 10, b: 34 };
    const H = m.t + cats.length * rowH + m.b;
    const lo = 0.3, hi = 0.9;
    const sx = (v) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart subject-dots' }, box);
    [0.3, 0.45, 0.6, 0.75, 0.9].forEach((v) => {
      svg('line', { x1: sx(v), x2: sx(v), y1: m.t, y2: H - m.b + 4, class: 'grid' }, s);
      text(s, sx(v), H - 10, `${Math.round(v * 100)}%`, { class: 'tick', 'text-anchor': 'middle' });
    });
    cats.forEach(([c, v], i) => {
      const y = m.t + i * rowH + rowH / 2;
      const vals = rows.map((r) => v.recall[r.id]).filter((x) => x !== undefined);
      const g = svg('g', { class: 'dot-g', style: `--d:${i * 60}ms` }, s);
      text(g, m.l - 16, y + 4, SHORT[c], { class: 'dot-label', 'text-anchor': 'end' });
      text(g, m.l - 16, y + 16, `${v.videos} videos`, { class: 'tick', 'text-anchor': 'end' });
      svg('line', { x1: sx(Math.min(...vals)), x2: sx(Math.max(...vals)), y1: y, y2: y, class: 'range-line' }, g);
      const best = Math.max(...vals);
      rows.forEach((r) => {
        const x = v.recall[r.id];
        if (x === undefined) return;
        const d = svg('circle', { cx: sx(x), cy: y, r: x === best ? 7 : 5, fill: color(r), class: `sdot${x === best ? ' is-best' : ''}` }, g);
        hover(d, `<b>${esc(r.name)}</b> · ${esc(c)}<br>Anchor recall ${pct(x)}`);
      });
    });
    reveal(box);
  }

  // Subject colours, in donut order (most videos first); the typical-video strip reuses them.
  const COLORS = ['#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb7185', '#fb923c', '#fbbf24'];
  const subjectColor = (cat) => {
    const order = Object.entries(data.category_stats || {}).sort((a, b) => b[1].videos - a[1].videos).map(([c]) => c);
    return COLORS[Math.max(0, order.indexOf(cat)) % COLORS.length];
  };

  // Benchmark: one real video close to the medians; a playhead sweeps and the anchors people kept light up.
  function typical() {
    const box = $('typical');
    const T = data.typical, D = data.dataset;
    if (!box || !T) return;
    const color = subjectColor(T.category);
    box.style.setProperty('--c', color);
    const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    $('typical-title').innerHTML = `${esc(T.title)} <span><i></i>${esc(T.category)}</span>`;
    $('typical-end').textContent = clock(T.duration);
    $('typical-note').textContent = `${T.human.length} anchors kept · ${Math.round(100 * T.covered)}% of the video`;
    const track = $('typical-track'), play = $('typical-play');
    const blocks = T.human.map(([a, b]) => {
      const n = document.createElement('i');
      n.style.cssText = `left:${(100 * a) / T.duration}%;width:${(100 * (b - a)) / T.duration}%`;
      hover(n, `Anchor ${clock(a)}–${clock(b)} · ${Math.round(b - a)} s`);
      track.appendChild(n);
      return { n, a, b };
    });
    const stats = [
      [D.median_video_min, 1, 'min', 'median video'], [D.targets_per_video, 1, '', 'anchors per video'],
      [D.target_len_median, 0, 's', 'median anchor'], [100 * D.time_coverage, 0, '%', 'of video time kept'],
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
        sub.textContent = `${rows.length} subjects · ${hours.toFixed(1)} h · ${targets.toLocaleString()} anchors`;
        box.style.setProperty('--focus', '#a78bfa');
      } else {
        const { cat, v, color } = slices[i];
        count(v.videos); label.textContent = cat;
        sub.textContent = `${pct(v.videos / total)} · ${v.hours.toFixed(1)} h · ${v.targets.toLocaleString()} anchors`;
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

  // Headline numbers inside the finding cards, from the paper's tables.
  const fill = (id, str) => { const n = $(id); if (n) n.textContent = str; };
  const range = (xs, d = 1) => `${(100 * Math.min(...xs)).toFixed(d)}% to ${(100 * Math.max(...xs)).toFixed(d)}%`;
  if (data.browse) {
    const B = Object.values(data.browse);
    const seen = B.map((g) => g.seen), len = B.map((g) => g.median_len_s);
    fill('f1-big', `${(100 * Math.min(...seen)).toFixed(1)}–${(100 * Math.max(...seen)).toFixed(1)}%`);
    fill('f3-big', `${data.human_anchor_median_s.toFixed(1)} s`);
    fill('f3-agents', `${Math.min(...len).toFixed(1)}–${Math.max(...len).toFixed(1)} s`);
  }
  fill('f1-recall', range(results.map((r) => r.target_recall)));

  scatter(); attribution(); lengths(); heatmap(); donut(); typical();
};
