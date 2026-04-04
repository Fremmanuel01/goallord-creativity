const express = require('express');
const batchesDb = require('../db/batches');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/batches
router.get('/', requireAuth, async (req, res) => {
  try {
    const batches = await batchesDb.findAll();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batches/active
router.get('/active', async (req, res) => {
  try {
    const batch = await batchesDb.findActive();
    if (!batch) return res.status(404).json({ error: 'No active batch' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batches/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const batch = await batchesDb.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Not found' });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batches
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, number, track, classDays, isActive, startDate, endDate, totalWeeks, description } = req.body;
    const doc = {
      name,
      number,
      track,
      class_days:   classDays,
      is_active:    isActive || false,
      start_date:   startDate,
      end_date:     endDate,
      total_weeks:  totalWeeks,
      description:  description || '',
      created_by:   req.user.id
    };
    const batch = await batchesDb.create(doc);
    res.status(201).json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batches/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { name, number, track, classDays, isActive, startDate, endDate, totalWeeks, description } = req.body;

    // If setting isActive=true, deactivate all others first
    if (isActive === true) {
      // Deactivate all batches, then activate this one
      const allBatches = await batchesDb.findAll();
      for (const b of allBatches) {
        if (b.id !== req.params.id && b.is_active) {
          await batchesDb.update(b.id, { is_active: false });
        }
      }
    }

    const update = {};
    if (name !== undefined)        update.name = name;
    if (number !== undefined)      update.number = number;
    if (track !== undefined)       update.track = track;
    if (classDays !== undefined)   update.class_days = classDays;
    if (isActive !== undefined)    update.is_active = isActive;
    if (startDate !== undefined)   update.start_date = startDate;
    if (endDate !== undefined)     update.end_date = endDate;
    if (totalWeeks !== undefined)  update.total_weeks = totalWeeks;
    if (description !== undefined) update.description = description;

    const batch = await batchesDb.update(req.params.id, update);
    if (!batch) return res.status(404).json({ error: 'Not found' });
    res.json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/batches/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await batchesDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
