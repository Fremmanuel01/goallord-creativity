const express         = require('express');
const notificationsDb = require('../db/notifications');
const studentsDb      = require('../db/students');
const lecturersDb     = require('../db/lecturers');
const batchesDb       = require('../db/batches');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');
const { extractAnyToken } = require('../lib/authCookie');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Identify the caller from the httpOnly auth cookie (student/lecturer/admin),
// falling back to a real Bearer token for API clients. The browser only carries
// a 'cookie-session' placeholder in the Authorization header, so these personal
// endpoints must read the cookie — reading the header alone 500'd every load.
function whoami(req) {
  const token = extractAnyToken(req);
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return null; }
}

// The reminder/notification types we surface in the dashboard delivery log,
// grouped into the three categories teachers care about.
const LOG_CATEGORIES = {
  class:     ['class_reminder'],
  lecture:   ['lecture_published', 'lecture_updated', 'lecture_pending'],
  flashcard: ['flashcard_ready', 'flashcard_day_after'],
};
const LOG_TYPES = Object.values(LOG_CATEGORIES).flat();
const CATEGORY_FOR_TYPE = Object.fromEntries(
  Object.entries(LOG_CATEGORIES).flatMap(([cat, types]) => types.map(t => [t, cat]))
);

// GET /api/notifications - returns notifications for the authenticated user
router.get('/', async (req, res) => {
  try {
    const decoded = whoami(req);
    if (!decoded) return res.status(401).json({ error: 'No token' });

    const filter = { recipient_id: decoded.id };
    if (req.query.read !== undefined) filter.read = req.query.read === 'true';

    const docs = await notificationsDb.find(filter, 50);
    const unread = await notificationsDb.countUnread(decoded.id);
    res.json({ notifications: docs, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications/sent-log - delivery log of class/lecture/flashcard
// reminders that went out to a lecturer's (or admin's) students and lecturers.
// Lets teachers confirm who was actually notified and what was sent.
// Query: ?batch=<id> (scope to one batch), ?category=class|lecture|flashcard,
//        ?days=<n> (default 30).
router.get('/sent-log', requireLecturer, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Resolve which batches this caller may see, honouring an optional filter.
    let batches;
    if (isAdmin) {
      batches = await batchesDb.findAll();
    } else {
      batches = await lecturersDb.batchesFor(req.user.id);
    }
    batches = (batches || []).filter(Boolean);
    if (req.query.batch) {
      batches = batches.filter(b => (b.id || b._id) === req.query.batch);
    }
    const batchNameById = {};
    batches.forEach(b => { batchNameById[b.id || b._id] = b.name; });

    // Build the recipient roster (students in those batches + relevant lecturers)
    // and a name/type lookup so the log reads in plain language.
    const nameById = {};
    const recipientIds = new Set();

    for (const b of batches) {
      const students = await studentsDb.findByBatch(b.id || b._id);
      for (const s of students) {
        nameById[s.id] = { name: s.full_name || s.email || 'Student', type: 'Student', batch: b.name };
        recipientIds.add(s.id);
      }
    }

    // Lecturers: the caller themselves (if a lecturer), plus — for admins — all
    // lecturers, so lecture_pending / class reminders to teachers also show up.
    if (!isAdmin) {
      const me = await lecturersDb.findById(req.user.id).catch(() => null);
      if (me) { nameById[me.id] = { name: me.full_name || me.email || 'You', type: 'Lecturer', batch: '' }; recipientIds.add(me.id); }
    } else {
      const lecturers = await lecturersDb.findAll().catch(() => []);
      for (const l of lecturers || []) {
        nameById[l.id] = { name: l.full_name || l.email || 'Lecturer', type: 'Lecturer', batch: '' };
        recipientIds.add(l.id);
      }
    }

    const ids = Array.from(recipientIds);
    let types = LOG_TYPES;
    if (req.query.category && LOG_CATEGORIES[req.query.category]) {
      types = LOG_CATEGORIES[req.query.category];
    }

    const rows = await notificationsDb.sentLog({ recipientIds: ids, types, since, limit: 400 });

    const summary = { class: 0, lecture: 0, flashcard: 0, total: 0 };
    const log = rows.map(n => {
      const who = nameById[n.recipient_id] || { name: 'Unknown', type: n.recipient_type, batch: '' };
      const category = CATEGORY_FOR_TYPE[n.type] || 'other';
      if (summary[category] !== undefined) summary[category]++;
      summary.total++;
      return {
        id: n.id,
        recipient_id: n.recipient_id,
        recipient_name: who.name,
        recipient_type: who.type,
        batch_name: who.batch || '',
        type: n.type,
        category,
        title: n.title,
        message: n.message,
        read: n.read,
        created_at: n.created_at,
      };
    });

    res.json({ summary, log, days, batches: batches.map(b => ({ id: b.id || b._id, name: b.name })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    if (!whoami(req)) return res.status(401).json({ error: 'No token' });
    const doc = await notificationsDb.markRead(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  try {
    const decoded = whoami(req);
    if (!decoded) return res.status(401).json({ error: 'No token' });
    await notificationsDb.markAllRead(decoded.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/announce - broadcast to all active students in a batch
router.post('/announce', requireLecturer, async (req, res) => {
  try {
    const { batchId, title, message } = req.body;
    if (!batchId || !title || !message) return res.status(400).json({ error: 'batchId, title, and message are required' });

    const students = await studentsDb.findByBatch(batchId);
    if (!students.length) return res.json({ sent: 0 });

    await notificationsDb.insertMany(students.map(s => ({
      recipient_id:   s.id,
      recipient_type: 'Student',
      type:           'announcement',
      title,
      message
    })));

    res.json({ sent: students.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications - admin sends notification
router.post('/', requireLecturer, async (req, res) => {
  try {
    const { recipient, recipientType, type, title, message } = req.body;
    const doc = await notificationsDb.create({
      recipient_id: recipient,
      recipient_type: recipientType,
      type, title, message
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
