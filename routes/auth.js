const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

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
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
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
    const users = await User.find({}, 'name email role').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.seedAdmin = seedAdmin;
