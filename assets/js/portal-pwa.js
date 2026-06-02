/* ============================================================
 * portal-pwa.js — shared PWA client for the Goallord Portal.
 * Loaded on every portal page. Handles:
 *   1. Service worker registration
 *   2. "Install app" prompt (beforeinstallprompt)
 *   3. Web Push subscription (auto if already granted; window.GoallordPush.enable() on a gesture)
 * Self-contained: attaches the CSRF header itself so it works on any page.
 * ============================================================ */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  // ---- CSRF (double-submit cookie) ----
  function csrfToken() {
    var m = document.cookie.match(/(?:^|;\s*)_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: JSON.stringify(body || {})
    });
  }

  // ---- Service worker ----
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js')
      .then(maybeAutoSubscribe)
      .catch(function () {});
  });

  // ---- Install prompt ----
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var box = document.getElementById('install');
    var btn = document.getElementById('installBtn');
    if (box) box.classList.add('show');
    if (btn) {
      btn.onclick = function () {
        if (box) box.classList.remove('show');
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        if (deferredPrompt.userChoice) {
          deferredPrompt.userChoice.finally(function () { deferredPrompt = null; });
        } else { deferredPrompt = null; }
      };
    }
  });
  window.addEventListener('appinstalled', function () {
    var box = document.getElementById('install');
    if (box) box.classList.remove('show');
  });

  // ---- Web Push ----
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSupported() {
    return ('PushManager' in window) && ('Notification' in window);
  }

  function getVapidKey() {
    return fetch('/api/push/vapid-public-key', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.publicKey; })
      .catch(function () { return null; });
  }

  // Create (or reuse) a subscription and register it with the server.
  // Resolves true on success, false otherwise. Fails quietly when the
  // user isn't logged in (subscribe endpoint returns 401).
  function subscribe() {
    if (!pushSupported()) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return getVapidKey().then(function (key) {
          if (!key) return null;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key)
          });
        });
      });
    }).then(function (sub) {
      if (!sub) return false;
      return postJSON('/api/push/subscribe', { subscription: sub })
        .then(function (r) { return r.ok; });
    }).catch(function () { return false; });
  }

  // Request permission (needs a user gesture on iOS) then subscribe.
  function enable() {
    if (!pushSupported()) return Promise.resolve('unsupported');
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return perm;
      return subscribe().then(function () { return 'granted'; });
    });
  }

  // If permission was already granted, refresh the subscription silently.
  // Otherwise, if the user is signed in and hasn't decided yet, offer a
  // one-tap prompt (required for the permission gesture, esp. on iOS).
  function maybeAutoSubscribe() {
    if (!pushSupported()) return;
    if (Notification.permission === 'granted') { subscribe().catch(function () {}); return; }
    if (Notification.permission === 'default' && isSignedIn() && !dismissed()) {
      showOptIn();
    }
  }

  function isSignedIn() {
    return !!(localStorage.getItem('gl_student_token') ||
              localStorage.getItem('gl_lecturer_token') ||
              localStorage.getItem('gl_token'));
  }
  function dismissed() {
    try { return localStorage.getItem('gl_push_optin_dismissed') === '1'; }
    catch (_) { return false; }
  }

  // Lightweight, self-contained opt-in bar (no page markup required).
  function showOptIn() {
    if (document.getElementById('gl-push-optin')) return;
    var bar = document.createElement('div');
    bar.id = 'gl-push-optin';
    bar.setAttribute('role', 'dialog');
    bar.innerHTML =
      '<style>' +
      '#gl-push-optin{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
      'z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:460px;margin:0 auto;' +
      'background:#161a22;color:#f4f6fb;border:1px solid rgba(255,255,255,.1);border-radius:14px;' +
      'padding:12px 14px;box-shadow:0 16px 40px rgba(0,0,0,.45);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:glpush .35s ease}' +
      '@keyframes glpush{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
      '#gl-push-optin .ic{font-size:22px;flex:0 0 auto}' +
      '#gl-push-optin .tx{flex:1;font-size:.85rem;line-height:1.35}' +
      '#gl-push-optin .tx b{display:block;font-size:.92rem;margin-bottom:1px}' +
      '#gl-push-optin .tx span{color:#9aa3b2}' +
      '#gl-push-optin button{border:0;border-radius:9px;padding:8px 13px;font-weight:700;font-size:.82rem;cursor:pointer}' +
      '#gl-push-optin .yes{background:#D66A1F;color:#1a0f06}' +
      '#gl-push-optin .no{background:transparent;color:#9aa3b2;padding:8px 6px}' +
      '</style>' +
      '<span class="ic">🔔</span>' +
      '<span class="tx"><b>Turn on notifications</b><span>Get alerts for messages, assignments &amp; more.</span></span>' +
      '<button class="no" type="button">Later</button>' +
      '<button class="yes" type="button">Enable</button>';
    document.body.appendChild(bar);

    bar.querySelector('.yes').addEventListener('click', function () {
      enable().finally(function () { bar.remove(); });
    });
    bar.querySelector('.no').addEventListener('click', function () {
      try { localStorage.setItem('gl_push_optin_dismissed', '1'); } catch (_) {}
      bar.remove();
    });
  }

  window.GoallordPush = {
    enable: enable,
    subscribe: subscribe,
    supported: pushSupported,
    permission: function () { return pushSupported() ? Notification.permission : 'unsupported'; }
  };
})();
