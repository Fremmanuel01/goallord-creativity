// Server-side SVG hardening for lecture illustrations.
// SVGs are drawn by the model (and editable by authenticated lecturers), then
// shown to students — so before anything is stored we strip the active-content
// vectors: scripts, styles, foreignObject, raster <image>, event handlers and
// any non-fragment href. This is defence-in-depth; the renderer also runs a
// strict DOM allowlist (assets/js/lecture-deck.js) at the actual injection point.
// Returns a cleaned SVG string, or '' if there is no usable <svg> root.

const MAX_LEN = 40000; // a labelled instructional diagram is well under this

function sanitizeSvg(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';

  // Keep only the <svg>…</svg> root (drop XML prolog, DOCTYPE, stray markup).
  const open = s.search(/<svg[\s>]/i);
  if (open < 0) return '';
  const close = s.toLowerCase().lastIndexOf('</svg>');
  if (close < 0) return '';
  s = s.slice(open, close + 6);

  // Remove DOCTYPE / ENTITY / processing instructions / comments.
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
       .replace(/<!ENTITY[\s\S]*?>/gi, '')
       .replace(/<\?[\s\S]*?\?>/g, '')
       .replace(/<!--[\s\S]*?-->/g, '');

  // Drop whole dangerous elements (open/close and self-closing).
  const dropTags = ['script', 'style', 'foreignObject', 'image', 'animate', 'animateTransform', 'animateMotion', 'set', 'a', 'iframe', 'audio', 'video'];
  for (const tag of dropTags) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), '');
    s = s.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }

  // Strip event-handler attributes (onload, onclick, …).
  s = s.replace(/\son[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, '')
       .replace(/\son[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, '')
       .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

  // Neutralise hrefs that aren't internal fragments (#id), and any js: / data:html.
  s = s.replace(/((?:xlink:)?href)\s*=\s*"(?!#)[^"]*"/gi, '$1="#"')
       .replace(/((?:xlink:)?href)\s*=\s*'(?!#)[^']*'/gi, "$1='#'");
  s = s.replace(/javascript:/gi, '').replace(/data:text\/html/gi, '');

  if (s.length > MAX_LEN) return '';
  return s.trim();
}

module.exports = { sanitizeSvg };
