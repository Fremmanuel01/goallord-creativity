// ============================================================
// utils/totp.js - RFC 6238 TOTP, dependency-free (Node crypto)
//
// Google Authenticator / Authy compatible: base32 secret, SHA-1,
// 6 digits, 30-second period. No external packages so there is
// nothing extra to install or audit.
// ============================================================
const crypto = require('crypto');

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648
const PERIOD = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A fresh random base32 secret. 20 bytes = 160 bits = 32 base32 chars.
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

// HOTP (RFC 4226): one code for a given counter.
function hotp(secret, counter, digits = DIGITS) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter without bitwise ops (avoids 32-bit overflow)
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return (bin % (10 ** digits)).toString().padStart(digits, '0');
}

// Current TOTP code (mainly useful for tests).
function generate(secret, { time = Date.now(), period = PERIOD, digits = DIGITS } = {}) {
  return hotp(secret, Math.floor(time / 1000 / period), digits);
}

// Verify a submitted code, tolerating ±window steps of clock drift.
function verify(token, secret, { window = 1, time = Date.now(), period = PERIOD, digits = DIGITS } = {}) {
  if (!token || !secret) return false;
  const cleaned = String(token).replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(cleaned)) return false;
  const counter = Math.floor(time / 1000 / period);
  const input = Buffer.from(cleaned);
  for (let drift = -window; drift <= window; drift++) {
    const candidate = Buffer.from(hotp(secret, counter + drift, digits));
    if (candidate.length === input.length && crypto.timingSafeEqual(candidate, input)) return true;
  }
  return false;
}

// otpauth:// provisioning URI for the QR code / manual entry.
function otpauthURL({ secret, label, issuer }) {
  const enc = encodeURIComponent;
  const path = issuer ? `${enc(issuer)}:${enc(label)}` : enc(label);
  const params = new URLSearchParams({
    secret,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD)
  });
  if (issuer) params.set('issuer', issuer);
  return `otpauth://totp/${path}?${params.toString()}`;
}

// ── Single-use recovery codes ──
// High-entropy random, so a plain sha256 hash at rest is sufficient
// (no need for bcrypt's slow hashing on these).
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);   // e.g. "a1b2c-3d4e5"
  }
  return codes;
}

function hashBackupCode(code) {
  const normalized = String(code).toLowerCase().replace(/[\s-]+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  base32Encode, base32Decode,
  generateSecret, hotp, generate, verify, otpauthURL,
  generateBackupCodes, hashBackupCode,
  PERIOD, DIGITS
};
