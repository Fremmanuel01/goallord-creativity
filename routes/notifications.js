const express      = require('express');
const Notification = require('../models/Notification');
const Student      = require('../models/Student');
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

    const filter = { recipient: decoded.id };
    if (req.query.read !== undefined) filter.read = req.query.read === 'true';

    const docs = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
    const unread = await Notification.countDocuments({ recipient: decoded.id, read: false });
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
    const doc = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
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
    await Notification.updateMany({ recipient: decoded.id, read: false }, { read: true });
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

    const students = await Student.find({ batch: batchId, status: 'Active' }).select('_id');
    if (!students.length) return res.json({ sent: 0 });

    await Notification.insertMany(students.map(s => ({
      recipient:     s._id,
      recipientType: 'Student',
      type:          'announcement',
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
    const doc = await Notification.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
