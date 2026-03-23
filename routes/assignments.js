const express    = require('express');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Student    = require('../models/Student');
const Notification = require('../models/Notification');
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

    // Notify student that their assignment has been graded
    if (score != null) {
      const assignment = await Assignment.findById(req.params.id).select('title maxScore');
      const msg = `Your submission for "${assignment?.title || 'an assignment'}" has been graded: ${score}${assignment?.maxScore ? '/' + assignment.maxScore : ''} points.${feedback ? ' Feedback: ' + feedback : ''}`;
      Notification.create({
        recipient:     sub.student,
        recipientType: 'Student',
        type:          'assignment_scored',
        title:         'Assignment Graded',
        message:       msg
      }).catch(() => {});
    }

    res.json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Scheduled: remind students of assignments due within 24 hours that they haven't submitted
async function runDeadlineReminders() {
  const now     = new Date();
  const in24h   = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let sent = 0;

  const upcoming = await Assignment.find({
    published: true,
    deadline:  { $gte: now, $lte: in24h }
  });

  for (const assignment of upcoming) {
    if (!assignment.batch) continue;

    const students  = await Student.find({ batch: assignment.batch, status: 'Active' }).select('_id');
    const submitted = new Set((await Submission.find({ assignment: assignment._id }).distinct('student')).map(String));

    for (const s of students) {
      if (submitted.has(String(s._id))) continue;

      // Only notify once per assignment per student
      const exists = await Notification.exists({
        recipient: s._id,
        type:      'assignment_deadline',
        link:      String(assignment._id)
      });
      if (exists) continue;

      const hoursLeft = Math.round((new Date(assignment.deadline) - now) / (1000 * 60 * 60));
      await Notification.create({
        recipient:     s._id,
        recipientType: 'Student',
        type:          'assignment_deadline',
        title:         'Assignment Due Soon',
        message:       `"${assignment.title}" is due in about ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Submit before the deadline.`,
        link:          String(assignment._id)
      }).catch(() => {});
      sent++;
    }
  }

  console.log(`[Deadline Reminders] Sent: ${sent}`);
  return { deadlineReminders: sent };
}

module.exports = router;
module.exports.runDeadlineReminders = runDeadlineReminders;
