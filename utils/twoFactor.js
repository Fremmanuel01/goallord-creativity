// ============================================================
// utils/twoFactor.js — shared 2FA route handlers
//
// One implementation reused by all three identity types
// (admin/staff, students, lecturers). Each caller supplies:
//   db          — module with findById(id) -> full row and update(id, updates)
//   getIdentity — (req) => ({ id, email })  (reads req.user / req.student)
//   issuer      — label shown in the authenticator app
// ============================================================
const bcrypt = require('bcryptjs');
const totp = require('./totp');

// Verify a login-time code against an account that has 2FA enabled.
// Accepts a live TOTP code OR a single-use backup code (which is then
// consumed). Returns true if the code is valid. Safe to call when 2FA
// is off — it returns true so the caller can treat it uniformly.
async function verifyLoginCode(db, row, code) {
  if (!row.totp_enabled) return true;
  if (!code) return false;
  const cleaned = String(code).replace(/\s+/g, '');

  // TOTP path
  if (/^\d{6}$/.test(cleaned) && totp.verify(cleaned, row.totp_secret)) return true;

  // Backup-code path — match a stored hash, then remove it (single use)
  const hash = totp.hashBackupCode(cleaned);
  const codes = row.totp_backup_codes || [];
  const idx = codes.indexOf(hash);
  if (idx !== -1) {
    const remaining = codes.slice(0, idx).concat(codes.slice(idx + 1));
    await db.update(row.id, { totp_backup_codes: remaining });
    return true;
  }
  return false;
}

function createTwoFactorHandlers({ db, getIdentity, issuer = 'Goallord Academy' }) {
  // GET …/2fa/status
  async function status(req, res) {
    try {
      const { id } = getIdentity(req);
      const row = await db.findById(id);
      if (!row) return res.status(404).json({ error: 'Account not found' });
      res.json({
        enabled: !!row.totp_enabled,
        pending: !!row.totp_pending_secret && !row.totp_enabled,
        backupCodesRemaining: (row.totp_backup_codes || []).length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST …/2fa/setup — create a pending secret + provisioning URI
  async function setup(req, res) {
    try {
      const { id, email } = getIdentity(req);
      const row = await db.findById(id);
      if (!row) return res.status(404).json({ error: 'Account not found' });
      if (row.totp_enabled) {
        return res.status(400).json({ error: 'Two-factor authentication is already enabled. Disable it first to re-enrol.' });
      }
      const secret = totp.generateSecret();
      await db.update(id, { totp_pending_secret: secret });
      res.json({
        secret,
        otpauthUrl: totp.otpauthURL({ secret, label: email, issuer })
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST …/2fa/enable { code } — confirm the pending secret, turn 2FA on,
  // return one-time backup codes (shown to the user exactly once)
  async function enable(req, res) {
    try {
      const { id } = getIdentity(req);
      const { code } = req.body || {};
      const row = await db.findById(id);
      if (!row) return res.status(404).json({ error: 'Account not found' });
      if (row.totp_enabled) return res.status(400).json({ error: 'Already enabled' });
      if (!row.totp_pending_secret) {
        return res.status(400).json({ error: 'Start setup first.' });
      }
      if (!totp.verify(code, row.totp_pending_secret)) {
        return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
      }
      const backupCodes = totp.generateBackupCodes();
      await db.update(id, {
        totp_secret: row.totp_pending_secret,
        totp_pending_secret: null,
        totp_enabled: true,
        totp_backup_codes: backupCodes.map(totp.hashBackupCode)
      });
      res.json({ success: true, backupCodes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST …/2fa/disable { password, code } — require a fresh re-auth
  // (password + a valid TOTP or backup code) before tearing 2FA down
  async function disable(req, res) {
    try {
      const { id } = getIdentity(req);
      const { password, code } = req.body || {};
      const row = await db.findById(id);
      if (!row) return res.status(404).json({ error: 'Account not found' });
      if (!row.totp_enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
      if (!password || !(await bcrypt.compare(password, row.password))) {
        return res.status(401).json({ error: 'Incorrect password.' });
      }
      const codeOk = await verifyLoginCode(db, row, code);
      if (!codeOk) return res.status(400).json({ error: 'Invalid authentication code.' });
      await db.update(id, {
        totp_enabled: false,
        totp_secret: null,
        totp_pending_secret: null,
        totp_backup_codes: []
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  return { status, setup, enable, disable };
}

module.exports = { createTwoFactorHandlers, verifyLoginCode };
