const express          = require('express');
const FlashcardSet     = require('../models/FlashcardSet');
const Flashcard        = require('../models/Flashcard');
const FlashcardResponse = require('../models/FlashcardResponse');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// ── FLASHCARD SETS ──────────────────────────────────────────

// GET /api/flashcards/sets?batch=&week=
router.get('/sets', requireLecturer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.batch) filter.batch = req.query.batch;
    if (req.query.week)  filter.week  = Number(req.query.week);
    if (req.user.role === 'lecturer') filter.lecturer = req.user.id;
    const sets = await FlashcardSet.find(filter).populate('lecturer', 'fullName').sort({ week: 1, createdAt: -1 });
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards/sets
router.post('/sets', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : req.body.lecturer;
    const set = await FlashcardSet.create({ ...req.body, lecturer: lecturerId });
    res.status(201).json(set);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/flashcards/sets/:setId
router.patch('/sets/:setId', requireLecturer, async (req, res) => {
  try {
    const set = await FlashcardSet.findByIdAndUpdate(req.params.setId, req.body, { new: true });
    if (!set) return res.status(404).json({ error: 'Not found' });
    res.json(set);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/flashcards/sets/:setId
router.delete('/sets/:setId', requireLecturer, async (req, res) => {
  try {
    await FlashcardSet.findByIdAndDelete(req.params.setId);
    await Flashcard.deleteMany({ set: req.params.setId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CARDS IN A SET ──────────────────────────────────────────

// GET /api/flashcards/sets/:setId/cards
router.get('/sets/:setId/cards', requireLecturer, async (req, res) => {
  try {
    const cards = await Flashcard.find({ set: req.params.setId }).sort({ order: 1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/flashcards/sets/:setId/cards
router.post('/sets/:setId/cards', requireLecturer, async (req, res) => {
  try {
    const set = await FlashcardSet.findById(req.params.setId);
    if (!set) return res.status(404).json({ error: 'Set not found' });
    const card = await Flashcard.create({ ...req.body, set: req.params.setId, batch: set.batch });
    res.status(201).json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/flashcards/cards/:cardId
router.patch('/cards/:cardId', requireLecturer, async (req, res) => {
  try {
    const card = await Flashcard.findByIdAndUpdate(req.params.cardId, req.body, { new: true });
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/flashcards/cards/:cardId
router.delete('/cards/:cardId', requireLecturer, async (req, res) => {
  try {
    await Flashcard.findByIdAndDelete(req.params.cardId);
    res.json({ success: true });
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

    const set = await FlashcardSet.findById(req.params.setId);
    if (!set) return res.status(404).json({ error: 'Set not found' });

    const docs = responses.map(r => ({
      set:       req.params.setId,
      flashcard: r.flashcard,
      student:   req.user.id,
      batch:     set.batch,
      answer:    r.answer,
      isCorrect: r.isCorrect
    }));

    // Delete previous attempts for this set+student then re-insert
    await FlashcardResponse.deleteMany({ set: req.params.setId, student: req.user.id });
    const saved = await FlashcardResponse.insertMany(docs);
    res.status(201).json({ submitted: saved.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/:setId/results (lecturer sees all student results)
router.get('/sets/:setId/results', requireLecturer, async (req, res) => {
  try {
    const results = await FlashcardResponse.find({ set: req.params.setId })
      .populate('student', 'fullName email')
      .populate('flashcard', 'question correctAnswer')
      .sort({ attemptedAt: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
