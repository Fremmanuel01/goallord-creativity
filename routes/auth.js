const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const { sendMail } = require('../utils/mailer');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name, permissions: user.permissions },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Seed admin user on first start
async function seedAdmin() {
  const exists = await User.findOne({ email: process.env.ADMIN_EMAIL });
  if (exists) return;
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await User.create({ name: 'Goallord Admin', email: process.env.ADMIN_EMAIL, password: hash, role: 'admin' });
  console.log('Admin user seeded');
}

// GET /api/auth/users — list all users (for assignee dropdowns)
router.get('/users', requireAuth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email role permissions avatar createdAt').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register — create a staff/admin account (admin only)
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, permissions, avatar } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const validRoles = ['admin', 'staff'];
    const userRole = validRoles.includes(role) ? role : 'staff';

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const userData = { name, email: email.toLowerCase(), password: hash, role: userRole };
    if (permissions && typeof permissions === 'object') {
      userData.permissions = permissions;
    }
    if (avatar) userData.avatar = avatar;
    const user = await User.create(userData);

    // Send welcome email with credentials
    try {
      await sendMail({
        to: user.email,
        subject: 'Your Goallord Dashboard Account',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:0">

  <!-- Top accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#E8782A,#FF9F43,#E8782A)"></div>

  <!-- Header -->
  <div style="background:#0d1017;padding:40px 32px 0;text-align:center">
    <div style="display:inline-block;background:linear-gradient(135deg,rgba(232,120,42,0.15),rgba(232,120,42,0.05));border:1px solid rgba(232,120,42,0.25);border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;margin-bottom:20px">
      <span style="font-size:28px">&#128075;</span>
    </div>
    <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 8px;letter-spacing:-0.5px">Welcome to Goallord</h1>
    <p style="color:#6b7280;font-size:14px;margin:0;letter-spacing:0.5px">YOUR DASHBOARD ACCOUNT IS READY</p>
  </div>

  <!-- Body -->
  <div style="background:#0d1017;padding:32px 32px 40px">
    <p style="font-size:16px;line-height:1.7;color:#d1d5db;margin:0 0 24px">Hi <strong style="color:#fff">${user.name.split(' ')[0]}</strong>, your account has been created. Use the credentials below to log in.</p>

    <!-- Credentials card -->
    <div style="background:#141820;border:1px solid #1e2432;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <div style="padding:20px 24px;border-bottom:1px solid #1e2432">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Email Address</p>
        <p style="margin:0;font-size:17px;font-weight:600;color:#fff">${user.email}</p>
      </div>
      <div style="padding:20px 24px">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Password</p>
        <div style="background:#0a0d12;border:1px solid #1e2432;border-radius:8px;padding:12px 16px;margin-top:4px">
          <code style="font-size:18px;font-weight:700;color:#E8782A;font-family:'SF Mono',Consolas,monospace;letter-spacing:1px">${password}</code>
        </div>
      </div>
    </div>

    <!-- Warning -->
    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:14px 18px;margin-bottom:28px;display:flex;align-items:start;gap:10px">
      <span style="font-size:16px;flex-shrink:0;margin-top:1px">&#9888;&#65039;</span>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#fbbf24">Please change your password after your first login for security.</p>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center">
      <a href="https://goallordcreativity.com/login.html" style="display:inline-block;background:linear-gradient(135deg,#E8782A,#FF9F43);color:#fff;text-decoration:none;padding:14px 40px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(232,120,42,0.3)">Log In to Dashboard</a>
    </div>

    <!-- Role badge -->
    <div style="text-align:center;margin-top:24px">
      <span style="display:inline-block;background:rgba(232,120,42,0.1);border:1px solid rgba(232,120,42,0.25);color:#E8782A;font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;letter-spacing:1px;text-transform:uppercase">${user.role} Account</span>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#080a0e;padding:24px 32px;text-align:center;border-top:1px solid #141820">
    <p style="margin:0 0 4px;font-size:12px;color:#4b5563">Goallord Creativity Limited</p>
    <p style="margin:0;font-size:11px;color:#374151">No. 1 Mission Road, Onitsha, Anambra State, Nigeria</p>
  </div>

</div>
</body></html>`
      });
      console.log('[Auth] Welcome email sent to ' + user.email);
    } catch (emailErr) {
      console.error('[Auth] Failed to send welcome email to ' + user.email + ':', emailErr.message, emailErr.stack);
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      createdAt: user.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/users/:id — update a user (admin only)
router.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, permissions, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (role && ['admin', 'staff'].includes(role)) updates.role = role;
    if (password) updates.password = await bcrypt.hash(password, 10);
    if (typeof avatar === 'string') updates.avatar = avatar;
    if (permissions && typeof permissions === 'object') {
      // Set each permission key individually so Mongoose merges correctly
      for (const [key, val] of Object.entries(permissions)) {
        updates[`permissions.${key}`] = !!val;
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id — delete a user (admin only)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password — any logged-in user changes their own password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.seedAdmin = seedAdmin;
