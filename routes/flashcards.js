const express      = require('express');
const flashcardsDb = require('../db/flashcards');
const studentsDb   = require('../db/students');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// ── FLASHCARD SETS ──────────────────────────────────────────

// GET /api/flashcards/sets?batch=&week=
router.get('/sets', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch_id = req.query.batch;
    if (req.query.week)  filter.week     = Number(req.query.week);
    if (req.user.role === 'lecturer') filter.lecturer_id = req.user.id;
    const sets = await flashcardsDb.findSets(filter);
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards/sets
router.post('/sets', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const { title, description, batch, week, published } = req.body;
    const set = await flashcardsDb.createSet({
      title, description,
      batch_id: batch,
      week,
      published,
      lecturer_id: lecturerId
    });
    res.status(201).json(set);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/flashcards/sets/:setId
router.patch('/sets/:setId', requireLecturer, async (req, res) => {
  try {
    const { title, description, batch, week, published } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (batch !== undefined) update.batch_id = batch;
    if (week !== undefined) update.week = week;
    if (published !== undefined) update.published = published;
    const set = await flashcardsDb.updateSet(req.params.setId, update);
    if (!set) return res.status(404).json({ error: 'Not found' });
    res.json(set);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/flashcards/sets/:setId
router.delete('/sets/:setId', requireLecturer, async (req, res) => {
  try {
    await flashcardsDb.removeSet(req.params.setId);
    // Cards are deleted by cascade or manually
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CARDS IN A SET ──────────────────────────────────────────

// GET /api/flashcards/sets/:setId/cards
router.get('/sets/:setId/cards', requireLecturer, async (req, res) => {
  try {
    const cards = await flashcardsDb.findCards(req.params.setId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards/sets/:setId/cards
router.post('/sets/:setId/cards', requireLecturer, async (req, res) => {
  try {
    const set = await flashcardsDb.findSetById(req.params.setId);
    if (!set) return res.status(404).json({ error: 'Set not found' });
    const { question, options, correctAnswer, order, generatedBy } = req.body;
    const card = await flashcardsDb.createCard({
      question, options,
      correct_answer: correctAnswer,
      order,
      generated_by: generatedBy,
      set_id: req.params.setId,
      batch_id: set.batch_id
    });
    res.status(201).json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/flashcards/cards/:cardId
router.patch('/cards/:cardId', requireLecturer, async (req, res) => {
  try {
    const { question, options, correctAnswer, order, generatedBy } = req.body;
    const update = {};
    if (question !== undefined) update.question = question;
    if (options !== undefined) update.options = options;
    if (correctAnswer !== undefined) update.correct_answer = correctAnswer;
    if (order !== undefined) update.order = order;
    if (generatedBy !== undefined) update.generated_by = generatedBy;
    const card = await flashcardsDb.updateCard(req.params.cardId, update);
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/flashcards/cards/:cardId
router.delete('/cards/:cardId', requireLecturer, async (req, res) => {
  try {
    await flashcardsDb.removeCard(req.params.cardId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STUDENT READ ROUTES ──────────────────────────────────────

// GET /api/flashcards/sets/student/progress — sets the student has completed + scores
router.get('/sets/student/progress', requireStudentAuth, async (req, res) => {
  try {
    const results = await flashcardsDb.getProgress(req.user.id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/student — student: published sets for their batch
router.get('/sets/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const filter = { published: true };
    if (student.batch_id) filter.batch_id = student.batch_id;

    const sets = await flashcardsDb.findSets(filter);
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/:setId/cards/student — student: cards in a set
router.get('/sets/:setId/cards/student', requireStudentAuth, async (req, res) => {
  try {
    const set = await flashcardsDb.findSetById(req.params.setId);
    if (!set || !set.published) return res.status(404).json({ error: 'Set not found' });
    const cards = await flashcardsDb.findCards(req.params.setId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STUDENT RESPONSES ───────────────────────────────────────

// POST /api/flashcards/sets/:setId/respond (student submits answers)
router.post('/sets/:setId/respond', requireStudentAuth, async (req, res) => {
  try {
    const { responses } = req.body; // [{ flashcard, answer, isCorrect }]
    if (!Array.isArray(responses)) return res.status(400).json({ error: 'responses must be an array' });

    const set = await flashcardsDb.findSetById(req.params.setId);
    if (!set) return res.status(404).json({ error: 'Set not found' });

    const docs = responses.map(r => ({
      set_id:      req.params.setId,
      flashcard_id: r.flashcard,
      student_id:  req.user.id,
      batch_id:    set.batch_id,
      answer:      r.answer,
      is_correct:  r.isCorrect
    }));

    // Delete previous attempts for this set+student then re-insert
    const supabase = require('../lib/supabase');
    await supabase.from('flashcard_responses').delete().eq('set_id', req.params.setId).eq('student_id', req.user.id);
    const { data: saved, error } = await supabase.from('flashcard_responses').insert(docs).select();
    if (error) throw error;
    res.status(201).json({ submitted: (saved || []).length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/:setId/results (lecturer sees all student results)
router.get('/sets/:setId/results', requireLecturer, async (req, res) => {
  try {
    const supabase = require('../lib/supabase');
    const { data: results, error } = await supabase
      .from('flashcard_responses')
      .select('*')
      .eq('set_id', req.params.setId)
      .order('attempted_at', { ascending: false });
    if (error) throw error;
    res.json(results || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
