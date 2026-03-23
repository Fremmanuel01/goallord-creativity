const express         = require('express');
const CurriculumEntry = require('../models/CurriculumEntry');
const Student         = require('../models/Student');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// GET /api/curriculum/student — student: curriculum for their batch
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await Student.findById(req.user.id).select('batch');
    if (!student || !student.batch) return res.json([]);
    const docs = await CurriculumEntry.find({ batch: student.batch })
      .sort({ week: 1, day: 1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/curriculum?batch=&week=
router.get('/', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.week)  filter.week  = Number(req.query.week);
    const docs = await CurriculumEntry.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ week: 1, day: 1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/curriculum/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await CurriculumEntry.findById(req.params.id).populate('createdBy', 'fullName');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/curriculum
router.post('/', requireLecturer, async (req, res) => {
  try {
    const doc = await CurriculumEntry.create({ ...req.body, createdBy: req.user.id, updatedAt: new Date() });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/curriculum/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await CurriculumEntry.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/curriculum/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await CurriculumEntry.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
