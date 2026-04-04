const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const lecturersDb = require('../db/lecturers');
const { requireAuth }        = require('../middleware/auth');
const { sendMail }           = require('../utils/mailer');
const { passwordResetEmail } = require('../utils/emailTemplates');

const router = express.Router();

// POST /api/lecturers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const lecturer = await lecturersDb.findByEmail(email.toLowerCase());
    if (!lecturer) return res.status(401).json({ error: 'Invalid credentials' });
    if (lecturer.status === 'Inactive') return res.status(403).json({ error: 'Account inactive' });

    const match = await bcrypt.compare(password, lecturer.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: lecturer.id, role: 'lecturer', fullName: lecturer.full_name, email: lecturer.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, lecturer: { id: lecturer.id, fullName: lecturer.full_name, email: lecturer.email, specialization: lecturer.specialization, profilePicture: lecturer.profile_picture } });
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
    const { password, ...safe } = lecturer;
    res.json(safe);
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
    const { password: pw, ...safe } = lecturer;
    res.status(201).json(safe);
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
    const { password, ...safe } = lecturer;
    res.json(safe);
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

// ── POST /api/lecturers/forgot-password — public, rate limited ───
const rateLimit = require('express-rate-limit');
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
      subject: 'Reset your password — Goallord Academy',
      html:    passwordResetEmail({ fullName: lecturer.full_name, resetUrl, role: 'lecturer' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lecturers/reset-password — public, rate limited ────
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/reset-password', resetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

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
