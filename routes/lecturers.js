const express  = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const Lecturer  = require('../models/Lecturer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/lecturers/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const lecturer = await Lecturer.findOne({ email: email.toLowerCase() });
    if (!lecturer) return res.status(401).json({ error: 'Invalid credentials' });
    if (lecturer.status === 'Inactive') return res.status(403).json({ error: 'Account inactive' });

    const match = await bcrypt.compare(password, lecturer.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: lecturer._id, role: 'lecturer', fullName: lecturer.fullName, email: lecturer.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, lecturer: { _id: lecturer._id, fullName: lecturer.fullName, email: lecturer.email, specialization: lecturer.specialization, profilePicture: lecturer.profilePicture } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers
router.get('/', requireAuth, async (req, res) => {
  try {
    const lecturers = await Lecturer.find().select('-password').populate('batches', 'name number').sort({ createdAt: -1 });
    res.json(lecturers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lecturers/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const lecturer = await Lecturer.findById(req.params.id).select('-password').populate('batches', 'name number');
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(lecturer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lecturers
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fullName, email, password, phone, bio, specialization, batches, status } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    const lecturer = await Lecturer.create({
      fullName, email, password: hashed, phone, bio, specialization,
      batches: batches || [], status: status || 'Active',
      createdBy: req.user.id
    });
    res.status(201).json({ ...lecturer.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/lecturers/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 12);
    }
    const lecturer = await Lecturer.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!lecturer) return res.status(404).json({ error: 'Not found' });
    res.json(lecturer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/lecturers/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Lecturer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
