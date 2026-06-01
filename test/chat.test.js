// ============================================================
// test/chat.test.js — portal chat unit/integration tests
//
// Runs the REAL chat code (db/messages, routes/messages helpers,
// middleware/chatAuth) against an in-memory Supabase double.
// Run: node --test
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createFakeSupabase } = require('./support/fake-supabase');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-chat';

const ROOT = path.join(__dirname, '..');
const P = (rel) => require.resolve(path.join(ROOT, rel));

// Fresh modules bound to a fresh fake Supabase for each scenario.
function loadChat(seed) {
  const fake = createFakeSupabase(seed);
  ['db/messages.js', 'db/notifications.js', 'routes/messages.js', 'lib/supabase.js'].forEach((rel) => {
    try { delete require.cache[P(rel)]; } catch (_) {}
  });
  const sp = P('lib/supabase.js');
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };
  const messagesDb = require(P('db/messages.js'));
  const notificationsDb = require(P('db/notifications.js'));
  const routes = require(P('routes/messages.js'));
  return { fake, messagesDb, notificationsDb, routes, h: routes._test };
}

// ── Seed: 2 batches, 4 students (s4 graduated), 2 lecturers, 1 admin ──
function seed() {
  return {
    batches: [
      { id: 'b1', name: 'Batch A' },
      { id: 'b2', name: 'Batch B' }
    ],
    students: [
      { id: 's1', full_name: 'Ada One',  track: 'UI/UX',      batch_id: 'b1', status: 'Active' },
      { id: 's2', full_name: 'Ben Two',  track: 'WordPress',  batch_id: 'b1', status: 'Active' },
      { id: 's3', full_name: 'Cee Three', track: 'AI',        batch_id: 'b2', status: 'Active' },
      { id: 's4', full_name: 'Dee Four', track: 'UI/UX',      batch_id: 'b1', status: 'Graduated' }
    ],
    lecturers: [
      { id: 'L1', full_name: 'Lec One', specialization: 'Design' },
      { id: 'L2', full_name: 'Lec Two', specialization: 'Code' }
    ],
    lecturer_batches: [
      { lecturer_id: 'L1', batch_id: 'b1' },
      { lecturer_id: 'L2', batch_id: 'b2' }
    ],
    users: [{ id: 'u1', name: 'Admin User' }],
    chat_threads: [],
    chat_participants: [],
    chat_messages: [],
    notifications: []
  };
}

const S1 = { type: 'student', id: 's1', name: 'Ada One' };
const S3 = { type: 'student', id: 's3', name: 'Cee Three' };
const L1 = { type: 'lecturer', id: 'L1', name: 'Lec One' };
const ADMIN = { type: 'admin', id: 'u1', name: 'Admin User' };

// ════════════════════════════════════════════════════════════
test('dmKey is order-independent and stable', () => {
  const { messagesDb } = loadChat(seed());
  const a = messagesDb.dmKey(S1, L1);
  const b = messagesDb.dmKey(L1, S1);
  assert.strictEqual(a, b, 'pair key must not depend on argument order');
  assert.match(a, /student:s1/);
  assert.match(a, /lecturer:L1/);
});

test('canPostToThread: students are read-only only in announce batch threads', () => {
  const { messagesDb } = loadChat(seed());
  const cp = messagesDb.canPostToThread;
  assert.strictEqual(cp(S1, { type: 'batch', post_policy: 'announce' }), false, 'student blocked in announce group');
  assert.strictEqual(cp(S1, { type: 'batch', post_policy: 'open' }), true, 'student allowed in open group');
  assert.strictEqual(cp(L1, { type: 'batch', post_policy: 'announce' }), true, 'lecturer always allowed');
  assert.strictEqual(cp(ADMIN, { type: 'batch', post_policy: 'announce' }), true, 'admin always allowed');
  assert.strictEqual(cp(S1, { type: 'dm', post_policy: 'announce' }), true, 'policy never restricts DMs');
  assert.strictEqual(cp(S1, null), false, 'no thread → cannot post');
});

test('ensureDmThread creates one thread + two participants, idempotently', async () => {
  const { messagesDb, fake } = loadChat(seed());
  const t1 = await messagesDb.ensureDmThread(S1, L1);
  assert.strictEqual(t1.type, 'dm');
  assert.ok(t1.dm_key, 'dm_key set');
  let parts = await messagesDb.getParticipants(t1.id);
  assert.strictEqual(parts.length, 2);

  const t2 = await messagesDb.ensureDmThread(L1, S1); // reversed order
  assert.strictEqual(t2.id, t1.id, 'same thread reused');
  parts = await messagesDb.getParticipants(t1.id);
  assert.strictEqual(parts.length, 2, 'no duplicate participants');
  assert.strictEqual(fake._store.chat_threads.length, 1, 'only one thread row');
});

test('ensureBatchThread is idempotent per batch', async () => {
  const { messagesDb, fake } = loadChat(seed());
  const a = await messagesDb.ensureBatchThread('b1', 'Batch A');
  const b = await messagesDb.ensureBatchThread('b1', 'Batch A');
  assert.strictEqual(a.id, b.id);
  assert.strictEqual(fake._store.chat_threads.filter((t) => t.type === 'batch').length, 1);
});

test('addMessage stores body, updates thread preview, marks sender read', async () => {
  const { messagesDb, fake } = loadChat(seed());
  const t = await messagesDb.ensureDmThread(S1, L1);
  const m = await messagesDb.addMessage(t.id, S1, 'Hello prof');
  assert.strictEqual(m.body, 'Hello prof');
  const thread = fake._store.chat_threads.find((x) => x.id === t.id);
  assert.strictEqual(thread.last_message_preview, 'Hello prof');
  assert.ok(thread.last_message_at, 'last_message_at set');
  const senderPart = fake._store.chat_participants.find((p) => p.user_id === 's1' && p.thread_id === t.id);
  assert.strictEqual(senderPart.last_read_at, m.created_at, 'sender auto-read up to own message');
});

test('getMessages returns chronological order and honours `before`', async () => {
  const { messagesDb } = loadChat(seed());
  const t = await messagesDb.ensureDmThread(S1, L1);
  await messagesDb.addMessage(t.id, S1, 'one');
  await messagesDb.addMessage(t.id, L1, 'two');
  const m3 = await messagesDb.addMessage(t.id, S1, 'three');
  const all = await messagesDb.getMessages(t.id);
  assert.deepStrictEqual(all.map((m) => m.body), ['one', 'two', 'three'], 'ascending order');
  const older = await messagesDb.getMessages(t.id, { before: m3.created_at });
  assert.deepStrictEqual(older.map((m) => m.body), ['one', 'two'], 'before excludes newest');
});

test('unread counting excludes own messages and respects markRead', async () => {
  const { messagesDb } = loadChat(seed());
  const t = await messagesDb.ensureDmThread(S1, L1);
  await messagesDb.addMessage(t.id, L1, 'msg a');
  await messagesDb.addMessage(t.id, L1, 'msg b');
  await messagesDb.addMessage(t.id, S1, 'my reply');
  // s1 has not read L1's messages yet
  let unread = await messagesDb.unreadCount(t.id, S1, null);
  assert.strictEqual(unread, 2, 'two messages from L1 unread, own excluded');
  await messagesDb.markRead(t.id, S1);
  const part = (await messagesDb.getParticipants(t.id)).find((p) => p.user_id === 's1');
  unread = await messagesDb.unreadCount(t.id, S1, part.last_read_at);
  assert.strictEqual(unread, 0, 'all read after markRead');
});

test('listThreads returns DM (titled by counterpart) + batch group with unread', async () => {
  const { messagesDb } = loadChat(seed());
  const dm = await messagesDb.ensureDmThread(S1, L1);
  await messagesDb.addMessage(dm.id, L1, 'hi ada');
  const threads = await messagesDb.listThreads(S1, [{ id: 'b1', name: 'Batch A' }]);
  const dmView = threads.find((x) => x.type === 'dm');
  const batchView = threads.find((x) => x.type === 'batch');
  assert.ok(dmView, 'dm thread listed');
  assert.strictEqual(dmView.title, 'Lec One', 'DM titled by the other party');
  assert.strictEqual(dmView.unread, 1, 'one unread from L1');
  assert.ok(batchView, 'batch group auto-listed');
});

test('setPostPolicy updates the thread policy', async () => {
  const { messagesDb } = loadChat(seed());
  const t = await messagesDb.ensureBatchThread('b1', 'Batch A');
  const updated = await messagesDb.setPostPolicy(t.id, 'announce');
  assert.strictEqual(updated.post_policy, 'announce');
});

// ── Permission model (the safeguarding core) ───────────────
test('canDm enforces role-scoped messaging', async () => {
  const { h } = loadChat(seed());
  // student ↔ lecturer of the SAME batch → allowed (both directions)
  assert.strictEqual(await h.canDm(S1, { type: 'lecturer', id: 'L1' }), true);
  assert.strictEqual(await h.canDm(L1, { type: 'student', id: 's1' }), true);
  // student ↔ lecturer of a DIFFERENT batch → blocked
  assert.strictEqual(await h.canDm(S1, { type: 'lecturer', id: 'L2' }), false);
  // peer-to-peer is always blocked
  assert.strictEqual(await h.canDm(S1, { type: 'student', id: 's2' }), false, 'no student↔student');
  assert.strictEqual(await h.canDm(L1, { type: 'lecturer', id: 'L2' }), false, 'no lecturer↔lecturer');
  // admin ↔ anyone, either direction
  assert.strictEqual(await h.canDm(ADMIN, { type: 'student', id: 's3' }), true);
  assert.strictEqual(await h.canDm(ADMIN, { type: 'lecturer', id: 'L2' }), true);
  assert.strictEqual(await h.canDm(S3, { type: 'admin', id: 'u1' }), true);
});

test('canDm: forged "admin" target cannot bypass the peer-DM block', async () => {
  const { h } = loadChat(seed());
  // s2 is a student, not an admin. Claiming type:'admin' must NOT grant access.
  assert.strictEqual(await h.canDm(S1, { type: 'admin', id: 's2' }), false, 'forged admin claim rejected');
  // A real admin id is still allowed.
  assert.strictEqual(await h.canDm(S1, { type: 'admin', id: 'u1' }), true, 'genuine admin allowed');
});

test('verifyUserType resolves the real type from the database', async () => {
  const { h } = loadChat(seed());
  assert.strictEqual(await h.verifyUserType('s1'), 'student');
  assert.strictEqual(await h.verifyUserType('L1'), 'lecturer');
  assert.strictEqual(await h.verifyUserType('u1'), 'admin');
  assert.strictEqual(await h.verifyUserType('does-not-exist'), null);
});

test('canAccessThread gates socket room joins (DM + batch)', async () => {
  const { messagesDb } = loadChat(seed());
  const dm = await messagesDb.ensureDmThread(S1, L1);
  assert.strictEqual(await messagesDb.canAccessThread(S1, dm.id), true, 'participant');
  assert.strictEqual(await messagesDb.canAccessThread(S3, dm.id), false, 'non-participant blocked');

  const batch = await messagesDb.ensureBatchThread('b1', 'Batch A');
  assert.strictEqual(await messagesDb.canAccessThread(S1, batch.id), true, 'b1 student');
  assert.strictEqual(await messagesDb.canAccessThread(S3, batch.id), false, 'b2 student blocked from b1 group');
  assert.strictEqual(await messagesDb.canAccessThread(L1, batch.id), true, 'b1 lecturer');
  assert.strictEqual(await messagesDb.canAccessThread(ADMIN, batch.id), true, 'admin sees any group');
  assert.strictEqual(await messagesDb.canAccessThread(S1, 'missing-thread'), false, 'unknown thread');
});

test('accessibleBatches is scoped per role', async () => {
  const { h } = loadChat(seed());
  assert.deepStrictEqual((await h.accessibleBatches(S1)).map((b) => b.id), ['b1']);
  assert.deepStrictEqual((await h.accessibleBatches(L1)).map((b) => b.id), ['b1']);
  assert.deepStrictEqual((await h.accessibleBatches(ADMIN)).map((b) => b.id).sort(), ['b1', 'b2']);
});

test('dmContacts excludes peers and non-active students', async () => {
  const { h } = loadChat(seed());
  const studentContacts = await h.dmContacts(S1);
  assert.deepStrictEqual(studentContacts.map((c) => c.id), ['L1'], 'student sees only their batch lecturer');

  const lecturerContacts = await h.dmContacts(L1);
  const ids = lecturerContacts.map((c) => c.id).sort();
  assert.deepStrictEqual(ids, ['s1', 's2'], 'lecturer sees ACTIVE students in batch (not graduated s4)');

  const adminContacts = await h.dmContacts(ADMIN);
  assert.ok(adminContacts.some((c) => c.type === 'lecturer'), 'admin sees lecturers');
  assert.ok(adminContacts.some((c) => c.type === 'student'), 'admin sees students');
  assert.ok(!adminContacts.some((c) => c.id === 's4'), 'admin does not see graduated students');
});

test('authorizeThread gates DM participants and batch membership', async () => {
  const { messagesDb, h } = loadChat(seed());
  const dm = await messagesDb.ensureDmThread(S1, L1);
  assert.ok(await h.authorizeThread(S1, dm.id), 'participant may access DM');
  assert.strictEqual(await h.authorizeThread(S3, dm.id), null, 'non-participant blocked from DM');

  const batch = await messagesDb.ensureBatchThread('b1', 'Batch A');
  assert.ok(await h.authorizeThread(S1, batch.id), 'b1 student may access b1 group');
  assert.strictEqual(await h.authorizeThread(S3, batch.id), null, 'b2 student blocked from b1 group');
});

test('notifyBatchMembers notifies active members, excludes sender', async () => {
  const { messagesDb, h, fake } = loadChat(seed());
  const batch = await messagesDb.ensureBatchThread('b1', 'Batch A');
  const req = { chatUser: L1, app: { get: () => null } };
  await h.notifyBatchMembers(req, { id: batch.id, type: 'batch', batch_id: 'b1', title: 'Batch A — Group Chat' }, 'Class moved to 3pm', null);
  const notifs = fake._store.notifications;
  const recipientIds = notifs.map((n) => n.recipient_id).sort();
  assert.deepStrictEqual(recipientIds, ['s1', 's2'], 'both active b1 students notified; sender lecturer excluded; graduated excluded');
  assert.ok(notifs.every((n) => n.recipient_type === 'Student'), 'student recipient type');
  assert.ok(notifs.every((n) => n.type === 'chat_message'));
});

test('notifyBatchMembers: admin sender notifies all members incl. lecturers', async () => {
  const { messagesDb, h, fake } = loadChat(seed());
  const batch = await messagesDb.ensureBatchThread('b1', 'Batch A');
  const req = { chatUser: ADMIN, app: { get: () => null } };
  await h.notifyBatchMembers(req, { id: batch.id, type: 'batch', batch_id: 'b1', title: 'Batch A — Group Chat' }, 'Holiday notice', null);
  const recipients = fake._store.notifications.map((n) => `${n.recipient_type}:${n.recipient_id}`).sort();
  // admin is not in the batch, so nobody is excluded: 2 active students + lecturer L1
  assert.deepStrictEqual(recipients, ['Lecturer:L1', 'Student:s1', 'Student:s2']);
});

test('notifyBatchMembers: empty batch sends nothing and does not throw', async () => {
  const { messagesDb, h, fake } = loadChat(seed());
  const batch = await messagesDb.ensureBatchThread('b_empty', 'Empty Batch');
  const req = { chatUser: L1, app: { get: () => null } };
  await h.notifyBatchMembers(req, { id: batch.id, type: 'batch', batch_id: 'b_empty', title: 'Empty Batch' }, 'anyone?', null);
  assert.strictEqual(fake._store.notifications.length, 0);
});

// ── Auth normalisation ─────────────────────────────────────
test('chatAuth.verifyChatToken normalises roles', () => {
  delete require.cache[P('middleware/chatAuth.js')];
  const { verifyChatToken } = require(P('middleware/chatAuth.js'));
  const sign = (role) => jwt.sign({ id: 'x', name: 'N', role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  assert.strictEqual(verifyChatToken(sign('student')).type, 'student');
  assert.strictEqual(verifyChatToken(sign('lecturer')).type, 'lecturer');
  assert.strictEqual(verifyChatToken(sign('admin')).type, 'admin');
  assert.strictEqual(verifyChatToken(sign('staff')).type, 'admin', 'staff maps to admin');
  assert.strictEqual(verifyChatToken(sign('visitor')), null, 'unknown role rejected');
  assert.strictEqual(verifyChatToken('garbage.token'), null, 'invalid token rejected');
});
