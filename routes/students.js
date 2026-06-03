const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const studentsDb = require('../db/students');
const batchesDb = require('../db/batches');
const assignmentsDb = require('../db/assignments');
const submissionsDb = require('../db/submissions');
const applicantsDb = require('../db/applicants');
const supabase = require('../lib/supabase');
const notificationsDb = require('../db/notifications');
const { requireAuth }       = require('../middleware/auth');
const { requireStudent }    = require('../middleware/studentAuth');
const { requireLecturer }   = require('../middleware/lecturerAuth');
const { sendMail }          = require('../utils/mailer');
const { passwordResetEmail, graduationEmail } = require('../utils/emailTemplates');
const { createTwoFactorHandlers, verifyLoginCode } = require('../utils/twoFactor');
const { sanitizeIdentity } = require('../lib/utils');
const { passwordError } = require('../utils/passwordPolicy');
const { setAuthCookie, clearAuthCookie } = require('../lib/authCookie');

const router = express.Router();

const twoFactor = createTwoFactorHandlers({
  db: studentsDb,
  getIdentity: (req) => ({ id: req.student.id, email: req.student.email })
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// ── POST /api/students/login - public ──────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
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

    if (student.totp_enabled) {
      if (!totpCode) return res.json({ twoFactorRequired: true });
      const codeOk = await verifyLoginCode(studentsDb, student, totpCode);
      if (!codeOk) return res.status(401).json({ error: 'Invalid authentication code' });
    }

    const token = jwt.sign(
      { id: student.id, email: student.email, name: student.full_name, role: 'student', track: student.track },
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    setAuthCookie(res, 'gl_student_token', token);

    res.json({
      token,
      student: { id: student.id, fullName: student.full_name, email: student.email, track: student.track, status: student.status }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/logout - clear the auth cookie ──────────
router.post('/logout', (req, res) => {
  clearAuthCookie(res, 'gl_student_token');
  res.json({ success: true });
});

// ── Two-factor authentication (students) ───────────────────────
router.get('/2fa/status',   requireStudent, twoFactor.status);
router.post('/2fa/setup',   requireStudent, twoFactor.setup);
router.post('/2fa/enable',  requireStudent, twoFactor.enable);
router.post('/2fa/disable', requireStudent, twoFactor.disable);

// ── GET /api/students/me - student auth ────────────────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.student.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(sanitizeIdentity(student));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students/me/progress - student dashboard hero ─────
// Behaviour-based progress, computed live from existing data:
//   - weeks: today's position inside the batch's start_date..end_date window
//   - assignments: submitted vs published for this batch
//   - attendance: present count vs total sessions taken for this batch
//   - overall: weighted blend (time 30%, assignments 35%, attendance 35%)
//     where components with no data are excluded
//   - nextDeadline: soonest published, unsubmitted assignment
router.get('/me/progress', requireStudent, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.student.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const batchId = student.batch_id;
    const now = Date.now();

    const [batch, allAssignments, mySubs, attRowsRes] = await Promise.all([
      batchId ? batchesDb.findById(batchId).catch(() => null) : Promise.resolve(null),
      batchId
        ? assignmentsDb.find({ filter: { batch_id: batchId, published: true } }).catch(() => [])
        : Promise.resolve([]),
      submissionsDb.find({ filter: { student_id: student.id } }).catch(() => []),
      batchId
        ? supabase.from('attendance').select('id').eq('batch_id', batchId)
        : Promise.resolve({ data: [] })
    ]);

    // ── Weeks ──
    let weeks = null;
    if (batch && batch.start_date) {
      const startMs = new Date(batch.start_date).getTime();
      const endMs   = batch.end_date ? new Date(batch.end_date).getTime() : null;
      const DAY = 86400000;
      const defaultTotalDays = 12 * 7;
      const totalDays = endMs ? Math.max(1, Math.round((endMs - startMs) / DAY)) : defaultTotalDays;
      const totalWeeks = Math.max(1, Math.round(totalDays / 7));
      const elapsedDays = Math.max(0, Math.floor((now - startMs) / DAY));
      const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(elapsedDays / 7) + 1));
      const pct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
      weeks = {
        current: currentWeek,
        total: totalWeeks,
        remaining: Math.max(0, totalWeeks - currentWeek),
        pct,
        startDate: batch.start_date,
        endDate: batch.end_date || null
      };
    }

    // ── Assignments ──
    const submittedIds = new Set((mySubs || []).map(s => String(s.assignment_id)));
    const submittedCount = (allAssignments || []).filter(a => submittedIds.has(String(a.id))).length;
    const totalAssignments = (allAssignments || []).length;
    const assignmentsPct = totalAssignments
      ? Math.round((submittedCount / totalAssignments) * 100)
      : 0;

    // ── Attendance ──
    const attIds = ((attRowsRes && attRowsRes.data) || []).map(r => r.id);
    const totalSessions = attIds.length;
    let presentCount = 0;
    if (totalSessions > 0) {
      const { data: studAtt } = await supabase
        .from('attendance_students')
        .select('attendance_id, status')
        .eq('student_id', student.id)
        .eq('status', 'present')
        .in('attendance_id', attIds);
      presentCount = (studAtt || []).length;
    }
    const attendancePct = totalSessions
      ? Math.round((presentCount / totalSessions) * 100)
      : 0;

    // ── Overall (weighted; drop components without data) ──
    const parts = [];
    if (weeks)                     parts.push({ w: 30, v: weeks.pct });
    if (totalAssignments > 0)      parts.push({ w: 35, v: assignmentsPct });
    if (totalSessions > 0)         parts.push({ w: 35, v: attendancePct });
    const totalWeight = parts.reduce((a, p) => a + p.w, 0);
    const overall = totalWeight
      ? Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / totalWeight)
      : 0;

    // ── Next deadline (soonest unsubmitted) ──
    const upcoming = (allAssignments || [])
      .filter(a => a.deadline && new Date(a.deadline).getTime() > now && !submittedIds.has(String(a.id)))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const nextDeadline = upcoming[0]
      ? { id: upcoming[0].id, title: upcoming[0].title, deadline: upcoming[0].deadline, week: upcoming[0].week || null }
      : null;

    res.json({
      weeks,
      assignments: { submitted: submittedCount, total: totalAssignments, pct: assignmentsPct },
      attendance:  { present: presentCount, total: totalSessions, pct: attendancePct },
      overall,
      nextDeadline
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/me - student: update own profile ───────
router.patch('/me', requireStudent, async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const update = {};
    if (fullName) update.full_name = fullName.trim();
    if (phone !== undefined) update.phone = phone.trim();
    const student = await studentsDb.update(req.student.id, update);
    res.json(sanitizeIdentity(student));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/students/me/password - student: change own password
router.patch('/me/password', requireStudent, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    { const e = passwordError(newPassword); if (e) return res.status(400).json({ error: e }); }

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

// ── PATCH /api/students/me/photo - student: upload profile picture ──
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
      res.json({ url: req.file.path, student: sanitizeIdentity(student) });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/forgot-password - public ─────────────────
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
      subject: 'Reset your password - Goallord Academy',
      html:    passwordResetEmail({ fullName: student.full_name, resetUrl, role: 'student' })
    }).catch(e => console.error('Reset email error:', e.message));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students/reset-password - public, rate limited ─────
const studentResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many reset attempts. Try again later.' } });
router.post('/reset-password', studentResetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });
    { const e = passwordError(newPassword); if (e) return res.status(400).json({ error: e }); }

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

// ── GET /api/students - admin or lecturer: list (lecturer restricted to batch filter) ──
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
    res.json({ data: (docs || []).map(sanitizeIdentity), total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/students - admin: create ─────────────────────────
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

// ── POST /api/students/sync-names-from-applicants - admin ──────
// Backfill student full_name + profile_picture from the linked applicant
// row. Matches by applicant_ref (UUID) first, then by email
// (case-insensitive). Each field is only overwritten when the student's
// value is empty AND the applicant has a non-empty value, so this is
// always safe to re-run. Pass ?debug=1 to also get a per-row report.
router.post('/sync-names-from-applicants', requireAuth, async (req, res) => {
  try {
    const debug = req.query.debug === '1' || req.body.debug === true;

    // Scan ALL students - backfilling a photo even when the name is set,
    // and vice versa.
    const { data: rows, error } = await supabase
      .from('students')
      .select('id, email, full_name, profile_picture, applicant_ref');
    if (error) throw error;

    let namesUpdated  = 0;
    let photosUpdated = 0;
    let alreadyComplete = 0;
    const missing = [];
    const partial = [];
    const report  = []; // per-row diagnostic when ?debug=1

    for (const s of rows || []) {
      const studentName  = (s.full_name || '').trim();
      const studentPhoto = (s.profile_picture || '').trim();
      const row = {
        id: s.id,
        email: s.email || '',
        hadName: !!studentName,
        hadPhoto: !!studentPhoto,
        hadApplicantRef: !!s.applicant_ref
      };

      if (studentName && studentPhoto) {
        alreadyComplete++;
        if (debug) { row.outcome = 'alreadyComplete'; report.push(row); }
        continue;
      }

      let applicant = null;
      let matchedBy = null;
      if (s.applicant_ref) {
        try {
          applicant = await applicantsDb.findById(s.applicant_ref);
          if (applicant) matchedBy = 'ref';
        } catch (_) {}
      }
      if (!applicant && s.email) {
        try {
          applicant = await applicantsDb.findByEmail(String(s.email).toLowerCase().trim());
          if (applicant) matchedBy = 'email';
        } catch (_) {}
      }
      row.matchedBy = matchedBy;

      if (!applicant) {
        missing.push(s.email || s.id);
        if (debug) { row.outcome = 'noApplicantFound'; report.push(row); }
        continue;
      }

      const applicantName  = (applicant.full_name    || '').trim();
      const applicantPhoto = (applicant.profile_photo || '').trim();
      row.applicantHasName  = !!applicantName;
      row.applicantHasPhoto = !!applicantPhoto;

      const update = {};
      if (!studentName  && applicantName)  update.full_name       = applicantName;
      if (!studentPhoto && applicantPhoto) update.profile_picture = applicantPhoto;
      if (!s.applicant_ref && applicant.id) update.applicant_ref = applicant.id;

      if (Object.keys(update).length === 0) {
        partial.push(s.email || s.id);
        if (debug) { row.outcome = 'applicantBlank'; report.push(row); }
        continue;
      }

      await studentsDb.update(s.id, update);
      if (update.full_name)       namesUpdated++;
      if (update.profile_picture) photosUpdated++;
      if (debug) {
        row.outcome = 'updated';
        row.applied = Object.keys(update);
        report.push(row);
      }
    }

    const summary = {
      scanned: (rows || []).length,
      namesUpdated,
      photosUpdated,
      alreadyComplete,
      missing,
      partial
    };
    if (debug) summary.report = report;
    if (namesUpdated || photosUpdated || debug) {
      console.log('[sync-from-applicants]', summary);
    }
    res.json(summary);
  } catch (err) {
    console.error('sync-names-from-applicants error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students/directory - PUBLIC: showcase current students / alumni ──
// No auth. Powers the public "Our Students" and "Alumni" pages. Returns ONLY
// safe, display-only fields - never email, phone, password, notes, payment
// data, applicant_ref or reset tokens. Must stay registered BEFORE `/:id`
// so the literal path is not captured by the id param route.
const directoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
router.get('/directory', directoryLimiter, async (req, res) => {
  try {
    const type   = req.query.type === 'alumni' ? 'alumni' : 'current';
    const status = type === 'alumni' ? 'Graduated' : 'Active';

    const { data: rows } = await studentsDb.find({
      filter: { status },
      populate: 'batch',
      sort: '-enrolled_at',
      limit: 1000
    });

    // Enrich with the location + goal the student gave on their application,
    // in a single batched query. Best-effort: missing applicants are skipped.
    const refs = [...new Set((rows || []).map(s => s.applicant_ref).filter(Boolean))];
    const applicantsById = {};
    if (refs.length) {
      const { data: apps } = await supabase
        .from('applicants')
        .select('id, location, goal')
        .in('id', refs);
      for (const a of (apps || [])) applicantsById[a.id] = a;
    }

    const students = (rows || []).map(s => {
      const app      = s.applicant_ref ? applicantsById[s.applicant_ref] : null;
      const batch    = s.batch || null;
      const fullName = (s.full_name || '').trim();
      const when     = s.enrolled_at ? new Date(s.enrolled_at) : null;
      const bioRaw   = ((app && app.goal) || '').trim();
      return {
        name:        fullName,
        firstName:   fullName.split(/\s+/)[0] || fullName,
        track:       s.track || '',
        batchName:   batch ? (batch.name || ('Batch ' + batch.number)) : '',
        batchNumber: batch ? (batch.number ?? null) : null,
        photo:       (s.profile_picture || '').trim(),
        location:    ((app && app.location) || '').trim(),
        bio:         bioRaw.length > 160 ? bioRaw.slice(0, 157).trimEnd() + '…' : bioRaw,
        year:        when && !isNaN(when) ? when.getUTCFullYear() : null,
        since:       s.enrolled_at || null
      };
    });

    // Current cohort: newest batch first, then alphabetical. Alumni keep the
    // most-recently-enrolled-first order from the query.
    if (type === 'current') {
      students.sort((a, b) =>
        (b.batchNumber || 0) - (a.batchNumber || 0) || a.name.localeCompare(b.name));
    }

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ type, total: students.length, students });
  } catch (err) {
    console.error('students/directory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/students/:id - admin: single ──────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.params.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Not found' });
    res.json(sanitizeIdentity(student));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/students/:id - admin: update ────────────────────
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
    res.json(sanitizeIdentity(student));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/students/:id/graduate - admin ────────────────────
router.post('/:id/graduate', requireAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.params.id, { populate: 'batch' });
    if (!student) return res.status(404).json({ error: 'Not found' });
    if (student.status === 'Graduated') return res.status(400).json({ error: 'Student is already graduated' });

    await studentsDb.update(req.params.id, { status: 'Graduated' });

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    sendMail({
      to:      student.email,
      subject: 'Congratulations on your graduation! - Goallord Creativity Academy',
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

// ── POST /api/students/:id/reactivate - admin ──────────────────
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
      subject: 'Account reactivated - Goallord Creativity Academy',
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

// ── POST /api/students/:id/reset-password - admin ──────────────
router.post('/:id/reset-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    { const e = passwordError(newPassword); if (e) return res.status(400).json({ error: e }); }
    const hash = await bcrypt.hash(newPassword, 10);
    await studentsDb.update(req.params.id, { password: hash });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/students/:id - admin ───────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await studentsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
