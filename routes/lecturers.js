const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const Lecturer  = require('../models/Lecturer');
const { requireAuth }        = require('../middleware/auth');
const { sendMail }           = require('../utils/mailer');
const { passwordResetEmail } = require('../utils/emailTemplates');

const router = express.Router();

// POST /api/lecturers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const lecturer = await Lecturer.findOne({ email: email.toLowerCase() });
    if (!lecturer) return res.status(401).json({ error: 'Invalid credentials' });
    if (lecturer.status === 'Inactive') return res.status(403).json({ error: 'Account inactive' });

    const match = await bcrypt.compare(password, lecturer.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: lecturer._id, role: 'lecturer', fullName: lecturer.fullName, email: lecturer.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, lecturer: { _id: lecturer._id, fullName: lecturer.fullName, email: lecturer.email, specialization: lecturer.specialization, profilePicture: lecturer.profilePicture } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers
router.get('/', requireAuth, async (req, res) => {
  try {
    const lecturers = await Lecturer.find().select('-password').populate('batches', 'name number').sort({ createdAt: -1 });
    res.json(lecturers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const lecturer = await Lecturer.findById(req.params.id).select('-password').populate('batches', 'name number');
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(lecturer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lecturers
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fullName, email, password, phone, bio, specialization, batches, status } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    const lecturer = await Lecturer.create({
      fullName, email, password: hashed, phone, bio, specialization,
      batches: batches || [], status: status || 'Active',
      createdBy: req.user.id
    });
    res.status(201).json({ ...lecturer.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/lecturers/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { fullName, email, phone, bio, specialization, batches, status } = req.body;
    const update = {};
    if (fullName !== undefined) update.fullName = fullName;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (bio !== undefined) update.bio = bio;
    if (specialization !== undefined) update.specialization = specialization;
    if (batches !== undefined) update.batches = batches;
    if (status !== undefined) update.status = status;
    if (req.body.password) {
      update.password = await bcrypt.hash(req.body.password, 12);
    }
    const lecturer = await Lecturer.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(lecturer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/lecturers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Lecturer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lecturers/forgot-password — public ────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const lecturer = await Lecturer.findOne({ email: email?.toLowerCase() });
    if (!lecturer) return res.json({ success: true });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    lecturer.resetToken   = token;
    lecturer.resetExpires = expires;
    await lecturer.save();

    const host     = process.env.HOST || 'https://goallordcreativity.com';
    const resetUrl = `${host}/reset-password.html?token=${token}&role=lecturer`;

    await sendMail({
      to:      lecturer.email,
      subject: 'Reset your password — Goallord Academy',
      html:    passwordResetEmail({ fullName: lecturer.fullName, resetUrl, role: 'lecturer' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lecturers/reset-password — public ─────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const lecturer = await Lecturer.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
    if (!lecturer) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    lecturer.password     = await bcrypt.hash(newPassword, 12);
    lecturer.resetToken   = undefined;
    lecturer.resetExpires = undefined;
    await lecturer.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
