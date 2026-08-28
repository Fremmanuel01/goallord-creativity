// ============================================================
// test/browser.e2e.test.js — REAL browser end-to-end (Playwright)
//
// Launches Chromium (headless) inside the sandbox against the full app
// harness (real production routers + the real rendered HTML/JS frontend,
// backed by the in-memory Supabase double). Drives the ACTUAL login
// forms, dashboards, bell, and navigation the way a user would — not the
// API directly. Captures console errors, page exceptions, and failed /
// 5xx network responses on every flow, at desktop and mobile viewports.
//
// This is the browser layer mandated for every Academy change. API/unit
// tests live in the other test files and remain required.
//
// Run: node --test test/browser.e2e.test.js
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { chromium } = require('playwright');
const { buildApp } = require('./support/app-harness');
const { seed: baseSeed, PW } = require('./support/e2e-seed');

const ROOT = path.join(__dirname, '..');
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };

// Reminder scenario: class holds on the fake's epoch day (2023-11-14), the
// day-before job runs the day prior. Curriculum gives it a topic.
const CLASS_DAY = '2023-11-14';
const RUN_DAY = '2023-11-13';

function seed() {
  const s = baseSeed();
  // Give batch b1 a class "tomorrow" (relative to RUN_DAY) with a topic, and a
  // hostile applicant name to prove the stored-XSS escaping renders inert.
  s.batches[0].start_date = CLASS_DAY;
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(CLASS_DAY + 'T00:00:00Z').getUTCDay()];
  // Two concurrent batches at DIFFERENT curriculum positions — proves no
  // global "current topic" bleeds across batches.
  s.curriculum_entries = [
    { id: 'curR', batch_id: 'b1', week: 1, day: dow, topic: 'Recursion', objectives: 'Understand recursion', subtopics: [] },
    { id: 'curG', batch_id: 'b2', week: 1, day: 'Wednesday', topic: 'CSS Grid', objectives: 'Learn CSS Grid', subtopics: [] },
  ];
  // Student A is present in batch-b1's attendance session att1.
  s.attendance_students = [{ attendance_id: 'att1', student_id: 's1', status: 'present' }];
  s.applicants = [{
    id: 'ap1', full_name: '<img src=x onerror="window.__XSS__=1">Mallory', email: 'mal@test.local',
    phone: '0800', track: 'AI Development', experience: 'None', schedule: 'Morning',
    status: 'Pending', email_verified: true, application_fee_paid: false, created_at: '2023-11-10T00:00:00Z',
  }];
  return s;
}

let server, base, browser, fake;

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret';
  process.env.CRON_SECRET = 'browser-cron-secret';
  const built = buildApp(seed(), { quiet: true, serveStatic: true });
  fake = built.fake;
  await new Promise((r) => { server = built.app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// Fresh page with console/exception/network capture attached.
async function newPage(viewport) {
  const context = await browser.newContext({ viewport: viewport || DESKTOP });
  const page = await context.newPage();
  const errors = [];
  const serverErrors = [];
  const failed = [];
  const api = [];
  // Third-party noise that production also emits and is not an app defect:
  // Paystack injects a stylesheet from paystack.com that every strict CSP blocks.
  const benign = (t) => /paystack\.com|favicon\.ico/i.test(t);
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push('pageerror: ' + e.message); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.startsWith('data:')) failed.push(u); });
  page.on('response', (r) => {
    if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
    if (r.url().includes('/api/')) api.push({ method: r.request().method(), status: r.status(), url: r.url() });
  });
  return { context, page, errors, serverErrors, failed, api };
}
const apiHit = (api, frag, status) => api.some((r) => r.url.includes(frag) && (status === undefined || r.status === status));

async function studentLogin(page, email) {
  await page.goto(base + '/student-login.html');
  await page.fill('#loginEmail', email);
  await page.fill('#loginPassword', PW);
  await Promise.all([page.waitForURL('**/student-dashboard.html'), page.click('#loginBtn')]);
}
async function lecturerLogin(page, email) {
  await page.goto(base + '/lecturer-login.html');
  await page.fill('#emailInput', email);
  await page.fill('#passwordInput', PW);
  await Promise.all([page.waitForURL('**/lecturer-dashboard.html'), page.click('#loginBtn')]);
}
// Open the notification bell (real UI control) and return the panel's text.
async function openBell(page) {
  const r = page.waitForResponse((x) => x.url().includes('/api/notifications') && x.request().method() === 'GET', { timeout: 8000 });
  await page.click('.bell-btn');
  const resp = await r;
  await page.waitForTimeout(250);
  return { status: resp.status(), text: await page.textContent('#notifList') };
}

async function adminLogin(page) {
  await page.goto(base + '/login.html');
  await page.fill('#loginEmail', 'admin@test.local');
  await page.fill('#loginPassword', PW);
  await Promise.all([page.waitForURL('**/dashboard.html'), page.click('#loginBtn')]);
}

// ─────────────────────────────────────────────────────────────
// STUDENT — login + dashboard render (desktop & mobile)
// ─────────────────────────────────────────────────────────────
for (const [label, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  test(`student login + dashboard renders (${label})`, async () => {
    const { context, page, errors, serverErrors, api } = await newPage(vp);
    try {
      await studentLogin(page, 'ada@test.local');
      await page.waitForSelector('.bell-btn', { timeout: 8000 });
      await page.waitForFunction(() => /Ada/.test(document.body.innerText), null, { timeout: 8000 });
      assert.ok(apiHit(api, '/api/students/me', 200), 'GET /api/students/me returned 200');
      assert.deepStrictEqual(serverErrors, [], 'no 5xx responses during dashboard load');
      assert.deepStrictEqual(errors, [], 'no console/page errors on dashboard');
    } finally { await context.close(); }
  });
}

// ─────────────────────────────────────────────────────────────
// DAY-BEFORE REMINDER — visible in the student's notification bell
// (reproduces the notifications-auth bug, then confirms the fix)
// ─────────────────────────────────────────────────────────────
test('day-before reminder appears in the student notification bell', async () => {
  // Trigger the real reminder job in-process (same injected fake DB the server reads).
  delete require.cache[require.resolve(path.join(ROOT, 'utils/classReminders.js'))];
  const { runClassRemindersDayBefore } = require(path.join(ROOT, 'utils/classReminders.js'));
  const totals = await runClassRemindersDayBefore({ todayOverride: RUN_DAY });
  assert.ok(totals.notified >= 1, 'reminder job created at least one notification');

  const { context, page, errors, serverErrors } = await newPage(DESKTOP);
  try {
    await studentLogin(page, 'ada@test.local');
    // Open the bell (real UI control) and read the panel it renders.
    const notifResp = page.waitForResponse((r) => r.url().includes('/api/notifications') && r.request().method() === 'GET', { timeout: 8000 });
    await page.click('.bell-btn');
    const nr = await notifResp;
    assert.strictEqual(nr.status(), 200, 'GET /api/notifications returns 200 (cookie auth)');
    await page.waitForFunction(() => /Recursion/.test(document.getElementById('notifList')?.textContent || ''), null, { timeout: 8000 });
    const panel = await page.textContent('#notifList');
    assert.match(panel, /class tomorrow/i, 'bell shows the day-before reminder');
    assert.match(panel, /Recursion/, 'reminder names the batch curriculum topic');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx from /api/notifications');
    assert.deepStrictEqual(errors, [], 'no console errors while loading notifications');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// SAME-DAY REMINDER — correct student bell shows own topic; other batch
// does not receive this batch's topic. (Per-batch class *times* don't
// exist in the schema — reminders are cron-scheduled, batch-agnostic in
// timing — so we verify batch/topic correctness, not per-batch times.)
// ─────────────────────────────────────────────────────────────
test('same-day reminder: student A sees own topic; student B does not see it', async () => {
  delete require.cache[require.resolve(path.join(ROOT, 'utils/classReminders.js'))];
  const { runClassReminders } = require(path.join(ROOT, 'utils/classReminders.js'));
  await runClassReminders({ todayOverride: CLASS_DAY });

  // Student A (batch b1) — sees "class today" + own topic.
  let ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ada@test.local');
    const bell = await openBell(ctx.page);
    assert.strictEqual(bell.status, 200);
    assert.match(bell.text, /class today/i, 'A sees a same-day reminder');
    assert.match(bell.text, /Recursion/, 'A sees own batch topic');
    assert.deepStrictEqual(ctx.serverErrors, []);
  } finally { await ctx.context.close(); }

  // Student B (batch b2) — sees their own same-day reminder but NOT b1's topic.
  ctx = await newPage(MOBILE);
  try {
    await studentLogin(ctx.page, 'ben@test.local');
    const bell = await openBell(ctx.page);
    assert.match(bell.text, /class today/i, 'B sees their own same-day reminder (mobile)');
    assert.doesNotMatch(bell.text, /Recursion/, 'B must NOT see batch A\'s topic');
    assert.doesNotMatch(bell.text, /CSS Grid/, 'B\'s Wednesday topic not shown on a Tuesday class day');
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// LECTURER REMINDER — assigned lecturer's bell shows the day-before
// teaching reminder with the topic; other lecturer does not.
// ─────────────────────────────────────────────────────────────
test('lecturer reminder: assigned lecturer sees teaching reminder + topic', async () => {
  delete require.cache[require.resolve(path.join(ROOT, 'utils/classReminders.js'))];
  const { runClassRemindersDayBefore } = require(path.join(ROOT, 'utils/classReminders.js'));
  await runClassRemindersDayBefore({ todayOverride: RUN_DAY });

  const { context, page, serverErrors } = await newPage(DESKTOP);
  try {
    await lecturerLogin(page, 'lex@test.local'); // Lecturer A, batch b1
    const bell = await openBell(page);
    assert.strictEqual(bell.status, 200, 'lecturer notifications load (cookie auth)');
    assert.match(bell.text, /teaching tomorrow/i, 'assigned lecturer sees teaching reminder');
    assert.match(bell.text, /Recursion/, 'reminder names the topic');
    assert.deepStrictEqual(serverErrors, []);
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// CURRICULUM PROGRESS ISOLATION — two batches at different positions;
// each student sees only their own batch's topic.
// ─────────────────────────────────────────────────────────────
test('curriculum progress: each batch student sees only their own topic', async () => {
  // Student A (b1) → Recursion, never CSS Grid.
  let ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ada@test.local');
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/curriculum/calendar'), { timeout: 8000 });
    await ctx.page.click(`text=Curriculum`).catch(() => ctx.page.evaluate(() => window.switchTab && window.switchTab('curriculum')));
    await r;
    await ctx.page.waitForTimeout(300);
    const txt = await ctx.page.textContent('#curriculumContent');
    assert.match(txt, /Recursion/, 'A sees own curriculum topic');
    assert.doesNotMatch(txt, /CSS Grid/, 'A must not see batch B topic');
  } finally { await ctx.context.close(); }

  // Student B (b2) → CSS Grid, never Recursion.
  ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ben@test.local');
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/curriculum/calendar'), { timeout: 8000 });
    await ctx.page.click(`text=Curriculum`).catch(() => ctx.page.evaluate(() => window.switchTab && window.switchTab('curriculum')));
    await r;
    await ctx.page.waitForTimeout(300);
    const txt = await ctx.page.textContent('#curriculumContent');
    assert.match(txt, /CSS Grid/, 'B sees own curriculum topic');
    assert.doesNotMatch(txt, /Recursion/, 'B must not see batch A topic');
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// BATCH ISOLATION — Student A cannot reach Batch B lecture (direct nav)
// ─────────────────────────────────────────────────────────────
test('student cannot open another batch\'s lecture via direct URL', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await studentLogin(page, 'ada@test.local'); // batch b1
    const resp = await page.goto(base + '/api/lectures/lec_b2/student'); // batch b2 lecture
    assert.strictEqual(resp.status(), 404, 'cross-batch lecture blocked server-side');
    const txt = await page.textContent('body');
    assert.doesNotMatch(txt, /Beta Lecture/, 'no batch-b2 lecture content leaked');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// SUSPENSION — login gate: suspended student is blocked with the right
// message; a paid active student is NOT suspended and logs in fine.
// (Root cause: runOverdueCheck() suspends only students with an 'overdue'
// payment row ≥14 days old; computePaymentStatus never marks a fully-paid
// row overdue, so paid students are never caught — see enrolment.test.js.)
// ─────────────────────────────────────────────────────────────
for (const [label, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  test(`suspension: suspended student blocked, paid student allowed (${label})`, async () => {
    // Suspended → blocked on the real login form with the suspended message.
    let ctx = await newPage(vp);
    try {
      await ctx.page.goto(base + '/student-login.html');
      await ctx.page.fill('#loginEmail', 'sara@test.local');
      await ctx.page.fill('#loginPassword', PW);
      await ctx.page.click('#loginBtn');
      await ctx.page.waitForFunction(() => {
        const e = document.getElementById('errorMsg');
        return e && e.style.display !== 'none' && /suspend/i.test(e.textContent);
      }, null, { timeout: 8000 });
      assert.ok(ctx.page.url().includes('student-login.html'), 'suspended user stays on login');
    } finally { await ctx.context.close(); }

    // Paid active → logs straight through to the dashboard.
    ctx = await newPage(vp);
    try {
      await studentLogin(ctx.page, 'ada@test.local');
      assert.ok(ctx.page.url().includes('student-dashboard.html'), 'paid student not suspended');
    } finally { await ctx.context.close(); }
  });
}

// ─────────────────────────────────────────────────────────────
// LECTURES — student sees published lecture, not the draft; slides render;
// other batch cannot see it. (Publish transition is covered API-side in
// academy.e2e.test.js; here we verify the student-facing UI.)
// ─────────────────────────────────────────────────────────────
for (const [label, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  test(`lectures: student sees published (not draft) + slides render (${label})`, async () => {
    const { context, page, serverErrors } = await newPage(vp);
    try {
      await studentLogin(page, 'ada@test.local'); // batch b1
      const r = page.waitForResponse((x) => x.url().includes('/api/lectures/student'), { timeout: 8000 });
      await page.evaluate(() => window.switchTab('lectures')); // same fn the nav buttons call (viewport-independent)
      await r;
      await page.waitForFunction(() => /Intro to Vars/.test(document.getElementById('lecList')?.textContent || ''), null, { timeout: 8000 });
      const list = await page.textContent('#lecList');
      assert.match(list, /Intro to Vars/, 'published lecture listed');
      assert.doesNotMatch(list, /Draft Lecture/, 'draft lecture hidden from student');

      // Open slides via the real button; the viewer renders published slide text.
      const sr = page.waitForResponse((x) => x.url().includes('/api/lectures/lec_pub/student'), { timeout: 8000 });
      await page.click('button:has-text("View Slides")');
      const sresp = await sr;
      assert.strictEqual(sresp.status(), 200, 'published slides load');
      await page.waitForFunction(() => /Welcome|Details|Intro/.test(document.body.innerText), null, { timeout: 8000 });
      assert.deepStrictEqual(serverErrors, [], 'no 5xx while viewing lecture');
    } finally { await context.close(); }
  });
}

test('lectures: batch B student cannot see batch A lecture in the UI', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await studentLogin(page, 'ben@test.local'); // batch b2
    const r = page.waitForResponse((x) => x.url().includes('/api/lectures/student'), { timeout: 8000 });
    await page.evaluate(() => window.switchTab('lectures'));
    await r;
    await page.waitForTimeout(400);
    const list = await page.textContent('#lecList');
    assert.doesNotMatch(list, /Intro to Vars/, 'batch A lecture not shown to batch B student');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// ATTENDANCE — student sees only their own batch's session; the API the
// dashboard calls returns the present record for A and nothing for B.
// ─────────────────────────────────────────────────────────────
test('attendance: student A sees own present record; student B sees none of it', async () => {
  // Student A — /api/attendance/me (called on dashboard load) returns the session.
  let ctx = await newPage(DESKTOP);
  try {
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance/me') && x.status() === 200, { timeout: 8000 });
    await studentLogin(ctx.page, 'ada@test.local');
    const body = await (await r).json();
    assert.ok(body.totalPresent >= 1, 'A has a present record');
    await ctx.page.click('text=Attendance').catch(() => ctx.page.evaluate(() => window.switchTab && window.switchTab('attendance')));
    await ctx.page.waitForTimeout(400);
    assert.deepStrictEqual(ctx.serverErrors, [], 'attendance tab loads without 5xx');
  } finally { await ctx.context.close(); }

  // Student B — no attendance in batch b1's session.
  ctx = await newPage(MOBILE);
  try {
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance/me') && x.status() === 200, { timeout: 8000 });
    await studentLogin(ctx.page, 'ben@test.local');
    const body = await (await r).json();
    assert.strictEqual(body.totalPresent || 0, 0, 'B is not in batch A attendance');
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// CONCURRENT BATCHES / ADMIN BATCH MANAGEMENT — admin sees multiple
// active batches distinctly in the real batch table.
// ─────────────────────────────────────────────────────────────
test('admin batch management: concurrent batches listed distinctly', async () => {
  const { context, page, serverErrors } = await newPage(DESKTOP);
  try {
    await adminLogin(page);
    const r = page.waitForResponse((x) => x.url().includes('/api/batches') && x.request().method() === 'GET', { timeout: 8000 });
    await page.evaluate(() => window.navigate && window.navigate('batches'));
    await r.catch(() => {});
    // Ensure the table is populated via the real loader the UI uses.
    await page.evaluate(() => window.loadBatches && window.loadBatches()).catch(() => {});
    await page.waitForFunction(() => /Batch Alpha/.test(document.getElementById('batchTableBody')?.textContent || ''), null, { timeout: 8000 });
    const table = await page.textContent('#batchTableBody');
    assert.match(table, /Batch Alpha/, 'first batch listed');
    assert.match(table, /Batch Beta/, 'second concurrent batch listed distinctly');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx on admin batch management');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// LECTURER — login + dashboard render
// ─────────────────────────────────────────────────────────────
test('lecturer login + dashboard renders', async () => {
  const { context, page, serverErrors } = await newPage(DESKTOP);
  try {
    await lecturerLogin(page, 'lex@test.local');
    assert.ok(page.url().includes('lecturer-dashboard.html'));
    assert.deepStrictEqual(serverErrors, [], 'no 5xx during lecturer dashboard load');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// LECTURER BATCH ISOLATION — Lecturer B (batch b2) cannot reach any
// batch-b1 resource by direct navigation; server returns 403/404 and
// no b1 content leaks into the page. Desktop + mobile.
// ─────────────────────────────────────────────────────────────
for (const [label, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  test(`lecturer batch isolation — cross-batch resources blocked (${label})`, async () => {
    const { context, page } = await newPage(vp);
    try {
      await lecturerLogin(page, 'lena@test.local'); // Lecturer B, batch b2 only

      // Every batch-b1 resource, reached by typing the URL, must be refused.
      const b1Resources = [
        '/api/lectures/lec_pub',              // b1 lecture (editor)
        '/api/materials/m1',                  // b1 material
        '/api/assignments/as1',               // b1 assignment
        '/api/assignments/as1/submissions',   // b1 submissions
        '/api/flashcards/sets/fs1/results',   // b1 flashcard results
        '/api/attendance/att1',               // b1 attendance session
      ];
      for (const url of b1Resources) {
        const resp = await page.goto(base + url);
        assert.ok([403, 404].includes(resp.status()), `${url} → ${resp.status()} (expected 403/404)`);
        const txt = await page.textContent('body');
        assert.doesNotMatch(txt, /Intro to Vars|Slides Wk1|HW1|Recursion/, `no b1 content leaked from ${url}`);
        assert.doesNotMatch(txt, /No rows|PGRST|SUPABASE_/i, `no DB internals leaked from ${url}`);
      }
      // Positive control: Lecturer B CAN reach their own batch-b2 lecture.
      const own = await page.goto(base + '/api/lectures/lec_b2');
      assert.strictEqual(own.status(), 200, 'lecturer can open own-batch lecture');
    } finally { await context.close(); }
  });
}

// ─────────────────────────────────────────────────────────────
// ADMIN — stored XSS renders inert on the applicants screen
// ─────────────────────────────────────────────────────────────
test('admin applicants screen renders hostile name as inert text (no XSS)', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await adminLogin(page);
    // Navigate to the applicants view and let it render the seeded hostile name.
    await page.evaluate(() => window.navigate && window.navigate('applicants')).catch(() => {});
    await page.waitForTimeout(500);
    const flagged = await page.evaluate(() => !!window.__XSS__);
    assert.strictEqual(flagged, false, 'onerror payload must NOT execute');
    const body = await page.textContent('body');
    assert.match(body, /Mallory/, 'the applicant name still displays as text');
  } finally { await context.close(); }
});
