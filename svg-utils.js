// Updated svg-utils.js styled like the old version

export function buildSVG (cfg) {
  const mount = typeof cfg.mountEl === 'string'
    ? document.querySelector(cfg.mountEl)
    : cfg.mountEl;
  if (!mount) throw new Error('mountEl not found');

  const total = cfg.totalSeats;
  const rowHeight  = cfg.options?.rowHeight  ?? 20;
  const seatR      = cfg.options?.seatRadius ?? 5.5;
  const paddingH   = cfg.options?.paddingH   ?? 10;
  const paddingV   = cfg.options?.paddingV   ?? 25;
  const nRows = calcRows(total);

  const fig   = document.createElement('figure');
  fig.className = 'my-4';

  const h = document.createElement('figcaption');
  h.className = 'text-lg font-semibold mb-2';
  h.textContent = cfg.title;
  fig.appendChild(h);

  const svgW = paddingH*2 + (seatR*2+2) * Math.ceil(total / nRows);
  const svgH = paddingV*2 + nRows * rowHeight;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  fig.appendChild(svg);

  const seatPositions = calcSeatPositions(total, nRows, svgW/2, svgH - paddingV, rowHeight, seatR);
  const seatColors = [];
  cfg.seatMap.forEach(entry => {
    for (let i=0; i<entry.seats; i++) seatColors.push(entry.color);
  });

  seatPositions.forEach((pos, idx) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', pos.x);
    c.setAttribute('cy', pos.y);
    c.setAttribute('r', seatR);
    c.setAttribute('fill', seatColors[idx] ?? '#ddd');
    c.setAttribute('stroke', 'black');
    c.setAttribute('stroke-width', '0.3');
    svg.appendChild(c);
  });

  const totalLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  totalLabel.setAttribute('x', svgW / 2);
  totalLabel.setAttribute('y', svgH - 5);
  totalLabel.setAttribute('text-anchor', 'middle');
  totalLabel.setAttribute('font-size', '14');
  totalLabel.setAttribute('font-family', 'sans-serif');
  totalLabel.textContent = `${cfg.totalSeats} seats`;
  svg.appendChild(totalLabel);

  const table = document.createElement('table');
  table.className = 'mt-3 text-sm w-full border-collapse';
  table.innerHTML = `<thead><tr>
    <th class="text-left pb-1">Партия</th>
    <th class="text-right pb-1">% голосов</th>
    <th class="text-right pb-1">% мандатов</th>
  </tr></thead>`;
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

function calcRows(total) {
  return Math.ceil(Math.sqrt(total));
}

function calcSeatPositions(total, nRows, centerX, baseY, rowHeight, r) {
  const positions = [];
  let seatsLeft = total;
  for (let row=0; row<nRows; row++) {
    const seatsInRow = Math.ceil(seatsLeft / (nRows - row));
    seatsLeft -= seatsInRow;
    const radius = rowHeight * (row+1);
    for (let i=0; i<seatsInRow; i++) {
      const angle = Math.PI * (i+0.5) / seatsInRow;
      const x = centerX + (radius * Math.cos(angle));
      const y = baseY - (radius * Math.sin(angle));
      positions.push({x, y});
    }
  }
  return positions;
}

function svgToPng(figureEl, downloadName) {
  const svgEl = figureEl.querySelector('svg');
  const serializer = new XMLSerializer();
  const data = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([data], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = svgEl.viewBox.baseVal.width;
    canvas.height = svgEl.viewBox.baseVal.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${downloadName}.png`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    });
  };
  img.src = url;
}
