// Updated svg-utils.js using the old seat layout algorithm
// while keeping the new structure and features.

export function buildSVG (cfg) {
  const mount = typeof cfg.mountEl === 'string'
    ? document.querySelector(cfg.mountEl)
    : cfg.mountEl;
  if (!mount) throw new Error('mountEl not found');

  const total = cfg.totalSeats;

  // --- Options for the old layout style ---
  // User provides the dimensions for the seating plot area itself
  const plotAreaWidth  = cfg.options?.plotAreaWidth  ?? 600; // e.g., old canvasWidth - legendWidth - paddings
  const plotAreaHeight = cfg.options?.plotAreaHeight ?? 350; // e.g., old canvasHeight - titleHeight - bottomPadding
  const maxSeatRadius  = cfg.options?.seatRadius ?? 10; // Used as initial/max for old algo
  const minSeatGap     = cfg.options?.minSeatGap ?? 2;  // The old code used 'minGap', often 1 or 2
  // --- Standard paddings from new code ---
  const paddingH   = cfg.options?.paddingH   ?? 10;
  const paddingV   = cfg.options?.paddingV   ?? 25;
  const totalLabelHeight = 25; // Approximate height for the "N seats" label

  const fig   = document.createElement('figure');
  fig.className = 'my-4';

  const h = document.createElement('figcaption');
  h.className = 'text-lg font-semibold mb-2';
  h.textContent = cfg.title;
  fig.appendChild(h);

  // SVG dimensions are based on the plot area plus paddings and label space
  const svgW = paddingH*2 + plotAreaWidth;
  const svgH = paddingV*2 + plotAreaHeight + totalLabelHeight;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  fig.appendChild(svg);

  // --- Use the old layout algorithm ---
  const { positions: seatPositions, calculatedSeatR } = calculateSeatPositionsOldStyle(
    total,
    plotAreaWidth,
    plotAreaHeight,
    maxSeatRadius, // This will be the cfg.options.seatRadius
    minSeatGap
  );
  // --- ---

  const seatColors = [];
  cfg.seatMap.forEach(entry => {
    for (let i=0; i<entry.seats; i++) seatColors.push(entry.color);
  });

  seatPositions.forEach((pos, idx) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    // Adjust positions from plot-area-relative to SVG-relative by adding paddings
    c.setAttribute('cx', paddingH + pos.x);
    c.setAttribute('cy', paddingV + pos.y);
    c.setAttribute('r', calculatedSeatR); // Use the radius calculated by the old algorithm
    c.setAttribute('fill', seatColors[idx] ?? '#ddd');
    c.setAttribute('stroke', 'black');
    c.setAttribute('stroke-width', '0.3');
    svg.appendChild(c);
  });

  const totalLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  totalLabel.setAttribute('x', svgW / 2);
  // Position totalLabel below the plot area, within the bottom padding/extra space
  totalLabel.setAttribute('y', paddingV + plotAreaHeight + (totalLabelHeight / 2) + 5 ); // Centered in its allocated space
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

/**
 * Calculates seat positions based on the logic from the old `buildSVG` function.
 * @param {number} totalSeats - Total number of seats.
 * @param {number} plotAreaWidth - The width available for the seat arrangement.
 * @param {number} plotAreaHeight - The height available for the seat arrangement (base of semi-circle to top).
 * @param {number} initialMaxSeatRadius - The preferred/maximum seat radius.
 * @param {number} minGap - The minimum gap between seats.
 * @returns {{positions: Array<{x: number, y: number}>, calculatedSeatR: number}}
 */
function calculateSeatPositionsOldStyle(totalSeats, plotAreaWidth, plotAreaHeight, initialMaxSeatRadius, minGap) {
  const positions = [];
  if (totalSeats === 0) {
    return { positions, calculatedSeatR: initialMaxSeatRadius };
  }

  // centerX and centerY are relative to the plotArea itself.
  // (0,0) of plotArea is top-left.
  // centerY is the base of the semi-circle at the bottom of the plotArea.
  const centerX = plotAreaWidth / 2;
  const centerY = plotAreaHeight;

  let seatR = initialMaxSeatRadius;
  let layers = 0;

  // Step 1: Determine the number of layers needed with an initial seatR (like the old code did)
  // This is a simplified loop compared to the old one, which had a more complex seatR refinement.
  // We'll try to find a seatR that allows all seats to fit.
  
  let tempLayers = 0;
  let remainingSeats = totalSeats;
  // First, estimate layers with initialMaxSeatRadius
  // This loop is primarily to determine 'tempLayers'
  while (remainingSeats > 0 && tempLayers < 100) { // 100 layers max (safety)
    const r = (tempLayers + 1) * (2 * seatR + minGap); // Radius of current layer's center line
    if (r > plotAreaHeight || r > plotAreaWidth / 2) { // Layer would go out of bounds
        break;
    }
    const seatsInLayer = Math.floor(Math.PI * r / (2 * seatR + minGap));
    if (seatsInLayer === 0 && tempLayers === 0 && totalSeats > 0) { // Cannot fit even one seat
        break;
    }
    remainingSeats -= seatsInLayer;
    tempLayers++;
  }
  layers = tempLayers > 0 ? tempLayers : 1; // Ensure at least 1 layer if seats > 0

  // Step 2: Refine seatR based on the determined layers and available space (like old code's refinement)
  // Given 'layers', calculate the maximum seatR that fits.
  // Outermost radius R_outer = layers * (2*seatR + minGap)
  // Constraint 1: R_outer <= plotAreaHeight  => seatR <= (plotAreaHeight/layers - minGap)/2
  // Constraint 2: R_outer <= plotAreaWidth/2 => seatR <= ( (plotAreaWidth/2)/layers - minGap)/2
  
  let seatR_from_height = (plotAreaHeight / layers - minGap) / 2;
  let seatR_from_width  = ( (plotAreaWidth / 2) / layers - minGap) / 2;
  
  seatR = Math.max(1, Math.min(initialMaxSeatRadius, seatR_from_height, seatR_from_width));

  // Step 3: Place seats with the final seatR and layers
  let totalPlaced = 0;
  remainingSeats = totalSeats; // Reset for actual placement

  for (let row = 0; row < layers && totalPlaced < totalSeats; row++) {
    const r = (row + 1) * (2 * seatR + minGap); // Radius for this row of seats

    // How many seats can physically fit in this row (arc length / seat diameter + gap)
    const physicalSeatsInRow = Math.floor(Math.PI * r / (2 * seatR + minGap));
    if (physicalSeatsInRow === 0) continue; // Should not happen if seatR is reasonable

    // Distribute remaining seats somewhat evenly across remaining rows
    const seatsToPlaceThisRow = Math.min(
      physicalSeatsInRow,
      Math.ceil(remainingSeats / (layers - row))
    );
    
    if (seatsToPlaceThisRow === 0 && remainingSeats > 0) continue; // No seats for this row based on distribution

    for (let i = 0; i < seatsToPlaceThisRow && totalPlaced < totalSeats; i++) {
      // Theta: angle for seat. 0 is right, PI is left. We draw from left (PI) to right (0).
      // (i + 0.5) / seatsToPlaceThisRow gives fractions from (0 to 1).
      // Multiply by PI to span the semi-circle.
      // PI - angle gives the coordinate system the old code used (starts near PI, ends near 0).
      const theta = Math.PI - ( (i + 0.5) * Math.PI / seatsToPlaceThisRow );
      
      positions.push({
        x: centerX + r * Math.cos(theta),
        y: centerY - r * Math.sin(theta), // Y is from bottom of plotArea, up
      });
      totalPlaced++;
    }
    remainingSeats -= seatsToPlaceThisRow;
  }
  
  if (totalPlaced < totalSeats) {
      console.warn(`[svg-utils] Could only place ${totalPlaced} of ${totalSeats} seats. ` +
                   `Plot area might be too small, or seat radius became too constrained. ` +
                   `Calculated seatR: ${seatR.toFixed(2)}`);
      // As a fallback, if not all seats are placed, we might need a more robust seatR/layer calculation
      // or just accept that not all are visible if constraints are too tight.
  }

  return { positions, calculatedSeatR: seatR };
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
    // Use viewBox for accurate sizing if available, otherwise clientWidth/Height
    const viewBox = svgEl.viewBox?.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        canvas.width  = viewBox.width;
        canvas.height = viewBox.height;
    } else {
        canvas.width  = svgEl.clientWidth || svgEl.getAttribute('width') || 600;
        canvas.height = svgEl.clientHeight || svgEl.getAttribute('height') || 400;
    }

    const ctx = canvas.getContext('2d');
    // Optional: Fill background for SVGs that might not have one
    // ctx.fillStyle = 'white'; 
    // ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => {
      if (!blob) {
        console.error("Canvas toBlob failed, resulting blob is null.");
        // Potentially fallback or notify user
        return;
      }
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${downloadName || 'parliament-chart'}.png`;
      document.body.appendChild(a); // Required for Firefox
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(dlUrl),1000);
    });
  };
  img.onerror = (e) => {
    console.error("Error loading SVG into image for PNG conversion:", e);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}