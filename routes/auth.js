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
        html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:40px 20px;background:#0B0D10;color:#F4F6FA">
          <h1 style="color:#D66A1F;font-size:22px;margin:0 0 24px">Welcome to Goallord</h1>
          <p style="font-size:15px;line-height:1.7;color:#ccc">Hi ${user.name.split(' ')[0]},</p>
          <p style="font-size:15px;line-height:1.7;color:#ccc">Your dashboard account has been created. Here are your login details:</p>
          <div style="background:#171A21;border:1px solid #2A2F3A;border-radius:8px;padding:20px;margin:20px 0">
            <p style="margin:0 0 10px;font-size:13px;color:#8892A4">EMAIL</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:600">${user.email}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#8892A4">PASSWORD</p>
            <p style="margin:0;font-size:16px;font-weight:600;font-family:monospace;background:#0F1115;padding:8px 12px;border-radius:4px">${password}</p>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#F59E0B">Please change your password after your first login.</p>
          <a href="https://goallordcreativity.com/dashboard.html" style="display:inline-block;background:#D66A1F;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;margin-top:16px">Log In to Dashboard</a>
          <p style="font-size:12px;color:#555;margin-top:32px">Goallord Creativity Limited, No. 1 Mission Road, Onitsha</p>
        </div>`
      });
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr.message);
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
