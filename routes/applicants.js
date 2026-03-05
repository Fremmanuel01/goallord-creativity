const express = require('express');
const Applicant = require('../models/Applicant');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/applicants — public (apply form)
router.post('/', async (req, res) => {
  try {
    const applicant = await Applicant.create(req.body);
    res.status(201).json({ success: true, id: applicant._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/applicants — protected (dashboard)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, track, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (track)  filter.track  = track;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ fullName: re }, { email: re }, { phone: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Applicant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Applicant.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applicants/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Applicant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/applicants/:id — protected (status, notes)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;
    const doc = await Applicant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/applicants/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Applicant.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
