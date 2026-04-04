const express         = require('express');
const notificationsDb = require('../db/notifications');
const studentsDb      = require('../db/students');
const { requireLecturer } = require('../middleware/lecturerAuth');
const { requireStudentAuth } = require('../middleware/studentAuth');

const router = express.Router();

// GET /api/notifications — returns notifications for the authenticated user
router.get('/', async (req, res) => {
  try {
    // Accept both student and lecturer tokens
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);

    const filter = { recipient_id: decoded.id };
    if (req.query.read !== undefined) filter.read = req.query.read === 'true';

    const docs = await notificationsDb.find(filter, 50);
    const unread = await notificationsDb.countUnread(decoded.id);
    res.json({ notifications: docs, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const jwt = require('jsonwebtoken');
    jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
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
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    await notificationsDb.markAllRead(decoded.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/announce — broadcast to all active students in a batch
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

// POST /api/notifications — admin sends notification
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
