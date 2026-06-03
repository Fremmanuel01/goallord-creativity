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

// Resolve the REAL type of a user id from the database. Never trust a
// client-supplied type - that allowed a peer-DM bypass (claiming a target
// is an "admin" to skip the student↔student block).
async function verifyUserType(id) {
  const { data: s } = await supabase.from('students').select('id').eq('id', id).limit(1);
  if (s && s.length) return 'student';
  const { data: l } = await supabase.from('lecturers').select('id').eq('id', id).limit(1);
  if (l && l.length) return 'lecturer';
  const { data: a } = await supabase.from('users').select('id').eq('id', id).limit(1);
  if (a && a.length) return 'admin';
  return null;
}

// May `user` open a DM with `target`? Assumes target.type is DB-verified
// (see verifyUserType); still re-checks an admin target defensively.
async function canDm(user, target) {
  if (user.type === 'admin') return true;            // admin → anyone
  if (target.type === 'admin') {                     // → admin only if really an admin
    const { data } = await supabase.from('users').select('id').eq('id', target.id).limit(1);
    return !!(data && data.length);
  }
  if (user.type === target.type) return false;       // no student↔student / lecturer↔lecturer
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
  // batch thread - must belong to that batch
  const batches = await accessibleBatches(user);
  return batches.some(b => b.id === thread.batch_id) ? thread : null;
}

function emitToThread(req, threadId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to('thread:' + threadId).emit(event, payload);
}

// Notify every member of a batch group (active students + assigned lecturers),
// excluding the sender. Used when staff post to a batch thread.
async function notifyBatchMembers(req, thread, preview, io) {
  const sender = req.chatUser;
  const [{ data: studs }, { data: lecRows }] = await Promise.all([
    supabase.from('students').select('id').eq('batch_id', thread.batch_id).eq('status', 'Active'),
    supabase.from('lecturer_batches').select('lecturer_id').eq('batch_id', thread.batch_id)
  ]);

  const title = 'New message in ' + (thread.title || 'your group');
  const message = preview.slice(0, 120);
  const notifs = [];

  (studs || []).forEach(s => {
    if (sender.type === 'student' && s.id === sender.id) return;
    notifs.push({
      recipient_id: s.id, recipient_type: 'Student', type: 'chat_message',
      title, message, link: '/student-dashboard.html#messages'
    });
  });
  (lecRows || []).forEach(r => {
    if (sender.type === 'lecturer' && r.lecturer_id === sender.id) return;
    notifs.push({
      recipient_id: r.lecturer_id, recipient_type: 'Lecturer', type: 'chat_message',
      title, message, link: '/lecturer-dashboard.html#messages'
    });
  });

  if (notifs.length) await notificationsDb.insertMany(notifs).catch(() => {});

  if (io) {
    (studs || []).forEach(s => io.to(`user:student:${s.id}`).emit('chat:thread-updated', { threadId: thread.id }));
    (lecRows || []).forEach(r => io.to(`user:lecturer:${r.lecturer_id}`).emit('chat:thread-updated', { threadId: thread.id }));
  }
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/messages/contacts - who I can DM + which group chats I have
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

// GET /api/messages/threads - my threads (DMs + batch groups) with unread counts
router.get('/threads', requireChatUser, async (req, res) => {
  try {
    const batches = await accessibleBatches(req.chatUser);
    const threads = await messagesDb.listThreads(req.chatUser, batches);
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/unread-count - total unread (for the nav badge)
router.get('/unread-count', requireChatUser, async (req, res) => {
  try {
    const batches = await accessibleBatches(req.chatUser);
    res.json({ count: await messagesDb.unreadTotal(req.chatUser, batches) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/dm - find/create a DM thread with { withType, withId }
router.post('/dm', requireChatUser, async (req, res) => {
  try {
    const { withId } = req.body || {};
    if (!withId) return res.status(400).json({ error: 'withId is required' });
    // Resolve the real type from the DB - never trust client-supplied withType.
    const verifiedType = await verifyUserType(withId);
    if (!verifiedType) return res.status(404).json({ error: 'User not found' });
    const target = { type: verifiedType, id: withId };
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
    res.json({
      thread: {
        id: thread.id,
        type: thread.type,
        batchId: thread.batch_id || null,
        postPolicy: thread.post_policy || 'open',
        canPost: messagesDb.canPostToThread(req.chatUser, thread),
        canManage: thread.type === 'batch' && req.chatUser.type !== 'student'
      },
      messages
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/threads/:id/messages - send a message
router.post('/threads/:id/messages', requireChatUser, async (req, res) => {
  try {
    const body = (req.body && req.body.body || '').toString().trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });

    const thread = await authorizeThread(req.chatUser, req.params.id);
    if (!thread) return res.status(403).json({ error: 'No access to this conversation' });

    // Announcement channels: students are read-only.
    if (!messagesDb.canPostToThread(req.chatUser, thread)) {
      return res.status(403).json({ error: 'Only staff can post in this announcement channel.' });
    }

    const clean = xss(body);
    const message = await messagesDb.addMessage(req.params.id, req.chatUser, clean);

    // Real-time fan-out to anyone viewing the thread.
    emitToThread(req, req.params.id, 'chat:message', message);

    const io = req.app.get('io');

    if (thread.type === 'dm') {
      // Notify the other DM party.
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
        if (io) io.to(`user:${other.user_type}:${other.user_id}`).emit('chat:thread-updated', { threadId: req.params.id });
      }
    } else if (thread.type === 'batch' && (req.chatUser.type === 'lecturer' || req.chatUser.type === 'admin')) {
      // Staff post to a batch group → notify every batch member (fixes silently-missed group messages).
      // Student posts in 'open' groups stay quiet to avoid notification spam.
      await notifyBatchMembers(req, thread, clean, io).catch(() => {});
    }

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/threads/:id/read - mark a thread read
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

// POST /api/messages/threads/:id/policy - staff set a batch group's posting policy
router.post('/threads/:id/policy', requireChatUser, async (req, res) => {
  try {
    const policy = (req.body && req.body.policy || '').toString();
    if (!['open', 'announce'].includes(policy)) {
      return res.status(400).json({ error: 'Invalid policy' });
    }
    const thread = await authorizeThread(req.chatUser, req.params.id);
    if (!thread) return res.status(403).json({ error: 'No access to this conversation' });
    if (thread.type !== 'batch') return res.status(400).json({ error: 'Policy only applies to group chats' });
    if (req.chatUser.type === 'student') return res.status(403).json({ error: 'Only staff can change this setting' });

    const updated = await messagesDb.setPostPolicy(req.params.id, policy);
    emitToThread(req, req.params.id, 'chat:policy', { threadId: req.params.id, postPolicy: policy });
    res.json({ id: updated.id, postPolicy: updated.post_policy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Internal helpers exposed for unit tests only - attaching properties to the
// router function has no effect on Express routing.
router._test = { accessibleBatches, dmContacts, canDm, verifyUserType, lookupName, authorizeThread, notifyBatchMembers };

module.exports = router;
