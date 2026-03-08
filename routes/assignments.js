const express    = require('express');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Student    = require('../models/Student');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// ── ASSIGNMENTS ──────────────────────────────────────────────

// GET /api/assignments/student — student: published assignments + own submission status
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select('batch');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const assignments = await Assignment.find({ batch: student.batch, published: true })
      .populate('lecturer', 'fullName').sort({ week: 1, deadline: 1 });

    const assignmentIds = assignments.map(a => a._id);
    const mySubmissions = await Submission.find({ assignment: { $in: assignmentIds }, student: req.user.id })
      .select('assignment content score feedback scoredAt isLate submittedAt');

    const subMap = {};
    mySubmissions.forEach(s => { subMap[s.assignment.toString()] = s; });

    const result = assignments.map(a => ({
      ...a.toObject(),
      mySubmission: subMap[a._id.toString()] || null
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assignments?batch=&week=
router.get('/', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.week)  filter.week  = Number(req.query.week);
    if (req.user.role === 'lecturer') filter.lecturer = req.user.id;
    const docs = await Assignment.find(filter).populate('lecturer', 'fullName').sort({ week: 1, deadline: 1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assignments/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await Assignment.findById(req.params.id).populate('lecturer', 'fullName');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assignments
router.post('/', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const doc = await Assignment.create({ ...req.body, lecturer: lecturerId });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/assignments/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUBMISSIONS ──────────────────────────────────────────────

// GET /api/assignments/:id/submissions (lecturer/admin sees all)
router.get('/:id/submissions', requireLecturer, async (req, res) => {
  try {
    const subs = await Submission.find({ assignment: req.params.id })
      .populate('student', 'fullName email profilePicture')
      .sort({ submittedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assignments/:id/submissions (student submits)
router.post('/:id/submissions', requireStudentAuth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isLate = new Date() > assignment.deadline;
    const existing = await Submission.findOne({ assignment: req.params.id, student: req.user.id });
    if (existing) return res.status(409).json({ error: 'Already submitted' });

    const sub = await Submission.create({
      assignment:  req.params.id,
      student:     req.user.id,
      batch:       assignment.batch,
      content:     req.body.content || '',
      fileUrl:     req.body.fileUrl || '',
      isLate
    });
    res.status(201).json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/assignments/:id/submissions/:subId (score + feedback)
router.patch('/:id/submissions/:subId', requireLecturer, async (req, res) => {
  try {
    const { score, feedback } = req.body;
    const sub = await Submission.findByIdAndUpdate(
      req.params.subId,
      { score, feedback, scoredBy: req.user.id, scoredAt: new Date() },
      { new: true }
    );
    if (!sub) return res.status(404).json({ error: 'Not found' });
    res.json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
