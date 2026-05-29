/* Goallord Creativity — Service Worker
 * Strategy:
 *  - HTML navigations: network-first, fall back to cache, fall back to /offline.html
 *  - Static assets (css/js/font/image): cache-first, revalidate in background
 *  - API + socket.io + auth: never cached, never intercepted (network only)
 *  - Cross-origin GETs: best-effort cache-first
 */

const VERSION = 'goallord-v5-2026-05-29';
const SHELL_CACHE   = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE   = `${VERSION}-images`;

const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/assets/images/icons/icon-192.png',
  '/assets/images/icons/icon-512.png',
  '/assets/images/logo/favicon.svg'
];

// ---------- install ----------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(
      PRECACHE_URLS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )
    );
    self.skipWaiting();
  })());
});

// ---------- activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(VERSION))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
    const clientsList = await self.clients.matchAll({ type: 'window' });
    clientsList.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// ---------- helpers ----------
const SKIP_PATTERNS = [
  /^\/api\//,
  /^\/socket\.io\//,
  /^\/auth\//,
  /\/login(?:\.html)?$/,
  /\.map$/
];

function shouldSkip(url) {
  return SKIP_PATTERNS.some((re) => re.test(url.pathname));
}

function isNavigation(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

function isImage(request) {
  if (request.destination === 'image') return true;
  return /\.(?:png|jpe?g|gif|webp|svg|avif|ico)$/i.test(new URL(request.url).pathname);
}

function isAsset(request) {
  if (['style', 'script', 'font'].includes(request.destination)) return true;
  return /\.(?:css|js|woff2?|ttf|otf|eot)$/i.test(new URL(request.url).pathname);
}

// ---------- fetch ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && shouldSkip(url)) return;

  // Never intercept cross-origin requests (Cloudinary images, CDN scripts, etc.).
  // The image handler's opaque-response path was breaking cross-origin images —
  // let the browser fetch them natively instead.
  if (url.origin !== self.location.origin) return;

  // 1) HTML navigations -> network-first
  if (isNavigation(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          const copy = preload.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return preload;
        }
        const fresh = await fetch(request);
        if (fresh && fresh.ok && fresh.type === 'basic') {
          const copy = fresh.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) Images -> cache-first, stale-while-revalidate
  if (isImage(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then((res) => {
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })());
    return;
  }

  // 3) CSS / JS / fonts -> cache-first
  if (isAsset(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }
  // Anything else: let the browser handle it normally.
});

// ---------- messaging ----------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
