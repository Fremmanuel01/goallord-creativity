// ============================================================
// test/support/app-harness.js
//
// Builds the REAL Express application stack (helmet+CSP, camelKeys
// transform, cookie-parser, CSRF double-submit, cookie-JWT auth,
// every academy router, and static file serving) wired to an
// in-memory Supabase double. This is the closest we can get to the
// production server without external credentials or touching real
// data — same middleware order as server.js, same auth, same status
// codes. The only omissions are the global rate limiter (would
// self-DoS a walkthrough), webhooks raw-body mount, socket.io, and
// the seed/cron bootstrap.
//
//   const { buildApp } = require('./support/app-harness');
//   const { app, fake } = buildApp(seedData);
//
// Router-level limiters (e.g. applicant status checker) are preserved.
// ============================================================
'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { createFakeSupabase } = require('./fake-supabase');

const ROOT = path.join(__dirname, '..', '..');

// Drop cached copies of every app module so a fresh require picks up
// the injected fake supabase. Covers db/, routes/, middleware/, and
// lib/supabase.js.
function bustAppCache() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}db${path.sep}`) ||
      key.includes(`${path.sep}routes${path.sep}`) ||
      key.includes(`${path.sep}middleware${path.sep}`) ||
      key.endsWith(`${path.sep}lib${path.sep}supabase.js`)
    ) {
      // Only bust files inside THIS project, not node_modules.
      if (key.startsWith(ROOT) && !key.includes('node_modules')) delete require.cache[key];
    }
  }
}

const ACADEMY_ROUTERS = [
  ['/api/auth',          'routes/auth'],
  ['/api/students',      'routes/students'],
  ['/api/lecturers',     'routes/lecturers'],
  ['/api/attendance',    'routes/attendance'],
  ['/api/assignments',   'routes/assignments'],
  ['/api/materials',     'routes/materials'],
  ['/api/flashcards',    'routes/flashcards'],
  ['/api/curriculum',    'routes/curriculum'],
  ['/api/lectures',      'routes/lectures'],
  ['/api/batches',       'routes/batches'],
  ['/api/notifications', 'routes/notifications'],
  ['/api/applicants',    'routes/applicants'],
  ['/api/academy',       'routes/academy'],
  ['/api/payments',      'routes/payments'],
  ['/api/push',          'routes/push'],
  ['/api/messages',      'routes/messages'],
  ['/api/cron',          'routes/cron'],
];

function buildApp(seed, opts = {}) {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'harness-key';

  const fake = createFakeSupabase(seed);
  bustAppCache();
  const sp = require.resolve(path.join(ROOT, 'lib/supabase.js'));
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };

  const { camelKeys } = require(path.join(ROOT, 'lib/utils'));

  const app = express();
  app.set('trust proxy', 1);

  // CSP mirrors production (server.js) so the real pages behave identically in
  // the browser tests — inline handlers run, Paystack frames load, etc.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://js.paystack.co", "https://unpkg.com", "https://prod.spline.design", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        connectSrc: ["'self'", "blob:", "data:", "https://api.anthropic.com", "https://prod.spline.design", "https://unpkg.com", "https://viewer.spline.design", "https://api.paystack.co", "https://standard.paystack.co", "https://js.paystack.co", "https://cdn.jsdelivr.net", "wss:", "ws:"],
        frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.paystack.com", "https://standard.paystack.co", "https://prod.spline.design", "https://viewer.spline.design"],
        mediaSrc: ["'self'", "blob:", "data:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // camelKeys transform (matches server.js)
  app.use('/api/', (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => originalJson(camelKeys(data));
    next();
  });

  app.use(cookieParser());

  // CSRF double-submit cookie setter
  app.use((req, res, next) => {
    if (!req.cookies || !req.cookies._csrf) {
      const token = crypto.randomBytes(24).toString('hex');
      res.cookie('_csrf', token, { httpOnly: false, sameSite: 'Strict', path: '/' });
    }
    next();
  });

  function csrfCheck(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path.includes('/upload')) return next();
    if (req.path.startsWith('/webhooks/') || req.path === '/webhooks') return next();
    if (req.path.startsWith('/cron/')) return next();
    const cookie = req.cookies && req.cookies._csrf;
    const header = req.headers['x-csrf-token'];
    if (!cookie || !header || cookie !== header) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token. Please refresh the page.' });
    }
    next();
  }
  app.use('/api/', csrfCheck);

  // Public config (used by frontend pages)
  app.get('/api/config/public', (req, res) => {
    res.json({ paystackPublicKey: '', bank: {}, bank2: {}, fees: { application: 20000, fullTuition: 300000, monthlyTuition: 100000 } });
  });

  for (const [mount, mod] of ACADEMY_ROUTERS) {
    try {
      app.use(mount, require(path.join(ROOT, mod)));
    } catch (e) {
      if (!opts.quiet) console.error(`[harness] failed to mount ${mod}: ${e.message}`);
    }
  }

  // Static site (so the browser pass can load the real HTML/JS/CSS).
  if (opts.serveStatic !== false) {
    app.use(express.static(ROOT, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
  }

  // 404 + generic error handler (mirrors server.js: never leak stacks)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).sendFile(path.join(ROOT, '404.html'));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err && err.status === 400 ? 400 : 500;
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: status === 400 ? 'Invalid request.' : 'Something went wrong.' });
    res.status(status).send('Something went wrong.');
  });

  return { app, fake };
}

module.exports = { buildApp };
