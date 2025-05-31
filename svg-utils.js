// ==============================================
//  SVG‑Utilities for Multi‑District Calculator
//  – draws semi‑circular parliament charts and
//    legend tables with vote / seat percentages.
//  Pure DOM/SVG helpers, no business logic inside.
// ==============================================

/*
  Public API
  ==========
  buildSVG({
    mountEl,          // HTMLElement | CSS‑selector      – where to insert <figure>
    title,            // string                         – heading above chart
    seatMap,          // Array<{partyId, seats, color}> – already SORTED by seats desc.
    legendRows,       // Array<{partyId,name,color,votePct,seatPct}>
    totalSeats,       // number                         – for geometry calc
    options = {       // optional tweaks
       rowHeight, seatRadius, paddingH, paddingV
    }
  })

  Returns: { figureEl, svgEl, pngButton }
*/

export function buildSVG (cfg) {
  // Resolve mount element
  const mount = typeof cfg.mountEl === 'string'
    ? document.querySelector(cfg.mountEl)
    : cfg.mountEl;
  if (!mount) throw new Error('mountEl not found');

  // Default geometry
  const total = cfg.totalSeats;
  const rowHeight  = cfg.options?.rowHeight  ?? 26;
  const seatR      = cfg.options?.seatRadius ?? 10;
  const paddingH   = cfg.options?.paddingH   ?? 20;
  const paddingV   = cfg.options?.paddingV   ?? 40;
  const nRows = calcRows(total);

  const fig   = document.createElement('figure');
  fig.className = 'my-4';

  // Title
  const h = document.createElement('figcaption');
  h.className = 'text-lg font-semibold mb-2';
  h.textContent = cfg.title;
  fig.appendChild(h);

  // SVG canvas dims
  const svgW = paddingH*2 + (seatR*2+2) * Math.ceil(total / nRows);
  const svgH = paddingV*2 + nRows * rowHeight;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  fig.appendChild(svg);

  // Build geometry map once
  const seatPositions = calcSeatPositions(total, nRows, svgW/2, svgH - paddingV, rowHeight, seatR);

  // Flatten seatMap into per‑seat array for color
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
    svg.appendChild(c);
  });

  // Legend table
  const table = document.createElement('table');
  table.className = 'mt-3 text-sm w-full border-collapse';
  table.innerHTML = `<thead><tr>
    <th class="text-left pb-1">Партия</th>
    <th class="text-right pb-1">% голосов</th>
    <th class="text-right pb-1">% мандатов</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  cfg.legendRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-0.5"><span class="inline-block w-3 h-3 rounded-sm mr-1" style="background:${row.color}"></span>${row.name}</td>
      <td class="text-right">${row.votePct.toFixed(1)}</td>
      <td class="text-right font-medium">${row.seatPct.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  fig.appendChild(table);

  // PNG download button
  const btn = document.createElement('button');
  btn.className = 'mt-2 px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-xs';
  btn.textContent = 'Download PNG';
  btn.addEventListener('click', () => svgToPng(fig, cfg.title));
  fig.appendChild(btn);

  mount.appendChild(fig);
  return {figureEl: fig, svgEl: svg, pngButton: btn};
}

// ----------------------------
// helpers
// ----------------------------

function calcRows(total) {
  // simple heuristic: sqrt approach → near‑optimal packing
  return Math.ceil(Math.sqrt(total));
}

function calcSeatPositions(total, nRows, centerX, baseY, rowHeight, r) {
  /*
    Arrange seats in concentric half‑circles.
    Row 0 (outer) has ceil(total / nRows) seats, inner rows gradually fewer.
  */
  const positions = [];
  let seatsLeft = total;
  for (let row=0; row<nRows; row++) {
    const seatsInRow = Math.ceil(seatsLeft / (nRows - row));
    seatsLeft -= seatsInRow;

    const radius = rowHeight * (row+1);
    for (let i=0; i<seatsInRow; i++) {
      const angle = Math.PI * (i+0.5) / seatsInRow; // 0..π
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
