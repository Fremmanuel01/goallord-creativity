const express      = require('express');
const curriculumDb = require('../db/curriculum');
const studentsDb   = require('../db/students');
const batchesDb    = require('../db/batches');
const assignmentsDb = require('../db/assignments');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

const DAY = 86400000;
// JS getDay() index for each class weekday used by the academy.
const WEEKDAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

// Date (UTC, YYYY-MM-DD) of `dayName` inside week `week` of a batch that began on `startMs`.
// Each week is the 7-day window beginning at start_date; the class day is placed at its
// weekday offset relative to the batch's first day so the grid lines up with real dates.
function dateForWeekDay(startMs, startDow, week, dayName) {
  const targetDow = WEEKDAY_INDEX[dayName];
  if (targetDow === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (targetDow - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// GET /api/curriculum/student - student: curriculum for their batch
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

// GET /api/curriculum/calendar - student: week × day × topic × deadline syllabus calendar
router.get('/calendar', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student || !student.batch_id) {
      return res.json({ batch: null, currentWeek: null, weeks: [] });
    }

    const [batch, entries, assignments] = await Promise.all([
      batchesDb.findById(student.batch_id).catch(() => null),
      curriculumDb.find({ batch_id: student.batch_id }),
      assignmentsDb
        .find({ filter: { batch_id: student.batch_id, published: true } })
        .catch(() => [])
    ]);

    const now = Date.now();
    const hasStart = !!(batch && batch.start_date);
    const startMs  = hasStart ? new Date(batch.start_date).getTime() : null;
    const startDow = hasStart ? new Date(batch.start_date).getUTCDay() : null;

    // Total weeks: prefer batch.total_weeks, else span start..end, else default 12.
    let totalWeeks = batch && batch.total_weeks ? batch.total_weeks : 12;
    if (hasStart && batch.end_date) {
      const spanWeeks = Math.round((new Date(batch.end_date).getTime() - startMs) / (7 * DAY));
      if (spanWeeks > 0) totalWeeks = spanWeeks;
    }

    // Current week (1-based), only meaningful once the batch has started.
    let currentWeek = null;
    if (hasStart) {
      const elapsedDays = Math.floor((now - startMs) / DAY);
      currentWeek = elapsedDays < 0
        ? 0
        : Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);
    }

    // Build the set of weeks to render: every week that has content, padded to totalWeeks.
    const weekNums = new Set();
    for (let w = 1; w <= totalWeeks; w++) weekNums.add(w);
    entries.forEach(e => weekNums.add(e.week));
    assignments.forEach(a => { if (a.week) weekNums.add(a.week); });

    const weeks = [...weekNums].sort((a, b) => a - b).map(week => {
      const days = entries
        .filter(e => e.week === week)
        .map(e => ({
          day: e.day,
          date: hasStart ? dateForWeekDay(startMs, startDow, week, e.day) : null,
          topic: e.topic,
          subtopics: e.subtopics || [],
          objectives: e.objectives || '',
          resources: e.resources || []
        }))
        .sort((a, b) => (WEEKDAY_INDEX[a.day] || 9) - (WEEKDAY_INDEX[b.day] || 9));

      const deadlines = assignments
        .filter(a => a.week === week && a.deadline)
        .map(a => ({ id: a.id, title: a.title, deadline: a.deadline }))
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

      let status = 'upcoming';
      if (currentWeek != null && currentWeek > 0) {
        if (week < currentWeek) status = 'past';
        else if (week === currentWeek) status = 'current';
      }

      return {
        week,
        startDate: hasStart ? new Date(startMs + (week - 1) * 7 * DAY).toISOString().slice(0, 10) : null,
        endDate:   hasStart ? new Date(startMs + (week * 7 - 1) * DAY).toISOString().slice(0, 10) : null,
        status,
        days,
        deadlines
      };
    });

    res.json({
      batch: batch ? {
        name: batch.name,
        track: batch.track,
        startDate: batch.start_date || null,
        endDate: batch.end_date || null,
        totalWeeks,
        classDays: batch.class_days || []
      } : null,
      currentWeek,
      weeks
    });
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
