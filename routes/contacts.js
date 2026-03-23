const express  = require('express');
const router   = express.Router();
const Contact  = require('../models/Contact');
const { requireAuth } = require('../middleware/auth');
const { sendMail }    = require('../utils/mailer');
const { adminContactEmail, contactAutoReplyEmail, contactReplyEmail } = require('../utils/emailTemplates');

// POST /api/contacts — public (website contact form)
router.post('/', async (req, res) => {
  try {
    const { name, email, service, budget, message } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const contact = await Contact.create({ name, email, service, budget, message, source: 'Contact Form' });

    const host = process.env.HOST || 'https://goallordcreativity.com';

    // Notify admin
    sendMail({
      to:      process.env.EMAIL_FROM || 'hello@goallordcreativity.com',
      subject: `New Contact: ${name} — ${service || 'General Enquiry'}`,
      html:    adminContactEmail({ name, email, service, budget, message, dashboardUrl: `${host}/dashboard.html` })
    }).catch(e => console.error('Contact admin email failed:', e.message));

    // Auto-reply to sender
    sendMail({
      to:      email,
      subject: 'We received your message — Goallord Creativity',
      html:    contactAutoReplyEmail({ name })
    }).catch(e => console.error('Contact auto-reply failed:', e.message));

    res.status(201).json({ success: true, id: contact._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts — protected
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ name: re }, { email: re }, { message: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Contact.countDocuments(filter)
    ]);
    res.json({ data: docs, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });
    if (contact.status === 'New') { contact.status = 'Read'; await contact.save(); }
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/:id/reply — protected
router.post('/:id/reply', requireAuth, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Reply body is required.' });

    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    contact.replies.push({ body, sentBy: req.user.name || 'Admin' });
    contact.status = 'Replied';
    await contact.save();

    await sendMail({
      to:      contact.email,
      subject: `Re: Your message to Goallord Creativity`,
      html:    contactReplyEmail({ name: contact.name, replyBody: body })
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id — protected (update status)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!contact) return res.status(404).json({ error: 'Not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
