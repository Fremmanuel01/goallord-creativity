const express        = require('express');
const assignmentsDb  = require('../db/assignments');
const submissionsDb  = require('../db/submissions');
const studentsDb     = require('../db/students');
const notificationsDb = require('../db/notifications');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// ── ASSIGNMENTS ──────────────────────────────────────────────

// GET /api/assignments/student — student: published assignments + own submission status
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const assignments = await assignmentsDb.find({
      filter: { batch_id: student.batch_id, published: true },
      populate: 'lecturer'
    });

    const assignmentIds = assignments.map(a => a.id);
    let mySubmissions = [];
    if (assignmentIds.length > 0) {
      mySubmissions = await submissionsDb.find({
        inFilter: { assignment_id: assignmentIds },
        filter: { student_id: req.user.id }
      });
    }

    const subMap = {};
    mySubmissions.forEach(s => { subMap[s.assignment_id] = s; });

    const result = assignments.map(a => ({
      ...a,
      mySubmission: subMap[a.id] || null
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
    if (req.query.batch) filter.batch_id = req.query.batch;
    if (req.query.week)  filter.week     = Number(req.query.week);
    if (req.user.role === 'lecturer') filter.lecturer_id = req.user.id;
    const docs = await assignmentsDb.find({ filter, populate: 'lecturer' });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assignments/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await assignmentsDb.findById(req.params.id, { populate: 'lecturer' });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assignments
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { title, description, batch, week, deadline, maxScore, published, attachments } = req.body;
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const doc = await assignmentsDb.create({
      title,
      description: description || '',
      batch_id: batch,
      week: week || null,
      deadline: deadline || null,
      max_score: maxScore || null,
      published: published || false,
      attachments: attachments || [],
      lecturer_id: lecturerId
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/assignments/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const { title, description, batch, week, deadline, maxScore, published, attachments } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (batch !== undefined) update.batch_id = batch;
    if (week !== undefined) update.week = week;
    if (deadline !== undefined) update.deadline = deadline;
    if (maxScore !== undefined) update.max_score = maxScore;
    if (published !== undefined) update.published = published;
    if (attachments !== undefined) update.attachments = attachments;
    const doc = await assignmentsDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await assignmentsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUBMISSIONS ──────────────────────────────────────────────

// GET /api/assignments/:id/submissions (lecturer/admin sees all)
router.get('/:id/submissions', requireLecturer, async (req, res) => {
  try {
    const subs = await submissionsDb.find({
      filter: { assignment_id: req.params.id },
      populate: 'student',
      sort: '-submitted_at'
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assignments/:id/submissions (student submits)
router.post('/:id/submissions', requireStudentAuth, async (req, res) => {
  try {
    const assignment = await assignmentsDb.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const isLate = new Date() > new Date(assignment.deadline);

    // Check for existing submission
    const existingSubs = await submissionsDb.find({
      filter: { assignment_id: req.params.id, student_id: req.user.id }
    });
    if (existingSubs.length > 0) return res.status(409).json({ error: 'Already submitted' });

    const sub = await submissionsDb.create({
      assignment_id: req.params.id,
      student_id:    req.user.id,
      batch_id:      assignment.batch_id,
      content:       req.body.content || '',
      file_url:      req.body.fileUrl || '',
      is_late:       isLate
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
    const sub = await submissionsDb.update(req.params.subId, {
      score,
      feedback: feedback || null,
      scored_by: req.user.id,
      scored_at: new Date().toISOString()
    });
    if (!sub) return res.status(404).json({ error: 'Not found' });

    // Notify student that their assignment has been graded
    if (score != null) {
      const assignment = await assignmentsDb.findById(req.params.id);
      const msg = `Your submission for "${assignment?.title || 'an assignment'}" has been graded: ${score}${assignment?.max_score ? '/' + assignment.max_score : ''} points.${feedback ? ' Feedback: ' + feedback : ''}`;
      notificationsDb.create({
        recipient_id:   sub.student_id,
        recipient_type: 'Student',
        type:           'assignment_scored',
        title:          'Assignment Graded',
        message:        msg
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
  let sent = 0;

  const upcoming = await assignmentsDb.findUpcoming(24);

  for (const assignment of upcoming) {
    if (!assignment.batch_id) continue;

    const students = await studentsDb.findByBatch(assignment.batch_id);
    const submittedStudentIds = await submissionsDb.findDistinctStudents(assignment.id);
    const submittedSet = new Set(submittedStudentIds.map(String));

    for (const s of students) {
      if (submittedSet.has(String(s.id))) continue;

      // Only notify once per assignment per student
      const exists = await notificationsDb.exists({
        recipient_id: s.id,
        type:         'assignment_deadline',
        link:         String(assignment.id)
      });
      if (exists) continue;

      const hoursLeft = Math.round((new Date(assignment.deadline) - now) / (1000 * 60 * 60));
      await notificationsDb.create({
        recipient_id:   s.id,
        recipient_type: 'Student',
        type:           'assignment_deadline',
        title:          'Assignment Due Soon',
        message:        `"${assignment.title}" is due in about ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Submit before the deadline.`,
        link:           String(assignment.id)
      }).catch(() => {});
      sent++;
    }
  }

  console.log(`[Deadline Reminders] Sent: ${sent}`);
  return { deadlineReminders: sent };
}

module.exports = router;
module.exports.runDeadlineReminders = runDeadlineReminders;
