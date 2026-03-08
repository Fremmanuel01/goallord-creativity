const express  = require('express');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const Applicant = require('../models/Applicant');
const Student   = require('../models/Student');
const Batch     = require('../models/Batch');
const { requireAuth } = require('../middleware/auth');
const { sendMail }    = require('../utils/mailer');
const { verificationEmail, acceptanceEmail, adminNewApplicationEmail, adminAcceptanceNotificationEmail } = require('../utils/emailTemplates');

const router = express.Router();

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
router.post('/', async (req, res) => {
  try {
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const applicant = await Applicant.create({
      ...req.body,
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

    return res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Email Verified</title>
<style>body{background:#0F1115;color:#F4F6FA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{max-width:420px;padding:40px;background:#171A21;border-radius:12px;border:1px solid #2A2F3A}
h2{color:#D66A1F;margin:0 0 16px}p{color:#A0A6B3;margin:0 0 24px}a{color:#D66A1F}</style></head>
<body><div class="box"><h2>Email Verified!</h2>
<p>Your email has been verified. We'll review your application and get back to you within 48 hours.</p>
<a href="/academy.html">Back to Academy</a></div></body></html>`);
  } catch (err) {
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
      const re = new RegExp(search, 'i');
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
        const cohort        = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });

        // Assign to the current active batch
        const activeBatch = await Batch.findOne({ isActive: true }).select('_id');

        const student = await Student.create({
          fullName:     doc.fullName,
          email:        doc.email,
          password:     hashed,
          phone:        doc.phone || '',
          track:        doc.track || 'Other',
          cohort,
          batch:        activeBatch ? activeBatch._id : undefined,
          status:       'Active',
          applicantRef: doc._id
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

// DELETE /api/applicants/:id — protected
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await Applicant.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
