// ui-utils.js

/**
 * Shorthand for querySelector with optional root (default: document).
 * Logs a warning if the element is not found.
 */
export function qs(selector, root = document) {
  const el = root.querySelector(selector);
  if (!el) console.warn(`Element not found: ${selector}`, root);
  return el;
}

/**
 * Shorthand for querySelectorAll with optional root (default: document).
 * Always returns an array.
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
