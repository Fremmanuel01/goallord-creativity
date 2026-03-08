const express    = require('express');
const Attendance = require('../models/Attendance');
const Student    = require('../models/Student');
const Batch      = require('../models/Batch');
const { requireAuth } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');
const { requireLecturer } = require('../middleware/lecturerAuth');

const router = express.Router();

// ── GET /api/attendance/me — student: own history ─────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const records = await Attendance.find({
      $or: [{ presentStudents: studentId }, { absentStudents: studentId }]
    }).sort({ classDate: -1 }).populate('batch', 'name number');

    const history = records.map(r => ({
      _id:       r._id,
      classDate: r.classDate,
      batch:     r.batch,
      week:      r.week,
      day:       r.day,
      topic:     r.topic,
      present:   r.presentStudents.some(id => id.toString() === studentId),
      notes:     r.notes
    }));

    const totalClasses = history.length;
    const totalPresent = history.filter(h => h.present).length;
    res.json({ data: history, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/open — student: find open session for their batch ──
router.get('/open', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const student = await Student.findById(studentId).select('batch');
    if (!student || !student.batch) return res.json({ session: null });

    const session = await Attendance.findOne({ batch: student.batch, isOpen: true })
      .select('_id week day topic classDate');
    res.json({ session: session || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance — admin/lecturer: list sessions ────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { batch, week, month, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (batch) filter.batch = batch;
    if (week)  filter.week  = Number(week);
    if (month) {
      const start = new Date(month + '-01');
      const end   = new Date(start);
      end.setMonth(end.getMonth() + 1);
      filter.classDate = { $gte: start, $lt: end };
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Attendance.find(filter)
        .sort({ classDate: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('batch', 'name number')
        .populate('takenBy', 'fullName')
        .populate('presentStudents', 'fullName email')
        .populate('absentStudents', 'fullName email'),
      Attendance.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/attendance — admin/lecturer: record session ──────
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { batchId, week, day, classDate, topic, presentStudentIds = [], notes } = req.body;
    if (!batchId || !week || !day || !classDate) {
      return res.status(400).json({ error: 'batchId, week, day, and classDate are required' });
    }

    // Get all active students in this batch
    const allStudents = await Student.find({ batch: batchId, status: 'Active' }).select('_id');
    const allIds = allStudents.map(s => s._id.toString());
    const presentSet = new Set(presentStudentIds.map(String));
    const absentIds = allIds.filter(id => !presentSet.has(id));

    const record = await Attendance.findOneAndUpdate(
      { batch: batchId, week: Number(week), day },
      {
        batch:           batchId,
        week:            Number(week),
        day,
        classDate:       new Date(classDate),
        topic:           topic || '',
        presentStudents: presentStudentIds,
        absentStudents:  absentIds,
        takenBy:         req.user.id,
        notes:           notes || ''
      },
      { new: true, upsert: true }
    );

    res.json({
      success:      true,
      sessionId:    record._id,
      presentCount: presentStudentIds.length,
      absentCount:  absentIds.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/attendance/:id/open — open self-mark window ────
router.patch('/:id/open', requireLecturer, async (req, res) => {
  try {
    const doc = await Attendance.findByIdAndUpdate(
      req.params.id,
      { isOpen: true, sessionOpenedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/attendance/:id/close — close self-mark window ──
router.patch('/:id/close', requireLecturer, async (req, res) => {
  try {
    const doc = await Attendance.findByIdAndUpdate(
      req.params.id,
      { isOpen: false, sessionClosedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/attendance/:id/self-mark — student marks self ───
router.post('/:id/self-mark', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const session = await Attendance.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!session.isOpen) return res.status(403).json({ error: 'Attendance window is closed' });

    // Add to present, remove from absent if already there
    if (!session.presentStudents.some(id => id.toString() === studentId)) {
      session.presentStudents.push(studentId);
    }
    session.absentStudents = session.absentStudents.filter(id => id.toString() !== studentId);
    await session.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/student/:studentId — admin ─────────────
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const records = await Attendance.find({
      $or: [{ presentStudents: studentId }, { absentStudents: studentId }]
    }).sort({ classDate: -1 }).populate('batch', 'name number').populate('takenBy', 'fullName');

    const history = records.map(r => ({
      _id:       r._id,
      classDate: r.classDate,
      batch:     r.batch,
      week:      r.week,
      day:       r.day,
      topic:     r.topic,
      present:   r.presentStudents.some(id => id.toString() === studentId),
      notes:     r.notes,
      takenBy:   r.takenBy
    }));

    const totalClasses = history.length;
    const totalPresent = history.filter(h => h.present).length;
    res.json({ data: history, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/:id — session detail ──────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Attendance.findById(req.params.id)
      .populate('batch', 'name number track')
      .populate('takenBy', 'fullName email')
      .populate('presentStudents', 'fullName email track')
      .populate('absentStudents', 'fullName email track');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
