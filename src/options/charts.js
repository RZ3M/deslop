// The two charts in Data: posts hidden per day as stacked columns, and posts
// hidden per filter as stacked bars, each split by site. Plain SVG and HTML.
// Marks follow one set of rules: bars at most 24px thick with a 2px gap
// between stacked segments and a rounded end away from the baseline, hairline
// gridlines, a tooltip listing every site on hover or keyboard focus, and the
// same numbers as a table under each chart.

const NS = 'http://www.w3.org/2000/svg';
const COLUMN_MAX = 24;
const GAP = 2;
const RADIUS = 4;

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const formatCount = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

// 0, a round step, …: three or four gridlines that cover the highest value.
function ticksFor(max) {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(t);
  return ticks;
}

// A column segment with a rounded top (the data end) and a square base.
function columnPath(x, y, w, h, rounded) {
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// The legend: a swatch beside each site's name, in the text colour.
export function legend(target, series) {
  target.replaceChildren(
    ...series.map((s) => {
      const item = el('span', 'legend-item');
      const swatch = el('i');
      swatch.style.background = s.color;
      item.append(swatch, s.label);
      return item;
    }),
  );
  target.hidden = series.length < 2;
}

// The tooltip: a title, then each site's value (strong) and name, keyed by a
// short stroke of its colour, and a total when there's more than one site.
function tooltipFor(root) {
  let tip = root.querySelector(':scope > .tooltip');
  if (!tip) {
    tip = el('div', 'tooltip');
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    root.append(tip);
  }
  return {
    show(title, rows, x, y) {
      const list = rows.map(({ label, color, value }) => {
        const row = el('div', 'tip-row');
        const key = el('i');
        key.style.background = color;
        row.append(key, el('b', '', formatCount(value)), el('span', '', label));
        return row;
      });
      if (rows.length > 1) {
        const total = el('div', 'tip-row tip-total');
        total.append(el('i'), el('b', '', formatCount(rows.reduce((n, r) => n + r.value, 0))), el('span', '', 'Total'));
        list.push(total);
      }
      tip.replaceChildren(el('div', 'tip-title', title), ...list);
      tip.hidden = false;
      const box = root.getBoundingClientRect();
      const left = Math.min(Math.max(x + 12, 0), box.width - tip.offsetWidth);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 8)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

// Posts hidden per day. `days` is [{ label, values: { [series id]: n } }].
export function stackedColumns(root, days, series) {
  const width = Math.max(280, root.clientWidth);
  const height = 220;
  const m = { top: 10, right: 6, bottom: 26, left: 38 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const totals = days.map((d) => series.reduce((n, s) => n + (d.values[s.id] || 0), 0));
  const ticks = ticksFor(Math.max(...totals));
  const top = ticks[ticks.length - 1];
  const y = (v) => m.top + plotH - (v / top) * plotH;
  const band = plotW / days.length;
  const barW = Math.max(2, Math.min(COLUMN_MAX, band - GAP * 2));

  const chart = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', tabindex: 0 });
  chart.setAttribute('aria-label', 'Posts hidden per day. Use the left and right arrow keys to read each day.');
  root.replaceChildren(chart);

  for (const t of ticks) {
    chart.append(svg('line', { x1: m.left, x2: width - m.right, y1: y(t), y2: y(t), class: t === 0 ? 'axis' : 'grid' }));
    const label = svg('text', { x: m.left - 8, y: y(t), class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = formatCount(t);
    chart.append(label);
  }

  // Dates under the first, middle and last columns.
  const labelled = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  for (const i of labelled) {
    const anchor = i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle';
    const x = i === 0 ? m.left : i === days.length - 1 ? width - m.right : m.left + band * (i + 0.5);
    const label = svg('text', { x, y: height - 6, class: 'tick', 'text-anchor': anchor });
    label.textContent = days[i].label;
    chart.append(label);
  }

  const hover = svg('rect', { class: 'hover-band', y: m.top, height: plotH, width: band, rx: 6, visibility: 'hidden' });
  chart.append(hover);

  days.forEach((day, i) => {
    const x = m.left + band * i + (band - barW) / 2;
    const parts = series.filter((s) => day.values[s.id] > 0);
    let base = 0;
    parts.forEach((s, j) => {
      const v = day.values[s.id];
      const y0 = y(base + v);
      const h = y(base) - y0 - (j > 0 ? GAP : 0);
      base += v;
      if (h > 0) chart.append(svg('path', { d: columnPath(x, y0, barW, h, j === parts.length - 1), fill: s.color }));
    });
  });

  const tip = tooltipFor(root);
  let current = -1;
  const show = (i) => {
    current = i;
    hover.setAttribute('x', m.left + band * i);
    hover.setAttribute('visibility', 'visible');
    const rows = series.map((s) => ({ label: s.label, color: s.color, value: days[i].values[s.id] || 0 }));
    tip.show(days[i].label, rows, m.left + band * (i + 0.5), y(totals[i]));
  };
  const hide = () => {
    hover.setAttribute('visibility', 'hidden');
    tip.hide();
  };
  // The whole day's band is the target, not just the painted column.
  const hits = svg('rect', { x: m.left, y: m.top, width: plotW, height: plotH, fill: 'transparent' });
  hits.addEventListener('pointermove', (e) => {
    const box = chart.getBoundingClientRect();
    show(Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - box.left - m.left) / band))));
  });
  hits.addEventListener('pointerleave', hide);
  chart.append(hits);
  chart.addEventListener('focus', () => show(current < 0 ? days.length - 1 : current));
  chart.addEventListener('blur', hide);
  chart.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    show(Math.min(days.length - 1, Math.max(0, current + step)));
  });
}

// Posts hidden per filter, longest first. `rows` is
// [{ label, values: { [series id]: n } }] with a total above zero.
export function stackedBars(root, rows, series) {
  const totals = rows.map((r) => series.reduce((n, s) => n + (r.values[s.id] || 0), 0));
  const max = Math.max(...totals);
  const list = el('div', 'bars');
  root.replaceChildren(list);
  const tip = tooltipFor(root);
  rows.forEach((row, i) => {
    const line = el('div', 'bar-row');
    line.tabIndex = 0;
    line.setAttribute('aria-label', `${row.label}: ${totals[i]} hidden`);
    const track = el('div', 'bar-track');
    const bar = el('div', 'bar');
    bar.style.width = `${(totals[i] / max) * 100}%`;
    for (const s of series) {
      const v = row.values[s.id] || 0;
      if (!v) continue;
      const seg = el('i');
      seg.style.flexGrow = v;
      seg.style.background = s.color;
      bar.append(seg);
    }
    track.append(bar);
    line.append(el('span', 'bar-label', row.label), track, el('span', 'bar-value', formatCount(totals[i])));
    const show = () => {
      const box = root.getBoundingClientRect();
      const at = bar.getBoundingClientRect();
      const values = series.map((s) => ({ label: s.label, color: s.color, value: row.values[s.id] || 0 }));
      tip.show(row.label, values, at.left + at.width / 2 - box.left, at.top - box.top);
    };
    line.addEventListener('pointerenter', show);
    line.addEventListener('focus', show);
    line.addEventListener('pointerleave', tip.hide);
    line.addEventListener('blur', tip.hide);
    list.append(line);
  });
}

// The numbers behind a chart, for reading without hovering.
export function table(root, head, rows) {
  const t = el('table', 'data-table');
  const tr = t.createTHead().insertRow();
  for (const h of head) tr.append(el('th', '', h));
  const body = t.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    r.forEach((v, i) => row.append(el(i === 0 ? 'th' : 'td', '', typeof v === 'number' ? formatCount(v) : v)));
  }
  root.replaceChildren(t);
}
