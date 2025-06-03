// party-utils.js

const COLOR_PALETTE = [
  "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
  "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5",
  "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f",
  "#e5c494", "#b3b3b3", "#1b9e77", "#d95f02", "#7570b3",
  "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666",
  "#8c564b", "#bcbd22", "#17becf", "#ff9896", "#c5b0d5"
];

let nextColorIndex = 0;

export function getNextColor() {
  const color = COLOR_PALETTE[nextColorIndex % COLOR_PALETTE.length];
  nextColorIndex++;
  return color;
}

export function resetColorIndex() {
  nextColorIndex = 0;
}
