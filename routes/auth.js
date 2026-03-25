const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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
    const users = await User.find({}, 'name email role permissions createdAt').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register — create a staff/admin account (admin only)
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;
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
    const user = await User.create(userData);

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
    const { name, email, password, role, permissions } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (role && ['admin', 'staff'].includes(role)) updates.role = role;
    if (password) updates.password = await bcrypt.hash(password, 10);
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

module.exports = router;
module.exports.seedAdmin = seedAdmin;
