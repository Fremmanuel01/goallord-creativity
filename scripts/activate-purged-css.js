#!/usr/bin/env node
/**
 * Switch the site's <link> tags between the original shared stylesheets and the
 * PurgeCSS output in assets/css/dist/. Run AFTER you've QA'd the purged build.
 *
 *   node scripts/activate-purged-css.js          # point HTML at purged CSS (go live)
 *   node scripts/activate-purged-css.js --revert # restore original CSS
 *
 * Also remember: production must generate the purged files at build time -
 * set Render buildCommand to:  npm install --include=dev && npm run build:css
 * (devDeps are needed because NODE_ENV=production otherwise skips PurgeCSS.)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP = [
  ['assets/css/bootstrap.min.css', 'assets/css/dist/bootstrap.min.purged.css'],
  ['assets/css/styles.css',        'assets/css/dist/styles.purged.css'],
  ['assets/css/goallord.css',      'assets/css/dist/goallord.purged.css']
];
const revert = process.argv.includes('--revert');

let changed = 0;
for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const p = path.join(ROOT, file);
  let html = fs.readFileSync(p, 'utf8');
  const orig = html;
  for (const [from, to] of MAP) {
    const [a, b] = revert ? [to, from] : [from, to];
    // match href="...a" with optional leading slash, preserve the slash
    html = html.split(`href="${a}"`).join(`href="${b}"`)
               .split(`href="/${a}"`).join(`href="/${b}"`);
  }
  if (html !== orig) { fs.writeFileSync(p, html); changed++; }
}
console.log(`${revert ? 'Reverted' : 'Activated purged CSS in'} ${changed} HTML file(s).`);
