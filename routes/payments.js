const express = require('express');
const https = require('https');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const { requireAuth } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');
const { sendMail } = require('../utils/mailer');
const { receiptEmail } = require('../utils/emailTemplates');

const router = express.Router();

// ── GET /api/payments/me — student: own payments ───────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.student.id }).sort({ createdAt: -1 });
    const totalDue    = payments.reduce((s, p) => s + p.amountDue, 0);
    const totalPaid   = payments.reduce((s, p) => s + p.amountPaid, 0);
    const outstanding = totalDue - totalPaid;
    res.json({ data: payments, totalDue, totalPaid, outstanding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments — admin: list all ───────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, category, studentId, batchId, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status)    filter.status   = status;
    if (category)  filter.category = category;
    if (studentId) filter.student  = studentId;
    if (batchId)   filter.batch    = batchId;

    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Payment.find(filter)
        .populate('student', 'fullName email track cohort')
        .populate('batch', 'name number')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payment.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/student/:studentId — admin: student detail
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.params.studentId }).sort({ createdAt: 1 });
    const totalDue    = payments.reduce((s, p) => s + p.amountDue, 0);
    const totalPaid   = payments.reduce((s, p) => s + p.amountPaid, 0);
    res.json({ data: payments, totalDue, totalPaid, outstanding: totalDue - totalPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments — admin: create payment record ─────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { studentId, batchId, category, amountDue, amountPaid, method, reference, notes, dueDate } = req.body;
    if (!studentId || !category || !amountDue) {
      return res.status(400).json({ error: 'studentId, category, and amountDue are required' });
    }

    const doc = await Payment.findOneAndUpdate(
      { student: studentId, category },
      {
        student:    studentId,
        batch:      batchId || undefined,
        category,
        amountDue:  Number(amountDue),
        amountPaid: Number(amountPaid) || 0,
        dueDate:    dueDate ? new Date(dueDate) : undefined,
        method:     method    || '',
        reference:  reference || '',
        notes:      notes     || '',
        recordedBy: req.user.name || 'Admin'
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Trigger post-save hook manually (findOneAndUpdate bypasses hooks)
    await Payment.findById(doc._id).then(p => p.save());

    res.json({ success: true, payment: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/payments/:id — admin: single payment ─────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Payment.findById(req.params.id).populate('student', 'fullName email track');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/payments/:id — admin: update payment ───────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { amountPaid, method, reference, notes, status } = req.body;
    const doc = await Payment.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (amountPaid !== undefined) doc.amountPaid = Number(amountPaid);
    if (method    !== undefined)  doc.method     = method;
    if (reference !== undefined)  doc.reference  = reference;
    if (notes     !== undefined)  doc.notes      = notes;
    if (status    !== undefined)  doc.status     = status;
    doc.recordedBy = req.user.name || 'Admin';

    await doc.save(); // triggers pre-save status computation + post-save sync
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/payments/:id — admin ──────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/paystack — student: verify Paystack payment ──
router.post('/:id/paystack', requireStudent, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student) !== String(req.student.id))
      return res.status(403).json({ error: 'Forbidden' });

    // Verify with Paystack
    const psData = await new Promise((resolve, reject) => {
      const paystackReq = https.request({
        hostname: 'api.paystack.co',
        path: `/transaction/verify/${encodeURIComponent(reference)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }, (psRes) => {
        let body = '';
        psRes.on('data', c => body += c);
        psRes.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid Paystack response')); }
        });
      });
      paystackReq.on('error', reject);
      paystackReq.end();
    });

    if (!psData.data || psData.data.status !== 'success')
      return res.status(400).json({ error: 'Paystack verification failed' });
    if (psData.data.amount / 100 < payment.amountDue)
      return res.status(400).json({ error: 'Amount paid is less than amount due' });

    payment.amountPaid = payment.amountDue;
    payment.method = 'Paystack';
    payment.reference = reference;
    payment.recordedBy = 'Student (Paystack)';
    await payment.save();

    res.json({ payment, receiptNumber: payment.receiptNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/bank-transfer — student: submit bank transfer ref ──
router.post('/:id/bank-transfer', requireStudent, async (req, res) => {
  try {
    const { reference, notes } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student) !== String(req.student.id))
      return res.status(403).json({ error: 'Forbidden' });

    payment.method = 'Bank Transfer';
    payment.reference = reference;
    payment.notes = 'Awaiting confirmation — ref: ' + reference + (notes ? (' | ' + notes) : '');
    payment.recordedBy = 'Student (Bank Transfer)';
    await payment.save();

    res.json({ payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/email-receipt — admin: email receipt to student ──
router.post('/:id/email-receipt', requireAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('student', 'fullName email track');
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!payment.receiptNumber) return res.status(400).json({ error: 'No receipt generated yet' });

    const catLabels = {
      application_fee: 'Application Fee', tuition_month_1: 'Tuition Month 1',
      tuition_month_2: 'Tuition Month 2', tuition_month_3: 'Tuition Month 3',
      full_tuition_payment: 'Full Tuition Payment'
    };

    await sendMail({
      to: payment.student.email,
      subject: `Payment Receipt ${payment.receiptNumber} — Goallord Creativity Academy`,
      html: receiptEmail({
        receiptNumber: payment.receiptNumber,
        date: payment.receiptIssuedAt || payment.paidAt || new Date(),
        recipientName: payment.student.fullName,
        recipientEmail: payment.student.email,
        description: catLabels[payment.category] || payment.category,
        amount: payment.amountPaid,
        currency: '₦',
        method: payment.method || 'N/A',
        reference: payment.reference || 'N/A',
        issuedBy: 'Goallord Creativity Academy'
      })
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
