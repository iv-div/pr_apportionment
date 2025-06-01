// This is a rewritten version of buildSVG from svg-utils_new.js
// that adopts the seat positioning and layout sizing logic from svg-utils_old.js

export function buildSVG(cfg) {
  const mount = typeof cfg.mountEl === 'string'
    ? document.querySelector(cfg.mountEl)
    : cfg.mountEl;
  if (!mount) throw new Error('mountEl not found');

  const total = cfg.totalSeats;
  const canvasWidth = 1000;
  const canvasHeight = 600;

  const titleHeight = 60;
  const bottomPadding = 40;
  const legendWidth = 250;
  const leftPadding = 40;

  const plotAreaLeft = leftPadding;
  const plotAreaRight = canvasWidth - legendWidth - 20;
  const plotAreaWidth = plotAreaRight - plotAreaLeft;
  const plotAreaHeight = canvasHeight - titleHeight - bottomPadding;

  const centerX = plotAreaLeft + plotAreaWidth / 2;
  const centerY = canvasHeight - bottomPadding;

  const fig = document.createElement('figure');
  fig.className = 'my-4';

  const h = document.createElement('figcaption');
  h.className = 'text-lg font-semibold mb-2';
  h.textContent = cfg.title;
  fig.appendChild(h);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
  svg.setAttribute('width', canvasWidth);
  svg.setAttribute('height', canvasHeight);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Debug rectangles and center dot
  const debugFullRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  debugFullRect.setAttribute('x', 0);
  debugFullRect.setAttribute('y', 0);
  debugFullRect.setAttribute('width', canvasWidth);
  debugFullRect.setAttribute('height', canvasHeight);
  debugFullRect.setAttribute('fill', 'none');
  debugFullRect.setAttribute('stroke', '#aaa');
  debugFullRect.setAttribute('stroke-width', '1');
  debugFullRect.setAttribute('stroke-dasharray', '4 4');
  svg.appendChild(debugFullRect);

  const debugPlotRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  debugPlotRect.setAttribute('x', plotAreaLeft);
  debugPlotRect.setAttribute('y', titleHeight);
  debugPlotRect.setAttribute('width', plotAreaWidth);
  debugPlotRect.setAttribute('height', plotAreaHeight);
  debugPlotRect.setAttribute('fill', 'none');
  debugPlotRect.setAttribute('stroke', 'blue');
  debugPlotRect.setAttribute('stroke-width', '1');
  debugPlotRect.setAttribute('stroke-dasharray', '4 2');
  svg.appendChild(debugPlotRect);

  const debugLegendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  debugLegendRect.setAttribute('x', canvasWidth - legendWidth);
  debugLegendRect.setAttribute('y', 0);
  debugLegendRect.setAttribute('width', legendWidth);
  debugLegendRect.setAttribute('height', canvasHeight);
  debugLegendRect.setAttribute('fill', 'none');
  debugLegendRect.setAttribute('stroke', 'green');
  debugLegendRect.setAttribute('stroke-width', '1');
  debugLegendRect.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(debugLegendRect);

  const debugCenterCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  debugCenterCircle.setAttribute('cx', centerX);
  debugCenterCircle.setAttribute('cy', centerY);
  debugCenterCircle.setAttribute('r', '3');
  debugCenterCircle.setAttribute('fill', 'red');
  svg.appendChild(debugCenterCircle);
  const seatR = 5.5;
  const minGap = 1;
  let layers = 0, remaining = total;

  while (remaining > 0 && layers < 100) {
    const r = (layers + 1) * (2 * seatR + minGap);
    const seats = Math.floor(Math.PI * r / (2 * seatR + minGap));
    remaining -= seats;
    layers++;
  }

  const maxHorizontalRadius = plotAreaWidth / 2;
  const maxVerticalRadius = plotAreaHeight;
  const horizontalLimit = (maxHorizontalRadius - minGap * layers) / (2 * layers);
  const verticalLimit = (maxVerticalRadius - minGap * layers) / (2 * layers);
  const adjustedSeatR = Math.min(horizontalLimit, verticalLimit, 26);

  const coords = [];
  let totalPlaced = 0;
  for (let row = 0; row < layers && totalPlaced < total; row++) {
    const r = (row + 1) * (2 * adjustedSeatR + minGap);
    const seatsThisRow = Math.floor(Math.PI * r / (2 * adjustedSeatR + minGap));
    for (let i = 0; i < seatsThisRow && totalPlaced < total; i++) {
      const theta = Math.PI - (i + 0.5) * Math.PI / seatsThisRow;
      coords.push({
        x: centerX + r * Math.cos(theta),
        y: centerY - r * Math.sin(theta),
      });
      totalPlaced++;
    }
  }

  const seatColors = [];
  cfg.seatMap.forEach(entry => {
    for (let i = 0; i < entry.seats; i++) seatColors.push(entry.color);
  });

  coords.forEach((pos, idx) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', pos.x);
    c.setAttribute('cy', pos.y);
    c.setAttribute('r', adjustedSeatR);
    c.setAttribute('fill', seatColors[idx] ?? '#ddd');
    c.setAttribute('stroke', 'black');
    c.setAttribute('stroke-width', '0.3');
    svg.appendChild(c);
  });

  const totalLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  totalLabel.setAttribute('x', centerX);
  totalLabel.setAttribute('y', centerY + 20);
  totalLabel.setAttribute('text-anchor', 'middle');
  totalLabel.setAttribute('font-size', '14');
  totalLabel.setAttribute('font-family', 'sans-serif');
  totalLabel.textContent = `${cfg.totalSeats} seats`;
  svg.appendChild(totalLabel);

  // Keep HTML legend as in new version
  const table = document.createElement('table');
  table.className = 'mt-3 text-sm w-full border-collapse';
  let legY = titleHeight;
  const legX = canvasWidth - legendWidth + 10;

  cfg.legendRows.forEach(row => {
    const lines = splitLegendLabel(`${row.name} – ${row.seats}`);
    lines.forEach((line, i) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', legX + 20);
      text.setAttribute('y', legY + 4 + i * 14);
      text.setAttribute('font-size', '14');
      text.setAttribute('font-family', 'sans-serif');
      text.textContent = line;
      svg.appendChild(text);
    });

    const colorRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    colorRect.setAttribute('x', legX);
    colorRect.setAttribute('y', legY - 7);
    colorRect.setAttribute('width', '14');
    colorRect.setAttribute('height', '14');
    colorRect.setAttribute('fill', row.color);
    colorRect.setAttribute('stroke', 'black');
    colorRect.setAttribute('stroke-width', '0.3');
    svg.appendChild(colorRect);

    legY += lines.length * 16 + 4;
  });

  const tbody = document.createElement('tbody');

  function splitLegendLabel(label) {
    const idx = label.indexOf('(');
    if (idx === -1) return [label];
    return [label.slice(0, idx).trim(), label.slice(idx).trim()];
  }

  cfg.legendRows.forEach(row => {
    const tr = document.createElement('tr');
    const lines = splitLegendLabel(row.name);
    const nameHtml = lines.map(line => `<div>${line}</div>`).join('');
    tr.innerHTML = `
      <td class="py-0.5">
        <span class="inline-block w-3 h-3 rounded-sm mr-1" style="background:${row.color}"></span>${nameHtml}
      </td>
      <td class="text-right">${row.votePct.toFixed(1)}</td>
      <td class="text-right font-medium">${row.seatPct.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  fig.appendChild(table);

  const btn = document.createElement('button');
  btn.className = 'mt-2 px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-xs';
  btn.textContent = 'Download PNG';
  btn.addEventListener('click', () => svgToPng(fig, cfg.title));
  fig.appendChild(btn);

  mount.appendChild(fig);
  return {figureEl: fig, svgEl: svg, pngButton: btn};
}
