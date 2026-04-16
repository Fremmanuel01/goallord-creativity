const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const studentsDb = require('../db/students');
const notificationsDb = require('../db/notifications');
const { requireAuth }       = require('../middleware/auth');
const { requireStudent }    = require('../middleware/studentAuth');
const { requireLecturer }   = require('../middleware/lecturerAuth');
const { sendMail }          = require('../utils/mailer');
const { passwordResetEmail, graduationEmail } = require('../utils/emailTemplates');

const router = express.Router();

// ── POST /api/students/login — public ──────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const student = await studentsDb.findByEmail(email.toLowerCase());
    if (!student) return res.status(401).json({ error: 'Invalid credentials' });
    if (student.status === 'Suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });
    if (!student.application_fee_paid) {
      const applicantRef = student.applicant_ref || '';
      return res.status(403).json({ error: 'Application fee not paid. Please complete payment to access your dashboard.', paymentRequired: true, applicantId: applicantRef });
    }

    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: student.id, email: student.email, name: student.full_name, role: 'student', track: student.track },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      student: { id: student.id, fullName: student.full_name, email: student.email, track: student.track, status: student.status }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students/me — student auth ────────────────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.student.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    // Remove sensitive fields
    const { password, reset_token, reset_expires, ...safe } = student;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/me — student: update own profile ───────
router.patch('/me', requireStudent, async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const update = {};
    if (fullName) update.full_name = fullName.trim();
    if (phone !== undefined) update.phone = phone.trim();
    const student = await studentsDb.update(req.student.id, update);
    const { password, reset_token, reset_expires, ...safe } = student;
    res.json(safe);
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

    const student = await studentsDb.findById(req.student.id);
    const match = await bcrypt.compare(currentPassword, student.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await studentsDb.update(req.student.id, { password: hashed });
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
      const student = await studentsDb.update(req.student.id, { profile_picture: req.file.path });
      const { password, reset_token, reset_expires, ...safe } = student;
      res.json({ url: req.file.path, student: safe });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/forgot-password — public ─────────────────
const rateLimit = require('express-rate-limit');
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/forgot-password', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const student = await studentsDb.findByEmail(email?.toLowerCase());
    // Always respond OK to prevent email enumeration
    if (!student) return res.json({ success: true });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await studentsDb.update(student.id, {
      reset_token:   token,
      reset_expires: expires.toISOString()
    });

    const host     = process.env.HOST || 'https://goallordcreativity.com';
    const resetUrl = `${host}/reset-password.html?token=${token}&role=student`;

    await sendMail({
      to:      student.email,
      subject: 'Reset your password — Goallord Academy',
      html:    passwordResetEmail({ fullName: student.full_name, resetUrl, role: 'student' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/reset-password — public, rate limited ─────
const studentResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/reset-password', studentResetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const student = await studentsDb.findByResetToken(token);
    if (!student) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await studentsDb.update(student.id, {
      password:      hashed,
      reset_token:   null,
      reset_expires: null
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students — admin or lecturer: list (lecturer restricted to batch filter) ──
router.get('/', requireLecturer, async (req, res) => {
  try {
    const { track, status, batch, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (track)  filter.track  = track;
    if (status) filter.status = status;
    if (batch)  filter.batch_id  = batch;

    const { data: docs, count: total } = await studentsDb.find({
      filter,
      search: search || undefined,
      populate: 'batch',
      page: Number(page),
      limit: Number(limit)
    });
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students — admin: create ─────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fullName, email, password, phone, track, batch, applicantRef, notes } = req.body;
    if (!fullName || !email || !password || !track) {
      return res.status(400).json({ error: 'fullName, email, password and track are required' });
    }
    const existing = await studentsDb.findByEmail(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'A student with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const student = await studentsDb.create({
      full_name: fullName,
      email: email.toLowerCase(),
      password: hash,
      phone: phone || '',
      track,
      batch_id: batch || null,
      applicant_ref: applicantRef || null,
      notes: notes || ''
    });
    res.status(201).json({ success: true, id: student.id, email: student.email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/students/:id — admin: single ──────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.params.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Not found' });
    const { password, ...safe } = student;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/:id — admin: update ────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { fullName, email, phone, track, batch, status, notes } = req.body;
    const update = {};
    if (fullName !== undefined) update.full_name = fullName;
    if (email   !== undefined) update.email    = email.toLowerCase();
    if (phone   !== undefined) update.phone    = phone;
    if (track   !== undefined) update.track    = track;
    if (batch   !== undefined) update.batch_id = batch || null;
    if (status  !== undefined) update.status   = status;
    if (notes   !== undefined) update.notes    = notes;

    const student = await studentsDb.update(req.params.id, update);
    if (!student) return res.status(404).json({ error: 'Not found' });
    const { password, ...safe } = student;
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/students/:id/graduate — admin ────────────────────
router.post('/:id/graduate', requireAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.params.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Not found' });
    if (student.status === 'Graduated') return res.status(400).json({ error: 'Student is already graduated' });

    await studentsDb.update(req.params.id, { status: 'Graduated' });

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    sendMail({
      to:      student.email,
      subject: 'Congratulations on your graduation! — Goallord Creativity Academy',
      html:    graduationEmail({ fullName: student.full_name, batchName: student.batch?.name, track: student.track, loginUrl })
    }).catch(e => console.error('Graduation email failed:', e.message));

    notificationsDb.create({
      recipient_id:   student.id,
      recipient_type: 'Student',
      type:           'graduation',
      title:          'Congratulations! You have graduated',
      message:        `You have successfully completed the ${student.track} program at Goallord Creativity Academy. We are proud of your achievement!`,
      link:           loginUrl
    }).catch(e => console.error('Graduation notification failed:', e.message));

    res.json({ success: true, student: { id: student.id, status: 'Graduated' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/:id/reactivate — admin ──────────────────
router.post('/:id/reactivate', requireAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Not found' });
    if (student.status !== 'Suspended') return res.status(400).json({ error: 'Student is not suspended' });

    await studentsDb.update(req.params.id, { status: 'Active' });

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    const { reactivationEmail } = require('../utils/emailTemplates');
    sendMail({
      to:      student.email,
      subject: 'Account reactivated — Goallord Creativity Academy',
      html:    reactivationEmail({ fullName: student.full_name, loginUrl })
    }).catch(e => console.error('Reactivation email failed:', e.message));

    notificationsDb.create({
      recipient_id:   student.id,
      recipient_type: 'Student',
      type:           'account_reactivated',
      title:          'Account Reactivated',
      message:        'Your account has been manually reactivated by an admin. Welcome back!',
      link:           loginUrl
    }).catch(e => console.error('Reactivation notification failed:', e.message));

    res.json({ success: true, student: { id: student.id, status: 'Active' } });
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
    await studentsDb.update(req.params.id, { password: hash });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/students/:id — admin ───────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await studentsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
