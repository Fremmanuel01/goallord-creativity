const express      = require('express');
const attendanceDb = require('../db/attendance');
const studentsDb   = require('../db/students');
const notificationsDb = require('../db/notifications');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');
const { requireLecturer } = require('../middleware/lecturerAuth');

const router = express.Router();

// ── GET /api/attendance/me - student: own history ─────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const records = await attendanceDb.getStudentAttendance(studentId);

    const history = records.map(r => ({
      id:        r.id,
      classDate: r.class_date,
      batch:     r.batch,
      week:      r.week,
      day:       r.day,
      topic:     r.topic,
      present:   true, // getStudentAttendance returns records where student appears
      notes:     r.notes
    }));

    // We need to check present/absent status from the junction table
    const allRecords = await attendanceDb.getStudentAttendance(studentId);
    const supabase = require('../lib/supabase');
    const { data: studentRecords } = await supabase
      .from('attendance_students')
      .select('attendance_id, status')
      .eq('student_id', studentId);
    const statusMap = {};
    (studentRecords || []).forEach(sr => { statusMap[sr.attendance_id] = sr.status; });

    const historyWithStatus = records.map(r => ({
      id:        r.id,
      classDate: r.class_date,
      batch:     r.batch,
      week:      r.week,
      day:       r.day,
      topic:     r.topic,
      present:   statusMap[r.id] === 'present',
      notes:     r.notes
    }));

    const totalClasses = historyWithStatus.length;
    const totalPresent = historyWithStatus.filter(h => h.present).length;
    res.json({ data: historyWithStatus, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/open - student: find open session for their batch ──
router.get('/open', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const student = await studentsDb.findById(studentId, { fields: 'id, batch_id' });
    if (!student || !student.batch_id) return res.json({ session: null });

    const session = await attendanceDb.findOpenSession(student.batch_id);
    if (!session) return res.json({ session: null });

    // Treat an expired window as closed; never leak the code to students.
    const expired = session.auto_close_at && new Date(session.auto_close_at).getTime() < Date.now();
    if (expired) return res.json({ session: null });
    const { check_in_code, ...safe } = session;
    res.json({ session: { ...safe, codeRequired: !!check_in_code } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance - admin/lecturer: list sessions ────────
router.get('/', requireLecturer, async (req, res) => {
  try {
    const { batch, week, month, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (batch) filter.batch_id = batch;
    if (week)  filter.week     = Number(week);

    const result = await attendanceDb.find({ filter, page: Number(page), limit: Number(limit) });
    res.json({ data: result.data, total: result.count, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/attendance - admin/lecturer: record session ──────
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { batchId, week, day, classDate, topic, presentStudentIds = [], notes } = req.body;
    if (!batchId || !week || !day || !classDate) {
      return res.status(400).json({ error: 'batchId, week, day, and classDate are required' });
    }

    // Get all active students in this batch
    const allStudents = await studentsDb.findByBatch(batchId);
    const allIds = allStudents.map(s => s.id);
    const presentSet = new Set(presentStudentIds.map(String));
    const absentIds = allIds.filter(id => !presentSet.has(id));

    const record = await attendanceDb.upsert({
      batch_id:         batchId,
      week:             Number(week),
      day,
      class_date:       new Date(classDate).toISOString(),
      topic:            topic || '',
      present_students: presentStudentIds,
      absent_students:  absentIds,
      taken_by:         req.user.id,
      notes:            notes || ''
    });

    res.json({
      success:      true,
      sessionId:    record.id,
      presentCount: presentStudentIds.length,
      absentCount:  absentIds.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/attendance/:id - lecturer edits an existing session ──
// Loads/edits marks by id (does NOT change week/day identity), so it never
// blind-overwrites: the lecturer dashboard preloads current marks first.
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const { topic, presentStudentIds } = req.body || {};
    const session = await attendanceDb.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    if (topic !== undefined) updates.topic = topic;
    if (Array.isArray(presentStudentIds)) {
      const allStudents = await studentsDb.findByBatch(session.batch_id);
      const presentSet = new Set(presentStudentIds.map(String));
      updates.present_students = presentStudentIds;
      updates.absent_students = allStudents.map(s => s.id).filter(id => !presentSet.has(String(id)));
    }
    await attendanceDb.update(req.params.id, updates);
    res.json({ success: true, sessionId: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/attendance/:id/open - open self-mark window ────
// Optional { code } (students must enter it) and { minutes } (auto-close after).
router.patch('/:id/open', requireLecturer, async (req, res) => {
  try {
    const { code, minutes } = req.body || {};
    const base = { is_open: true, session_opened_at: new Date().toISOString() };
    const codeVal = (code && String(code).trim()) ? String(code).trim() : null;
    const autoCloseAt = minutes && Number(minutes) > 0
      ? new Date(Date.now() + Number(minutes) * 60000).toISOString() : null;

    let doc;
    try {
      // Full update incl. integrity fields (needs migration 012).
      doc = await attendanceDb.update(req.params.id, { ...base, check_in_code: codeVal, auto_close_at: autoCloseAt });
    } catch (e) {
      // Columns not present yet → open without integrity fields (deploy-before-migrate safe).
      doc = await attendanceDb.update(req.params.id, base);
    }
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Notify the batch's students that check-in is open (fires push via the chokepoint).
    try {
      const students = await studentsDb.findByBatch(doc.batch_id);
      const notifs = (students || []).map(s => ({
        recipient_id: s.id, recipient_type: 'Student', type: 'attendance_open',
        title: 'Attendance is open',
        message: `Mark yourself present for Week ${doc.week} (${doc.day})${codeVal ? ' — ask your lecturer for the code' : ''}`,
        link: '/student-dashboard.html#attendance'
      }));
      if (notifs.length) await notificationsDb.insertMany(notifs);
    } catch (_) { /* notification/push is best-effort */ }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/attendance/:id/close - close self-mark window ──
router.patch('/:id/close', requireLecturer, async (req, res) => {
  try {
    const base = { is_open: false, session_closed_at: new Date().toISOString() };
    let doc;
    try {
      doc = await attendanceDb.update(req.params.id, { ...base, check_in_code: null, auto_close_at: null });
    } catch (e) {
      doc = await attendanceDb.update(req.params.id, base);
    }
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/attendance/:id/self-mark - student marks self ───
router.post('/:id/self-mark', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const session = await attendanceDb.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const expired = session.auto_close_at && new Date(session.auto_close_at).getTime() < Date.now();
    if (!session.is_open || expired) return res.status(403).json({ error: 'Attendance window is closed' });

    if (session.check_in_code) {
      const given = (req.body && req.body.code ? String(req.body.code) : '').trim();
      if (given !== session.check_in_code) return res.status(403).json({ error: 'Incorrect check-in code' });
    }

    await attendanceDb.markStudent(req.params.id, studentId, 'present');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/student/:studentId - admin ─────────────
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const records = await attendanceDb.getStudentAttendance(studentId);

    // Get status for this student from junction table
    const supabase = require('../lib/supabase');
    const { data: studentRecords } = await supabase
      .from('attendance_students')
      .select('attendance_id, status')
      .eq('student_id', studentId);
    const statusMap = {};
    (studentRecords || []).forEach(sr => { statusMap[sr.attendance_id] = sr.status; });

    const history = records.map(r => ({
      id:        r.id,
      classDate: r.class_date,
      batch:     r.batch,
      week:      r.week,
      day:       r.day,
      topic:     r.topic,
      present:   statusMap[r.id] === 'present',
      notes:     r.notes,
      takenBy:   r.taken_by
    }));

    const totalClasses = history.length;
    const totalPresent = history.filter(h => h.present).length;
    res.json({ data: history, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/:id - session detail ──────────────────
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await attendanceDb.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/attendance/:id - admin only ──────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await attendanceDb.remove(req.params.id);
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
