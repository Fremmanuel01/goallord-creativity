const express = require('express');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { requireAuth } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');

const router = express.Router();

// ── GET /api/attendance/me — student: own history ──────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const studentId = req.student.id;
    const records = await Attendance.find({
      $or: [{ presentStudents: studentId }, { absentStudents: studentId }]
    }).sort({ classDate: -1 }).select('classDate cohort track presentStudents notes');

    const history = records.map(r => ({
      _id: r._id,
      classDate: r.classDate,
      cohort: r.cohort,
      track: r.track,
      present: r.presentStudents.some(id => id.toString() === studentId),
      notes: r.notes
    }));

    const totalClasses = history.length;
    const totalPresent = history.filter(h => h.present).length;

    res.json({ data: history, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance — admin: list sessions ─────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { cohort, month, track, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (cohort) filter.cohort = cohort;
    if (track)  filter.track  = track;
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
        .populate('presentStudents', 'fullName email')
        .populate('absentStudents', 'fullName email'),
      Attendance.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/attendance — admin: record session ───────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { cohort, classDate, track, presentStudentIds = [], notes } = req.body;
    if (!cohort || !classDate) return res.status(400).json({ error: 'cohort and classDate are required' });

    // Get all active students in this cohort
    const allStudents = await Student.find({ cohort, status: 'Active' }).select('_id');
    const allIds = allStudents.map(s => s._id.toString());
    const presentSet = new Set(presentStudentIds.map(String));
    const absentIds = allIds.filter(id => !presentSet.has(id));

    const sessionDate = new Date(classDate);

    const record = await Attendance.findOneAndUpdate(
      { cohort, classDate: sessionDate },
      {
        cohort,
        classDate: sessionDate,
        track: track || '',
        presentStudents: presentStudentIds,
        absentStudents:  absentIds,
        takenBy: req.user.name || 'Admin',
        notes: notes || ''
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      sessionId: record._id,
      presentCount: presentStudentIds.length,
      absentCount: absentIds.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/attendance/student/:studentId — admin ─────────────
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const { studentId } = req.params;
    const records = await Attendance.find({
      $or: [{ presentStudents: studentId }, { absentStudents: studentId }]
    }).sort({ classDate: -1 }).select('classDate cohort track presentStudents notes takenBy');

    const history = records.map(r => ({
      _id: r._id,
      classDate: r.classDate,
      cohort: r.cohort,
      track: r.track,
      present: r.presentStudents.some(id => id.toString() === studentId),
      notes: r.notes,
      takenBy: r.takenBy
    }));

    const totalClasses = history.length;
    const totalPresent = history.filter(h => h.present).length;

    res.json({ data: history, totalClasses, totalPresent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/attendance/:id — admin: session detail ────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Attendance.findById(req.params.id)
      .populate('presentStudents', 'fullName email track')
      .populate('absentStudents', 'fullName email track');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
