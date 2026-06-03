// ============================================================
// two-factor-ui.js - reusable 2FA enrolment panel
//
// Renders the "Two-Factor Authentication" card into a container and
// drives the setup → confirm → backup-codes → disable flow against
// one of the role endpoints (/api/auth, /api/students, /api/lecturers).
//
// Usage:
//   initTwoFactor({
//     container: '#twoFactorPanel',
//     base: '/api/students',
//     token: function () { return localStorage.getItem('gl_student_token'); }
//   });
//
// Relies on the global fetch patch in csrf.js for the X-CSRF-Token
// header, so include this AFTER csrf.js. The QR library is lazy-loaded
// from jsDelivr (allowed by CSP); if it fails, the manual key is shown.
// ============================================================
(function () {
  function loadQR() {
    return new Promise(function (resolve) {
      if (window.QRCode) return resolve(window.QRCode);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
      s.onload = function () { resolve(window.QRCode || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.initTwoFactor = function (opts) {
    var el = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!el) return;
    var base = opts.base;
    function token() { return typeof opts.token === 'function' ? opts.token() : opts.token; }

    function api(path, method, body) {
      var headers = { 'Authorization': 'Bearer ' + token() };
      if (body) headers['Content-Type'] = 'application/json';
      var o = { method: method || 'GET', headers: headers };
      if (body) o.body = JSON.stringify(body);
      return fetch(base + path, o).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; })
          .catch(function () { return { ok: r.ok, status: r.status, json: {} }; });
      });
    }

    // Shared inline styles - use CSS vars with fallbacks so the card looks
    // right on every dashboard regardless of which tokens it defines.
    var CARD = 'background:var(--card,#171A21);border:1px solid var(--border,#2A2F3A);border-radius:12px;padding:24px;';
    var BTN_PRIMARY = 'padding:11px 22px;background:var(--orange,#D66A1F);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
    var BTN_GHOST = 'padding:11px 22px;background:transparent;border:1px solid var(--border,#2A2F3A);color:var(--text,#F4F6FA);border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;';
    var INPUT = 'width:100%;padding:11px 14px;background:#0F1115;border:1px solid #2A2F3A;border-radius:8px;color:#F4F6FA;font-size:14px;outline:none;';
    var MSG = '<div id="tf-msg" style="display:none;margin-bottom:14px;padding:10px 14px;border-radius:8px;font-size:13px;"></div>';

    function showMsg(text, kind) {
      var m = el.querySelector('#tf-msg');
      if (!m) return;
      m.textContent = text;
      m.style.display = 'block';
      if (kind === 'error') {
        m.style.background = 'rgba(220,60,60,0.12)'; m.style.border = '1px solid rgba(220,60,60,0.3)'; m.style.color = '#ff7070';
      } else {
        m.style.background = 'rgba(34,197,94,0.1)'; m.style.border = '1px solid rgba(34,197,94,0.3)'; m.style.color = '#22c55e';
      }
    }

    function header() {
      return '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">Two-Factor Authentication</div>'
        + '<p style="font-size:13px;color:var(--muted,#A0A6B3);margin-bottom:18px;line-height:1.5;">Require a one-time code from an authenticator app (Google Authenticator, Authy, 1Password) in addition to your password.</p>';
    }

    function render() {
      el.innerHTML = '<div style="' + CARD + '">' + header() + '<div style="color:var(--muted,#A0A6B3);font-size:13px;">Loading…</div></div>';
      api('/2fa/status').then(function (r) {
        if (!r.ok) {
          el.innerHTML = '<div style="' + CARD + '">' + header() + '<div style="color:#ff7070;font-size:13px;">Could not load 2FA status.</div></div>';
          return;
        }
        if (r.json.enabled) renderEnabled(r.json); else renderDisabled();
      });
    }

    function renderDisabled() {
      el.innerHTML = '<div style="' + CARD + '">' + header() + MSG
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;">'
        +   '<span style="background:rgba(160,166,179,0.12);color:var(--muted,#A0A6B3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">DISABLED</span>'
        +   '<span style="font-size:13px;color:var(--muted,#A0A6B3);">Your account is protected by password only.</span>'
        + '</div>'
        + '<button id="tf-enable" style="' + BTN_PRIMARY + '">Enable Two-Factor</button>'
        + '<div id="tf-setup" style="display:none;margin-top:20px;"></div>';
      el.querySelector('#tf-enable').onclick = startSetup;
    }

    function startSetup() {
      var btn = el.querySelector('#tf-enable');
      btn.disabled = true; btn.textContent = 'Starting…';
      api('/2fa/setup', 'POST').then(function (r) {
        btn.disabled = false; btn.textContent = 'Enable Two-Factor';
        if (!r.ok) { showMsg(r.json.error || 'Could not start setup.', 'error'); return; }
        renderSetup(r.json.secret, r.json.otpauthUrl);
      });
    }

    function renderSetup(secret, otpauthUrl) {
      var box = el.querySelector('#tf-setup');
      var grouped = secret.replace(/(.{4})/g, '$1 ').trim();
      box.style.display = 'block';
      box.innerHTML =
        '<div style="border-top:1px solid var(--border,#2A2F3A);padding-top:18px;">'
        + '<div style="font-size:13px;color:var(--muted,#A0A6B3);margin-bottom:14px;">1. Scan this QR code with your authenticator app, or enter the key manually.</div>'
        + '<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;margin-bottom:18px;">'
        +   '<div id="tf-qr" style="width:180px;height:180px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:8px;flex-shrink:0;"></div>'
        +   '<div style="flex:1;min-width:200px;">'
        +     '<div style="font-size:11px;font-weight:700;color:var(--muted,#A0A6B3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Manual entry key</div>'
        +     '<code style="display:block;font-size:15px;font-weight:700;color:var(--orange,#D66A1F);letter-spacing:1px;word-break:break-all;background:#0F1115;border:1px solid #2A2F3A;border-radius:8px;padding:12px;">' + esc(grouped) + '</code>'
        +   '</div>'
        + '</div>'
        + '<div style="font-size:13px;color:var(--muted,#A0A6B3);margin-bottom:8px;">2. Enter the 6-digit code shown in your app to confirm.</div>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
        +   '<input id="tf-confirm-code" inputmode="numeric" maxlength="6" placeholder="123456" style="' + INPUT + 'max-width:160px;">'
        +   '<button id="tf-confirm" style="' + BTN_PRIMARY + '">Confirm &amp; Enable</button>'
        +   '<button id="tf-cancel" style="' + BTN_GHOST + '">Cancel</button>'
        + '</div></div>';

      loadQR().then(function (QR) {
        var host = el.querySelector('#tf-qr');
        if (!host) return;
        if (QR && QR.toCanvas) {
          var c = document.createElement('canvas');
          QR.toCanvas(c, otpauthUrl, { width: 164, margin: 0 }, function (err) {
            if (err) host.innerHTML = '<span style="color:#888;font-size:11px;text-align:center;">Use the manual key →</span>';
            else host.appendChild(c);
          });
        } else {
          host.innerHTML = '<span style="color:#888;font-size:11px;text-align:center;padding:8px;">QR unavailable.<br>Use the manual key →</span>';
        }
      });

      el.querySelector('#tf-confirm').onclick = confirmEnable;
      el.querySelector('#tf-cancel').onclick = render;
      el.querySelector('#tf-confirm-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmEnable(); });
    }

    function confirmEnable() {
      var code = (el.querySelector('#tf-confirm-code').value || '').trim();
      var btn = el.querySelector('#tf-confirm');
      btn.disabled = true; btn.textContent = 'Verifying…';
      api('/2fa/enable', 'POST', { code: code }).then(function (r) {
        btn.disabled = false; btn.textContent = 'Confirm & Enable';
        if (!r.ok) { showMsg(r.json.error || 'Invalid code.', 'error'); return; }
        renderBackupCodes(r.json.backupCodes || []);
      });
    }

    function renderBackupCodes(codes) {
      el.innerHTML = '<div style="' + CARD + '">' + header()
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">'
        +   '<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">ENABLED</span>'
        +   '<span style="font-size:13px;color:var(--text,#F4F6FA);font-weight:600;">Two-factor authentication is now on.</span>'
        + '</div>'
        + '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:14px 16px;margin-bottom:16px;">'
        +   '<div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:6px;">⚠️ Save your backup codes</div>'
        +   '<div style="font-size:12px;color:var(--muted,#A0A6B3);line-height:1.5;">Each code works once if you lose access to your authenticator. Store them somewhere safe - they will not be shown again.</div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:18px;">'
        +   codes.map(function (c) { return '<code style="background:#0F1115;border:1px solid #2A2F3A;border-radius:6px;padding:8px;text-align:center;font-size:13px;color:var(--text,#F4F6FA);letter-spacing:1px;">' + esc(c) + '</code>'; }).join('')
        + '</div>'
        + '<button id="tf-copy" style="' + BTN_GHOST + 'margin-right:8px;">Copy codes</button>'
        + '<button id="tf-done" style="' + BTN_PRIMARY + '">Done</button>';
      el.querySelector('#tf-copy').onclick = function () {
        var text = codes.join('\n');
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { el.querySelector('#tf-copy').textContent = 'Copied ✓'; });
      };
      el.querySelector('#tf-done').onclick = render;
    }

    function renderEnabled(status) {
      el.innerHTML = '<div style="' + CARD + '">' + header() + MSG
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;">'
        +   '<span style="background:rgba(34,197,94,0.15);color:#22c55e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">ENABLED</span>'
        +   '<span style="font-size:13px;color:var(--muted,#A0A6B3);">' + (status.backupCodesRemaining || 0) + ' backup code(s) remaining.</span>'
        + '</div>'
        + '<div style="font-size:13px;color:var(--muted,#A0A6B3);margin-bottom:12px;">To turn off 2FA, confirm your password and a current code.</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:460px;margin-bottom:14px;">'
        +   '<input id="tf-dis-pw" type="password" placeholder="Password" autocomplete="current-password" style="' + INPUT + '">'
        +   '<input id="tf-dis-code" inputmode="numeric" maxlength="20" placeholder="Code or backup code" style="' + INPUT + '">'
        + '</div>'
        + '<button id="tf-disable" style="' + BTN_GHOST + 'border-color:rgba(239,68,68,0.4);color:#ff8080;">Disable Two-Factor</button>';
      el.querySelector('#tf-disable').onclick = function () {
        var pw = el.querySelector('#tf-dis-pw').value;
        var code = (el.querySelector('#tf-dis-code').value || '').trim();
        var btn = el.querySelector('#tf-disable');
        btn.disabled = true; btn.textContent = 'Disabling…';
        api('/2fa/disable', 'POST', { password: pw, code: code }).then(function (r) {
          btn.disabled = false; btn.textContent = 'Disable Two-Factor';
          if (!r.ok) { showMsg(r.json.error || 'Could not disable.', 'error'); return; }
          render();
        });
      };
    }

    render();
  };
})();
