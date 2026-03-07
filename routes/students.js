const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const { requireAuth } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');

const router = express.Router();

// ── POST /api/students/login — public ──────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) return res.status(401).json({ error: 'Invalid credentials' });
    if (student.status === 'Suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });

    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: student._id, email: student.email, name: student.fullName, role: 'student', cohort: student.cohort, track: student.track },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      student: { id: student._id, fullName: student.fullName, email: student.email, cohort: student.cohort, track: student.track, status: student.status }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students/me — student auth ────────────────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.student.id).select('-password');
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students — admin: list all ────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { cohort, track, status, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (cohort) filter.cohort = cohort;
    if (track)  filter.track  = track;
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ fullName: re }, { email: re }, { phone: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Student.find(filter).select('-password').sort({ enrolledAt: -1 }).skip(skip).limit(Number(limit)),
      Student.countDocuments(filter)
    ]);
    // Return distinct cohorts for filter dropdowns
    const cohorts = await Student.distinct('cohort');
    res.json({ data: docs, total, page: Number(page), cohorts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students — admin: create ─────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fullName, email, password, phone, track, cohort, applicantRef, notes } = req.body;
    if (!fullName || !email || !password || !track || !cohort) {
      return res.status(400).json({ error: 'fullName, email, password, track and cohort are required' });
    }
    const existing = await Student.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'A student with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const student = await Student.create({ fullName, email, password: hash, phone, track, cohort, applicantRef, notes });
    res.status(201).json({ success: true, id: student._id, email: student.email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/students/:id — admin: single ──────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/:id — admin: update ────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { fullName, email, phone, track, cohort, status, notes } = req.body;
    const update = {};
    if (fullName !== undefined) update.fullName = fullName;
    if (email   !== undefined) update.email    = email.toLowerCase();
    if (phone   !== undefined) update.phone    = phone;
    if (track   !== undefined) update.track    = track;
    if (cohort  !== undefined) update.cohort   = cohort;
    if (status  !== undefined) update.status   = status;
    if (notes   !== undefined) update.notes    = notes;

    const student = await Student.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/students/:id/reset-password — admin ──────────────
router.post('/:id/reset-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await Student.findByIdAndUpdate(req.params.id, { password: hash });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/students/:id — admin ───────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
