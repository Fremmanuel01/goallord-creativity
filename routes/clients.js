const express = require('express');
const Client = require('../models/Client');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const router = express.Router();

const clientLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many submissions.' } });

// POST /api/clients — public (contact form)
router.post('/', clientLimiter, async (req, res) => {
  try {
    const { name, email, phone, company, service, budget, timeline, message } = req.body;
    const client = await Client.create({
      name:     xss(name || ''),
      email:    xss(email || ''),
      phone:    xss(phone || ''),
      company:  xss(company || ''),
      service:  xss(service || ''),
      budget:   xss(budget || ''),
      timeline: xss(timeline || ''),
      message:  xss(message || ''),
      source:   'Contact Form'
    });
    res.status(201).json({ success: true, id: client._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/clients — protected
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ name: re }, { email: re }, { company: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Client.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Client.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id — protected
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;
    const doc = await Client.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
