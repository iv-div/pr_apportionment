// svg-utils.js

function svgToImage(svgString, callback) {
  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    let width = parseInt(svgEl.getAttribute('width'));
    let height = parseInt(svgEl.getAttribute('height'));

    if (isNaN(width) || isNaN(height) || width === 0 || height === 0) {
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(' ');
            if (parts.length === 4) {
                width = parseInt(parts[2]);
                height = parseInt(parts[3]);
            }
        }
        if (isNaN(width) || isNaN(height) || width === 0 || height === 0) { // Default if everything fails
            console.warn("SVG dimensions not found, defaulting to 600x400 for canvas.");
            width = 600; height = 400;
        }
    }
    
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    URL.revokeObjectURL(url);
    callback(dataUrl, null); // null for error
  };

  img.onerror = function(e) {
    console.error("Error loading SVG into image object. SVG might be malformed or an external resource failed.", e);
    URL.revokeObjectURL(url);
    callback(null, "Error loading SVG content into image element."); // Pass error message
  };

  img.src = url;
}

function buildSVG(title, counts, names, colors, seatR = 6, gap = 1, innerR = 28) {
  const total = counts.reduce((a, b) => (a || 0) + (b || 0), 0);
  
  const partyObjs = counts.map((c, i) => ({
    c: Number(c) || 0, // Ensure c is a number, default to 0 if NaN/undefined
    color: colors[i] || '#CCCCCC', // Default gray if color is missing
    name: names[i] || `P${i + 1}`,
    idx: i,
  })).filter(p => p.c > 0).sort((a, b) => b.c - a.c);

  const coords = [], visible = [];
  let remaining = total, row = 0, rStep = seatR * 2 + gap, outerRCalculated = 0; // Renamed to avoid conflict
  
  if (total === 0) {
      const placeholderWidth = 400;
      const placeholderHeight = 300;
      const phcx = placeholderWidth / 2;
      const phcy = placeholderHeight / 2;
      let svgNoSeats = [`<svg width="${placeholderWidth}" height="${placeholderHeight}" viewBox="0 0 ${placeholderWidth} ${placeholderHeight}" xmlns="http://www.w3.org/2000/svg">`];
      svgNoSeats.push(`<rect width="100%" height="100%" fill="white"/>`);
      svgNoSeats.push(`<text x="${phcx}" y="${phcy - 15}" text-anchor="middle" font-size="16" font-family="sans-serif" font-weight="bold">${title}</text>`);
      svgNoSeats.push(`<text x="${phcx}" y="${phcy + 15}" text-anchor="middle" font-size="14" font-family="sans-serif">No seats allocated</text>`);
      svgNoSeats.push(`</svg>`);
      return svgNoSeats.join('\n');
  }

  // Calculate seat coordinates
  let safetyRowCount = 0; // Prevent infinite loop if remaining doesn't decrease
  while (remaining > 0 && safetyRowCount < 100) { // Max 100 rows
    const radius = innerR + row * rStep + seatR;
    outerRCalculated = radius;
    const circumferenceSegment = Math.PI * radius; // Semicircle
    const cap = Math.max(1, Math.floor(circumferenceSegment / (seatR * 2 + gap)));
    const seatsInThisRow = Math.min(remaining, cap);

    for (let i = 0; i < cap; i++) {
      const theta = Math.PI - (i + (cap > 1 ? 0.5 : 0.5)) * Math.PI / cap; // Adjust for single seat in row
      coords.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
      visible.push(i < seatsInThisRow);
    }
    remaining -= seatsInThisRow;
    row++;
    safetyRowCount++;
  }
  if (safetyRowCount >= 100 && remaining > 0) {
    console.warn("Max rows reached in buildSVG, some seats may not be drawn.");
  }


  const scaleFactor = Math.max(1, Math.sqrt(total / 200)); // Adjusted scaling base
  const baseOuterR = outerRCalculated; 
  
  const legendEntryHeight = 20 * scaleFactor;
  const estimatedLegendHeight = partyObjs.length * legendEntryHeight + 40 * scaleFactor;
  const parliamentHeight = baseOuterR + innerR; // Approximate height of the semicircle drawing area

  const horizontalPadding = 40 * scaleFactor;
  const legendWidth = 200 * scaleFactor; // Fixed width for legend area
  const diagramWidth = baseOuterR * 2;

  const totalWidth = diagramWidth + legendWidth + 3 * horizontalPadding; // Parliament + padding + legend + padding
  
  const topPaddingTitle = 60 * scaleFactor;
  const bottomPadding = 40 * scaleFactor;
  const totalHeight = Math.max(parliamentHeight, estimatedLegendHeight) + topPaddingTitle + bottomPadding;

  const diagramCenterX = baseOuterR + horizontalPadding;
  const diagramCenterY = parliamentHeight + topPaddingTitle; // Bottom-center of the semicircle

  const svg = [`<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`];
  svg.push(`<rect width="100%" height="100%" fill="white"/>`);
  svg.push(`<text x="${totalWidth / 2}" y="${topPaddingTitle / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${18 * scaleFactor}" font-family="sans-serif" font-weight="bold">${title}</text>`);

  let currentSeatVisualIndex = 0;
  const scaledSeatR = seatR * scaleFactor;

  partyObjs.forEach(p => {
    for (let k = 0; k < p.c; k++) {
      if (currentSeatVisualIndex >= coords.length) break; 
      while (currentSeatVisualIndex < visible.length && !visible[currentSeatVisualIndex]) {
        currentSeatVisualIndex++;
      }
      if (currentSeatVisualIndex >= coords.length || currentSeatVisualIndex >= visible.length) break;

      const [x, y] = coords[currentSeatVisualIndex++];
      const isDisputed = p.name.toLowerCase().includes("disputed mandates");
      // Use the color from applyTieBreak for disputed, or party's color
      const fillColor = p.color; // applyTieBreak now sets the color directly for disputed
      const strokeColor = isDisputed ? "black" : (total > 50 ? p.color : "white"); // Darker stroke for many seats, or same as fill
      const strokeWidth = isDisputed ? (0.8 * scaleFactor) : (0.5 * scaleFactor);
      
      svg.push(`<circle cx="${diagramCenterX + x * scaleFactor}" 
                        cy="${diagramCenterY - y * scaleFactor}" 
                        r="${scaledSeatR}" 
                        fill="${fillColor}" 
                        stroke="${strokeColor}" 
                        stroke-width="${strokeWidth}"/>`);
    }
    if (currentSeatVisualIndex >= coords.length) break;
  });

  svg.push(`<text x="${diagramCenterX}" y="${diagramCenterY + scaledSeatR + 20 * scaleFactor}" text-anchor="middle" font-size="${14 * scaleFactor}" font-family="sans-serif">${total} seats</text>`);

  const legX = diagramWidth + 2 * horizontalPadding;
  let legY = topPaddingTitle; 

  partyObjs.forEach((p) => {
    const isDisputed = p.name.toLowerCase().includes("disputed mandates");
    const fillColor = p.color;
    const rectStroke = isDisputed ? "black" : "none";

    svg.push(`<rect x="${legX}" y="${legY - (15 * scaleFactor / 2)}" width="${15 * scaleFactor}" height="${15 * scaleFactor}" fill="${fillColor}" ${rectStroke !== 'none' ? `stroke="${rectStroke}" stroke-width="0.5"` : ''}/>`);
    svg.push(`<text x="${legX + 25 * scaleFactor}" y="${legY}" dominant-baseline="middle" font-size="${12 * scaleFactor}" font-family="sans-serif">${p.name} – ${p.c}</text>`);
    legY += legendEntryHeight;
    if (legY > totalHeight - bottomPadding) { /* Stop if legend overflows */ return; }
  });

  svg.push(`</svg>`);
  return svg.join('\n');
}