const express  = require('express');
const router   = express.Router();
const Contact  = require('../models/Contact');
const { requireAuth } = require('../middleware/auth');
const { sendMail }    = require('../utils/mailer');
const { adminContactEmail, contactAutoReplyEmail, contactReplyEmail } = require('../utils/emailTemplates');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Too many submissions. Please try again in an hour.' }
});

// Email regex (RFC 5322 simplified)
function isValidEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(email);
}

// POST /api/contacts — public (website contact form)
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, service, budget, message, website } = req.body;

    // Honeypot check — 'website' field is hidden, bots fill it
    if (website) return res.status(200).json({ message: 'Thank you!' }); // silent reject

    // Required fields
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    // Length validation
    if (name.length > 100) return res.status(400).json({ error: 'Name is too long.' });
    if (email.length > 150) return res.status(400).json({ error: 'Email is too long.' });
    if (message && message.length > 2000) return res.status(400).json({ error: 'Message is too long (max 2000 characters).' });

    // Email format
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    // Sanitize inputs
    const sanitized = {
        name: xss(name.trim()),
        email: email.toLowerCase().trim(),
        service: xss((service || '').trim()),
        budget: xss((budget || '').trim()),
        message: xss((message || '').trim()),
        source: 'Contact Form'
    };

    const contact = await Contact.create(sanitized);

    const host = process.env.HOST || 'https://goallordcreativity.com';

    // Notify admin
    sendMail({
      to:      process.env.EMAIL_FROM || 'hello@goallordcreativity.com',
      subject: `New Contact: ${sanitized.name} — ${sanitized.service || 'General Enquiry'}`,
      html:    adminContactEmail({ name: sanitized.name, email: sanitized.email, service: sanitized.service, budget: sanitized.budget, message: sanitized.message, dashboardUrl: `${host}/dashboard.html` })
    }).catch(e => console.error('Contact admin email failed:', e.message));

    // Auto-reply to sender
    sendMail({
      to:      sanitized.email,
      subject: 'We received your message — Goallord Creativity',
      html:    contactAutoReplyEmail({ name: sanitized.name })
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
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
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

    contact.replies.push({ body: xss(body.trim()), sentBy: req.user.name || 'Admin' });
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
