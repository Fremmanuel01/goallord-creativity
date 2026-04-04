const express   = require('express');
const clientsDb = require('../db/clients');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const router = express.Router();

const clientLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: 'Too many submissions.' } });

// POST /api/clients — public (contact form)
router.post('/', clientLimiter, async (req, res) => {
  try {
    const { name, email, phone, company, service, budget, timeline, message } = req.body;
    const client = await clientsDb.create({
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
    res.status(201).json({ success: true, id: client.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/clients — protected
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;

    const supabase = require('../lib/supabase');
    let q = supabase.from('clients').select('*', { count: 'exact' });
    if (status) q = q.eq('status', status);
    if (search) {
      q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }
    q = q.order('created_at', { ascending: false });
    const skip = (Number(page) - 1) * Number(limit);
    q = q.range(skip, skip + Number(limit) - 1);
    const { data: docs, count: total, error } = await q;
    if (error) throw error;
    res.json({ data: docs || [], total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await clientsDb.findById(req.params.id);
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
    const doc = await clientsDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await clientsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
