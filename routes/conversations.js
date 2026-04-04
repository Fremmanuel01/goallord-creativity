const express  = require('express');
const router   = express.Router();
const xss      = require('xss');
const conversationsDb = require('../db/conversations');
const { requireAuth } = require('../middleware/auth');

// GET all conversations (agents only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await conversationsDb.find({ limit: 100 });
    res.json({ conversations: result.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single conversation
router.get('/:sessionId', requireAuth, async (req, res) => {
  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    res.json({ conversation: convo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST agent reply
router.post('/:sessionId/reply', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content required' });
  }
  if (content.length > 5000) {
    return res.status(400).json({ error: 'Message too long' });
  }

  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });

    const msg = {
      role:       'agent',
      content:    xss(content.trim()),
      agent_name: req.user.name,
      timestamp:  new Date().toISOString()
    };
    await conversationsDb.addMessage(convo.id, msg);
    await conversationsDb.update(convo.id, {
      mode:       'human',
      agent_id:   req.user.id,
      agent_name: req.user.name
    });

    // Emit to visitor's socket room and to other agents
    const io = req.app.get('io');
    if (io) {
      io.to(req.params.sessionId).emit('agent:reply', { content, agentName: req.user.name, timestamp: msg.timestamp });
      io.to('agents').emit('agent:reply', { sessionId: req.params.sessionId, message: msg });
    }

    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle AI/human mode
router.patch('/:sessionId/mode', requireAuth, async (req, res) => {
  const { mode } = req.body;
  if (!['ai', 'human'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });

  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });

    await conversationsDb.update(convo.id, {
      mode,
      agent_id:   mode === 'human' ? req.user.id : null,
      agent_name: mode === 'human' ? req.user.name : null
    });

    const io = req.app.get('io');
    if (io) io.to('agents').emit('mode:changed', { sessionId: req.params.sessionId, mode, agentName: req.user.name });
    if (io) io.to(req.params.sessionId).emit('mode:changed', { mode, agentName: req.user.name });

    res.json({ ok: true, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH mark as read
router.patch('/:sessionId/read', requireAuth, async (req, res) => {
  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    await conversationsDb.update(convo.id, { unread_by_agent: 0 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH close conversation
router.patch('/:sessionId/close', requireAuth, async (req, res) => {
  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    await conversationsDb.update(convo.id, { status: 'closed' });
    const io = req.app.get('io');
    if (io) io.to(req.params.sessionId).emit('conversation:closed');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH reopen conversation
router.patch('/:sessionId/reopen', requireAuth, async (req, res) => {
  try {
    const convo = await conversationsDb.findBySessionId(req.params.sessionId);
    if (!convo) return res.status(404).json({ error: 'Not found' });
    await conversationsDb.update(convo.id, { status: 'active', mode: 'ai' });
    const io = req.app.get('io');
    if (io) {
      io.to('agents').emit('mode:changed', { sessionId: req.params.sessionId, mode: 'ai', status: 'active' });
      io.to(req.params.sessionId).emit('mode:changed', { mode: 'ai', status: 'active' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
