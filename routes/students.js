const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const Student  = require('../models/Student');
const { requireAuth }       = require('../middleware/auth');
const { requireStudent }    = require('../middleware/studentAuth');
const { requireLecturer }   = require('../middleware/lecturerAuth');
const { sendMail }          = require('../utils/mailer');
const { passwordResetEmail, graduationEmail } = require('../utils/emailTemplates');
const Notification = require('../models/Notification');

const router = express.Router();

// ── POST /api/students/login — public ──────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) return res.status(401).json({ error: 'Invalid credentials' });
    if (student.status === 'Suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    if (!student.applicationFeePaid) return res.status(403).json({ error: 'Application fee not paid. Please complete payment to access your dashboard.', paymentRequired: true });

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
    const student = await Student.findById(req.student.id).select('-password -resetToken -resetExpires');
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/me — student: update own profile ───────
router.patch('/me', requireStudent, async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const update = {};
    if (fullName) update.fullName = fullName.trim();
    if (phone !== undefined) update.phone = phone.trim();
    const student = await Student.findByIdAndUpdate(req.student.id, update, { new: true }).select('-password -resetToken -resetExpires');
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/students/me/password — student: change own password
router.patch('/me/password', requireStudent, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const student = await Student.findById(req.student.id);
    const match = await bcrypt.compare(currentPassword, student.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    student.password = await bcrypt.hash(newPassword, 12);
    await student.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/students/me/photo — student: upload profile picture ──
router.patch('/me/photo', requireStudent, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    const multer = require('multer');
    const { CloudinaryStorage } = require('multer-storage-cloudinary');
    const storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'goallord/students',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }]
      }
    });
    const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } }).single('photo');
    upload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const student = await Student.findByIdAndUpdate(
        req.student.id,
        { profilePicture: req.file.path },
        { new: true }
      ).select('-password -resetToken -resetExpires');
      res.json({ url: req.file.path, student });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/forgot-password — public ─────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const student = await Student.findOne({ email: email?.toLowerCase() });
    // Always respond OK to prevent email enumeration
    if (!student) return res.json({ success: true });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    student.resetToken   = token;
    student.resetExpires = expires;
    await student.save();

    const host     = process.env.HOST || 'https://goallordcreativity.com';
    const resetUrl = `${host}/reset-password.html?token=${token}&role=student`;

    await sendMail({
      to:      student.email,
      subject: 'Reset your password — Goallord Academy',
      html:    passwordResetEmail({ fullName: student.fullName, resetUrl, role: 'student' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/reset-password — public ──────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const student = await Student.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
    if (!student) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    student.password     = await bcrypt.hash(newPassword, 12);
    student.resetToken   = undefined;
    student.resetExpires = undefined;
    await student.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students — admin or lecturer: list (lecturer restricted to batch filter) ──
router.get('/', requireLecturer, async (req, res) => {
  try {
    const { cohort, track, status, batch, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (cohort) filter.cohort = cohort;
    if (track)  filter.track  = track;
    if (status) filter.status = status;
    if (batch)  filter.batch  = batch;
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

// ── POST /api/students/:id/graduate — admin ────────────────────
router.post('/:id/graduate', requireAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Not found' });
    if (student.status === 'Graduated') return res.status(400).json({ error: 'Student is already graduated' });

    student.status = 'Graduated';
    await student.save();

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    sendMail({
      to:      student.email,
      subject: 'Congratulations on your graduation! — Goallord Creativity Academy',
      html:    graduationEmail({ fullName: student.fullName, cohort: student.cohort, track: student.track, loginUrl })
    }).catch(e => console.error('Graduation email failed:', e.message));

    Notification.create({
      recipient:     student._id,
      recipientType: 'Student',
      type:          'graduation',
      title:         'Congratulations! You have graduated',
      message:       `You have successfully completed the ${student.track} program at Goallord Creativity Academy. We are proud of your achievement!`,
      link:          loginUrl
    }).catch(e => console.error('Graduation notification failed:', e.message));

    res.json({ success: true, student: { id: student._id, status: student.status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
