const express = require('express');
const https = require('https');
const paymentsDb = require('../db/payments');
const studentsDb = require('../db/students');
const notificationsDb = require('../db/notifications');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireStudent } = require('../middleware/studentAuth');
const { sendMail } = require('../utils/mailer');
const { sendSms } = require('../utils/sms');
const { receiptEmail, paymentReminderEmail, suspensionEmail, reactivationEmail, paymentRetryEmail, proformaInvoiceEmail } = require('../utils/emailTemplates');
const supabase = require('../lib/supabase');

const router = express.Router();

const CAT_LABELS = {
  application_fee: 'Application Fee', tuition_month_1: 'Tuition Month 1',
  tuition_month_2: 'Tuition Month 2', tuition_month_3: 'Tuition Month 3',
  full_tuition_payment: 'Full Tuition Payment'
};

// Sequential proforma invoice number, e.g. PRO-2026-0001
async function generateProformaNumber() {
  const { count } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .not('proforma_number', 'is', null);
  return 'PRO-' + new Date().getFullYear() + '-' + String((count || 0) + 1).padStart(4, '0');
}

// ── GET /api/payments/me - student: own payments ───────────────
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

// ── GET /api/payments - admin: list all ───────────────────────
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

// ── GET /api/payments/student/:studentId - admin: student detail
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

// ── POST /api/payments - admin: create payment record ─────────
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

// ── GET /api/payments/:id - admin: single payment ─────────────
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

// ── PATCH /api/payments/:id - admin: update payment ───────────
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

// ── DELETE /api/payments/:id - admin only ─────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await paymentsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/paystack - student: verify Paystack payment ──
router.post('/:id/paystack', requireStudent, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference is required' });

    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student_id) !== String(req.student.id))
      return res.status(403).json({ error: 'Forbidden' });

    // Idempotency #1: if this payment is already settled, return success
    // without re-verifying or re-crediting. Safe to call repeatedly.
    if (Number(payment.amount_paid || 0) >= Number(payment.amount_due || 0)) {
      return res.json({ payment, receiptNumber: payment.receipt_number, alreadyPaid: true });
    }

    // Idempotency #2: a Paystack reference may only ever settle ONE payment
    // row. Reject replay of a reference already attached to another payment.
    const { data: dupRows } = await supabase
      .from('payments').select('id').eq('reference', reference).neq('id', req.params.id).limit(1);
    if (dupRows && dupRows.length) {
      return res.status(409).json({ error: 'This payment reference has already been used.' });
    }

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

    const verifyOk = psData.data && psData.data.status === 'success';
    const amountOk = verifyOk && (psData.data.amount / 100 >= payment.amount_due);

    if (!verifyOk || !amountOk) {
      // Payment didn't complete - nudge the student to retry (best effort, once).
      sendPaymentRetry(payment).catch(e => console.error('Retry email failed:', e.message));
      return res.status(400).json({
        error: verifyOk ? 'Amount paid is less than amount due' : 'Paystack verification failed',
        retry: true
      });
    }

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

// Send a "your payment didn't go through" email to the payment's student.
// Throttled to once per hour per payment so repeated failed attempts don't spam.
async function sendPaymentRetry(payment) {
  const student = await studentsDb.findById(payment.student_id).catch(() => null);
  if (!student || !student.email) return;
  const lastSent = payment.retry_email_sent_at ? new Date(payment.retry_email_sent_at).getTime() : 0;
  if (Date.now() - lastSent < 60 * 60 * 1000) return; // throttle: 1/hour
  const loginUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';
  await sendMail({
    to: student.email,
    subject: 'Your payment didn\'t go through - Goallord Creativity Academy',
    html: paymentRetryEmail({
      fullName: student.full_name, category: payment.category,
      amountDue: payment.amount_due, loginUrl
    })
  });
  await paymentsDb.update(payment.id, { retry_email_sent_at: new Date().toISOString() });
}

// ── POST /api/payments/:id/bank-transfer - student: submit bank transfer ref ──
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
      notes: 'Awaiting confirmation - ref: ' + reference + (notes ? (' | ' + notes) : ''),
      recorded_by: 'Student (Bank Transfer)'
    });

    res.json({ payment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/cash - student: record cash payment, awaits admin confirm ──
router.post('/:id/cash', requireStudent, async (req, res) => {
  try {
    const { collectedBy, notes } = req.body || {};

    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (String(payment.student_id) !== String(req.student.id))
      return res.status(403).json({ error: 'Forbidden' });

    const cashRef = 'CASH-' + Date.now() + '-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const stamp = new Date().toISOString();
    const collected = (collectedBy || '').toString().trim().slice(0, 80);
    const note = (notes || '').toString().trim().slice(0, 280);
    const noteLine = `Cash payment - awaiting admin confirmation` +
      (collected ? ` | collected by: ${collected}` : '') +
      (note ? ` | notes: ${note}` : '') +
      ` | submitted ${stamp}`;

    const updated = await paymentsDb.update(req.params.id, {
      method: 'Cash',
      reference: cashRef,
      notes: noteLine,
      recorded_by: 'Student (Cash)'
    });

    res.json({ payment: updated, reference: cashRef });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/confirm-cash - admin: approve cash payment ──
router.post('/:id/confirm-cash', requireAuth, async (req, res) => {
  try {
    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Only confirm rows that are still cash-pending (method=Cash and not yet fully paid).
    const isCashRow = String(payment.method || '').toLowerCase() === 'cash';
    const alreadyPaid = Number(payment.amount_paid || 0) >= Number(payment.amount_due || 0);
    if (!isCashRow) return res.status(400).json({ error: 'Payment is not marked as Cash' });
    if (alreadyPaid)  return res.status(400).json({ error: 'Payment already fully paid' });

    const adminLabel = (req.user && (req.user.name || req.user.email)) || 'Admin';
    const confirmStamp = new Date().toISOString();
    const newNotes = (payment.notes ? payment.notes + ' | ' : '') +
      `confirmed by ${adminLabel} at ${confirmStamp}`;

    const updated = await paymentsDb.update(req.params.id, {
      amount_paid: payment.amount_due,
      method: 'Cash',
      notes: newNotes,
      recorded_by: adminLabel + ' (Cash confirm)'
    });

    // Trigger auto-reactivate if applicable (same path as Paystack flow)
    checkAutoReactivate(payment.student_id).catch(() => {});
    res.json({ payment: updated, receiptNumber: updated.receipt_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/confirm-bank-transfer - admin: confirm a bank transfer ──
router.post('/:id/confirm-bank-transfer', requireAuth, async (req, res) => {
  try {
    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (Number(payment.amount_paid || 0) >= Number(payment.amount_due || 0)) {
      return res.status(400).json({ error: 'Payment already fully paid' });
    }

    const adminLabel = (req.user && (req.user.name || req.user.email)) || 'Admin';
    const stamp = new Date().toISOString();
    const newNotes = (payment.notes ? payment.notes + ' | ' : '') +
      `bank transfer confirmed by ${adminLabel} at ${stamp}`;

    const updated = await paymentsDb.update(req.params.id, {
      amount_paid: payment.amount_due,
      method: 'Bank Transfer',
      notes: newNotes,
      recorded_by: adminLabel + ' (Bank Transfer confirm)'
    });

    checkAutoReactivate(payment.student_id).catch(() => {});

    // Notify the student: email receipt + SMS confirmation (both best-effort).
    const student = await studentsDb.findById(payment.student_id).catch(() => null);
    if (student) {
      const label = CAT_LABELS[payment.category] || payment.category;
      if (student.email && updated.receipt_number) {
        sendMail({
          to: student.email,
          subject: `Payment Receipt ${updated.receipt_number} - Goallord Creativity Academy`,
          html: receiptEmail({
            receiptNumber: updated.receipt_number,
            date: updated.receipt_issued_at || updated.paid_at || new Date(),
            recipientName: student.full_name, recipientEmail: student.email,
            description: label, amount: updated.amount_paid, currency: '₦',
            method: 'Bank Transfer', reference: updated.reference || 'N/A',
            issuedBy: 'Goallord Creativity Academy'
          })
        }).catch(e => console.error('Bank-transfer receipt email failed:', e.message));
      }
      if (student.phone) {
        sendSms({
          to: student.phone,
          text: `Goallord: your bank transfer of N${Number(updated.amount_paid).toLocaleString()} for ${label} is confirmed. Receipt ${updated.receipt_number || ''}. Thank you!`
        }).then(r => {
          if (r.sent) paymentsDb.update(req.params.id, { confirmation_sms_sent_at: new Date().toISOString() }).catch(() => {});
        }).catch(e => console.error('Confirmation SMS failed:', e.message));
      }
    }

    res.json({ payment: updated, receiptNumber: updated.receipt_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/proforma - admin: issue a proforma invoice (corporate) ──
router.post('/:id/proforma', requireAuth, async (req, res) => {
  try {
    const { companyName, companyAddress, contactEmail, contactName } = req.body || {};
    const payment = await paymentsDb.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const student = await studentsDb.findById(payment.student_id).catch(() => null);
    const recipientEmail = (contactEmail || (student && student.email) || '').trim();
    if (!recipientEmail) return res.status(400).json({ error: 'No recipient email - provide contactEmail.' });

    // Reuse the existing number if a proforma was already issued for this row.
    const proformaNumber = payment.proforma_number || await generateProformaNumber();
    const issuedAt = new Date().toISOString();
    const label = CAT_LABELS[payment.category] || payment.category;
    const payUrl = (process.env.HOST || 'https://goallordcreativity.com') + '/student-login.html';

    await sendMail({
      to: recipientEmail,
      subject: `Proforma Invoice ${proformaNumber} - Goallord Creativity Academy`,
      html: proformaInvoiceEmail({
        proformaNumber, date: issuedAt,
        companyName: companyName || '', companyAddress: companyAddress || '',
        studentName: (student && student.full_name) || contactName || '',
        description: label, amount: payment.amount_due, currency: '₦',
        dueDate: payment.due_date, payUrl
      })
    });

    const updated = await paymentsDb.update(req.params.id, {
      proforma_number: proformaNumber,
      proforma_issued_at: issuedAt,
      company_name: companyName || payment.company_name || null,
      company_address: companyAddress || payment.company_address || null
    });

    res.json({ success: true, proformaNumber, sentTo: recipientEmail, payment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/:id/email-receipt - admin: email receipt to student ──
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
      subject: `Payment Receipt ${payment.receipt_number} - Goallord Creativity Academy`,
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

// ── POST /api/payments/:id/remind - admin: send payment reminder ──
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
        ? `OVERDUE: Payment required - Goallord Creativity Academy`
        : `Payment reminder - Goallord Creativity Academy`,
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

// ── POST /api/payments/run-overdue-check - admin: mark overdue + send reminders ──
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
      subject: 'Account reactivated - Goallord Creativity Academy',
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
        subject: `OVERDUE: Payment required - Goallord Creativity Academy`,
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
      subject: `Reminder: Payment due soon - Goallord Creativity Academy`,
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
      subject: 'Account suspended - Goallord Creativity Academy',
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
