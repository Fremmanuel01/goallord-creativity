// ============================================================
// test/chat.http.test.js - HTTP-layer integration tests
//
// Drives the REAL Express /api/messages router (with requireChatUser
// auth middleware) against the in-memory Supabase double, over real
// HTTP. Verifies status codes / permission enforcement end-to-end -
// the layer that pure unit tests of helpers cannot reach.
// Run: node --test
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createFakeSupabase } = require('./support/fake-supabase');

const SECRET = process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-chat';
const ROOT = path.join(__dirname, '..');
const P = (rel) => require.resolve(path.join(ROOT, rel));

function loadChat(seed) {
  const fake = createFakeSupabase(seed);
  ['db/messages.js', 'db/notifications.js', 'routes/messages.js', 'lib/supabase.js', 'middleware/chatAuth.js']
    .forEach((rel) => { try { delete require.cache[P(rel)]; } catch (_) {} });
  const sp = P('lib/supabase.js');
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };
  const messagesDb = require(P('db/messages.js'));
  const routes = require(P('routes/messages.js'));
  return { fake, messagesDb, routes };
}

function seed() {
  return {
    batches: [{ id: 'b1', name: 'Batch A' }, { id: 'b2', name: 'Batch B' }],
    students: [
      { id: 's1', full_name: 'Ada One', track: 'UI/UX', batch_id: 'b1', status: 'Active' },
      { id: 's2', full_name: 'Ben Two', track: 'WordPress', batch_id: 'b1', status: 'Active' },
      { id: 's3', full_name: 'Cee Three', track: 'AI', batch_id: 'b2', status: 'Active' }
    ],
    lecturers: [
      { id: 'L1', full_name: 'Lec One', specialization: 'Design' },
      { id: 'L2', full_name: 'Lec Two', specialization: 'Code' }
    ],
    lecturer_batches: [{ lecturer_id: 'L1', batch_id: 'b1' }, { lecturer_id: 'L2', batch_id: 'b2' }],
    users: [{ id: 'u1', name: 'Admin User' }],
    chat_threads: [], chat_participants: [], chat_messages: [], notifications: []
  };
}

const tokenFor = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { algorithm: 'HS256' });
const STUDENT1 = { id: 's1', role: 'student', name: 'Ada One' };
const STUDENT3 = { id: 's3', role: 'student', name: 'Cee Three' };
const LEC1 = { id: 'L1', role: 'lecturer', name: 'Lec One' };

function startApp(routes) {
  const app = express();
  app.use(express.json());
  app.use('/api/messages', routes);
  return new Promise((res) => { const srv = app.listen(0, () => res(srv)); });
}

async function call(srv, method, p, token, body) {
  const port = srv.address().port;
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (_) {}
  return { status: r.status, json };
}

async function withApp(t, seedData, fn) {
  const ctx = loadChat(seedData || seed());
  const srv = await startApp(ctx.routes);
  t.after(() => new Promise((r) => srv.close(r)));
  return fn(srv, ctx);
}

// ── Auth ───────────────────────────────────────────────────
test('GET /threads without a token → 401', async (t) => {
  await withApp(t, null, async (srv) => {
    const r = await call(srv, 'GET', '/api/messages/threads');
    assert.strictEqual(r.status, 401);
  });
});

// ── POST /dm permission enforcement ────────────────────────
test('POST /dm student→student → 403', async (t) => {
  await withApp(t, null, async (srv) => {
    const r = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), { withId: 's2' });
    assert.strictEqual(r.status, 403);
    assert.match(r.json.error, /cannot message/i);
  });
});

test('POST /dm forged admin type (withType ignored) → still 403', async (t) => {
  await withApp(t, null, async (srv) => {
    // The classic bypass attempt: claim the other student is an admin.
    const r = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), { withType: 'admin', withId: 's2' });
    assert.strictEqual(r.status, 403, 'server resolves real type from DB, ignores withType');
  });
});

test('POST /dm student→cross-batch lecturer → 403', async (t) => {
  await withApp(t, null, async (srv) => {
    const r = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), { withId: 'L2' });
    assert.strictEqual(r.status, 403);
  });
});

test('POST /dm student→same-batch lecturer → 200 (thread created)', async (t) => {
  await withApp(t, null, async (srv) => {
    const r = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), { withId: 'L1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.type, 'dm');
    assert.strictEqual(r.json.title, 'Lec One');
  });
});

test('POST /dm missing withId → 400; unknown id → 404', async (t) => {
  await withApp(t, null, async (srv) => {
    const a = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), {});
    assert.strictEqual(a.status, 400);
    const b = await call(srv, 'POST', '/api/messages/dm', tokenFor(STUDENT1), { withId: 'ghost' });
    assert.strictEqual(b.status, 404);
  });
});

// ── Announce-mode posting enforcement ──────────────────────
test('announce batch: student POST message → 403, staff → 201', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    await ctx.messagesDb.setPostPolicy(thread.id, 'announce');

    const studentPost = await call(srv, 'POST', `/api/messages/threads/${thread.id}/messages`, tokenFor(STUDENT1), { body: 'can I post?' });
    assert.strictEqual(studentPost.status, 403);
    assert.match(studentPost.json.error, /announcement channel/i);

    const staffPost = await call(srv, 'POST', `/api/messages/threads/${thread.id}/messages`, tokenFor(LEC1), { body: 'Class at 3pm' });
    assert.strictEqual(staffPost.status, 201);
    assert.strictEqual(staffPost.json.body, 'Class at 3pm');
  });
});

test('cross-batch student cannot post to a group they are not in → 403', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    const r = await call(srv, 'POST', `/api/messages/threads/${thread.id}/messages`, tokenFor(STUDENT3), { body: 'hi' });
    assert.strictEqual(r.status, 403);
  });
});

test('message validation: empty → 400, >4000 chars → 400', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    const empty = await call(srv, 'POST', `/api/messages/threads/${thread.id}/messages`, tokenFor(LEC1), { body: '   ' });
    assert.strictEqual(empty.status, 400);
    const big = await call(srv, 'POST', `/api/messages/threads/${thread.id}/messages`, tokenFor(LEC1), { body: 'x'.repeat(4001) });
    assert.strictEqual(big.status, 400);
  });
});

// ── Policy endpoint enforcement ────────────────────────────
test('POST /policy: student → 403, lecturer → 200', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    const asStudent = await call(srv, 'POST', `/api/messages/threads/${thread.id}/policy`, tokenFor(STUDENT1), { policy: 'announce' });
    assert.strictEqual(asStudent.status, 403);
    assert.match(asStudent.json.error, /only staff/i);

    const asLecturer = await call(srv, 'POST', `/api/messages/threads/${thread.id}/policy`, tokenFor(LEC1), { policy: 'announce' });
    assert.strictEqual(asLecturer.status, 200);
    assert.strictEqual(asLecturer.json.postPolicy, 'announce');
  });
});

test('POST /policy: invalid value → 400', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    const r = await call(srv, 'POST', `/api/messages/threads/${thread.id}/policy`, tokenFor(LEC1), { policy: 'nonsense' });
    assert.strictEqual(r.status, 400);
  });
});

// ── GET messages response shape ────────────────────────────
test('GET messages returns postPolicy/canPost/canManage per role', async (t) => {
  await withApp(t, null, async (srv, ctx) => {
    const thread = await ctx.messagesDb.ensureBatchThread('b1', 'Batch A');
    await ctx.messagesDb.setPostPolicy(thread.id, 'announce');

    const student = await call(srv, 'GET', `/api/messages/threads/${thread.id}/messages`, tokenFor(STUDENT1));
    assert.strictEqual(student.status, 200);
    assert.strictEqual(student.json.thread.postPolicy, 'announce');
    assert.strictEqual(student.json.thread.canPost, false, 'student read-only in announce group');
    assert.strictEqual(student.json.thread.canManage, false);

    const lecturer = await call(srv, 'GET', `/api/messages/threads/${thread.id}/messages`, tokenFor(LEC1));
    assert.strictEqual(lecturer.json.thread.canPost, true);
    assert.strictEqual(lecturer.json.thread.canManage, true, 'staff can manage policy');
  });
});
