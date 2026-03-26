const express  = require('express');
const crypto   = require('crypto');
const https    = require('https');
const bcrypt   = require('bcryptjs');
const Applicant = require('../models/Applicant');
const Student   = require('../models/Student');
const Batch     = require('../models/Batch');
const Payment   = require('../models/Payment');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail }    = require('../utils/mailer');
const { verificationEmail, acceptanceEmail, adminNewApplicationEmail, adminAcceptanceNotificationEmail } = require('../utils/emailTemplates');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const router = express.Router();

const applyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Too many applications. Please try again later.' }
});

function isValidEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(email);
}

// POST /api/applicants/upload-photo — public (applicant uploads profile photo before submission)
router.post('/upload-photo', async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    const multer = require('multer');
    const { CloudinaryStorage } = require('multer-storage-cloudinary');
    const storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'goallord/applicants',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }]
      }
    });
    const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } }).single('photo');
    upload(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      res.json({ url: req.file.path });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const TRACK_DURATION = {
  'Web Design':        '12 Weeks',
  'WordPress':         '12 Weeks',
  'Digital Marketing': '8 Weeks',
  'Brand Identity':    '12 Weeks',
  'Other':             '12 Weeks'
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = 'Gl' + new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

// POST /api/applicants — public (apply form)
router.post('/', applyLimiter, async (req, res) => {
  try {
    // Honeypot check
    if (req.body.website) return res.status(200).json({ message: 'Application received!' });

    // Extract fields explicitly (no spread)
    const { fullName, email, phone, location, track, experience, schedule, howFound, goal, why, background, profilePhoto } = req.body;

    // Validate required fields
    if (!fullName || fullName.trim().length < 2) return res.status(400).json({ error: 'Full name is required.' });
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
    if (phone && !/^[\d\s\-\+\(\)]{7,20}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number.' });

    // Sanitize all text fields
    const sanitized = {
        fullName: xss(fullName.trim()),
        email: email.toLowerCase().trim(),
        phone: xss((phone || '').trim()),
        location: xss((location || '').trim()),
        track: xss((track || '').trim()),
        experience: xss((experience || '').trim()),
        schedule: xss((schedule || '').trim()),
        howFound: xss((howFound || '').trim()),
        goal: xss((goal || '').trim()),
        why: xss((why || '').trim()),
        background: xss((background || '').trim()),
        profilePhoto: profilePhoto || ''
    };

    const emailLower = sanitized.email;

    // Block if already a student
    const existingStudent = await Student.findOne({ email: emailLower });
    if (existingStudent) {
      return res.status(409).json({ error: 'A student account already exists for this email. Please log in at the student portal.' });
    }

    // Block if already applied (and not rejected); if rejected, remove old record so they can reapply
    const existingApplicant = await Applicant.findOne({ email: emailLower });
    if (existingApplicant) {
      if (existingApplicant.status !== 'Rejected') {
        return res.status(409).json({
          error: existingApplicant.applicationFeePaid
            ? 'An account already exists for this email. Please log in at the student portal.'
            : 'An application with this email already exists. Check your inbox for the verification link, or contact admin if you need help.'
        });
      }
      // Rejected — remove old record so they can reapply cleanly
      await Applicant.deleteOne({ _id: existingApplicant._id });
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const applicant = await Applicant.create({
      ...sanitized,
      emailVerifyToken:   token,
      emailVerifyExpires: expires
    });

    const host      = process.env.HOST || `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${host}/api/applicants/verify/${token}`;

    try {
      await sendMail({
        to:      applicant.email,
        subject: 'Verify your email — Goallord Creativity Academy',
        html:    verificationEmail({ fullName: applicant.fullName, verifyUrl })
      });
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr.message);
    }

    // Notify admin of new application
    try {
      await sendMail({
        to:      process.env.EMAIL_FROM,
        subject: `New application: ${applicant.fullName} — ${applicant.track || 'No track'}`,
        html:    adminNewApplicationEmail({
          fullName:     applicant.fullName,
          email:        applicant.email,
          phone:        applicant.phone,
          track:        applicant.track,
          dashboardUrl: `${host}/dashboard.html`
        })
      });
    } catch (mailErr) {
      console.error('Admin notification failed:', mailErr.message);
    }

    res.status(201).json({ success: true, id: applicant._id, emailSent: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/applicants/verify/:token — public (email verification link)
router.get('/verify/:token', async (req, res) => {
  try {
    const applicant = await Applicant.findOne({
      emailVerifyToken:   req.params.token,
      emailVerifyExpires: { $gt: new Date() }
    });

    if (!applicant) {
      return res.status(400).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Link Expired</title>
<style>body{background:#0F1115;color:#F4F6FA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{max-width:420px;padding:40px;background:#171A21;border-radius:12px;border:1px solid #2A2F3A}
h2{color:#D66A1F;margin:0 0 16px}p{color:#A0A6B3;margin:0 0 24px}a{color:#D66A1F}</style></head>
<body><div class="box"><h2>Link Expired</h2><p>This verification link has expired or is invalid. Please submit a new application.</p>
<a href="/apply.html">Back to Apply</a></div></body></html>`);
    }

    applicant.emailVerified      = true;
    applicant.emailVerifyToken   = undefined;
    applicant.emailVerifyExpires = undefined;
    await applicant.save();

    // Redirect to payment page
    return res.redirect(`/apply-payment.html?id=${applicant._id}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: create student account from applicant ─────────────
// opts.reference    – payment reference string
// opts.method       – 'Paystack' | 'Bank Transfer'
// opts.tuitionPaid  – true = mark tuition as paid in same transaction
async function createStudentFromApplicant(applicant, paymentPlan, opts = {}) {
  const plainPassword = generatePassword();
  const hashed        = await bcrypt.hash(plainPassword, 12);
  const activeBatch   = await Batch.findOne({ isActive: true }).select('_id');
  const method        = opts.method    || (applicant.applicationFeeRef ? 'Bank Transfer' : 'Paystack');
  const reference     = opts.reference || applicant.applicationFeeRef || '';

  const student = await Student.create({
    fullName:           applicant.fullName,
    email:              applicant.email,
    password:           hashed,
    phone:              applicant.phone || '',
    track:              applicant.track || 'Other',
    batch:              activeBatch ? activeBatch._id : undefined,
    status:             'Active',
    applicantRef:       applicant._id,
    applicationFeePaid: true,
    paymentPlan:        paymentPlan === 'full' ? 'full_upfront' : 'monthly',
    profilePicture:     applicant.profilePhoto || ''
  });

  // Application fee — always paid
  const appFee = Number(process.env.APPLICATION_FEE) || 20000;
  await Payment.create({
    student:    student._id,
    batch:      activeBatch ? activeBatch._id : undefined,
    category:   'application_fee',
    amountDue:  appFee,
    amountPaid: appFee,
    method, reference,
    recordedBy: 'System',
    paidAt:     new Date()
  });

  // Tuition payment records
  const fullFee    = Number(process.env.FULL_TUITION_FEE)    || 150000;
  const monthlyFee = Number(process.env.MONTHLY_TUITION_FEE) || 60000;
  const now = new Date();

  if (paymentPlan === 'full') {
    // Full tuition — paid upfront in same transaction
    await Payment.create({
      student: student._id, batch: activeBatch ? activeBatch._id : undefined,
      category: 'full_tuition_payment', amountDue: fullFee,
      amountPaid: opts.tuitionPaid ? fullFee : 0,
      method:    opts.tuitionPaid ? method : '',
      reference: opts.tuitionPaid ? reference : '',
      paidAt:    opts.tuitionPaid ? new Date() : undefined,
      dueDate:   new Date(now.getFullYear(), now.getMonth() + 1, 1),
      recordedBy: 'System'
    });
  } else {
    // Monthly — 1st instalment paid now, 2nd and 3rd pending
    for (let i = 1; i <= 3; i++) {
      const isFirst = i === 1;
      await Payment.create({
        student: student._id, batch: activeBatch ? activeBatch._id : undefined,
        category: `tuition_month_${i}`, amountDue: monthlyFee,
        amountPaid: (opts.tuitionPaid && isFirst) ? monthlyFee : 0,
        method:    (opts.tuitionPaid && isFirst) ? method : '',
        reference: (opts.tuitionPaid && isFirst) ? reference : '',
        paidAt:    (opts.tuitionPaid && isFirst) ? new Date() : undefined,
        dueDate:   new Date(now.getFullYear(), now.getMonth() + i, 1),
        recordedBy: 'System'
      });
    }
  }

  // Send acceptance email with credentials
  const host     = process.env.HOST || 'https://goallordcreativity.com';
  const loginUrl = `${host}/student-login.html`;
  const duration = TRACK_DURATION[applicant.track] || '12 Weeks';

  await sendMail({
    to:      applicant.email,
    subject: `Welcome to Goallord Creativity Academy — Your Login Details`,
    html:    acceptanceEmail({ fullName: applicant.fullName, track: applicant.track || 'Other', duration, email: applicant.email, password: plainPassword, loginUrl })
  }).catch(e => console.error('Acceptance email failed:', e.message));

  await sendMail({
    to:      process.env.EMAIL_FROM,
    subject: `New Student Enrolled: ${applicant.fullName} — ${applicant.track || 'Other'}`,
    html:    adminAcceptanceNotificationEmail({ fullName: applicant.fullName, email: applicant.email, track: applicant.track || 'Other', studentId: student._id.toString(), dashboardUrl: `${host}/dashboard.html` })
  }).catch(e => console.error('Admin notification failed:', e.message));

  return student;
}

// GET /api/applicants/:id/payment-info — public (payment page fetches this)
router.get('/:id/payment-info', async (req, res) => {
  try {
    const { token } = req.query;
    const query = { _id: req.params.id };
    if (token) query.emailVerifyToken = token;
    else return res.status(401).json({ error: 'Verification token required' });

    const applicant = await Applicant.findOne(query).select('fullName email track emailVerified applicationFeePaid');
    if (!applicant) return res.status(404).json({ error: 'Not found or invalid token' });
    if (!applicant.emailVerified) return res.status(403).json({ error: 'Email not verified' });
    res.json({
      fullName:           applicant.fullName,
      email:              applicant.email,
      track:              applicant.track,
      applicationFeePaid: applicant.applicationFeePaid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/pay-application — public (Paystack app fee payment)
router.post('/:id/pay-application', async (req, res) => {
  try {
    const { reference, paymentPlan } = req.body;
    if (!reference || !paymentPlan) return res.status(400).json({ error: 'reference and paymentPlan are required' });

    const applicant = await Applicant.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (!applicant.emailVerified) return res.status(403).json({ error: 'Email not verified' });
    if (applicant.applicationFeePaid) return res.status(400).json({ error: 'Application fee already paid' });

    // Verify with Paystack
    const psData = await new Promise((resolve, reject) => {
      const psReq = https.request({
        hostname: 'api.paystack.co',
        path: `/transaction/verify/${encodeURIComponent(reference)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }, (psRes) => {
        let body = '';
        psRes.on('data', c => body += c);
        psRes.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid Paystack response')); } });
      });
      psReq.on('error', reject);
      psReq.end();
    });

    if (!psData.data || psData.data.status !== 'success')
      return res.status(400).json({ error: 'Payment verification failed. Please try again.' });

    const appFee     = Number(process.env.APPLICATION_FEE)    || 20000;
    const fullFee    = Number(process.env.FULL_TUITION_FEE)   || 150000;
    const monthlyFee = Number(process.env.MONTHLY_TUITION_FEE)|| 60000;
    const tuitionNow = paymentPlan === 'full' ? fullFee : monthlyFee;
    const totalExpected = appFee + tuitionNow;
    const amountPaid    = psData.data.amount / 100;

    if (amountPaid < totalExpected)
      return res.status(400).json({ error: `Amount paid (₦${amountPaid.toLocaleString()}) is less than required total (₦${totalExpected.toLocaleString()})` });

    // Mark fee paid
    applicant.applicationFeePaid = true;
    applicant.applicationFeeRef  = reference;
    applicant.status             = 'Accepted';
    await applicant.save();

    // Create student account — tuition also marked paid in same transaction
    const student = await createStudentFromApplicant(applicant, paymentPlan, {
      tuitionPaid: true, reference, method: 'Paystack'
    });

    // Fetch app fee payment for receipt number
    const appFeePayment = await Payment.findOne({ student: student._id, category: 'application_fee' });

    res.json({
      success: true,
      studentId: student._id,
      receipt: {
        receiptNumber:   appFeePayment ? appFeePayment.receiptNumber   : '',
        receiptIssuedAt: appFeePayment ? appFeePayment.receiptIssuedAt : new Date(),
        name:         applicant.fullName,
        email:        applicant.email,
        appFee,
        tuitionAmount: tuitionNow,
        tuitionLabel:  paymentPlan === 'full' ? 'Full Tuition Payment' : 'Tuition — 1st Instalment',
        totalAmount:   amountPaid,
        reference
      }
    });
  } catch (err) {
    console.error('pay-application error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/bank-transfer-fee — public (submit bank transfer ref, awaits admin confirm)
router.post('/:id/bank-transfer-fee', async (req, res) => {
  try {
    const { reference, paymentPlan } = req.body;
    if (!reference || !paymentPlan) return res.status(400).json({ error: 'reference and paymentPlan are required' });

    const applicant = await Applicant.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (!applicant.emailVerified) return res.status(403).json({ error: 'Email not verified' });
    if (applicant.applicationFeePaid) return res.status(400).json({ error: 'Application fee already paid' });

    applicant.applicationFeeRef  = reference;
    applicant.pendingPaymentPlan = paymentPlan;
    await applicant.save();

    res.json({ success: true, message: 'Transfer reference submitted. Admin will confirm within 24 hours and you\'ll receive login details by email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/confirm-fee — admin: confirm bank transfer, create student
router.post('/:id/confirm-fee', requireAuth, async (req, res) => {
  try {
    const applicant = await Applicant.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (applicant.applicationFeePaid) return res.status(400).json({ error: 'Fee already confirmed' });
    if (!applicant.applicationFeeRef) return res.status(400).json({ error: 'No bank transfer reference on record' });

    const paymentPlan = req.body.paymentPlan || applicant.pendingPaymentPlan || 'monthly';

    applicant.applicationFeePaid = true;
    applicant.status             = 'Accepted';
    await applicant.save();

    const existing = await Student.findOne({ email: applicant.email });
    if (existing) return res.status(400).json({ error: 'Student account already exists for this email' });

    // Bank transfer covers full amount (app fee + tuition) — mark both as paid
    const student = await createStudentFromApplicant(applicant, paymentPlan, {
      tuitionPaid: true,
      reference:   applicant.applicationFeeRef,
      method:      'Bank Transfer'
    });
    res.json({ success: true, studentId: student._id });
  } catch (err) {
    console.error('confirm-fee error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applicants — protected (dashboard)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, track, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (track)  filter.track  = track;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = [{ fullName: re }, { email: re }, { phone: re }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      Applicant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Applicant.countDocuments(filter)
    ]);
    res.json({ data: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applicants/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Applicant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/applicants/:id — protected (status, notes)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;

    const doc = await Applicant.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Auto-create student account and send acceptance email
    if (status === 'Accepted') {
      const existing = await Student.findOne({ email: doc.email });
      if (!existing) {
        const plainPassword = generatePassword();
        const hashed        = await bcrypt.hash(plainPassword, 12);

        // Assign to the current active batch
        const activeBatch = await Batch.findOne({ isActive: true }).select('_id');

        const student = await Student.create({
          fullName:          doc.fullName,
          email:             doc.email,
          password:          hashed,
          phone:             doc.phone || '',
          track:             doc.track || 'Other',
          batch:             activeBatch ? activeBatch._id : undefined,
          status:            'Active',
          applicantRef:      doc._id,
          applicationFeePaid: true,
          profilePicture:    doc.profilePhoto || ''
        });

        const host     = process.env.HOST || 'https://goallordcreativity.com';
        const loginUrl = `${host}/student-login.html`;
        const duration = TRACK_DURATION[doc.track] || '12 Weeks';

        try {
          await sendMail({
            to:      doc.email,
            subject: `You've been accepted — Goallord Creativity Academy`,
            html:    acceptanceEmail({
              fullName: doc.fullName,
              track:    doc.track || 'Other',
              duration,
              email:    doc.email,
              password: plainPassword,
              loginUrl
            })
          });
        } catch (mailErr) {
          console.error('Acceptance email failed:', mailErr.message);
        }

        // Notify admin of acceptance
        try {
          await sendMail({
            to:      process.env.EMAIL_FROM,
            subject: `Accepted: ${doc.fullName} — ${doc.track || 'Other'}`,
            html:    adminAcceptanceNotificationEmail({
              fullName:     doc.fullName,
              email:        doc.email,
              track:        doc.track || 'Other',
              studentId:    student._id.toString(),
              dashboardUrl: `${host}/dashboard.html`
            })
          });
        } catch (mailErr) {
          console.error('Admin acceptance notification failed:', mailErr.message);
        }

        return res.json({ ...doc.toObject(), studentCreated: true, studentId: student._id });
      }
    }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/applicants/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Applicant.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
