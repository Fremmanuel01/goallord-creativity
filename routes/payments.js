const express = require('express');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const { requireAuth } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');

const router = express.Router();

// ── GET /api/payments/me — student: own history ────────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.student.id }).sort({ month: -1 });
    const totalDue   = payments.reduce((s, p) => s + p.amountDue, 0);
    const totalPaid  = payments.reduce((s, p) => s + p.amountPaid, 0);
    const outstanding = totalDue - totalPaid;
    res.json({ data: payments, totalDue, totalPaid, outstanding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/summary/:month — admin ───────────────────
router.get('/summary/:month', requireAuth, async (req, res) => {
  try {
    const { month } = req.params;
    const { cohort, track } = req.query;

    const studentFilter = { status: 'Active' };
    if (cohort) studentFilter.cohort = cohort;
    if (track)  studentFilter.track  = track;

    const [students, payments] = await Promise.all([
      Student.find(studentFilter).select('-password'),
      Payment.find({ month })
    ]);

    const paymentMap = {};
    payments.forEach(p => { paymentMap[p.student.toString()] = p; });

    const summary = students.map(s => {
      const pay = paymentMap[s._id.toString()];
      return {
        student:    { _id: s._id, fullName: s.fullName, email: s.email, cohort: s.cohort, track: s.track },
        paymentId:  pay ? pay._id : null,
        amountDue:  pay ? pay.amountDue  : 100000,
        amountPaid: pay ? pay.amountPaid : 0,
        status:     pay ? pay.status     : 'Unpaid',
        method:     pay ? pay.method     : '',
        reference:  pay ? pay.reference  : '',
        paidAt:     pay ? pay.paidAt     : null,
        notes:      pay ? pay.notes      : ''
      };
    });

    const totalDue  = summary.reduce((s, r) => s + r.amountDue, 0);
    const totalPaid = summary.reduce((s, r) => s + r.amountPaid, 0);

    res.json({ data: summary, month, totalDue, totalPaid, outstanding: totalDue - totalPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments — admin: list ───────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { month, status, studentId, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (month)     filter.month   = month;
    if (status)    filter.status  = status;
    if (studentId) filter.student = studentId;

    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Payment.find(filter).populate('student', 'fullName email cohort track').sort({ month: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      Payment.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments — admin: record/update payment ─────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { studentId, month, amountPaid, method, reference, notes } = req.body;
    if (!studentId || !month) return res.status(400).json({ error: 'studentId and month are required' });

    const paid = Number(amountPaid) || 0;
    let status = 'Unpaid';
    let paidAt;
    if (paid >= 100000) { status = 'Paid'; paidAt = new Date(); }
    else if (paid > 0)  { status = 'Partial'; }

    const doc = await Payment.findOneAndUpdate(
      { student: studentId, month },
      {
        student: studentId,
        month,
        amountPaid: paid,
        status,
        paidAt: paidAt || null,
        method:     method     || '',
        reference:  reference  || '',
        notes:      notes      || '',
        recordedBy: req.user.name || 'Admin'
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, payment: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/payments/student/:studentId — admin ──────────────
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const payments = await Payment.find({ student: req.params.studentId }).sort({ month: -1 });
    const totalDue   = payments.reduce((s, p) => s + p.amountDue, 0);
    const totalPaid  = payments.reduce((s, p) => s + p.amountPaid, 0);
    res.json({ data: payments, totalDue, totalPaid, outstanding: totalDue - totalPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/payments/:id — admin: edit record ──────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { amountPaid, method, reference, notes } = req.body;
    const doc = await Payment.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (amountPaid !== undefined) doc.amountPaid = Number(amountPaid);
    if (method    !== undefined)  doc.method     = method;
    if (reference !== undefined)  doc.reference  = reference;
    if (notes     !== undefined)  doc.notes      = notes;
    doc.recordedBy = req.user.name || 'Admin';

    await doc.save(); // triggers pre-save status computation
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
