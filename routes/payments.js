const express = require('express');
const https = require('https');
const paymentsDb = require('../db/payments');
const studentsDb = require('../db/students');
const notificationsDb = require('../db/notifications');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');
const { sendMail } = require('../utils/mailer');
const { receiptEmail, paymentReminderEmail, suspensionEmail, reactivationEmail } = require('../utils/emailTemplates');

const router = express.Router();

// ── GET /api/payments/me — student: own payments ───────────────
router.get('/me', requireStudent, async (req, res) => {
  try {
    const payments = await paymentsDb.findByStudent(req.student.id);
    const totalDue    = payments.reduce((s, p) => s + (p.amount_due || 0), 0);
    const totalPaid   = payments.reduce((s, p) => s + (p.amount_paid || 0), 0);
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
    if (studentId) filter.student_id = studentId;
    if (batchId)   filter.batch_id   = batchId;

    const { data: docs, count: total } = await paymentsDb.find({
      filter,
      populate: 'all',
      sort: '-created_at',
      page: Number(page),
      limit: Number(limit)
    });
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payments/student/:studentId — admin: student detail
router.get('/student/:studentId', requireAuth, async (req, res) => {
  try {
    const payments = await paymentsDb.findByStudent(req.params.studentId);
    const totalDue    = payments.reduce((s, p) => s + (p.amount_due || 0), 0);
    const totalPaid   = payments.reduce((s, p) => s + (p.amount_paid || 0), 0);
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

    const saved = await paymentsDb.upsert({
      student_id:  studentId,
      category,
      batch_id:    batchId || null,
      amount_due:  Number(amountDue),
      amount_paid: Number(amountPaid) || 0,
      due_date:    dueDate ? new Date(dueDate).toISOString() : null,
      method:      method    || '',
      reference:   reference || '',
      notes:       notes     || '',
      recorded_by: req.user.name || 'Admin'
    });

    checkAutoReactivate(saved.student_id).catch(() => {});

    res.json({ success: true, payment: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/payments/:id — admin: single payment ─────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data: docs } = await paymentsDb.find({
      filter: { id: req.params.id },
      populate: 'student'
    });
    const doc = docs[0];
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
    const update = {};
    if (amountPaid !== undefined) update.amount_paid = Number(amountPaid);
    if (method    !== undefined)  update.method      = method;
    if (reference !== undefined)  update.reference   = reference;
    if (notes     !== undefined)  update.notes       = notes;
    if (status    !== undefined)  update.status      = status;
    update.recorded_by = req.user.name || 'Admin';

    const doc = await paymentsDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    checkAutoReactivate(doc.student_id).catch(() => {});
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/payments/:id — admin only ─────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await paymentsDb.remove(req.params.id);
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

    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student_id) !== String(req.student.id))
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
    if (psData.data.amount / 100 < payment.amount_due)
      return res.status(400).json({ error: 'Amount paid is less than amount due' });

    const updated = await paymentsDb.update(req.params.id, {
      amount_paid: payment.amount_due,
      method: 'Paystack',
      reference,
      recorded_by: 'Student (Paystack)'
    });

    checkAutoReactivate(payment.student_id).catch(() => {});
    res.json({ payment: updated, receiptNumber: updated.receipt_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/bank-transfer — student: submit bank transfer ref ──
router.post('/:id/bank-transfer', requireStudent, async (req, res) => {
  try {
    const { reference, notes } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student_id) !== String(req.student.id))
      return res.status(403).json({ error: 'Forbidden' });

    const updated = await paymentsDb.update(req.params.id, {
      method: 'Bank Transfer',
      reference,
      notes: 'Awaiting confirmation — ref: ' + reference + (notes ? (' | ' + notes) : ''),
      recorded_by: 'Student (Bank Transfer)'
    });

    res.json({ payment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/email-receipt — admin: email receipt to student ──
router.post('/:id/email-receipt', requireAuth, async (req, res) => {
  try {
    const { data: docs } = await paymentsDb.find({
      filter: { id: req.params.id },
      populate: 'student'
    });
    const payment = docs[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!payment.receipt_number) return res.status(400).json({ error: 'No receipt generated yet' });

    const catLabels = {
      application_fee: 'Application Fee', tuition_month_1: 'Tuition Month 1',
      tuition_month_2: 'Tuition Month 2', tuition_month_3: 'Tuition Month 3',
      full_tuition_payment: 'Full Tuition Payment'
    };

    await sendMail({
      to: payment.student.email,
      subject: `Payment Receipt ${payment.receipt_number} — Goallord Creativity Academy`,
      html: receiptEmail({
        receiptNumber: payment.receipt_number,
        date: payment.receipt_issued_at || payment.paid_at || new Date(),
        recipientName: payment.student.full_name,
        recipientEmail: payment.student.email,
        description: catLabels[payment.category] || payment.category,
        amount: payment.amount_paid,
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

// ── POST /api/payments/:id/remind — admin: send payment reminder ──
router.post('/:id/remind', requireAuth, async (req, res) => {
  try {
    const { data: docs } = await paymentsDb.find({
      filter: { id: req.params.id },
      populate: 'student'
    });
    const payment = docs[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (!payment.student) return res.status(400).json({ error: 'No student linked' });

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';
    const isOverdue = payment.status === 'overdue' || (payment.due_date && new Date(payment.due_date) < new Date());

    await sendMail({
      to:      payment.student.email,
      subject: isOverdue
        ? `OVERDUE: Payment required — Goallord Creativity Academy`
        : `Payment reminder — Goallord Creativity Academy`,
      html: paymentReminderEmail({
        fullName:  payment.student.full_name,
        category:  payment.category,
        amountDue: payment.amount_due,
        dueDate:   payment.due_date || new Date(),
        isOverdue,
        loginUrl
      })
    });

    await paymentsDb.update(req.params.id, { reminder_sent_at: new Date().toISOString() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/run-overdue-check — admin: mark overdue + send reminders ──
router.post('/run-overdue-check', requireAuth, async (req, res) => {
  try {
    const result = await runOverdueCheck();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-reactivate a suspended student when all payments are fully settled
async function checkAutoReactivate(studentId) {
  try {
    const payments = await paymentsDb.findByStudent(studentId);
    if (!payments.length) return;
    const allPaid = payments.every(p => ['paid', 'fully_paid'].includes(p.status));
    if (!allPaid) return;

    const student = await studentsDb.findById(studentId);
    if (!student || student.status !== 'Suspended') return;

    await studentsDb.update(studentId, { status: 'Active' });

    const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    sendMail({
      to:      student.email,
      subject: 'Account reactivated — Goallord Creativity Academy',
      html:    reactivationEmail({ fullName: student.full_name, loginUrl })
    }).catch(e => console.error('Reactivation email failed:', e.message));

    notificationsDb.create({
      recipient_id:   studentId,
      recipient_type: 'Student',
      type:           'account_reactivated',
      title:          'Account Reactivated',
      message:        'Your outstanding payment has been confirmed. Your account is now active again. Welcome back!',
      link:           loginUrl
    }).catch(e => console.error('Reactivation notification failed:', e.message));

    console.log(`[Auto-reactivate] Student ${studentId} reactivated`);
  } catch (e) {
    console.error('checkAutoReactivate failed:', e.message);
  }
}

// Shared overdue check logic (called by scheduler and admin endpoint)
async function runOverdueCheck() {
  const now             = new Date();
  const in3days         = new Date(now.getTime() + 3  * 24 * 60 * 60 * 1000);
  const suspendCutoff   = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const loginUrl        = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';
  const catLabel = { application_fee: 'Application Fee', tuition_month_1: 'Tuition Month 1', tuition_month_2: 'Tuition Month 2', tuition_month_3: 'Tuition Month 3', full_tuition_payment: 'Full Tuition Payment' };
  let markedOverdue = 0, remindersSent = 0, suspended = 0;

  // 1. Mark pending/partially_paid payments past due date as overdue
  const { data: overduePayments } = await paymentsDb.find({
    inFilter: { status: ['pending', 'partially_paid'] },
    ltFilter: { due_date: now.toISOString() },
    populate: 'student'
  });

  for (const p of overduePayments) {
    // Recompute status via update (triggers computePaymentStatus)
    await paymentsDb.update(p.id, { amount_paid: p.amount_paid });
    markedOverdue++;

    // Email student
    if (p.student?.email) {
      sendMail({
        to:      p.student.email,
        subject: `OVERDUE: Payment required — Goallord Creativity Academy`,
        html:    paymentReminderEmail({ fullName: p.student.full_name, category: p.category, amountDue: p.amount_due, dueDate: p.due_date, isOverdue: true, loginUrl })
      }).catch(e => console.error('Overdue email failed:', e.message));
    }

    // In-app notification
    if (p.student?.id) {
      const dueDateStr = new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      notificationsDb.create({
        recipient_id:   p.student.id,
        recipient_type: 'Student',
        type:           'payment_overdue',
        title:          'Payment Overdue',
        message:        `Your ${catLabel[p.category] || p.category} of ₦${p.amount_due.toLocaleString()} was due on ${dueDateStr}. Please settle this immediately to avoid suspension.`,
        link:           loginUrl
      }).catch(e => console.error('Overdue notification failed:', e.message));
    }
  }

  // 2. Send reminder emails for payments due in the next 3 days (not yet reminded today)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: upcomingPayments } = await paymentsDb.find({
    inFilter:  { status: ['pending', 'partially_paid'] },
    gteFilter: { due_date: now.toISOString() },
    lteFilter: { due_date: in3days.toISOString() },
    orFilter:  `reminder_sent_at.is.null,reminder_sent_at.lt.${oneDayAgo}`,
    populate:  'student'
  });

  for (const p of upcomingPayments) {
    if (!p.student?.email) continue;
    sendMail({
      to:      p.student.email,
      subject: `Reminder: Payment due soon — Goallord Creativity Academy`,
      html:    paymentReminderEmail({ fullName: p.student.full_name, category: p.category, amountDue: p.amount_due, dueDate: p.due_date, isOverdue: false, loginUrl })
    }).catch(e => console.error('Reminder email failed:', e.message));

    const dueDateStr = new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    notificationsDb.create({
      recipient_id:   p.student.id,
      recipient_type: 'Student',
      type:           'payment_reminder',
      title:          'Payment Due Soon',
      message:        `Your ${catLabel[p.category] || p.category} of ₦${p.amount_due.toLocaleString()} is due on ${dueDateStr}. Log in to pay now.`,
      link:           loginUrl
    }).catch(e => console.error('Reminder notification failed:', e.message));

    await paymentsDb.update(p.id, { reminder_sent_at: new Date().toISOString() });
    remindersSent++;
  }

  // 3. Auto-suspend students whose payments have been overdue for ≥14 days
  const { data: longOverdue } = await paymentsDb.find({
    filter:   { status: 'overdue' },
    ltFilter: { due_date: suspendCutoff.toISOString() },
    populate: 'student'
  });

  const toSuspend = new Map();
  for (const p of longOverdue) {
    if (p.student && p.student.status === 'Active') {
      toSuspend.set(String(p.student.id), p.student);
    }
  }

  for (const [studentId, student] of toSuspend) {
    await studentsDb.update(studentId, { status: 'Suspended' });

    sendMail({
      to:      student.email,
      subject: 'Account suspended — Goallord Creativity Academy',
      html:    suspensionEmail({ fullName: student.full_name, loginUrl })
    }).catch(e => console.error('Suspension email failed:', e.message));

    notificationsDb.create({
      recipient_id:   studentId,
      recipient_type: 'Student',
      type:           'account_suspended',
      title:          'Account Suspended',
      message:        'Your account has been suspended due to an overdue payment. Please log in and settle your balance to reactivate.',
      link:           loginUrl
    }).catch(e => console.error('Suspension notification failed:', e.message));

    suspended++;
  }

  console.log(`[Overdue Check] Marked overdue: ${markedOverdue}, Reminders sent: ${remindersSent}, Suspended: ${suspended}`);
  return { markedOverdue, remindersSent, suspended };
}

module.exports = router;
module.exports.runOverdueCheck    = runOverdueCheck;
module.exports.checkAutoReactivate = checkAutoReactivate;
