// svg-utils.js

function svgToImage(svgString, callback) {
  const img = new Image();

  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    if (svgEl.tagName === "parsererror" || svgEl.querySelector("parsererror")) {
      console.error("SVG parsing error:", svgEl.textContent);
      callback(null, "SVG parsing error");
      return;
    }
  } catch (e) {
    console.error("Parsing error:", e);
    callback(null, "Error parsing SVG");
    return;
  }

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = parseInt(img.width) || 1000;
    const height = parseInt(img.height) || 600;

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');

    URL.revokeObjectURL(url);
    callback(dataUrl, null);
  };

  img.onerror = function () {
    URL.revokeObjectURL(url);
    callback(null, "Error loading image from SVG");
  };

  img.src = url;
}



function buildSVG(title, counts, names, colors) {
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

  const safeCounts = counts.map(c => Number(c) || 0);
  const total = safeCounts.reduce((a, b) => a + b, 0);
  const partyObjs = safeCounts.map((c, i) => ({
    c,
    color: colors[i] || '#CCCCCC',
    name: names[i] || `P${i + 1}`,
  })).filter(p => p.c > 0).sort((a, b) => b.c - a.c);

  if (total === 0) {
    return `<svg width="\${canvasWidth}" height="\${canvasHeight}" viewBox="0 0 \${canvasWidth} \${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="\${canvasWidth / 2}" y="\${canvasHeight / 2}" text-anchor="middle" font-size="16" font-family="sans-serif">No seats allocated</text>
    </svg>`;
  }

  const maxLayers = 100;
  const minGap = 1;
  let layers = 0, remaining = total;
  let seatR = 5;

  while (remaining > 0 && layers < maxLayers) {
    const r = (layers + 1) * (2 * seatR + minGap);
    const seats = Math.floor(Math.PI * r / (2 * seatR + minGap));
    remaining -= seats;
    layers++;
  }

  const maxRadius = plotAreaHeight;
  seatR = (maxRadius - minGap * layers) / (2 * layers);

  const coords = [], visible = [];
  let totalPlaced = 0;

  for (let row = 0; row < layers && totalPlaced < total; row++) {
    const r = (row + 1) * (2 * seatR + minGap);
    const seatsThisRow = Math.floor(Math.PI * r / (2 * seatR + minGap));

    for (let i = 0; i < seatsThisRow && totalPlaced < total; i++) {
      const theta = Math.PI - (i + 0.5) * Math.PI / seatsThisRow;
      coords.push([
        centerX + r * Math.cos(theta),
        centerY - r * Math.sin(theta),
      ]);
      visible.push(true);
      totalPlaced++;
    }
  }

  const svg = [\`<svg width="\${canvasWidth}" height="\${canvasHeight}" viewBox="0 0 \${canvasWidth} \${canvasHeight}" xmlns="http://www.w3.org/2000/svg">\`];
  svg.push(`<rect width="100%" height="100%" fill="white"/>`);
  svg.push(`<text x="\${canvasWidth / 2}" y="\${titleHeight / 2}" text-anchor="middle" font-size="20" font-family="sans-serif" font-weight="bold">\${title}</text>`);

  let currentIndex = 0;
  partyObjs.forEach(p => {
    for (let i = 0; i < p.c && currentIndex < coords.length; i++) {
      const [x, y] = coords[currentIndex++];
      svg.push(`<circle cx="\${x}" cy="\${y}" r="\${seatR}" fill="\${p.color}" stroke="black" stroke-width="0.3"/>`);
    }
  });

  svg.push(`<text x="\${centerX}" y="\${centerY + 20}" text-anchor="middle" font-size="14" font-family="sans-serif">\${total} seats</text>`);

  let legY = titleHeight;
  const legX = canvasWidth - legendWidth + 10;
  partyObjs.forEach(p => {
    svg.push(`<rect x="\${legX}" y="\${legY - 7}" width="14" height="14" fill="\${p.color}" stroke="black" stroke-width="0.3"/>`);
    svg.push(`<text x="\${legX + 20}" y="\${legY + 4}" font-size="12" font-family="sans-serif">\${p.name} – \${p.c}</text>`);
    legY += 20;
  });

  svg.push(`</svg>`);
  return svg.join('\n');
}

function svgToImage(svgString, callback) {
  const img = new Image();

  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    if (svgEl.tagName === "parsererror" || svgEl.querySelector("parsererror")) {
      console.error("SVG parsing error:", svgEl.textContent);
      callback(null, "SVG parsing error");
      return;
    }
  } catch (e) {
    console.error("Parsing error:", e);
    callback(null, "Error parsing SVG");
    return;
  }

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = function () {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = img.width || 1000;
    const height = img.height || 600;

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');

    URL.revokeObjectURL(url);
    callback(dataUrl, null);
  };

  img.onerror = function () {
    URL.revokeObjectURL(url);
    callback(null, "Error loading image from SVG");
  };

  img.src = url;
}
