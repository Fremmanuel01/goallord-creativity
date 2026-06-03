const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const lecturersDb = require('../db/lecturers');
const { requireAuth }        = require('../middleware/auth');
const { requireLecturerOnly } = require('../middleware/lecturerAuth');
const { sendMail }           = require('../utils/mailer');
const { passwordResetEmail } = require('../utils/emailTemplates');
const { createTwoFactorHandlers, verifyLoginCode } = require('../utils/twoFactor');
const { sanitizeIdentity } = require('../lib/utils');
const { passwordError } = require('../utils/passwordPolicy');
const { setAuthCookie, clearAuthCookie } = require('../lib/authCookie');

const router = express.Router();

const twoFactor = createTwoFactorHandlers({
  db: lecturersDb,
  getIdentity: (req) => ({ id: req.user.id, email: req.user.email })
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// POST /api/lecturers/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    const lecturer = await lecturersDb.findByEmail(email.toLowerCase());
    if (!lecturer) return res.status(401).json({ error: 'Invalid credentials' });
    if (lecturer.status === 'Inactive') return res.status(403).json({ error: 'Account inactive' });

    const match = await bcrypt.compare(password, lecturer.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    if (lecturer.totp_enabled) {
      if (!totpCode) return res.json({ twoFactorRequired: true });
      const codeOk = await verifyLoginCode(lecturersDb, lecturer, totpCode);
      if (!codeOk) return res.status(401).json({ error: 'Invalid authentication code' });
    }

    const token = jwt.sign(
      { id: lecturer.id, role: 'lecturer', fullName: lecturer.full_name, email: lecturer.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );
    setAuthCookie(res, 'gl_lecturer_token', token);
    res.json({ token, lecturer: { id: lecturer.id, fullName: lecturer.full_name, email: lecturer.email, specialization: lecturer.specialization, profilePicture: lecturer.profile_picture } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lecturers/logout - clear the auth cookie
router.post('/logout', (req, res) => {
  clearAuthCookie(res, 'gl_lecturer_token');
  res.json({ success: true });
});

// ── Two-factor authentication (lecturers) ──────────────────────
router.get('/2fa/status',   requireLecturerOnly, twoFactor.status);
router.post('/2fa/setup',   requireLecturerOnly, twoFactor.setup);
router.post('/2fa/enable',  requireLecturerOnly, twoFactor.enable);
router.post('/2fa/disable', requireLecturerOnly, twoFactor.disable);

// GET /api/lecturers/me/batches - batches the signed-in lecturer is assigned to
router.get('/me/batches', requireLecturerOnly, async (req, res) => {
  try {
    const batches = await lecturersDb.batchesFor(req.user.id);
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers
router.get('/', requireAuth, async (req, res) => {
  try {
    const lecturers = await lecturersDb.findAll();
    // Remove password from results
    const safe = lecturers.map(({ password, ...rest }) => rest);
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const lecturer = await lecturersDb.findById(req.params.id);
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(sanitizeIdentity(lecturer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lecturers
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fullName, email, password, phone, bio, specialization, batches, status } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    const lecturer = await lecturersDb.create({
      full_name: fullName,
      email,
      password: hashed,
      phone: phone || '',
      bio: bio || '',
      specialization: specialization || '',
      batches: batches || [],
      status: status || 'Active',
      created_by: req.user.id
    });
    res.status(201).json(sanitizeIdentity(lecturer));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/lecturers/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { fullName, email, phone, bio, specialization, batches, status } = req.body;
    const update = {};
    if (fullName !== undefined) update.full_name = fullName;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (bio !== undefined) update.bio = bio;
    if (specialization !== undefined) update.specialization = specialization;
    if (batches !== undefined) update.batches = batches;
    if (status !== undefined) update.status = status;
    if (req.body.password) {
      update.password = await bcrypt.hash(req.body.password, 12);
    }
    const lecturer = await lecturersDb.update(req.params.id, update);
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(sanitizeIdentity(lecturer));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/lecturers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await lecturersDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lecturers/forgot-password - public, rate limited ───
const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const lecturer = await lecturersDb.findByEmail(email?.toLowerCase());
    if (!lecturer) return res.json({ success: true });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await lecturersDb.update(lecturer.id, {
      reset_token:   token,
      reset_expires: expires.toISOString()
    });

    const host     = process.env.HOST || 'https://goallordcreativity.com';
    const resetUrl = `${host}/reset-password.html?token=${token}&role=lecturer`;

    await sendMail({
      to:      lecturer.email,
      subject: 'Reset your password - Goallord Academy',
      html:    passwordResetEmail({ fullName: lecturer.full_name, resetUrl, role: 'lecturer' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lecturers/reset-password - public, rate limited ────
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/reset-password', resetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    { const e = passwordError(newPassword); if (e) return res.status(400).json({ error: e }); }

    const lecturer = await lecturersDb.findByResetToken(token);
    if (!lecturer) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await lecturersDb.update(lecturer.id, {
      password:      hashed,
      reset_token:   null,
      reset_expires: null
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
