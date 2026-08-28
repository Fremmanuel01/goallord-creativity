// ============================================================
// test/academy.e2e.test.js — full-stack HTTP walkthrough
//
// Drives the REAL app stack (helmet/CSP, camelKeys, CSRF double-submit,
// cookie-JWT auth, every academy router) over a live socket, using a
// cookie jar exactly like a browser: GET a page to obtain the _csrf
// cookie, log in through the real endpoint (httpOnly cookie set),
// then exercise student / lecturer / admin flows and the Lectures
// feature end-to-end. Also re-verifies the 7 security fixes from the
// browser/API perspective (malformed ids, expired auth, no data leak).
//
// Run: node --test test/academy.e2e.test.js
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { buildApp } = require('./support/app-harness');
const { seed, PW } = require('./support/e2e-seed');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret';

// ── tiny cookie-jar HTTP client (browser-like) ───────────────
class Client {
  constructor(base) { this.base = base; this.jar = {}; }
  _storeCookies(res) {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > -1) this.jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  _cookieHeader() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, url, body) {
    const headers = {};
    const cookie = this._cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // CSRF: mirror the _csrf cookie into the header for mutations.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && this.jar._csrf) {
      headers['X-CSRF-Token'] = this.jar._csrf;
    }
    const res = await fetch(this.base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    this._storeCookies(res);
    let json = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) { try { json = await res.json(); } catch (_) {} }
    return { status: res.status, json, headers: res.headers };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b); }
  patch(u, b) { return this.req('PATCH', u, b); }
  del(u) { return this.req('DELETE', u); }
  // Prime the _csrf cookie the way a browser does (loads a page first).
  async prime() { await this.get('/api/config/public'); return this; }
}

let server, base;

test.before(async () => {
  const { app } = buildApp(seed(), { quiet: true });
  await new Promise((resolve) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
});
test.after(() => { if (server) server.close(); });

function client() { return new Client(base); }
async function loginStudent(email) {
  const c = await client().prime();
  const r = await c.post('/api/students/login', { email, password: PW });
  return { c, r };
}
async function loginLecturer(email) {
  const c = await client().prime();
  const r = await c.post('/api/lecturers/login', { email, password: PW });
  return { c, r };
}
async function loginAdmin() {
  const c = await client().prime();
  const r = await c.post('/api/auth/login', { email: 'admin@test.local', password: PW });
  return { c, r };
}

// ─────────────────────────────────────────────────────────────
// CSRF + auth plumbing
// ─────────────────────────────────────────────────────────────
test('CSRF: mutating request without token is blocked; login works after priming', async () => {
  const raw = client(); // no prime → no _csrf cookie yet
  const blocked = await raw.post('/api/students/login', { email: 'ada@test.local', password: PW });
  assert.strictEqual(blocked.status, 403, 'login POST without a primed _csrf cookie must be rejected');

  const { r } = await loginStudent('ada@test.local');
  assert.strictEqual(r.status, 200, 'after priming, login succeeds');
  assert.ok(r.json.student && r.json.student.fullName === 'Ada Alpha');
});

test('unpaid student cannot log in (paymentRequired)', async () => {
  const { r } = await loginStudent('uma@test.local');
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.json.paymentRequired, true);
});

test('protected endpoint requires auth; expired token is rejected', async () => {
  const anon = await client().prime();
  assert.strictEqual((await anon.get('/api/students/me')).status, 401);

  const expired = jwt.sign({ id: 's1-t', role: 'student' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 });
  const c = await client().prime();
  c.jar.gl_student_token = expired;
  assert.strictEqual((await c.get('/api/students/me')).status, 401, 'expired JWT must 401');
});

// ─────────────────────────────────────────────────────────────
// STUDENT FLOW
// ─────────────────────────────────────────────────────────────
test('student flow: dashboard data loads for own batch only', async () => {
  const { c } = await loginStudent('ada@test.local');

  const me = await c.get('/api/students/me');
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.json.batchId, 'b1-t');

  const mats = await c.get('/api/materials/student');
  assert.strictEqual(mats.status, 200);
  assert.ok(mats.json.every(m => m.batchId === 'b1-t' && m.published === true), 'only own-batch published materials');
  assert.ok(!mats.json.some(m => m.id === 'm2-t'), 'draft material hidden');

  const asg = await c.get('/api/assignments/student');
  assert.ok(asg.json.every(a => a.batchId === 'b1-t' && a.published), 'only own-batch published assignments');

  const sets = await c.get('/api/flashcards/sets/student');
  assert.ok(sets.json.every(s => s.published && s.batchId === 'b1-t'));
  assert.ok(!sets.json.some(s => s.id === 'fs2-t'), 'draft flashcard set hidden');
});

test('student lectures: only published for own batch; drafts and other batches hidden', async () => {
  const { c } = await loginStudent('ada@test.local');

  const list = await c.get('/api/lectures/student');
  assert.strictEqual(list.status, 200);
  const allCards = [...list.json.today, ...list.json.upcoming, ...list.json.past];
  assert.ok(allCards.some(l => l.id === 'lec_pub-t'), 'published own-batch lecture visible');
  assert.ok(!allCards.some(l => l.id === 'lec_draft-t'), 'draft lecture NOT listed');
  assert.ok(!allCards.some(l => l.id === 'lec_b2-t'), 'other batch lecture NOT listed');

  const pub = await c.get('/api/lectures/lec_pub-t/student');
  assert.strictEqual(pub.status, 200);
  assert.ok(Array.isArray(pub.json.slides) && pub.json.slides.length === 2, 'published slides render');

  assert.strictEqual((await c.get('/api/lectures/lec_draft-t/student')).status, 404, 'draft body hidden from students');
  assert.strictEqual((await c.get('/api/lectures/lec_b2-t/student')).status, 404, 'other-batch lecture body blocked');
  assert.strictEqual((await c.get('/api/lectures/does-not-exist/student')).status, 404, 'malformed id fails safe');
});

test('SECURITY 1 — student cross-batch attendance self-mark blocked; own passes', async () => {
  const cross = await loginStudent('ben@test.local'); // batch b2
  const r1 = await cross.c.post('/api/attendance/att1-t/self-mark', {});
  assert.strictEqual(r1.status, 403, 'b2 student cannot mark a b1 session');

  const own = await loginStudent('ada@test.local'); // batch b1
  const r2 = await own.c.post('/api/attendance/att1-t/self-mark', {});
  assert.strictEqual(r2.status, 200);
});

test('SECURITY 2 — student cross-batch / unpublished assignment submission blocked', async () => {
  const cross = await loginStudent('ben@test.local');
  assert.strictEqual((await cross.c.post('/api/assignments/as1-t/submissions', { content: 'x' })).status, 403);

  const own = await loginStudent('ada@test.local');
  assert.strictEqual((await own.c.post('/api/assignments/as2-t/submissions', { content: 'x' })).status, 403, 'draft assignment rejects');
  assert.strictEqual((await own.c.post('/api/assignments/as1-t/submissions', { content: 'x' })).status, 201);
});

test('SECURITY 3 — flashcard grading is server-side; forged isCorrect ignored', async () => {
  const { c, r } = await loginStudent('ada@test.local');
  void r;
  const resp = await c.post('/api/flashcards/sets/fs1-t/respond', {
    responses: [
      { flashcard: 'c1-t', answer: 'A loop', isCorrect: true },  // wrong → correct is "A container"
      { flashcard: 'c2-t', answer: '4', isCorrect: false },      // right
    ],
  });
  assert.strictEqual(resp.status, 201);
  // Verify via lecturer results that grading was recomputed.
  const lec = await loginLecturer('lex@test.local');
  const results = await lec.c.get('/api/flashcards/sets/fs1-t/results');
  const byCard = Object.fromEntries((results.json || []).map(x => [x.flashcardId, x.isCorrect]));
  assert.strictEqual(byCard['c1-t'], false, 'forged isCorrect:true must be stored as false');
  assert.strictEqual(byCard['c2-t'], true);
});

test('notifications load via httpOnly cookie (frontend sends only a Bearer placeholder)', async () => {
  // Regression: GET /api/notifications jwt.verify'd the Bearer header, which the
  // browser fills with the 'cookie-session' placeholder → 500 (broken bell).
  const { c } = await loginStudent('ada@test.local');
  // Mimic the real frontend: cookie carries the JWT, header is just a marker.
  const withMarker = await fetch(base + '/api/notifications', {
    headers: { Cookie: c._cookieHeader(), Authorization: 'Bearer cookie-session' },
  });
  assert.strictEqual(withMarker.status, 200, 'cookie auth must be honoured, not the placeholder');
  const body = await withMarker.json();
  assert.ok(Array.isArray(body.notifications), 'returns a notifications array');
  // No auth at all → 401, never 500.
  const anon = await fetch(base + '/api/notifications');
  assert.strictEqual(anon.status, 401);
});

test('student logout clears the session', async () => {
  const { c } = await loginStudent('ada@test.local');
  assert.strictEqual((await c.get('/api/students/me')).status, 200);
  await c.post('/api/students/logout', {});
  assert.strictEqual((await c.get('/api/students/me')).status, 401, 'after logout, protected route 401s');
});

// ─────────────────────────────────────────────────────────────
// LECTURER FLOW
// ─────────────────────────────────────────────────────────────
test('lecturer flow: sees only own-batch lectures; can edit + publish own', async () => {
  const { c, r } = await loginLecturer('lex@test.local');
  assert.strictEqual(r.status, 200);

  const list = await c.get('/api/lectures');
  assert.ok(list.json.every(l => l.batchId === 'b1-t'), 'only own batch lectures listed');
  assert.ok(!list.json.some(l => l.id === 'lec_b2-t'), 'other batch lecture absent');

  const full = await c.get('/api/lectures/lec_draft-t');
  assert.strictEqual(full.status, 200, 'lecturer can open own draft');

  const patched = await c.patch('/api/lectures/lec_draft-t', { lectureTitle: 'Renamed Draft' });
  assert.strictEqual(patched.status, 200);
  assert.strictEqual(patched.json.lectureTitle, 'Renamed Draft');

  const pub = await c.post('/api/lectures/lec_draft-t/publish', {});
  assert.strictEqual(pub.status, 200);
  assert.strictEqual(pub.json.status, 'published');
});

test('SECURITY 4 — lecturer cross-batch/cross-lecturer IDOR blocked across resources', async () => {
  const lena = await loginLecturer('lena@test.local'); // batch b2 only
  const c = lena.c;
  // lectures
  assert.strictEqual((await c.get('/api/lectures/lec_pub-t')).status, 403);
  assert.strictEqual((await c.patch('/api/lectures/lec_pub-t', { lectureTitle: 'hax' })).status, 403);
  assert.strictEqual((await c.post('/api/lectures/lec_pub-t/publish', {})).status, 403);
  assert.strictEqual((await c.post('/api/lectures/generate', { batchId: 'b1-t', week: 1, day: 'Wednesday' })).status, 403);
  // materials / assignments / flashcards / attendance / curriculum
  assert.strictEqual((await c.get('/api/materials/m1-t')).status, 403);
  assert.strictEqual((await c.patch('/api/materials/m1-t', { title: 'hax' })).status, 403);
  assert.strictEqual((await c.get('/api/assignments/as1-t')).status, 403);
  assert.strictEqual((await c.get('/api/assignments/as1-t/submissions')).status, 403);
  assert.strictEqual((await c.patch('/api/flashcards/sets/fs1-t', { title: 'hax' })).status, 403);
  assert.strictEqual((await c.get('/api/flashcards/sets/fs1-t/results')).status, 403);
  assert.strictEqual((await c.patch('/api/attendance/att1-t/open', {})).status, 403);
  assert.strictEqual((await c.get('/api/attendance/att1-t')).status, 403);
});

test('lecturer malformed ids fail safely (404, not 500)', async () => {
  // Regression: db findById used .single(), which errors on 0 rows (PGRST116)
  // → routes 500'd with a leaked message. Now maybeSingle → clean 404.
  const { c } = await loginLecturer('lex@test.local');
  for (const url of [
    '/api/lectures/nope', '/api/materials/nope', '/api/assignments/nope',
    '/api/flashcards/sets/nope/results', '/api/curriculum/nope', '/api/batches/nope',
  ]) {
    const r = await c.get(url);
    assert.ok([401, 403, 404].includes(r.status), `${url} → ${r.status} (expected 401/403/404, never 500)`);
    if (r.json) assert.ok(!/No rows|PGRST|supabase/i.test(JSON.stringify(r.json)), `${url} must not leak a DB error`);
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN FLOW
// ─────────────────────────────────────────────────────────────
test('admin flow: login + list applicants/students/batches; unrestricted lecture access', async () => {
  const { c, r } = await loginAdmin();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.user.role, 'admin');

  assert.strictEqual((await c.get('/api/students')).status, 200);
  assert.strictEqual((await c.get('/api/batches')).status, 200);
  // admin can open any batch's lecture
  assert.strictEqual((await c.get('/api/lectures/lec_b2-t')).status, 200);
  assert.strictEqual((await c.get('/api/attendance/att1-t')).status, 200);
});

// ─────────────────────────────────────────────────────────────
// SECURITY 6 & 7 — cron + applicant enumeration
// ─────────────────────────────────────────────────────────────
test('SECURITY 6 — cron endpoints reject query-param secret; require header', async () => {
  process.env.CRON_SECRET = 'test-cron-secret';
  const c = await client().prime();
  // query param must NOT work anymore
  assert.strictEqual((await c.post('/api/cron/daily-checks?key=test-cron-secret', {})).status, 401);
  // wrong header
  const bad = await fetch(base + '/api/cron/daily-checks', { method: 'POST', headers: { 'X-Cron-Key': 'wrong' } });
  assert.strictEqual(bad.status, 401);
  delete process.env.CRON_SECRET;
});

test('SECURITY 7 — applicant status checker is rate-limited', async () => {
  const c = await client().prime();
  let sawLimit = false;
  for (let i = 0; i < 13; i++) {
    const r = await c.get('/api/applicants/check-status?email=nobody' + i + '@test.local');
    if (r.status === 429) { sawLimit = true; break; }
  }
  assert.ok(sawLimit, 'status checker must start returning 429 within a burst');
});

// ─────────────────────────────────────────────────────────────
// No-data-leak: student endpoints never return other batches' rows
// ─────────────────────────────────────────────────────────────
test('no cross-batch data leak in student payloads', async () => {
  const { c } = await loginStudent('ada@test.local');
  const sets = await c.get('/api/flashcards/sets/student');
  assert.ok(!JSON.stringify(sets.json).includes('b2-t'), 'no batch-b2 ids in student flashcard payload');
  const mats = await c.get('/api/materials/student');
  assert.ok(mats.json.every(m => m.batchId === 'b1-t'));
});
