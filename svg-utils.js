// svg-utils.js

function svgToImage(svgString, callback) {
  const img = new Image();
  // Add a try-catch for DOMParser in case svgString is completely invalid
  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    if (svgEl.tagName === "parsererror" || svgEl.querySelector("parsererror")) {
        console.error("SVG parsing error:", svgEl.textContent);
        callback(null, "SVG parsing error. Check console.");
        return;
    }
  } catch(e) {
    console.error("Error initializing DOMParser or parsing SVG:", e);
    callback(null, "Error parsing SVG string.");
    return;
  }

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const parser = new DOMParser(); // Parse again to ensure fresh element for dimensions
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    let width = parseInt(svgEl.getAttribute('width'));
    let height = parseInt(svgEl.getAttribute('height'));

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(/[\s,]+/); // Split by space or comma
            if (parts.length === 4) {
                width = parseInt(parts[2]);
                height = parseInt(parts[3]);
            }
        }
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            console.warn("SVG dimensions not found or invalid, defaulting to 600x400 for canvas.");
            width = 600; height = 400;
        }
    }
    
    canvas.width = width;
    canvas.height = height;
    try {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url);
        callback(dataUrl, null);
    } catch (drawError) {
        console.error("Error drawing SVG to canvas:", drawError);
        URL.revokeObjectURL(url);
        callback(null, "Error drawing SVG to canvas.");
    }
  };

  img.onerror = function(e) {
    console.error("Error loading SVG into image object:", e);
    URL.revokeObjectURL(url);
    callback(null, "Error loading SVG content into image element.");
  };
  img.src = url;
}

function buildSVG(title, counts, names, colors, seatR = 6, gap = 1, innerR = 28) {
  // Ensure counts is an array of numbers, defaulting NaN/undefined to 0
  const safeCounts = Array.isArray(counts) ? counts.map(c => Number(c) || 0) : [];
  const total = safeCounts.reduce((a, b) => a + b, 0);
  
  const partyObjs = safeCounts.map((c, i) => ({
    c: c, 
    color: colors && colors[i] ? colors[i] : '#CCCCCC',
    name: names && names[i] ? names[i] : `P${i + 1}`,
    idx: i,
  })).filter(p => p.c > 0).sort((a, b) => b.c - a.c);

  // ... (rest of buildSVG, ensure it handles partyObjs correctly, especially if it's empty) ...
  // (The version from the previous good response for buildSVG should be mostly fine,
  // but double check how it handles `partyObjs` being empty if `total` is 0
  // The placeholder SVG for "No seats allocated" is a good way to handle this.)

  const coords = [], visible = [];
  let remaining = total, row = 0, rStep = seatR * 2 + gap, outerRCalculated = 0;
  
  if (total === 0) {
      const placeholderWidth = 400;
      const placeholderHeight = 300;
      const phcx = placeholderWidth / 2;
      const phcy = placeholderHeight / 2;
      let svgNoSeats = [`<svg width="${placeholderWidth}" height="${placeholderHeight}" viewBox="0 0 ${placeholderWidth} ${placeholderHeight}" xmlns="http://www.w3.org/2000/svg">`];
      svgNoSeats.push(`<rect width="100%" height="100%" fill="white"/>`);
      svgNoSeats.push(`<text x="${phcx}" y="${phcy - 20}" text-anchor="middle" font-size="16" font-family="sans-serif" font-weight="bold">${title}</text>`);
      svgNoSeats.push(`<text x="${phcx}" y="${phcy + 10}" text-anchor="middle" font-size="14" font-family="sans-serif">No seats allocated</text>`);
      if (names && names.length > 0) { // Add legend even if no seats
        let legY = phcy + 40;
        const legX = phcx - 60;
        names.forEach((name, i) => {
            if (legY > placeholderHeight - 20) return;
            const color = colors && colors[i] ? colors[i] : '#CCCCCC';
            svgNoSeats.push(`<rect x="${legX}" y="${legY - 7}" width="14" height="14" fill="${color}"/>`);
            svgNoSeats.push(`<text x="${legX + 20}" y="${legY}" dominant-baseline="middle" font-size="10" font-family="sans-serif">${name} – 0</text>`);
            legY += 18;
        });
      }
      svgNoSeats.push(`</svg>`);
      return svgNoSeats.join('\n');
  }

  let safetyRowCount = 0; 
  while (remaining > 0 && safetyRowCount < 100) {
    const radius = innerR + row * rStep + seatR;
    outerRCalculated = radius;
    const circumferenceSegment = Math.PI * radius; 
    const cap = Math.max(1, Math.floor(circumferenceSegment / (seatR * 2 + gap)));
    const seatsInThisRow = Math.min(remaining, cap);

    for (let i = 0; i < cap; i++) {
      const theta = Math.PI - (i + 0.5) * Math.PI / cap; 
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

  const circleScaleFactor = Math.max(0.2, Math.min(1, 300 / total));
  const textScaleFactor = 1; 
  const scaleFactor = Math.max(0.2, Math.min(1, 300 / total));
  const baseOuterR = outerRCalculated > 0 ? outerRCalculated : innerR + seatR; // Ensure baseOuterR is positive 
  
  const legendEntryHeight = 20 * scaleFactor;
  // Estimate legend height based on actual parties with seats
  const estimatedLegendHeight = partyObjs.length * legendEntryHeight + 40 * scaleFactor;
  const parliamentHeight = baseOuterR + innerR; 

  const horizontalPadding = 40 * scaleFactor;
  const legendWidth = 200 * scaleFactor; 
  const diagramWidth = baseOuterR * 2;

  const totalWidth = diagramWidth + legendWidth + 3 * horizontalPadding; 
  
  const topPaddingTitle = 60 * scaleFactor;
  const bottomPadding = 40 * scaleFactor;
  const totalHeight = Math.max(parliamentHeight, estimatedLegendHeight) + topPaddingTitle + bottomPadding;

  const diagramCenterX = baseOuterR + horizontalPadding;
  const diagramCenterY = parliamentHeight + topPaddingTitle; 

  const svg = [`<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`];
  svg.push(`<rect width="100%" height="100%" fill="white"/>`);
  svg.push(`<text x="${totalWidth / 2}" y="${topPaddingTitle / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${18 * textScaleFactor}" font-family="sans-serif" font-weight="bold">${title}</text>`);

  let currentSeatVisualIndex = 0;
  const scaledSeatR = Math.max(1, seatR * scaleFactor); // Ensure seat radius is at least 1
  let allSeatsDrawn = false; 

  partyObjs.forEach(p => {
    if (allSeatsDrawn) return;
    for (let k = 0; k < p.c; k++) {
      if (currentSeatVisualIndex >= coords.length) {
        allSeatsDrawn = true;
        break;
        }
      while (currentSeatVisualIndex < visible.length && !visible[currentSeatVisualIndex]) {
        currentSeatVisualIndex++;
      }
      if (currentSeatVisualIndex >= coords.length || currentSeatVisualIndex >= visible.length) {
        allSeatsDrawn = true;
        break;
      }

      const [x, y] = coords[currentSeatVisualIndex++];
      const isDisputed = p.name.toLowerCase().includes("disputed mandates");
      const fillColor = p.color; 
      const strokeColor = isDisputed ? "black" : (total > 50 ? p.color : "white"); 
      const strokeWidth = isDisputed ? (0.8 * scaleFactor) : (0.5 * scaleFactor);
      
      svg.push(`<circle cx="${diagramCenterX + x * scaleFactor}" 
                        cy="${diagramCenterY - y * scaleFactor}" 
                        r="${seatR * circleScaleFactor}"
                        fill="${fillColor}" 
                        stroke="${strokeColor}" 
                        stroke-width="${Math.max(0.1, strokeWidth)}"/>`); // Ensure stroke width is positive
    }
  });

  svg.push(`<text x="${diagramCenterX}" y="${diagramCenterY + scaledSeatR + 20 * scaleFactor}" text-anchor="middle" font-size="${Math.max(8, 14 * textScaleFactor)}" font-family="sans-serif">${total} seats</text>`);

  const legX = diagramWidth + 2 * horizontalPadding;
  let legYCurrent = topPaddingTitle; 

  partyObjs.forEach((p) => {
    if (legYCurrent > totalHeight - bottomPadding - legendEntryHeight) return; // Prevent legend overflow
    const isDisputed = p.name.toLowerCase().includes("disputed mandates");
    const fillColor = p.color;
    const rectStroke = isDisputed ? "black" : "none";
    const rectSize = Math.max(5, 15 * scaleFactor);

    svg.push(`<rect x="${legX}" y="${legYCurrent - (rectSize / 2)}" width="${rectSize}" height="${rectSize}" fill="${fillColor}" ${rectStroke !== 'none' ? `stroke="${rectStroke}" stroke-width="0.5"` : ''}/>`);
    svg.push(`<text x="${legX + rectSize * 1.5}" y="${legYCurrent}" dominant-baseline="middle" font-size="${Math.max(8, 12 * scaleFactor)}" font-family="sans-serif">${p.name} – ${p.c}</text>`);
    legYCurrent += legendEntryHeight;
  });

  svg.push(`</svg>`);
  return svg.join('\n');
}