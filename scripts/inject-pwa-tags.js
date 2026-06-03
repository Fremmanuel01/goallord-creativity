#!/usr/bin/env node
/* Goallord Creativity - PWA tag injector
 *
 * Inserts the PWA meta tags, manifest link, service-worker registration,
 * and install-prompt script into every *.html file in davies/.
 *
 * Idempotent: blocks are wrapped in sentinel comments. Re-running the script
 * replaces the existing block in place instead of stacking duplicates.
 *
 * Usage:
 *   node scripts/inject-pwa-tags.js          # injects/updates
 *   node scripts/inject-pwa-tags.js --check  # exits 1 if any file is out of date
 *   node scripts/inject-pwa-tags.js --strip  # removes the injected blocks
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // davies/
const HEAD_START = '<!-- pwa:head-start -->';
const HEAD_END   = '<!-- pwa:head-end -->';
const BODY_START = '<!-- pwa:body-end-start -->';
const BODY_END   = '<!-- pwa:body-end-end -->';

const HEAD_BLOCK = [
  HEAD_START,
  '<meta name="theme-color" content="#D66A1F">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Goallord">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="application-name" content="Goallord Creativity">',
  '<link rel="manifest" href="/manifest.json">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/icons/apple-touch-icon-180.png">',
  '<link rel="apple-touch-icon" sizes="167x167" href="/assets/images/icons/apple-touch-icon-167.png">',
  '<link rel="apple-touch-icon" sizes="152x152" href="/assets/images/icons/apple-touch-icon-152.png">',
  '<link rel="apple-touch-icon" sizes="120x120" href="/assets/images/icons/apple-touch-icon-120.png">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/icons/favicon-32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/assets/images/icons/favicon-16.png">',
  HEAD_END
].join('\n  ');

const BODY_BLOCK = [
  BODY_START,
  '<script src="/assets/js/csrf.js"></script>',
  '<script>',
  "  if ('serviceWorker' in navigator) {",
  "    window.addEventListener('load', function () {",
  "      navigator.serviceWorker.register('/sw.js').catch(function () {});",
  '    });',
  '  }',
  '</script>',
  '<script src="/assets/js/pwa-install.js" defer></script>',
  BODY_END
].join('\n  ');

// Files we never touch
const SKIP_FILES = new Set([
  'offline.html', // its own minimal PWA tags
  '404.html'      // optional: still inject? we include it; remove from skip if undesired
]);
SKIP_FILES.delete('404.html'); // we want 404 to be PWA-aware too

function listHtmlFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !SKIP_FILES.has(f))
    .map((f) => path.join(dir, f));
}

function stripBlock(src, startMarker, endMarker) {
  const re = new RegExp(
    '\\s*' + escape(startMarker) + '[\\s\\S]*?' + escape(endMarker) + '\\s*',
    'g'
  );
  return src.replace(re, '\n');
}
function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Tags the codemod owns. Any matching tag found OUTSIDE the sentinel block
// is a leftover from before site-wide PWA tags were unified, so we strip it.
// The canonical version lives inside the block below.
const META_NAMES_OWNED = [
  'theme-color',
  'apple-mobile-web-app-capable',
  'apple-mobile-web-app-status-bar-style',
  'apple-mobile-web-app-title',
  'mobile-web-app-capable',
  'application-name'
];
const LINK_RELS_OWNED = [
  'manifest',
  'apple-touch-icon',
  'apple-touch-icon-precomposed'
];

function stripOwnedHeadTags(src) {
  const metaRe = new RegExp(
    '[ \\t]*<meta\\s[^>]*name=["\'](?:' + META_NAMES_OWNED.join('|') + ')["\'][^>]*>\\s*\\n?',
    'gi'
  );
  const linkRe = new RegExp(
    '[ \\t]*<link\\s[^>]*rel=["\'](?:' + LINK_RELS_OWNED.join('|') + ')["\'][^>]*>\\s*\\n?',
    'gi'
  );
  return src.replace(metaRe, '').replace(linkRe, '');
}

function injectHead(src, block) {
  // 1) Replace any existing sentinel block.
  let cleaned = stripBlock(src, HEAD_START, HEAD_END);
  // 2) Strip leftover pre-existing copies of tags we now own.
  cleaned = stripOwnedHeadTags(cleaned);
  // 3) Insert before </head> with normalized whitespace.
  if (!/<\/head>/i.test(cleaned)) {
    console.warn('  ! no </head> tag found, skipping');
    return null;
  }
  return cleaned.replace(/\s*<\/head>/i, '\n  ' + block + '\n</head>');
}

function injectBody(src, block) {
  let cleaned = stripBlock(src, BODY_START, BODY_END);
  // Strip any pre-existing manual csrf.js script tags so the codemod is the
  // single source of truth (the block below loads csrf.js exactly once).
  cleaned = cleaned.replace(
    /[ \t]*<script[^>]*src=["'](?:\.\.?\/)*\/?assets\/js\/csrf\.js["'][^>]*><\/script>\s*\n?/gi,
    ''
  );
  if (!/<\/body>/i.test(cleaned)) {
    console.warn('  ! no </body> tag found, appending at end');
    return cleaned.replace(/\s*$/, '\n  ' + block + '\n');
  }
  // Replace only the LAST </body> with normalized whitespace.
  const matches = [...cleaned.matchAll(/<\/body>/gi)];
  const last = matches[matches.length - 1];
  const before = cleaned.slice(0, last.index).replace(/\s+$/, '');
  const after = cleaned.slice(last.index + last[0].length);
  return before + '\n  ' + block + '\n</body>' + after;
}

function transform(src, { strip }) {
  if (strip) {
    let out = stripBlock(src, HEAD_START, HEAD_END);
    out = stripBlock(out, BODY_START, BODY_END);
    return out;
  }
  let out = injectHead(src, HEAD_BLOCK);
  if (out === null) return null;
  out = injectBody(out, BODY_BLOCK);
  return out;
}

function run() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const strip = args.includes('--strip');

  const files = listHtmlFiles(ROOT);
  let changed = 0;
  let outOfDate = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    const out = transform(src, { strip });
    if (out === null) continue;
    if (out !== src) {
      if (check) {
        outOfDate++;
        console.log('  drift: ' + rel);
      } else {
        fs.writeFileSync(file, out, 'utf8');
        changed++;
        console.log('  ' + (strip ? 'stripped' : 'updated') + ': ' + rel);
      }
    } else {
      console.log('  ok:      ' + rel);
    }
  }

  if (check) {
    console.log('\n' + (outOfDate ? outOfDate + ' file(s) out of date' : 'all files in sync'));
    process.exit(outOfDate ? 1 : 0);
  } else {
    console.log('\n' + changed + ' file(s) ' + (strip ? 'stripped' : 'updated') + ', ' + (files.length - changed) + ' already current');
  }
}

run();
