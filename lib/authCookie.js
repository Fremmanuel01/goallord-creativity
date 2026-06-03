// ============================================================
// lib/authCookie.js - httpOnly JWT cookies
//
// The JWT now lives in an httpOnly cookie instead of being read
// from JS-accessible storage, closing the XSS token-exfil vector.
// Middleware reads the cookie first and falls back to the
// Authorization: Bearer header (API clients / transition).
//
// Cookie names mirror the old localStorage keys, one per portal:
//   admin/staff → gl_token
//   student     → gl_student_token
//   lecturer    → gl_lecturer_token
// ============================================================

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',                                // same-origin app; Lax is fine
    secure: process.env.NODE_ENV === 'production',  // allow http on localhost dev
    path: '/',
    maxAge: SEVEN_DAYS
  };
}

function setAuthCookie(res, name, token) {
  res.cookie(name, token, cookieOpts());
}

function clearAuthCookie(res, name) {
  res.clearCookie(name, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Token from the named cookie, else the Bearer header.
function extractToken(req, cookieName) {
  const fromCookie = req.cookies && req.cookies[cookieName];
  if (fromCookie) return fromCookie;
  return bearer(req);
}

// Any of the auth cookies (for the unified chat auth), else Bearer.
function extractAnyToken(req) {
  const c = req.cookies || {};
  return c.gl_token || c.gl_student_token || c.gl_lecturer_token || bearer(req);
}

// Parse a single cookie value out of a raw Cookie header - used for
// socket.io handshakes, where req.cookies isn't parsed for us.
function parseCookieHeader(header, name) {
  if (!header) return null;
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    if (p.slice(0, idx).trim() === name) return decodeURIComponent(p.slice(idx + 1).trim());
  }
  return null;
}

module.exports = {
  setAuthCookie, clearAuthCookie, extractToken, extractAnyToken, parseCookieHeader, bearer
};
