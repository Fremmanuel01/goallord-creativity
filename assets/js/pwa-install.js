/* Goallord PWA - Install prompt (banner + iOS modal)
 * - NEVER shows when already installed (display-mode standalone, iOS standalone,
 *   getInstalledRelatedApps, prior appinstalled, or localStorage flag).
 * - NEVER shows in iframes, in-app browsers (FB/IG/Twitter/LinkedIn/etc.),
 *   on auth or payment pages, or during the cooldown window after dismissal.
 * - Listens for `appinstalled` so the banner disappears across all open tabs
 *   the moment install happens (even if the user installs from the address bar).
 * - Cooldowns: 14 days for "Not now"/close, 30 days for explicit dismiss.
 *
 * Self-contained ES5+ - no build step required.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // -------- config --------
  var STORAGE = {
    installed: 'gl_pwa_installed',
    dismissUntil: 'gl_pwa_dismiss_until',
    lastShown: 'gl_pwa_last_shown'
  };
  var COOLDOWN_LATER_MS   = 14 * 24 * 60 * 60 * 1000; // 14 days
  var COOLDOWN_DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  var MIN_SECONDS_VISIBLE = 18;                       // engagement gate
  var MIN_SCROLL_FRACTION = 0.4;
  var EXCLUDED_PATHS = [
    '/apply-payment.html',
    '/student-login.html',
    '/lecturer-login.html',
    '/login.html',
    '/forgot-password.html',
    '/reset-password.html',
    '/application-status.html',
    '/offline.html'
  ];

  // -------- safe storage --------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  // -------- environment checks --------
  function isInIframe() {
    try { return window.top !== window.self; } catch (_) { return true; }
  }
  function isStandalone() {
    try {
      if (window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      )) return true;
    } catch (_) {}
    if (window.navigator.standalone === true) return true;
    if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
    return false;
  }
  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    return /(FBAN|FBAV|FB_IAB|FBIOS|Instagram|Twitter|Snapchat|LinkedInApp|TikTok|Line\/|MicroMessenger|WeChat|MiuiBrowser)/i.test(ua);
  }
  function isIOS() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
    // iPadOS 13+ reports MacIntel; detect via touch points
    return (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isIOSSafari() {
    if (!isIOS()) return false;
    var ua = navigator.userAgent || '';
    // Exclude iOS Chrome/Firefox/Edge (CriOS, FxiOS, EdgiOS) and in-app browsers
    if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(ua)) return false;
    if (isInAppBrowser()) return false;
    return /Safari/.test(ua);
  }
  function isExcludedPage() {
    var p = location.pathname || '/';
    for (var i = 0; i < EXCLUDED_PATHS.length; i++) {
      if (p === EXCLUDED_PATHS[i]) return true;
    }
    return false;
  }
  function isDismissedRecently() {
    var until = parseInt(lsGet(STORAGE.dismissUntil) || '0', 10);
    return Date.now() < until;
  }
  function markDismiss(ms) {
    lsSet(STORAGE.dismissUntil, String(Date.now() + ms));
  }
  function markInstalled() {
    lsSet(STORAGE.installed, 'true');
  }

  // -------- master eligibility --------
  function isIneligible() {
    if (isInIframe()) return true;
    if (isStandalone()) { markInstalled(); return true; }
    if (lsGet(STORAGE.installed) === 'true') return true;
    if (isInAppBrowser()) return true;
    if (isExcludedPage()) return true;
    if (isDismissedRecently()) return true;
    return false;
  }

  // -------- defensive: check installed-related-apps (Chromium) --------
  function checkRelatedApps() {
    if (!('getInstalledRelatedApps' in navigator)) return Promise.resolve(false);
    try {
      return navigator.getInstalledRelatedApps().then(function (apps) {
        if (apps && apps.length > 0) { markInstalled(); return true; }
        return false;
      }).catch(function () { return false; });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  // -------- DOM templates --------
  var BANNER_HTML =
    '<div class="gl-pwa-banner gl-pwa" role="region" aria-label="Install Goallord app" aria-hidden="true">' +
      '<div class="gl-pwa-banner__inner">' +
        '<div class="gl-pwa-banner__icon" aria-hidden="true">' +
          '<img src="/assets/images/icons/icon-192.png" alt="">' +
        '</div>' +
        '<div class="gl-pwa-banner__body">' +
          '<p class="gl-pwa-banner__title">Install Goallord Creativity</p>' +
          '<p class="gl-pwa-banner__sub">Faster access to the academy, dashboards, and updates - right from your home screen.</p>' +
        '</div>' +
        '<div class="gl-pwa-banner__actions">' +
          '<button type="button" class="gl-pwa-btn gl-pwa-btn--primary" data-gl-pwa-install>Install</button>' +
          '<button type="button" class="gl-pwa-btn gl-pwa-btn--ghost" data-gl-pwa-later>Not now</button>' +
        '</div>' +
        '<button type="button" class="gl-pwa-banner__close" data-gl-pwa-close aria-label="Close install prompt">&times;</button>' +
      '</div>' +
    '</div>';

  var IOS_MODAL_HTML =
    '<div class="gl-pwa-ios gl-pwa" role="dialog" aria-modal="true" aria-labelledby="gl-pwa-ios-title" aria-hidden="true">' +
      '<div class="gl-pwa-ios__sheet">' +
        '<h2 id="gl-pwa-ios-title" class="gl-pwa-ios__title">Add Goallord to your Home Screen</h2>' +
        '<p class="gl-pwa-ios__sub">Get the full app experience on iPhone or iPad - open instantly, even offline.</p>' +
        '<ol class="gl-pwa-ios__steps">' +
          '<li><span class="gl-pwa-ios__num">1</span><span class="gl-pwa-ios__text">Tap the Share button' +
            '<span class="gl-pwa-ios__glyph" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb37b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>' +
            '</span> in the Safari toolbar.</span></li>' +
          '<li><span class="gl-pwa-ios__num">2</span><span class="gl-pwa-ios__text">Scroll and choose <strong>Add to Home Screen</strong>' +
            '<span class="gl-pwa-ios__glyph" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb37b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
            '</span>.</span></li>' +
          '<li><span class="gl-pwa-ios__num">3</span><span class="gl-pwa-ios__text">Tap <strong>Add</strong> in the top right corner - done.</span></li>' +
        '</ol>' +
        '<button type="button" class="gl-pwa-ios__close" data-gl-pwa-ios-close>Maybe later</button>' +
      '</div>' +
    '</div>';

  // -------- DOM helpers --------
  function injectStyleLinkOnce() {
    if (document.getElementById('gl-pwa-install-css')) return;
    var link = document.createElement('link');
    link.id = 'gl-pwa-install-css';
    link.rel = 'stylesheet';
    link.href = '/assets/css/pwa-install.css';
    document.head.appendChild(link);
  }
  function injectHTMLOnce(html, id) {
    if (document.getElementById(id)) return document.getElementById(id);
    var wrap = document.createElement('div');
    wrap.id = id;
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    return wrap;
  }

  // -------- banner controller --------
  var deferredPromptEvent = null;
  var bannerShown = false;
  var iosShown = false;

  function showBanner() {
    if (bannerShown) return;
    if (isIneligible()) return;
    var host = injectHTMLOnce(BANNER_HTML, 'gl-pwa-banner-host');
    var banner = host.querySelector('.gl-pwa-banner');
    if (!banner) return;
    banner.classList.add('is-visible');
    banner.setAttribute('aria-hidden', 'false');
    bannerShown = true;
    lsSet(STORAGE.lastShown, String(Date.now()));

    host.querySelector('[data-gl-pwa-install]').addEventListener('click', onInstallClick);
    host.querySelector('[data-gl-pwa-later]').addEventListener('click', function () {
      markDismiss(COOLDOWN_LATER_MS);
      hideBanner();
    });
    host.querySelector('[data-gl-pwa-close]').addEventListener('click', function () {
      markDismiss(COOLDOWN_LATER_MS);
      hideBanner();
    });
  }
  function hideBanner() {
    var banner = document.querySelector('#gl-pwa-banner-host .gl-pwa-banner');
    if (!banner) return;
    banner.classList.remove('is-visible');
    banner.setAttribute('aria-hidden', 'true');
  }

  function onInstallClick() {
    if (!deferredPromptEvent) {
      // If we lost the event, just hide and short-cooldown.
      markDismiss(COOLDOWN_LATER_MS);
      hideBanner();
      return;
    }
    try {
      deferredPromptEvent.prompt();
      var p = deferredPromptEvent.userChoice;
      if (p && typeof p.then === 'function') {
        p.then(function (choice) {
          if (choice && choice.outcome === 'accepted') {
            markInstalled();
          } else {
            markDismiss(COOLDOWN_DISMISS_MS);
          }
          deferredPromptEvent = null;
          hideBanner();
        });
      } else {
        deferredPromptEvent = null;
        hideBanner();
      }
    } catch (_) {
      deferredPromptEvent = null;
      hideBanner();
    }
  }

  // -------- iOS modal --------
  function showIOSModal() {
    if (iosShown) return;
    if (isIneligible()) return;
    var host = injectHTMLOnce(IOS_MODAL_HTML, 'gl-pwa-ios-host');
    var modal = host.querySelector('.gl-pwa-ios');
    if (!modal) return;
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
    iosShown = true;
    lsSet(STORAGE.lastShown, String(Date.now()));

    host.querySelector('[data-gl-pwa-ios-close]').addEventListener('click', hideIOSModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideIOSModal();
    });
    document.addEventListener('keydown', escClose);
  }
  function hideIOSModal() {
    var modal = document.querySelector('#gl-pwa-ios-host .gl-pwa-ios');
    if (!modal) return;
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
    markDismiss(COOLDOWN_LATER_MS);
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) {
    if (e.key === 'Escape') hideIOSModal();
  }

  // -------- engagement gate --------
  function waitForEngagement(cb) {
    var startedAt = Date.now();
    var fired = false;
    var pageVisibleMs = 0;
    var lastTick = Date.now();

    function fire() {
      if (fired) return;
      fired = true;
      cleanup();
      // Defer slightly so we don't fight with page-load animations.
      setTimeout(cb, 200);
    }
    function check() {
      if (document.visibilityState === 'visible') {
        pageVisibleMs += (Date.now() - lastTick);
      }
      lastTick = Date.now();
      var scrolled = (window.scrollY || document.documentElement.scrollTop || 0);
      var maxScroll = Math.max(1, (document.documentElement.scrollHeight - window.innerHeight));
      var frac = scrolled / maxScroll;
      if (pageVisibleMs >= MIN_SECONDS_VISIBLE * 1000 || frac >= MIN_SCROLL_FRACTION) {
        fire();
      }
    }
    var iv = setInterval(check, 1500);
    function cleanup() { clearInterval(iv); }

    // safety: fire eventually even if user is idle but stayed on the page
    setTimeout(function () {
      if (!fired && document.visibilityState === 'visible' && (Date.now() - startedAt) > 45000) {
        fire();
      }
    }, 46000);
  }

  // -------- boot --------
  function boot() {
    if (isIneligible()) return;
    injectStyleLinkOnce();

    // Chromium / Edge: capture the event and wait for engagement
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPromptEvent = e;
      waitForEngagement(showBanner);
    });

    // Fired whenever the app gets installed (banner click, address-bar install,
    // OS-level install, or another tab installing).
    window.addEventListener('appinstalled', function () {
      markInstalled();
      hideBanner();
      hideIOSModal();
    });

    // Detect post-install switch to standalone in-session (rare but possible).
    if (window.matchMedia) {
      try {
        var mq = window.matchMedia('(display-mode: standalone)');
        var onChange = function (ev) {
          if (ev && ev.matches) { markInstalled(); hideBanner(); hideIOSModal(); }
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      } catch (_) {}
    }

    // Cross-tab sync: another tab marks installed -> we hide.
    window.addEventListener('storage', function (e) {
      if (!e) return;
      if (e.key === STORAGE.installed && e.newValue === 'true') {
        hideBanner();
        hideIOSModal();
      }
      if (e.key === STORAGE.dismissUntil) {
        // another tab just dismissed; hide ours too
        hideBanner();
      }
    });

    // Defensive related-apps check (Chromium with related_applications declared).
    checkRelatedApps().then(function (installed) {
      if (installed) { hideBanner(); hideIOSModal(); }
    });

    // iOS path - Safari doesn't fire beforeinstallprompt
    if (isIOSSafari()) {
      waitForEngagement(showIOSModal);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
