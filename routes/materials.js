const express  = require('express');
const Material = require('../models/Material');
const { requireAuth } = require('../middleware/auth');
const { requireLecturer } = require('../middleware/lecturerAuth');

const router = express.Router();

// GET /api/materials?batch=&week=&published=
router.get('/', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch)     filter.batch = req.query.batch;
    if (req.query.week)      filter.week  = Number(req.query.week);
    if (req.query.published) filter.published = req.query.published === 'true';
    // Lecturers see only their own, admins see all
    if (req.user.role === 'lecturer') filter.lecturer = req.user.id;
    const docs = await Material.find(filter).populate('lecturer', 'fullName').sort({ week: 1, createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await Material.findById(req.params.id).populate('lecturer', 'fullName');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/materials
router.post('/', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const doc = await Material.create({ ...req.body, lecturer: lecturerId });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/materials/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/materials/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
