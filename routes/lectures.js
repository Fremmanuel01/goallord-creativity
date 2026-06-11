const express         = require('express');
const supabase        = require('../lib/supabase');
const lecturesDb      = require('../db/lectures');
const studentsDb      = require('../db/students');
const notificationsDb = require('../db/notifications');
const { sendMail } = require('../utils/mailer');
const { lecturePublishedEmail, lectureUpdatedEmail } = require('../utils/emailTemplates');
const { generateForBatchDay } = require('../utils/lectureGenerator');
const { regenerateSlideImage } = require('../utils/lectureImages');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

const ANIMATIONS = ['fade', 'slide_up', 'panel_reveal', 'timeline_reveal', 'code_reveal', 'diagram_build', 'before_after_reveal', 'none'];
const LAYOUTS = ['title', 'image_left_text_right', 'image_right_text_left', 'full_image_overlay', 'cards_grid', 'comparison', 'timeline', 'flowchart', 'code_demo', 'diagram', 'lesson_summary'];

function urls() {
  const host = process.env.HOST || '';
  return { logoUrl: host + '/assets/images/logo/goallord-logo.png', lecturesUrl: host + '/student-dashboard.html#lectures' };
}

// Batch ids a non-admin lecturer may manage (admins → all).
async function scopeBatchIds(user) {
  if (user.role === 'admin') return null; // null = unrestricted
  const { data } = await supabase.from('lecturer_batches').select('batch_id').eq('lecturer_id', user.id);
  return (data || []).map(r => r.batch_id);
}

// Normalised teacher-facing shape. Top-level keys are camelCase (consistent with
// the rest of the API); slides + lessonNotes pass through verbatim (snake_case
// internals) because they are a defined rendering contract.
function lectureDTO(l) {
  return {
    id: l.id, batchId: l.batch_id, week: l.week, day: l.day, lectureDate: l.lecture_date,
    courseType: l.course_type, courseTitle: l.course_title, lectureTitle: l.lecture_title,
    status: l.status, premium: l.premium,
    slides: l.slides || [], lessonNotes: l.lesson_notes || {},
    hasPublished: !!l.published_slides,
    generatedAt: l.generated_at, publishedAt: l.published_at, republishedAt: l.republished_at,
  };
}

async function canManage(user, lecture) {
  if (user.role === 'admin') return true;
  const ids = await scopeBatchIds(user);
  return Array.isArray(ids) && ids.includes(lecture.batch_id);
}

// ── STUDENT ──────────────────────────────────────────────────
// GET /api/lectures/student — published lectures for the student's batch,
// bucketed into today / upcoming / past. Drafts are never returned.
router.get('/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    if (!student || !student.batch_id) return res.json({ today: [], upcoming: [], past: [] });

    const rows = await lecturesDb.findPublishedForBatch(student.batch_id);
    const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10); // WAT
    const card = (l) => ({
      id: l.id, lectureTitle: l.lecture_title, courseTitle: l.course_title,
      courseType: l.course_type, lectureDate: l.lecture_date, status: l.status,
      slideCount: Array.isArray(l.published_slides) ? l.published_slides.length : 0,
      hasNotes: !!(l.published_notes && Object.keys(l.published_notes).length),
    });
    const out = { today: [], upcoming: [], past: [] };
    for (const l of rows) {
      const c = card(l);
      if (!l.lecture_date) out.upcoming.push(c);
      else if (l.lecture_date === today) out.today.push(c);
      else if (l.lecture_date > today) out.upcoming.push(c);
      else out.past.push(c);
    }
    out.past.reverse(); // most recent past first
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lectures/:id/student — published slides + notes for one lecture.
router.get('/:id/student', requireStudentAuth, async (req, res) => {
  try {
    const student = await studentsDb.findById(req.user.id, { fields: 'id, batch_id' });
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l || !student || l.batch_id !== student.batch_id || !l.published_slides) {
      return res.status(404).json({ error: 'Lecture not found' });
    }
    res.json({
      id: l.id, lectureTitle: l.lecture_title, courseTitle: l.course_title,
      courseType: l.course_type, lectureDate: l.lecture_date,
      slides: l.published_slides, lessonNotes: l.published_notes || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TEACHER / ADMIN ──────────────────────────────────────────
// GET /api/lectures — all manageable lectures (scoped), for the buckets.
router.get('/', requireLecturer, async (req, res) => {
  try {
    const batchIds = await scopeBatchIds(req.user);
    const filter = {};
    if (req.query.batch) filter.batchId = req.query.batch;
    else if (batchIds) filter.batchIds = batchIds;
    if (req.query.status) filter.status = req.query.status;
    const rows = await lecturesDb.findManageable(filter);
    res.json(rows.map(l => ({
      id: l.id, batchId: l.batch_id, lectureTitle: l.lecture_title,
      courseTitle: l.course_title, courseType: l.course_type, week: l.week, day: l.day,
      lectureDate: l.lecture_date, status: l.status, premium: l.premium,
      slideCount: Array.isArray(l.slides) ? l.slides.length : 0,
      imageCount: Array.isArray(l.slides) ? l.slides.filter(s => s.image_url).length : 0,
      generatedAt: l.generated_at, publishedAt: l.published_at, republishedAt: l.republished_at,
      batch: l.batch,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lectures/:id — full working lecture for the editor.
router.get('/:id', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });
    res.json(lectureDTO(l));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lectures/generate { batchId, week, day, premium?, force? }
// Runs in the background; returns 202 immediately (generation takes minutes).
router.post('/generate', requireLecturer, async (req, res) => {
  try {
    const { batchId, week, day, premium, force } = req.body || {};
    if (!batchId || !week || !day) return res.status(400).json({ error: 'batchId, week and day are required' });
    if (req.user.role !== 'admin') {
      const ids = await scopeBatchIds(req.user);
      if (!ids.includes(batchId)) return res.status(403).json({ error: 'Access denied for this batch' });
    }
    // Fire-and-forget: the teacher polls the list for status to flip to pending_review.
    generateForBatchDay({ batchId, week: Number(week), day, premium: !!premium, force: !!force })
      .catch(e => console.error('[Lectures] manual generate failed:', e.message));
    res.status(202).json({ accepted: true, message: 'Generation started. This can take a few minutes.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/lectures/:id — edit notes/title/slides wholesale (NO AI).
// Editing a published lecture flips it to edited_after_publishing; students keep
// seeing the published snapshot until Republish.
router.patch('/:id', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });

    const updates = {};
    if (req.body.lectureTitle !== undefined) updates.lecture_title = String(req.body.lectureTitle);
    if (req.body.lessonNotes !== undefined) updates.lesson_notes = req.body.lessonNotes;
    if (Array.isArray(req.body.slides)) updates.slides = sanitizeSlides(req.body.slides);
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

    const wasPublished = ['published', 'republished', 'edited_after_publishing'].includes(l.status);
    if (wasPublished) updates.status = 'edited_after_publishing';
    const saved = await lecturesDb.update(req.params.id, updates);
    res.json(lectureDTO(saved));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/lectures/:id/slides/:n — edit one slide's editable blocks (NO AI).
router.patch('/:id/slides/:n', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });
    const n = Number(req.params.n);
    const slides = Array.isArray(l.slides) ? l.slides.slice() : [];
    const idx = slides.findIndex(s => s.slide_number === n);
    if (idx < 0) return res.status(404).json({ error: 'Slide not found' });

    const patch = req.body || {};
    const s = { ...slides[idx] };
    if (patch.slide_title !== undefined) s.slide_title = String(patch.slide_title);
    if (patch.on_slide_text !== undefined) s.on_slide_text = String(patch.on_slide_text);
    if (patch.main_explanation !== undefined) s.main_explanation = String(patch.main_explanation);
    if (Array.isArray(patch.editable_blocks)) s.editable_blocks = patch.editable_blocks;
    if (ANIMATIONS.includes(patch.animation_type)) s.animation_type = patch.animation_type;
    if (LAYOUTS.includes(patch.layout_type)) s.layout_type = patch.layout_type;
    slides[idx] = s;

    const wasPublished = ['published', 'republished', 'edited_after_publishing'].includes(l.status);
    const saved = await lecturesDb.update(req.params.id, {
      slides, ...(wasPublished ? { status: 'edited_after_publishing' } : {}),
    });
    res.json(lectureDTO(saved));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/lectures/:id/slides/:n/regenerate-image — regenerate ONE image.
router.post('/:id/slides/:n/regenerate-image', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });
    const n = Number(req.params.n);
    const slides = Array.isArray(l.slides) ? l.slides.slice() : [];
    const idx = slides.findIndex(s => s.slide_number === n);
    if (idx < 0) return res.status(404).json({ error: 'Slide not found' });

    const { image_url, model } = await regenerateSlideImage({ lectureId: l.id, courseType: l.course_type, slide: slides[idx] });
    slides[idx] = { ...slides[idx], image_url, image_required: true };
    const saved = await lecturesDb.update(req.params.id, { slides });
    await lecturesDb.logAi({ lecture_id: l.id, kind: 'image', model, images: 1, ok: true, detail: `regenerated slide ${n}` });
    res.json({ slide: saved.slides[idx] });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/lectures/:id/publish — freeze working → published, notify students.
router.post('/:id/publish', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });

    const saved = await lecturesDb.update(req.params.id, {
      published_slides: l.slides, published_notes: l.lesson_notes,
      status: 'published', published_at: new Date().toISOString(),
    });
    await notifyStudents(saved, lecturePublishedEmail, 'lecture_published', 'New lecture available');
    res.json({ success: true, status: saved.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lectures/:id/republish { notify } — re-freeze; notify only if asked.
router.post('/:id/republish', requireLecturer, async (req, res) => {
  try {
    const l = await lecturesDb.findById(req.params.id).catch(() => null);
    if (!l) return res.status(404).json({ error: 'Not found' });
    if (!(await canManage(req.user, l))) return res.status(403).json({ error: 'Access denied' });

    const saved = await lecturesDb.update(req.params.id, {
      published_slides: l.slides, published_notes: l.lesson_notes,
      status: 'republished', republished_at: new Date().toISOString(),
    });
    let notified = 0;
    if (req.body && req.body.notify) {
      notified = await notifyStudents(saved, lectureUpdatedEmail, 'lecture_updated', 'Lecture updated');
    }
    res.json({ success: true, status: saved.status, notified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── helpers ──────────────────────────────────────────────────
function sanitizeSlides(slides) {
  return slides.map((s, i) => ({
    ...s,
    slide_number: i + 1,
    animation_type: ANIMATIONS.includes(s.animation_type) ? s.animation_type : 'fade',
    layout_type: LAYOUTS.includes(s.layout_type) ? s.layout_type : 'cards_grid',
  }));
}

// Push + email every active student in the lecture's batch.
async function notifyStudents(lecture, emailFn, notifType, notifTitle) {
  try {
    const students = await studentsDb.findByBatch(lecture.batch_id); // active only
    if (!students.length) return 0;
    const { logoUrl, lecturesUrl } = urls();
    await notificationsDb.insertMany(students.map(s => ({
      recipient_id: s.id, recipient_type: 'Student', type: notifType,
      title: notifTitle, message: `"${lecture.lecture_title}" — slides & notes are ready to view.`,
      link: '/student-dashboard.html#lectures',
    })));
    const slideCount = Array.isArray(lecture.published_slides) ? lecture.published_slides.length : 0;
    for (const s of students) {
      if (!s.email) continue;
      try {
        await sendMail({
          to: s.email,
          subject: `${notifTitle}: ${lecture.lecture_title}`,
          html: emailFn({
            fullName: s.full_name, lectureTitle: lecture.lecture_title, courseTitle: lecture.course_title,
            lectureDate: lecture.lecture_date, slideCount, lecturesUrl, logoUrl,
          }),
        });
      } catch (e) { console.error('[Lectures] student email failed for', s.email, '-', e.message); }
    }
    return students.length;
  } catch (e) {
    console.error('[Lectures] notifyStudents failed:', e.message);
    return 0;
  }
}

module.exports = router;
