// ============================================================
// test/authz.test.js - batch/ownership authorization regressions
//
// Drives the REAL attendance / assignments / materials / flashcards
// routers over HTTP against the in-memory Supabase double. Locks in:
//   - students cannot act across batches (self-mark, submit, flashcards)
//   - flashcard grading is computed server-side (client isCorrect ignored)
//   - lecturers cannot read/write other lecturers' or batches' resources
//   - admins remain unrestricted
// Run: node --test test/authz.test.js
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createFakeSupabase } = require('./support/fake-supabase');

const SECRET = process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-authz';
const ROOT = path.join(__dirname, '..');
const P = (rel) => require.resolve(path.join(ROOT, rel));

const MODULES = [
  'lib/supabase.js',
  'middleware/auth.js', 'middleware/studentAuth.js', 'middleware/lecturerAuth.js',
  'db/students.js', 'db/attendance.js', 'db/assignments.js', 'db/submissions.js',
  'db/materials.js', 'db/flashcards.js', 'db/notifications.js',
  'routes/attendance.js', 'routes/assignments.js', 'routes/materials.js', 'routes/flashcards.js',
];

function loadApp(seed) {
  const fake = createFakeSupabase(seed);
  MODULES.forEach((rel) => { try { delete require.cache[P(rel)]; } catch (_) {} });
  const sp = P('lib/supabase.js');
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };

  const app = express();
  app.use(express.json());
  app.use('/api/attendance',  require(P('routes/attendance.js')));
  app.use('/api/assignments', require(P('routes/assignments.js')));
  app.use('/api/materials',   require(P('routes/materials.js')));
  app.use('/api/flashcards',  require(P('routes/flashcards.js')));
  return { fake, app };
}

function seed() {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  return {
    batches: [{ id: 'b1', name: 'Batch A' }, { id: 'b2', name: 'Batch B' }],
    students: [
      { id: 's1', full_name: 'Ada One', batch_id: 'b1', status: 'Active' },
      { id: 's3', full_name: 'Cee Three', batch_id: 'b2', status: 'Active' },
    ],
    lecturers: [{ id: 'L1', full_name: 'Lec One' }, { id: 'L2', full_name: 'Lec Two' }],
    lecturer_batches: [{ lecturer_id: 'L1', batch_id: 'b1' }, { lecturer_id: 'L2', batch_id: 'b2' }],
    attendance: [{ id: 'a1', batch_id: 'b1', week: 1, day: 'Wednesday', is_open: true, check_in_code: null, auto_close_at: null, class_date: future }],
    attendance_students: [],
    assignments: [
      { id: 'as1', batch_id: 'b1', lecturer_id: 'L1', title: 'HW1', published: true, deadline: future },
      { id: 'as2', batch_id: 'b1', lecturer_id: 'L1', title: 'Draft', published: false, deadline: future },
    ],
    submissions: [],
    materials: [{ id: 'm1', batch_id: 'b1', lecturer_id: 'L1', title: 'Notes', published: true }],
    flashcard_sets: [{ id: 'fs1', batch_id: 'b1', lecturer_id: 'L1', title: 'Set 1', published: true, week: 1 }],
    flashcards: [
      { id: 'c1', set_id: 'fs1', batch_id: 'b1', question: 'Q1', correct_answer: 'A', options: ['A', 'B'], order: 0 },
      { id: 'c2', set_id: 'fs1', batch_id: 'b1', question: 'Q2', correct_answer: 'B', options: ['A', 'B'], order: 1 },
    ],
    flashcard_responses: [],
    notifications: [],
  };
}

const tok = (id, role) => jwt.sign({ id, role, name: id }, SECRET, { algorithm: 'HS256' });
const STUDENT_B1 = tok('s1', 'student');
const STUDENT_B2 = tok('s3', 'student');
const LEC_B1 = tok('L1', 'lecturer');
const LEC_B2 = tok('L2', 'lecturer');
const ADMIN = tok('u1', 'admin');

function startApp(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

async function req(base, method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

test('attendance self-mark: cross-batch student is rejected, own batch passes', async () => {
  const { fake, app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    const cross = await req(base, 'POST', '/api/attendance/a1/self-mark', STUDENT_B2, {});
    assert.strictEqual(cross.status, 403, 'batch-b2 student must not self-mark a batch-b1 session');

    const own = await req(base, 'POST', '/api/attendance/a1/self-mark', STUDENT_B1, {});
    assert.strictEqual(own.status, 200);
    const marks = fake._store.attendance_students.filter((r) => r.attendance_id === 'a1');
    assert.deepStrictEqual(marks.map((m) => m.student_id), ['s1'], 'only the batch-b1 student is marked');
  } finally { srv.close(); }
});

test('assignment submit: cross-batch and unpublished are rejected, own+published passes', async () => {
  const { fake, app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    const cross = await req(base, 'POST', '/api/assignments/as1/submissions', STUDENT_B2, { content: 'hi' });
    assert.strictEqual(cross.status, 403);

    const draft = await req(base, 'POST', '/api/assignments/as2/submissions', STUDENT_B1, { content: 'hi' });
    assert.strictEqual(draft.status, 403, 'unpublished assignment must not accept submissions');

    const ok = await req(base, 'POST', '/api/assignments/as1/submissions', STUDENT_B1, { content: 'hi' });
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(fake._store.submissions.length, 1);
    assert.strictEqual(fake._store.submissions[0].student_id, 's1');
  } finally { srv.close(); }
});

test('flashcard respond: grading is server-side, client isCorrect is ignored; cross-batch blocked', async () => {
  const { fake, app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    const cross = await req(base, 'POST', '/api/flashcards/sets/fs1/respond', STUDENT_B2, {
      responses: [{ flashcard: 'c1', answer: 'A' }],
    });
    assert.strictEqual(cross.status, 404, 'other batch cannot even see the set');

    // Wrong answer with a forged isCorrect:true must be stored as incorrect.
    const ok = await req(base, 'POST', '/api/flashcards/sets/fs1/respond', STUDENT_B1, {
      responses: [
        { flashcard: 'c1', answer: 'B', isCorrect: true },  // wrong (correct is A)
        { flashcard: 'c2', answer: 'B', isCorrect: false }, // right (correct is B)
        { flashcard: 'nope', answer: 'A' },                 // unknown card dropped
      ],
    });
    assert.strictEqual(ok.status, 201);
    const saved = fake._store.flashcard_responses;
    assert.strictEqual(saved.length, 2, 'unknown card ids are dropped');
    const byCard = Object.fromEntries(saved.map((r) => [r.flashcard_id, r.is_correct]));
    assert.strictEqual(byCard.c1, false, 'forged isCorrect must be ignored');
    assert.strictEqual(byCard.c2, true, 'genuinely correct answer is graded correct');
  } finally { srv.close(); }
});

test('materials: lecturer cannot read or edit another lecturer\'s material; owner and admin can', async () => {
  const { app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    assert.strictEqual((await req(base, 'GET', '/api/materials/m1', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'PATCH', '/api/materials/m1', LEC_B2, { title: 'hax' })).status, 403);
    assert.strictEqual((await req(base, 'DELETE', '/api/materials/m1', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/materials/m1', LEC_B1)).status, 200);
    assert.strictEqual((await req(base, 'PATCH', '/api/materials/m1', ADMIN, { title: 'admin edit' })).status, 200);
  } finally { srv.close(); }
});

test('assignments: lecturer scoping on detail, submissions list and grading', async () => {
  const { app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    assert.strictEqual((await req(base, 'GET', '/api/assignments/as1', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/assignments/as1/submissions', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'PATCH', '/api/assignments/as1', LEC_B2, { title: 'hax' })).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/assignments/as1', LEC_B1)).status, 200);
    assert.strictEqual((await req(base, 'GET', '/api/assignments/as1/submissions', ADMIN)).status, 200);
  } finally { srv.close(); }
});

test('attendance: lecturer cannot open/edit another batch\'s session; assigned lecturer can', async () => {
  const { app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    assert.strictEqual((await req(base, 'PATCH', '/api/attendance/a1/open', LEC_B2, {})).status, 403);
    assert.strictEqual((await req(base, 'PATCH', '/api/attendance/a1', LEC_B2, { topic: 'hax' })).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/attendance/a1', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'PATCH', '/api/attendance/a1/open', LEC_B1, {})).status, 200);

    // POST create for a foreign batch is rejected
    const cross = await req(base, 'POST', '/api/attendance', LEC_B2, {
      batchId: 'b1', week: 2, day: 'Thursday', classDate: '2026-09-03',
    });
    assert.strictEqual(cross.status, 403);
  } finally { srv.close(); }
});

test('flashcards: lecturer cannot touch another batch\'s sets/cards/results', async () => {
  const { app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    assert.strictEqual((await req(base, 'PATCH', '/api/flashcards/sets/fs1', LEC_B2, { title: 'hax' })).status, 403);
    assert.strictEqual((await req(base, 'DELETE', '/api/flashcards/sets/fs1', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/flashcards/sets/fs1/cards', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/flashcards/sets/fs1/results', LEC_B2)).status, 403);
    assert.strictEqual((await req(base, 'PATCH', '/api/flashcards/cards/c1', LEC_B2, { question: 'hax' })).status, 403);
    assert.strictEqual((await req(base, 'GET', '/api/flashcards/sets/fs1/cards', LEC_B1)).status, 200);
    assert.strictEqual((await req(base, 'PATCH', '/api/flashcards/cards/c1', LEC_B1, { question: 'ok' })).status, 200);
  } finally { srv.close(); }
});

test('attendance list: lecturer only sees own batches, admin sees all', async () => {
  const { app } = loadApp(seed());
  const { srv, base } = await startApp(app);
  try {
    const l2 = await req(base, 'GET', '/api/attendance', LEC_B2);
    assert.strictEqual(l2.status, 200);
    assert.strictEqual((l2.json.data || []).length, 0, 'L2 has no sessions in their batch');

    const forbidden = await req(base, 'GET', '/api/attendance?batch=b1', LEC_B2);
    assert.strictEqual(forbidden.status, 403);

    const admin = await req(base, 'GET', '/api/attendance', ADMIN);
    assert.strictEqual(admin.status, 200);
    assert.strictEqual((admin.json.data || []).length, 1);
  } finally { srv.close(); }
});
