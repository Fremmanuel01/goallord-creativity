const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const usersDb = require('../db/users');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET all agents (any authenticated user)
router.get('/', requireAuth, async (req, res) => {
  try {
    const agents = await usersDb.findAll('id, name, email, role, permissions, avatar, created_at');
    res.json({ agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create agent (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (!['admin', 'agent'].includes(role)) return res.status(400).json({ error: 'Role must be admin or agent' });
  try {
    const hash  = await bcrypt.hash(password, 10);
    const agent = await usersDb.create({ name, email: email.toLowerCase(), password: hash, role: role || 'agent' });
    res.json({ agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role } });
  } catch (err) {
    // Check for unique constraint violation (Supabase returns code 23505)
    if (err.code === '23505') return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH update agent (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  const update = {};
  if (name)     update.name  = name;
  if (email)    update.email = email.toLowerCase();
  if (role && ['admin', 'agent'].includes(role)) update.role = role;
  if (password) update.password = await bcrypt.hash(password, 10);
  try {
    const agent = await usersDb.update(req.params.id, update);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    // Strip password from response
    const { password: _, ...agentData } = agent;
    res.json({ agent: agentData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE agent (admin only, cannot delete self)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    await usersDb.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
