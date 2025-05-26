// ---------- SVG to PNG Image Converter ----------
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
    const width = parseInt(svgEl.getAttribute('width'));
    const height = parseInt(svgEl.getAttribute('height'));

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    URL.revokeObjectURL(url);
    callback(dataUrl);
  };

  img.src = url;
}

// ---------- Parliament Diagram Builder ----------
function buildSVG(title, counts, names, colors, seatR = 6, gap = 1, innerR = 28) {
  const total = counts.reduce((a, b) => a + b, 0);
  const partyObjs = counts.map((c, i) => ({
    c,
    color: colors[i],
    name: names[i] || `P${i + 1}`,
    idx: i,
  })).filter(p => p.c > 0).sort((a, b) => b.c - a.c);

  const coords = [], visible = [];
  let remaining = total, row = 0, rStep = seatR * 2 + gap, outerR = 0;
  while (remaining > 0) {
    const radius = innerR + row * rStep + seatR;
    outerR = radius;
    const cap = Math.max(1, Math.floor(Math.PI * radius / (seatR * 2 + gap)));
    const seatsRow = Math.min(remaining, cap);
    for (let i = 0; i < cap; i++) {
      const theta = Math.PI - (i + 0.5) * Math.PI / cap;
      coords.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
      visible.push(i < seatsRow);
    }
    remaining -= seatsRow;
    row++;
  }

  const scaleFactor = Math.max(1, Math.sqrt(total / 300));
  const baseOuterR = outerR;
  const totalWidth = (baseOuterR * 2 + 200) * scaleFactor;
  const totalHeight = (innerR + row * rStep + 160) * scaleFactor;
  const cx = (baseOuterR + 40) * scaleFactor;
  const cy = totalHeight - 80 * scaleFactor;

  const svg = [`<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`];
  svg.push(`<rect width="100%" height="100%" fill="white"/>`);
  svg.push(`<text x="${cx}" y="${40 * scaleFactor}" text-anchor="middle" font-size="${18 * scaleFactor}" font-family="sans-serif" font-weight="bold">${title}</text>`);

  let idx = 0;
  const scaledSeatR = seatR * scaleFactor;
  partyObjs.forEach(p => {
    for (let k = 0; k < p.c; k++) {
      while (!visible[idx]) idx++;
      const [x, y] = coords[idx++];
      svg.push(`<circle cx="${(x + baseOuterR + 40) * scaleFactor}" cy="${cy - y * scaleFactor}" r="${scaledSeatR}" fill="${p.color}" stroke="white" stroke-width="${0.6 * scaleFactor}"/>`);
    }
  });

  svg.push(`<text x="${cx}" y="${cy + scaledSeatR * 2 + 20 * scaleFactor}" text-anchor="middle" font-size="${14 * scaleFactor}" font-family="sans-serif">${total} seats</text>`);

  const legX = cx + baseOuterR * scaleFactor + 50 * scaleFactor;
  const legY = 80 * scaleFactor;
  partyObjs.forEach((p, i) => {
    const y = legY + i * 25 * scaleFactor;
    svg.push(`<rect x="${legX}" y="${y - 8 * scaleFactor}" width="${15 * scaleFactor}" height="${15 * scaleFactor}" fill="${p.color}"/>`);
    svg.push(`<text x="${legX + 25 * scaleFactor}" y="${y}" alignment-baseline="middle" font-size="${14 * scaleFactor}" font-family="sans-serif">${p.name} – ${p.c}</text>`);
  });

  svg.push(`</svg>`);
  document.getElementById('visualizations').innerHTML += svg.join('\n');
}
