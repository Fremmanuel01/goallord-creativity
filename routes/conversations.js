const express  = require('express');
const router   = express.Router();
const Conversation = require('../models/Conversation');
const { requireAuth } = require('../middleware/auth');

// GET all conversations (agents only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const convos = await Conversation.find()
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json({ conversations: convos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single conversation
router.get('/:sessionId', requireAuth, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ sessionId: req.params.sessionId }).lean();
    if (!convo) return res.status(404).json({ error: 'Not found' });
    res.json({ conversation: convo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST agent reply
router.post('/:sessionId/reply', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  try {
    const convo = await Conversation.findOne({ sessionId: req.params.sessionId });
    if (!convo) return res.status(404).json({ error: 'Not found' });

    const msg = {
      role:      'agent',
      content,
      agentName: req.user.name,
      timestamp: new Date()
    };
    convo.messages.push(msg);
    convo.mode   = 'human';
    convo.agentId   = req.user.id;
    convo.agentName = req.user.name;
    await convo.save();

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
    const convo = await Conversation.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      { mode, agentId: mode === 'human' ? req.user.id : null, agentName: mode === 'human' ? req.user.name : null },
      { new: true }
    );
    if (!convo) return res.status(404).json({ error: 'Not found' });

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
  await Conversation.findOneAndUpdate({ sessionId: req.params.sessionId }, { unreadByAgent: 0 });
  res.json({ ok: true });
});

// PATCH close conversation
router.patch('/:sessionId/close', requireAuth, async (req, res) => {
  const convo = await Conversation.findOneAndUpdate(
    { sessionId: req.params.sessionId },
    { status: 'closed' },
    { new: true }
  );
  const io = req.app.get('io');
  if (io) io.to(req.params.sessionId).emit('conversation:closed');
  res.json({ ok: true });
});

// PATCH reopen conversation
router.patch('/:sessionId/reopen', requireAuth, async (req, res) => {
  const convo = await Conversation.findOneAndUpdate(
    { sessionId: req.params.sessionId },
    { status: 'active', mode: 'ai' },
    { new: true }
  );
  if (!convo) return res.status(404).json({ error: 'Not found' });
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('mode:changed', { sessionId: req.params.sessionId, mode: 'ai', status: 'active' });
    io.to(req.params.sessionId).emit('mode:changed', { mode: 'ai', status: 'active' });
  }
  res.json({ ok: true });
});

module.exports = router;
