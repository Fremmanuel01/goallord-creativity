const express     = require('express');
const materialsDb = require('../db/materials');
const studentsDb  = require('../db/students');
const { requireAuth } = require('../middleware/auth');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// GET /api/materials/student — student: published materials for their batch
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const filter = { published: true };
    if (student.batch_id) filter.batch_id = student.batch_id;

    const docs = await materialsDb.find(filter);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials?batch=&week=&published=
router.get('/', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch)     filter.batch_id = req.query.batch;
    if (req.query.week)      filter.week     = Number(req.query.week);
    if (req.query.published) filter.published = req.query.published === 'true';
    // Lecturers see only their own, admins see all
    if (req.user.role === 'lecturer') filter.lecturer_id = req.user.id;
    const docs = await materialsDb.find(filter);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const doc = await materialsDb.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/materials
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { title, description, batch, type, fileUrl, fileName, week, topic, linkUrl, published } = req.body;
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const doc = await materialsDb.create({
      title, description,
      batch_id: batch,
      type,
      file_url: fileUrl,
      file_name: fileName,
      week, topic,
      link_url: linkUrl,
      published,
      lecturer_id: lecturerId
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/materials/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const { title, description, batch, type, fileUrl, fileName, week, topic, linkUrl, published } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (batch !== undefined) update.batch_id = batch;
    if (type !== undefined) update.type = type;
    if (fileUrl !== undefined) update.file_url = fileUrl;
    if (fileName !== undefined) update.file_name = fileName;
    if (week !== undefined) update.week = week;
    if (topic !== undefined) update.topic = topic;
    if (linkUrl !== undefined) update.link_url = linkUrl;
    if (published !== undefined) update.published = published;
    const doc = await materialsDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/materials/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await materialsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
