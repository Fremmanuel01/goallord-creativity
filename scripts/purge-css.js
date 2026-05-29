#!/usr/bin/env node
/**
 * PurgeCSS build step — strips unused rules from the big shared stylesheets.
 *
 * NON-DESTRUCTIVE: reads the originals in assets/css/, writes purged copies to
 * assets/css/dist/. Production only uses the purged files once the <link> tags
 * are switched (see README note) — until then nothing changes.
 *
 * Content scanned: every *.html (incl. inline scripts) + assets/js/**.js, so a
 * class used anywhere — including ones built inside JS template literals — is
 * kept. Dynamically-concatenated class names (e.g. 'badge-' + status) can't be
 * seen by static analysis, so they're covered by the safelist below.
 *
 * Run:  npm run build:css
 */
const fs = require('fs');
const path = require('path');
const { PurgeCSS } = require('purgecss');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'css', 'dist');

// Big shared stylesheets worth purging (skip already-small/component files).
const TARGETS = [
  'assets/css/bootstrap.min.css',
  'assets/css/styles.css',
  'assets/css/goallord.css'
];

// Classes/patterns that are added at runtime (JS toggles, bootstrap components,
// plugin-generated DOM, concatenated names) and must NOT be purged.
const safelist = {
  standard: [
    'html', 'body', 'active', 'show', 'showing', 'hide', 'hidden', 'open', 'closed',
    'collapse', 'collapsing', 'collapsed', 'fade', 'in', 'disabled', 'selected',
    'loading', 'loaded', 'error', 'success', 'warning', 'info', 'visible', 'invisible',
    'modal-open', 'modal-backdrop', 'offcanvas-backdrop', 'dropdown-menu', 'dropdown-toggle',
    'menu-open', 'nav-open', 'scrolled', 'sticky', 'is-active', 'current',
    // nice-select plugin-generated DOM
    'nice-select', 'list', 'option', 'focus',
    // odometer plugin-generated DOM
    'odometer', 'odometer-inside', 'odometer-digit', 'odometer-value', 'odometer-ribbon', 'odometer-ribbon-inner',
    // app status badges / toasts seen in dashboards
    'sd-toast', 'show', 'badge', 'empty', 'empty-row'
  ],
  // keep whole families that are assembled dynamically (e.g. `badge-${status}`)
  greedy: [
    /^badge-/, /^btn-/, /^status-/, /^pay-/, /^stat-/, /^toast/, /^alert-/, /^modal/,
    /^carousel/, /^dropdown/, /^collapse/, /^offcanvas/, /^tooltip/, /^popover/,
    /^nice-select/, /^odometer/, /^swiper-/, /^slick-/, /^progress/, /^tab/, /^active$/,
    /^show$/, /^open$/, /^is-/, /^has-/, /^fade/, /^animate/, /^effectFade/, /^reveal/,
    /^aos/, /^wow/, /^gsap/, /^pin-/, /^pinned/
  ],
  // attributes/keyframes
  keyframes: true,
  variables: true
};

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const content = [
    path.join(ROOT, '*.html'),
    path.join(ROOT, 'assets', 'js', '**', '*.js')
  ];

  let totalBefore = 0, totalAfter = 0;
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { console.warn('skip (missing):', rel); continue; }
    const before = fs.statSync(abs).size;

    const [result] = await new PurgeCSS().purge({
      content,
      css: [abs],
      safelist,
      // keep @font-face, keyframes already handled; do not strip variables
      fontFace: false,
      keyframes: false,
      variables: false
    });

    const outName = path.basename(rel).replace(/\.css$/, '.purged.css');
    const outPath = path.join(OUT, outName);
    fs.writeFileSync(outPath, result.css);
    const after = Buffer.byteLength(result.css);
    totalBefore += before; totalAfter += after;
    const pct = Math.round((1 - after / before) * 100);
    console.log(`${rel.padEnd(34)} ${(before/1024).toFixed(0).padStart(4)}KB -> ${(after/1024).toFixed(0).padStart(4)}KB  (-${pct}%)  => dist/${outName}`);
  }
  console.log('-'.repeat(70));
  console.log(`TOTAL  ${(totalBefore/1024).toFixed(0)}KB -> ${(totalAfter/1024).toFixed(0)}KB  saved ${((totalBefore-totalAfter)/1024).toFixed(0)}KB (-${Math.round((1-totalAfter/totalBefore)*100)}%)`);
  console.log('\nPurged files written to assets/css/dist/. Originals untouched.');
  console.log('QA them before switching <link> tags + Render buildCommand (see report).');
})().catch(e => { console.error('purge failed:', e); process.exit(1); });
