const express  = require('express');
const crypto   = require('crypto');
const https    = require('https');
const bcrypt   = require('bcryptjs');
const applicantsDb = require('../db/applicants');
const studentsDb   = require('../db/students');
const batchesDb    = require('../db/batches');
const paymentsDb   = require('../db/payments');
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
    const existingStudent = await studentsDb.findByEmail(emailLower);
    if (existingStudent) {
      return res.status(409).json({ error: 'A student account already exists for this email. Please log in at the student portal.' });
    }

    // Block if already applied (and not rejected); if rejected, remove old record so they can reapply
    const existingApplicant = await applicantsDb.findByEmail(emailLower);
    if (existingApplicant) {
      if (existingApplicant.status !== 'Rejected') {
        return res.status(409).json({
          error: existingApplicant.application_fee_paid
            ? 'An account already exists for this email. Please log in at the student portal.'
            : 'An application with this email already exists. Check your inbox for the verification link, or contact admin if you need help.'
        });
      }
      // Rejected — remove old record so they can reapply cleanly
      await applicantsDb.remove(existingApplicant.id);
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const applicant = await applicantsDb.create({
      full_name:            sanitized.fullName,
      email:                sanitized.email,
      phone:                sanitized.phone,
      location:             sanitized.location,
      track:                sanitized.track,
      experience:           sanitized.experience,
      schedule:             sanitized.schedule,
      how_found:            sanitized.howFound,
      goal:                 sanitized.goal,
      why:                  sanitized.why,
      background:           sanitized.background,
      profile_photo:        sanitized.profilePhoto,
      email_verify_token:   token,
      email_verify_expires: expires.toISOString()
    });

    const host      = process.env.HOST || `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${host}/api/applicants/verify/${token}`;

    try {
      await sendMail({
        to:      applicant.email,
        subject: 'Verify your email — Goallord Creativity Academy',
        html:    verificationEmail({ fullName: applicant.full_name, verifyUrl })
      });
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr.message);
    }

    // Notify admin of new application
    try {
      await sendMail({
        to:      process.env.EMAIL_FROM,
        subject: `New application: ${applicant.full_name} — ${applicant.track || 'No track'}`,
        html:    adminNewApplicationEmail({
          fullName:     applicant.full_name,
          email:        applicant.email,
          phone:        applicant.phone,
          track:        applicant.track,
          dashboardUrl: `${host}/dashboard.html`
        })
      });
    } catch (mailErr) {
      console.error('Admin notification failed:', mailErr.message);
    }

    res.status(201).json({ success: true, id: applicant.id, emailSent: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/applicants/verify/:token — public (email verification link)
router.get('/verify/:token', async (req, res) => {
  try {
    // Find applicant by verify token that hasn't expired
    const { data: applicants } = await require('../lib/supabase')
      .from('applicants')
      .select('*')
      .eq('email_verify_token', req.params.token)
      .gt('email_verify_expires', new Date().toISOString())
      .limit(1);

    const applicant = applicants && applicants[0];

    if (!applicant) {
      return res.status(400).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Link Expired</title>
<style>body{background:#0F1115;color:#F4F6FA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{max-width:420px;padding:40px;background:#171A21;border-radius:12px;border:1px solid #2A2F3A}
h2{color:#D66A1F;margin:0 0 16px}p{color:#A0A6B3;margin:0 0 24px}a{color:#D66A1F}</style></head>
<body><div class="box"><h2>Link Expired</h2><p>This verification link has expired or is invalid. Please submit a new application.</p>
<a href="/apply.html">Back to Apply</a></div></body></html>`);
    }

    // Idempotent verify — do NOT null the token. Gmail/Outlook/spam scanners
    // prefetch every link in every email to check for phishing; if we nulled
    // the token here the real user's click would always land on "Link
    // Expired". Keep the token valid until email_verify_expires and just
    // flip email_verified — re-hitting the link is then a harmless no-op
    // and the real click still redirects to the payment page.
    if (!applicant.email_verified) {
      await applicantsDb.update(applicant.id, { email_verified: true });
    }

    // Redirect to payment page
    return res.redirect(`/apply-payment.html?id=${applicant.id}`);
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
  const activeBatch   = await batchesDb.findActive();
  const method        = opts.method    || (applicant.application_fee_ref ? 'Bank Transfer' : 'Paystack');
  const reference     = opts.reference || applicant.application_fee_ref || '';

  const student = await studentsDb.create({
    full_name:           applicant.full_name,
    email:               applicant.email,
    password:            hashed,
    phone:               applicant.phone || '',
    track:               applicant.track || 'Other',
    batch_id:            activeBatch ? activeBatch.id : null,
    status:              'Active',
    applicant_ref:       applicant.id,
    application_fee_paid: true,
    payment_plan:        paymentPlan === 'full' ? 'full_upfront' : 'monthly',
    profile_picture:     applicant.profile_photo || ''
  });

  // Application fee — always paid
  const appFee = Number(process.env.APPLICATION_FEE) || 20000;
  await paymentsDb.create({
    student_id:  student.id,
    batch_id:    activeBatch ? activeBatch.id : null,
    category:    'application_fee',
    amount_due:  appFee,
    amount_paid: appFee,
    method, reference,
    recorded_by: 'System',
    paid_at:     new Date().toISOString()
  });

  // Tuition payment records
  const fullFee    = Number(process.env.FULL_TUITION_FEE)    || 150000;
  const monthlyFee = Number(process.env.MONTHLY_TUITION_FEE) || 60000;
  const now = new Date();

  if (paymentPlan === 'full') {
    // Full tuition — paid upfront in same transaction
    await paymentsDb.create({
      student_id: student.id, batch_id: activeBatch ? activeBatch.id : null,
      category: 'full_tuition_payment', amount_due: fullFee,
      amount_paid: opts.tuitionPaid ? fullFee : 0,
      method:    opts.tuitionPaid ? method : '',
      reference: opts.tuitionPaid ? reference : '',
      paid_at:   opts.tuitionPaid ? new Date().toISOString() : null,
      due_date:  new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      recorded_by: 'System'
    });
  } else {
    // Monthly — 1st instalment paid now, 2nd and 3rd pending
    for (let i = 1; i <= 3; i++) {
      const isFirst = i === 1;
      await paymentsDb.create({
        student_id: student.id, batch_id: activeBatch ? activeBatch.id : null,
        category: `tuition_month_${i}`, amount_due: monthlyFee,
        amount_paid: (opts.tuitionPaid && isFirst) ? monthlyFee : 0,
        method:    (opts.tuitionPaid && isFirst) ? method : '',
        reference: (opts.tuitionPaid && isFirst) ? reference : '',
        paid_at:   (opts.tuitionPaid && isFirst) ? new Date().toISOString() : null,
        due_date:  new Date(now.getFullYear(), now.getMonth() + i, 1).toISOString(),
        recorded_by: 'System'
      });
    }
  }

  // Send acceptance email with credentials
  const host     = process.env.HOST || 'https://goallordcreativity.com';
  const loginUrl = `${host}/student-login.html`;
  const duration = TRACK_DURATION[applicant.track] || '12 Weeks';

  let acceptanceEmailSent = true;
  try {
    await sendMail({
      to:      applicant.email,
      subject: `Welcome to Goallord Creativity Academy — Your Login Details`,
      html:    acceptanceEmail({ fullName: applicant.full_name, track: applicant.track || 'Other', duration, email: applicant.email, password: plainPassword, loginUrl })
    });
  } catch (e) {
    acceptanceEmailSent = false;
    console.error('Acceptance email failed:', e.message);
    try {
      await require('../lib/supabase').from('email_failures').insert({
        to_email: applicant.email, kind: 'acceptance', student_id: student.id,
        error: e.message, payload: { password: plainPassword, loginUrl }
      });
    } catch {}
  }
  student._acceptanceEmailSent = acceptanceEmailSent;
  student._plainPassword = plainPassword;

  await sendMail({
    to:      process.env.EMAIL_FROM,
    subject: `New Student Enrolled: ${applicant.full_name} — ${applicant.track || 'Other'}`,
    html:    adminAcceptanceNotificationEmail({ fullName: applicant.full_name, email: applicant.email, track: applicant.track || 'Other', studentId: student.id.toString(), dashboardUrl: `${host}/dashboard.html` })
  }).catch(e => console.error('Admin notification failed:', e.message));

  return student;
}

// GET /api/applicants/:id/payment-info — public (payment page fetches this)
// Gate on email_verified: the verification step has already nulled the token,
// and the flag proves the user clicked the link. Re-requiring the token here
// locked every real applicant out of the payment page.
router.get('/:id/payment-info', async (req, res) => {
  try {
    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (!applicant.email_verified) return res.status(403).json({ error: 'Email not verified. Please click the link we sent to your inbox first.' });
    res.json({
      fullName:           applicant.full_name,
      email:              applicant.email,
      track:              applicant.track,
      applicationFeePaid: applicant.application_fee_paid
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/resend-verification — public (rescue path for stuck applicants)
router.post('/:id/resend-verification', applyLimiter, async (req, res) => {
  try {
    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (applicant.email_verified) return res.status(400).json({ error: 'Email is already verified.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await applicantsDb.update(applicant.id, {
      email_verify_token:   token,
      email_verify_expires: expires.toISOString()
    });

    const host = process.env.HOST || `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${host}/api/applicants/verify/${token}`;
    await sendMail({
      to:      applicant.email,
      subject: 'Verify your email — Goallord Creativity Academy',
      html:    verificationEmail({ fullName: applicant.full_name, verifyUrl })
    });

    res.json({ success: true });
  } catch (err) {
    console.error('resend-verification failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/admin-resend-verification — protected (dashboard button)
router.post('/:id/admin-resend-verification', requireAuth, async (req, res) => {
  try {
    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (applicant.email_verified) return res.status(400).json({ error: 'Email is already verified.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await applicantsDb.update(applicant.id, {
      email_verify_token:   token,
      email_verify_expires: expires.toISOString()
    });

    const host = process.env.HOST || `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${host}/api/applicants/verify/${token}`;
    await sendMail({
      to:      applicant.email,
      subject: 'Verify your email — Goallord Creativity Academy',
      html:    verificationEmail({ fullName: applicant.full_name, verifyUrl })
    });

    res.json({ success: true });
  } catch (err) {
    console.error('admin-resend-verification failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/pay-application — public (Paystack app fee payment)
router.post('/:id/pay-application', async (req, res) => {
  try {
    const { reference, paymentPlan } = req.body;
    if (!reference || !paymentPlan) return res.status(400).json({ error: 'reference and paymentPlan are required' });

    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (!applicant.email_verified) return res.status(403).json({ error: 'Email not verified' });
    if (applicant.application_fee_paid) return res.status(400).json({ error: 'Application fee already paid' });

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

    // Currency must be NGN
    if (psData.data.currency && psData.data.currency !== 'NGN')
      return res.status(400).json({ error: `Unexpected currency: ${psData.data.currency}` });

    // Ensure the Paystack metadata matches this applicant (blocks reference hijacking)
    const psMeta = psData.data.metadata || {};
    const psApplicantId = psMeta.applicantId || psMeta.applicant_id;
    if (psApplicantId && String(psApplicantId) !== String(applicant.id))
      return res.status(400).json({ error: 'Payment reference does not belong to this applicant' });

    // Reject a reference that was already consumed by another payment row
    const supabase = require('../lib/supabase');
    const { data: dupRefs } = await supabase
      .from('payments').select('id').eq('reference', reference).limit(1);
    if (dupRefs && dupRefs.length)
      return res.status(409).json({ error: 'This payment reference has already been processed' });

    const appFee     = Number(process.env.APPLICATION_FEE)    || 20000;
    const fullFee    = Number(process.env.FULL_TUITION_FEE)   || 150000;
    const monthlyFee = Number(process.env.MONTHLY_TUITION_FEE)|| 60000;
    const tuitionNow = paymentPlan === 'full' ? fullFee : monthlyFee;
    const totalExpected = appFee + tuitionNow;
    const amountPaid    = psData.data.amount / 100;

    if (amountPaid < totalExpected)
      return res.status(400).json({ error: `Amount paid (₦${amountPaid.toLocaleString()}) is less than required total (₦${totalExpected.toLocaleString()})` });

    // Mark fee paid
    await applicantsDb.update(applicant.id, {
      application_fee_paid: true,
      application_fee_ref:  reference,
      status:               'Accepted'
    });

    // Create student account — tuition also marked paid in same transaction
    const student = await createStudentFromApplicant(applicant, paymentPlan, {
      tuitionPaid: true, reference, method: 'Paystack'
    });

    // Fetch app fee payment for receipt number
    const studentPayments = await paymentsDb.findByStudent(student.id);
    const appFeePayment = studentPayments.find(p => p.category === 'application_fee');

    res.json({
      success: true,
      studentId: student.id,
      emailSent: student._acceptanceEmailSent !== false,
      receipt: {
        receiptNumber:   appFeePayment ? appFeePayment.receipt_number   : '',
        receiptIssuedAt: appFeePayment ? appFeePayment.receipt_issued_at : new Date(),
        name:         applicant.full_name,
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

    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (!applicant.email_verified) return res.status(403).json({ error: 'Email not verified' });
    if (applicant.application_fee_paid) return res.status(400).json({ error: 'Application fee already paid' });

    await applicantsDb.update(applicant.id, {
      application_fee_ref:  reference,
      pending_payment_plan: paymentPlan
    });

    res.json({ success: true, message: 'Transfer reference submitted. Admin will confirm within 24 hours and you\'ll receive login details by email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applicants/:id/confirm-fee — admin: confirm bank transfer, create student
router.post('/:id/confirm-fee', requireAuth, async (req, res) => {
  try {
    const applicant = await applicantsDb.findById(req.params.id);
    if (!applicant) return res.status(404).json({ error: 'Application not found' });
    if (applicant.application_fee_paid) return res.status(400).json({ error: 'Fee already confirmed' });
    if (!applicant.application_fee_ref) return res.status(400).json({ error: 'No bank transfer reference on record' });

    const paymentPlan = req.body.paymentPlan || applicant.pending_payment_plan || 'monthly';

    await applicantsDb.update(applicant.id, {
      application_fee_paid: true,
      status:               'Accepted'
    });

    const existing = await studentsDb.findByEmail(applicant.email);
    if (existing) return res.status(400).json({ error: 'Student account already exists for this email' });

    // Bank transfer covers full amount (app fee + tuition) — mark both as paid
    const student = await createStudentFromApplicant(applicant, paymentPlan, {
      tuitionPaid: true,
      reference:   applicant.application_fee_ref,
      method:      'Bank Transfer'
    });
    res.json({ success: true, studentId: student.id });
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

    // For search, applicantsDb.find doesn't have a built-in search param,
    // so we use supabase or filter to handle it
    let result;
    if (search) {
      const supabase = require('../lib/supabase');
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let q = supabase.from('applicants').select('*', { count: 'exact' });
      for (const [key, val] of Object.entries(filter)) {
        q = q.eq(key, val);
      }
      q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
      q = q.order('created_at', { ascending: false });
      const skip = (Number(page) - 1) * Number(limit);
      q = q.range(skip, skip + Number(limit) - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      result = { data: data || [], count };
    } else {
      result = await applicantsDb.find({ filter, page: Number(page), limit: Number(limit) });
    }

    res.json({ data: result.data, total: result.count, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applicants/:id — protected
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await applicantsDb.findById(req.params.id);
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

    const doc = await applicantsDb.update(req.params.id, update);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Auto-create student account and send acceptance email
    if (status === 'Accepted') {
      const existing = await studentsDb.findByEmail(doc.email);
      if (!existing) {
        const plainPassword = generatePassword();
        const hashed        = await bcrypt.hash(plainPassword, 12);

        // Assign to the current active batch
        const activeBatch = await batchesDb.findActive();

        const student = await studentsDb.create({
          full_name:          doc.full_name,
          email:              doc.email,
          password:           hashed,
          phone:              doc.phone || '',
          track:              doc.track || 'Other',
          batch_id:           activeBatch ? activeBatch.id : null,
          status:             'Active',
          applicant_ref:      doc.id,
          application_fee_paid: true,
          profile_picture:    doc.profile_photo || ''
        });

        const host     = process.env.HOST || 'https://goallordcreativity.com';
        const loginUrl = `${host}/student-login.html`;
        const duration = TRACK_DURATION[doc.track] || '12 Weeks';

        try {
          await sendMail({
            to:      doc.email,
            subject: `You've been accepted — Goallord Creativity Academy`,
            html:    acceptanceEmail({
              fullName: doc.full_name,
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
            subject: `Accepted: ${doc.full_name} — ${doc.track || 'Other'}`,
            html:    adminAcceptanceNotificationEmail({
              fullName:     doc.full_name,
              email:        doc.email,
              track:        doc.track || 'Other',
              studentId:    student.id.toString(),
              dashboardUrl: `${host}/dashboard.html`
            })
          });
        } catch (mailErr) {
          console.error('Admin acceptance notification failed:', mailErr.message);
        }

        return res.json({ ...doc, studentCreated: true, studentId: student.id });
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
    await applicantsDb.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
