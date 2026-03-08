const express = require('express');
const Batch   = require('../models/Batch');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/batches
router.get('/', requireAuth, async (req, res) => {
  try {
    const batches = await Batch.find().sort({ number: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batches/active
router.get('/active', async (req, res) => {
  try {
    const batch = await Batch.findOne({ isActive: true });
    if (!batch) return res.status(404).json({ error: 'No active batch' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batches/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batches
router.post('/', requireAuth, async (req, res) => {
  try {
    const batch = await Batch.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batches/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    // If setting isActive=true, deactivate all others first
    if (req.body.isActive === true) {
      await Batch.updateMany({ _id: { $ne: req.params.id } }, { isActive: false });
    }
    const batch = await Batch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!batch) return res.status(404).json({ error: 'Not found' });
    res.json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/batches/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Batch.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
