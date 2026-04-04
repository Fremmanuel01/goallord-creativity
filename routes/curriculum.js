const express      = require('express');
const curriculumDb = require('../db/curriculum');
const studentsDb   = require('../db/students');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// GET /api/curriculum/student — student: curriculum for their batch
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student || !student.batch_id) return res.json([]);
    const docs = await curriculumDb.find({ batch_id: student.batch_id });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/curriculum?batch=&week=
router.get('/', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch_id = req.query.batch;
    if (req.query.week)  filter.week     = Number(req.query.week);
    const docs = await curriculumDb.find(filter);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/curriculum/:id
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const supabase = require('../lib/supabase');
    const { data: doc, error } = await supabase.from('curriculum_entries').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/curriculum
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { batch, week, day, topic, description, objectives, resources } = req.body;
    const doc = await curriculumDb.create({
      batch_id: batch,
      week, day, topic, description, objectives, resources,
      created_by: req.user.id,
      updated_at: new Date().toISOString()
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/curriculum/:id
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const { batch, week, day, topic, description, objectives, resources } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (batch !== undefined) update.batch_id = batch;
    if (week !== undefined) update.week = week;
    if (day !== undefined) update.day = day;
    if (topic !== undefined) update.topic = topic;
    if (description !== undefined) update.description = description;
    if (objectives !== undefined) update.objectives = objectives;
    if (resources !== undefined) update.resources = resources;
    const doc = await curriculumDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/curriculum/:id
router.delete('/:id', requireLecturer, async (req, res) => {
  try {
    await curriculumDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
