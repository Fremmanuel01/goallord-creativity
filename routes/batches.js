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

// GET /api/batches/active - optional ?track=<name> to scope to one track
router.get('/active', async (req, res) => {
  try {
    const { track } = req.query;
    const batch = track
      ? await batchesDb.findActiveByTrack(track)
      : await batchesDb.findActive();
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
    // The admin form sends `description` (legacy field name); the DB column is `notes`.
    // Accept either, write to `notes`.
    const { name, number, track, classDays, isActive, startDate, endDate, totalWeeks, description, notes } = req.body;

    // A program (track) may run MANY batches at once — Morning / Midday / Evening
    // are all active simultaneously. Creating an active batch must NOT deactivate
    // its siblings. (One student still belongs to exactly one batch via
    // students.batch_id — that rule is not enforced by limiting active batches.)

    const doc = {
      name,
      number,
      track,
      class_days:   classDays,
      is_active:    isActive || false,
      start_date:   startDate,
      end_date:     endDate,
      total_weeks:  totalWeeks,
      notes:        (notes !== undefined ? notes : (description !== undefined ? description : '')) || '',
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
    // Accept either `description` (legacy) or `notes`; DB column is `notes`.
    const { name, number, track, classDays, isActive, startDate, endDate, totalWeeks, description, notes } = req.body;

    // Activating a batch must NOT deactivate its same-program siblings: many
    // batches of the same program run concurrently. Each batch's active state
    // is independent.

    const update = {};
    if (name !== undefined)        update.name = name;
    if (number !== undefined)      update.number = number;
    if (track !== undefined)       update.track = track;
    if (classDays !== undefined)   update.class_days = classDays;
    if (isActive !== undefined)    update.is_active = isActive;
    if (startDate !== undefined)   update.start_date = startDate;
    if (endDate !== undefined)     update.end_date = endDate;
    if (totalWeeks !== undefined)  update.total_weeks = totalWeeks;
    if (notes !== undefined)            update.notes = notes;
    else if (description !== undefined) update.notes = description;

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
