const express = require('express');
const xss = require('xss');
const messagesDb = require('../db/messages');
const notificationsDb = require('../db/notifications');
const supabase = require('../lib/supabase');
const { requireChatUser } = require('../middleware/chatAuth');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────

// Batches a chat user may access a group thread for.
async function accessibleBatches(user) {
  if (user.type === 'student') {
    const { data } = await supabase.from('students')
      .select('batch:batches(id, name)').eq('id', user.id).single();
    const b = data && data.batch;
    return b ? [{ id: b.id, name: b.name }] : [];
  }
  if (user.type === 'lecturer') {
    const { data } = await supabase.from('lecturer_batches')
      .select('batch:batches(id, name)').eq('lecturer_id', user.id);
    return (data || []).map(r => r.batch).filter(Boolean).map(b => ({ id: b.id, name: b.name }));
  }
  // admin: all batches
  const { data } = await supabase.from('batches').select('id, name');
  return (data || []).map(b => ({ id: b.id, name: b.name }));
}

// DM contacts the user is allowed to start a conversation with.
async function dmContacts(user) {
  if (user.type === 'student') {
    const { data: s } = await supabase.from('students').select('batch_id').eq('id', user.id).single();
    if (!s || !s.batch_id) return [];
    const { data } = await supabase.from('lecturer_batches')
      .select('lecturer:lecturers(id, full_name, specialization)').eq('batch_id', s.batch_id);
    return (data || []).map(r => r.lecturer).filter(Boolean)
      .map(l => ({ type: 'lecturer', id: l.id, name: l.full_name, sub: l.specialization || 'Lecturer' }));
  }
  if (user.type === 'lecturer') {
    const batches = await accessibleBatches(user);
    if (!batches.length) return [];
    const { data } = await supabase.from('students')
      .select('id, full_name, track, batch_id')
      .in('batch_id', batches.map(b => b.id)).eq('status', 'Active');
    return (data || []).map(s => ({ type: 'student', id: s.id, name: s.full_name, sub: s.track || 'Student' }));
  }
  // admin: lecturers + active students
  const [{ data: lecs }, { data: studs }] = await Promise.all([
    supabase.from('lecturers').select('id, full_name, specialization'),
    supabase.from('students').select('id, full_name, track').eq('status', 'Active')
  ]);
  return [
    ...(lecs || []).map(l => ({ type: 'lecturer', id: l.id, name: l.full_name, sub: l.specialization || 'Lecturer' })),
    ...(studs || []).map(s => ({ type: 'student', id: s.id, name: s.full_name, sub: s.track || 'Student' }))
  ];
}

// May `user` open a DM with `target`?
async function canDm(user, target) {
  if (user.type === 'admin' || target.type === 'admin') return user.type === 'admin' || target.type === 'admin';
  if (user.type === target.type) return false; // no student↔student / lecturer↔lecturer
  const studentId  = user.type === 'student' ? user.id : target.id;
  const lecturerId = user.type === 'lecturer' ? user.id : target.id;
  const { data: s } = await supabase.from('students').select('batch_id').eq('id', studentId).single();
  if (!s || !s.batch_id) return false;
  const { data } = await supabase.from('lecturer_batches')
    .select('lecturer_id').eq('lecturer_id', lecturerId).eq('batch_id', s.batch_id).limit(1);
  return !!(data && data.length);
}

async function lookupName(type, id) {
  if (type === 'lecturer') {
    const { data } = await supabase.from('lecturers').select('full_name').eq('id', id).single();
    return data ? data.full_name : 'Lecturer';
  }
  if (type === 'student') {
    const { data } = await supabase.from('students').select('full_name').eq('id', id).single();
    return data ? data.full_name : 'Student';
  }
  const { data } = await supabase.from('users').select('name').eq('id', id).single();
  return data ? data.name : 'Staff';
}

// Verify the user may access a thread; returns the thread or null.
async function authorizeThread(user, threadId) {
  const thread = await messagesDb.getThread(threadId);
  if (!thread) return null;
  if (thread.type === 'dm') {
    return (await messagesDb.isParticipant(threadId, user)) ? thread : null;
  }
  // batch thread — must belong to that batch
  const batches = await accessibleBatches(user);
  return batches.some(b => b.id === thread.batch_id) ? thread : null;
}

function emitToThread(req, threadId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to('thread:' + threadId).emit(event, payload);
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/messages/contacts — who I can DM + which group chats I have
router.get('/contacts', requireChatUser, async (req, res) => {
  try {
    const [people, batches] = await Promise.all([
      dmContacts(req.chatUser),
      accessibleBatches(req.chatUser)
    ]);
    res.json({ people, batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/threads — my threads (DMs + batch groups) with unread counts
router.get('/threads', requireChatUser, async (req, res) => {
  try {
    const batches = await accessibleBatches(req.chatUser);
    const threads = await messagesDb.listThreads(req.chatUser, batches);
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/unread-count — total unread (for the nav badge)
router.get('/unread-count', requireChatUser, async (req, res) => {
  try {
    const batches = await accessibleBatches(req.chatUser);
    res.json({ count: await messagesDb.unreadTotal(req.chatUser, batches) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/dm — find/create a DM thread with { withType, withId }
router.post('/dm', requireChatUser, async (req, res) => {
  try {
    const { withType, withId } = req.body || {};
    if (!withType || !withId) return res.status(400).json({ error: 'withType and withId are required' });
    const target = { type: withType, id: withId };
    if (!(await canDm(req.chatUser, target))) {
      return res.status(403).json({ error: 'You cannot message this person.' });
    }
    target.name = await lookupName(target.type, target.id);
    const thread = await messagesDb.ensureDmThread(req.chatUser, target);
    res.json({ id: thread.id, type: 'dm', title: target.name, counterpart: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/threads/:id/messages?before=
router.get('/threads/:id/messages', requireChatUser, async (req, res) => {
  try {
    const thread = await authorizeThread(req.chatUser, req.params.id);
    if (!thread) return res.status(403).json({ error: 'No access to this conversation' });
    const messages = await messagesDb.getMessages(req.params.id, { before: req.query.before });
    await messagesDb.markRead(req.params.id, req.chatUser);
    res.json({ thread: { id: thread.id, type: thread.type, batchId: thread.batch_id || null }, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/threads/:id/messages — send a message
router.post('/threads/:id/messages', requireChatUser, async (req, res) => {
  try {
    const body = (req.body && req.body.body || '').toString().trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });

    const thread = await authorizeThread(req.chatUser, req.params.id);
    if (!thread) return res.status(403).json({ error: 'No access to this conversation' });

    const clean = xss(body);
    const message = await messagesDb.addMessage(req.params.id, req.chatUser, clean);

    // Real-time fan-out to anyone viewing the thread.
    emitToThread(req, req.params.id, 'chat:message', message);

    // Notify the other DM party (skip noisy batch-thread notifications).
    if (thread.type === 'dm') {
      const parts = await messagesDb.getParticipants(req.params.id);
      const other = parts.find(p => !(p.user_type === req.chatUser.type && p.user_id === req.chatUser.id));
      if (other && other.user_type !== 'admin') {
        const linkPage = other.user_type === 'student' ? '/student-dashboard.html' : '/lecturer-dashboard.html';
        notificationsDb.create({
          recipient_id: other.user_id,
          recipient_type: other.user_type === 'student' ? 'Student' : 'Lecturer',
          type: 'chat_message',
          title: 'New message from ' + req.chatUser.name,
          message: clean.slice(0, 120),
          link: linkPage + '#messages'
        }).catch(() => {});
        const io = req.app.get('io');
        if (io) io.to(`user:${other.user_type}:${other.user_id}`).emit('chat:thread-updated', { threadId: req.params.id });
      }
    }

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/threads/:id/read — mark a thread read
router.post('/threads/:id/read', requireChatUser, async (req, res) => {
  try {
    const thread = await authorizeThread(req.chatUser, req.params.id);
    if (!thread) return res.status(403).json({ error: 'No access to this conversation' });
    await messagesDb.markRead(req.params.id, req.chatUser);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
