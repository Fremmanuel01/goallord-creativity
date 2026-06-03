const express      = require('express');
const flashcardsDb = require('../db/flashcards');
const studentsDb   = require('../db/students');
const supabase     = require('../lib/supabase');
const { generateContent } = require('../utils/gemini');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// ── AI GENERATION ───────────────────────────────────────────
// Generate `count` validated MCQ cards from one curriculum entry (a day).
async function generateCardsForEntry(entry, week, count) {
  const source =
    `Topic: ${entry.topic}\nKey points: ${(entry.subtopics || []).join('; ')}\n` +
    `Objectives: ${entry.objectives}\nTools: ${(entry.resources || []).join(', ')}`;
  const prompt =
    `You are creating revision flashcards for a practical, hands-on film and video bootcamp. ` +
    `Using ONLY the curriculum notes below, write exactly ${count} multiple-choice questions that test real understanding of the key concepts and practical skills. ` +
    `Each question must have exactly 4 distinct options with one clearly correct answer, plus a one-sentence explanation. ` +
    `Keep them clear and practical for beginners; avoid trick questions.\n\n` +
    `CURRICULUM (Week ${week}, ${entry.day} - ${entry.topic}):\n${source}\n\n` +
    `Return ONLY a JSON array (no markdown) of this exact shape:\n` +
    `[{"question":"...","options":["...","...","...","..."],"correctAnswer":"<exact text of the correct option>","explanation":"..."}]`;

  const raw = await generateContent({ prompt, json: true, maxOutputTokens: 4096, temperature: 0.5 });
  let cards;
  try { cards = JSON.parse(raw); }
  catch { const m = raw.match(/\[[\s\S]*\]/); cards = m ? JSON.parse(m[0]) : null; }
  return (Array.isArray(cards) ? cards : []).filter(c =>
    c && typeof c.question === 'string' && Array.isArray(c.options) &&
    c.options.length >= 2 && c.correctAnswer && c.options.includes(c.correctAnswer)
  ).slice(0, count);
}

// POST /api/flashcards/generate { batch, week, day?, count } — build flashcard sets
// from curriculum. With a day, one set; without (whole week), one set per class day.
router.post('/generate', requireLecturer, async (req, res) => {
  try {
    const { batch, week } = req.body;
    const day = req.body.day;
    if (!batch || !week) return res.status(400).json({ error: 'batch and week are required' });
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : (req.body.lecturer || req.user.id);
    const count = Math.min(Math.max(Number(req.body.count) || 10, 3), 15);

    let q = supabase.from('curriculum_entries')
      .select('topic, subtopics, objectives, resources, day')
      .eq('batch_id', batch).eq('week', Number(week));
    if (day) q = q.eq('day', day);
    const { data: entries } = await q.order('day');
    if (!entries || !entries.length) {
      return res.status(404).json({ error: 'No curriculum found for this week. Add the curriculum first.' });
    }

    // One set per curriculum day. Independent so one day failing won't lose the others.
    const results = await Promise.all(entries.map(async (entry) => {
      try {
        const valid = await generateCardsForEntry(entry, week, count);
        if (!valid.length) return { day: entry.day, error: 'no usable cards' };
        const set = await flashcardsDb.createSet({
          batch_id: batch, lecturer_id: lecturerId, title: entry.topic,
          topic: entry.topic, week: Number(week), generated_by: 'ai', published: false,
        });
        const rows = valid.map((c, i) => ({
          set_id: set.id, batch_id: batch, question: c.question,
          correct_answer: c.correctAnswer, options: c.options,
          explanation: c.explanation || '', topic: entry.topic, week: Number(week), order: i,
        }));
        await flashcardsDb.createCards(rows);
        return { day: entry.day, setId: set.id, title: entry.topic, count: rows.length };
      } catch (e) {
        return { day: entry.day, error: e.message };
      }
    }));

    const created = results.filter(r => r.setId);
    if (!created.length) return res.status(502).json({ error: 'Could not generate flashcards. Please try again.' });
    res.status(201).json({
      sets: created,
      totalCards: created.reduce((s, r) => s + r.count, 0),
      failures: results.filter(r => r.error),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// GET /api/flashcards/overview - student: per-set completion dots for the dashboard.
// Each published set becomes a dot: done (answered), missed (class day passed, not
// done), or pending (available, not yet passed).
const _DAY = 86400000;
const _WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function _dateForWeekDay(startMs, startDow, week, dayName) {
  const targetDow = _WEEKDAY[dayName];
  if (targetDow === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * _DAY;
  const offset = (targetDow - startDow + 7) % 7;
  return new Date(windowStart + offset * _DAY).toISOString().slice(0, 10);
}
router.get('/overview', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student || !student.batch_id) return res.json({ items: [] });
    const batchId = student.batch_id;

    const sets = await flashcardsDb.findSets({ batch_id: batchId, published: true });
    if (!sets.length) return res.json({ items: [] });
    const setIds = sets.map(s => s.id);

    const [{ data: batch }, { data: cardRows }, { data: respRows }, { data: curr }] = await Promise.all([
      supabase.from('batches').select('start_date').eq('id', batchId).single(),
      supabase.from('flashcards').select('set_id').in('set_id', setIds),
      supabase.from('flashcard_responses').select('set_id, is_correct').eq('student_id', req.user.id).in('set_id', setIds),
      supabase.from('curriculum_entries').select('week, day, topic').eq('batch_id', batchId),
    ]);

    const cardCount = {}; (cardRows || []).forEach(c => { cardCount[c.set_id] = (cardCount[c.set_id] || 0) + 1; });
    const done = {}, correct = {};
    (respRows || []).forEach(r => { done[r.set_id] = true; if (r.is_correct) correct[r.set_id] = (correct[r.set_id] || 0) + 1; });
    const dayByKey = {}; (curr || []).forEach(e => { dayByKey[e.week + '|' + e.topic] = e.day; });

    const startMs = batch && batch.start_date ? new Date(batch.start_date + 'T00:00:00Z').getTime() : null;
    const startDow = startMs != null ? new Date(startMs).getUTCDay() : null;
    const now = Date.now();

    const items = sets.map(s => {
      const day = dayByKey[s.week + '|' + s.topic] || null;
      let date = null, passed = false;
      if (startMs != null && day) {
        date = _dateForWeekDay(startMs, startDow, s.week, day);
        if (date) passed = new Date(date + 'T23:59:59Z').getTime() < now;
      } else if (startMs != null) {
        const wkEnd = startMs + s.week * 7 * _DAY;
        date = new Date(wkEnd).toISOString().slice(0, 10);
        passed = wkEnd < now;
      }
      const isDone = !!done[s.id];
      return {
        setId: s.id, week: s.week, day, topic: s.topic, date,
        total: cardCount[s.id] || 0, correct: correct[s.id] || 0,
        done: isDone, passed,
        status: isDone ? 'done' : (passed ? 'missed' : 'pending'),
      };
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/student/progress - sets the student has completed + scores
router.get('/sets/student/progress', requireStudentAuth, async (req, res) => {
  try {
    const results = await flashcardsDb.getProgress(req.user.id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/flashcards/sets/student - student: published sets for their batch
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

// GET /api/flashcards/sets/:setId/cards/student - student: cards in a set
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
