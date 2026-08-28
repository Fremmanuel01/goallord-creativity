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
const TABLET = { width: 768, height: 1024 };

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
  // Per-batch class times (distinct) + class days aligned to the reminder day.
  s.batches[0].class_days = [dow]; s.batches[0].class_time = '09:00'; // Alpha  9:00 AM
  s.batches[1].class_days = [dow]; s.batches[1].class_time = '14:00'; // Beta   2:00 PM
  s.batches[2].class_time = '16:00';                                  // Gamma  4:00 PM
  // Two concurrent batches at DIFFERENT curriculum positions — proves no
  // global "current topic" bleeds across batches.
  s.curriculum_entries = [
    { id: 'curR-t', batch_id: 'b1-t', week: 1, day: dow, topic: 'Recursion', objectives: 'Understand recursion', subtopics: [] },
    { id: 'curG-t', batch_id: 'b2-t', week: 1, day: 'Wednesday', topic: 'CSS Grid', objectives: 'Learn CSS Grid', subtopics: [] },
    // Same program as b1, but its OWN curriculum position (independent progress).
    { id: 'curP-t', batch_id: 'b3-t', week: 1, day: 'Wednesday', topic: 'Pointers', objectives: 'Learn pointers', subtopics: [] },
  ];
  // Student A is present in batch-b1's attendance session att1.
  s.attendance_students = [{ attendance_id: 'att1-t', student_id: 's1-t', status: 'present' }];
  const payer = (id, email, name) => ({
    id, full_name: name, email, phone: '0800', track: 'AI Development', experience: 'None',
    schedule: 'Morning', status: 'Pending', email_verified: true, application_fee_paid: false,
    pending_payment_plan: 'full', created_at: '2023-11-10T00:00:00Z',
  });
  s.applicants = [
    { id: 'ap1-t', full_name: '<img src=x onerror="window.__XSS__=1">Mallory', email: 'mal@test.local',
      phone: '0800', track: 'AI Development', experience: 'None', schedule: 'Morning',
      status: 'Pending', email_verified: true, application_fee_paid: false, created_at: '2023-11-10T00:00:00Z' },
    payer('pay-good', 'grace@test.local', 'Grace Good'),
    payer('pay-mismatch', 'mia@test.local', 'Mia Mismatch'),
    payer('pay-fail', 'fred@test.local', 'Fred Fail'),
    payer('pay-cancel', 'cara@test.local', 'Cara Cancel'),
    payer('pay-dup', 'dan@test.local', 'Dan Dup'),
    payer('pay-pending', 'paula@test.local', 'Paula Pending'),
  ];
  return s;
}

// Mock ONLY the external Paystack verify HTTP call. Reference shape mirrors the
// real client (ENROL-<applicantId>-<timestamp>[-MODE]); everything else — amount
// validation, reference-reuse (real query vs the fake DB), enrolment — is real.
const paystackMock = {
  searchTransactions: async () => [],
  async isReferenceUsed(reference) {
    const sb = require(path.join(ROOT, 'lib/supabase'));
    const { data: pay } = await sb.from('payments').select('id').eq('reference', reference).limit(1);
    if (pay && pay.length) return true;
    const { data: ord } = await sb.from('orders').select('id').eq('reference', reference).limit(1);
    return !!(ord && ord.length);
  },
  verifyTransaction(reference) {
    if (/FAIL/.test(reference)) return Promise.resolve({ data: { status: 'failed' } });
    if (/PENDING/.test(reference)) return Promise.resolve({ data: { status: 'pending' } });
    const mm = /^ENROL-(.+?)-\d{6,}/.exec(reference);
    const applicantId = mm ? mm[1] : '';
    const appFee = 20000, full = 300000;
    const amount = /MISMATCH/.test(reference) ? appFee * 100 : (appFee + full) * 100; // full-plan expected total
    return Promise.resolve({ data: { status: 'success', currency: 'NGN', amount, metadata: { applicantId } } });
  },
};

let server, base, browser, fake;

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret';
  process.env.CRON_SECRET = 'browser-cron-secret';
  const built = buildApp(seed(), { quiet: true, serveStatic: true, paystack: paystackMock });
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
  const benign = (t) => /paystack|favicon\.ico/i.test(t);
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
  await runClassReminders({ todayOverride: CLASS_DAY, ignoreWindow: true }); // bell-render test, not window timing (covered in classReminders.test.js)

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

  // Student C (b3, SAME program as A) → Pointers only. Same-program batches
  // track independent curriculum positions.
  ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'cody@test.local');
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/curriculum/calendar'), { timeout: 8000 });
    await ctx.page.evaluate(() => window.switchTab('curriculum'));
    await r;
    await ctx.page.waitForTimeout(300);
    const txt = await ctx.page.textContent('#curriculumContent');
    assert.match(txt, /Pointers/, 'C sees own batch topic');
    assert.doesNotMatch(txt, /Recursion/, 'C (same program as A) must not see A\'s position');
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// BATCH ISOLATION — Student A cannot reach Batch B lecture (direct nav)
// ─────────────────────────────────────────────────────────────
test('student cannot open another batch\'s lecture via direct URL', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await studentLogin(page, 'ada@test.local'); // batch b1
    const resp = await page.goto(base + '/api/lectures/lec_b2-t/student'); // batch b2 lecture
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
      const sr = page.waitForResponse((x) => x.url().includes('/api/lectures/lec_pub-t/student'), { timeout: 8000 });
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
    assert.match(table, /Batch Gamma/, 'third concurrent batch (same program as Alpha) listed');
    // All three render the "Active" badge at once (Alpha + Gamma share the AI
    // Development program), proving no single-active-per-program limit.
    const activeBadges = (table.match(/Active/g) || []).length;
    assert.ok(activeBadges >= 3, `>=3 active batches shown (got ${activeBadges})`);
    // Three DIFFERENT class times shown (9:00 AM / 2:00 PM / 4:00 PM).
    assert.match(table, /9:00 AM/, 'Alpha class time');
    assert.match(table, /2:00 PM/, 'Beta class time');
    assert.match(table, /4:00 PM/, 'Gamma class time');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx on admin batch management');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// MULTI-BATCH SUSPENSION INDEPENDENCE — suspension is account-level; a
// suspended student in batch b1 does not affect a paid student in b2.
// (The data model has one batch_id + one status per account, and unique
// emails, so cross-batch suspension is impossible by construction.)
// ─────────────────────────────────────────────────────────────
test('multi-batch: suspended b1 student blocked while paid b2 student logs in', async () => {
  // Suspended (batch b1) — blocked.
  let ctx = await newPage(DESKTOP);
  try {
    await ctx.page.goto(base + '/student-login.html');
    await ctx.page.fill('#loginEmail', 'sara@test.local');
    await ctx.page.fill('#loginPassword', PW);
    await ctx.page.click('#loginBtn');
    await ctx.page.waitForFunction(() => {
      const e = document.getElementById('errorMsg');
      return e && e.style.display !== 'none' && /suspend/i.test(e.textContent);
    }, null, { timeout: 8000 });
  } finally { await ctx.context.close(); }

  // Paid (batch b2) — unaffected, logs straight in.
  ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ben@test.local');
    assert.ok(ctx.page.url().includes('student-dashboard.html'), 'paid b2 student unaffected by b1 suspension');
  } finally { await ctx.context.close(); }
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
// PER-BATCH CLASS TIME — admin sets it via the real form; editing one
// batch's time does not touch another; students/lecturers see their own.
// ─────────────────────────────────────────────────────────────
test('admin sets a batch class time via the real form; other batches unchanged', async () => {
  const { context, page, serverErrors } = await newPage(DESKTOP);
  try {
    await adminLogin(page);
    const r = page.waitForResponse((x) => x.url().includes('/api/batches') && x.request().method() === 'GET', { timeout: 8000 });
    await page.evaluate(() => window.navigate && window.navigate('batches'));
    await r.catch(() => {});
    await page.evaluate(() => window.loadBatches && window.loadBatches()).catch(() => {});
    await page.waitForFunction(() => /Batch Alpha/.test(document.getElementById('batchTableBody')?.textContent || ''), null, { timeout: 8000 });

    // Create a new active batch at 11:00 via the real modal.
    await page.evaluate(() => window.openAddBatch());
    await page.waitForSelector('#batch-time', { state: 'visible', timeout: 8000 });
    await page.fill('#batch-name', 'WebDev Late Morning');
    await page.fill('#batch-number', '207');
    await page.selectOption('#batch-track', 'AI Software Development').catch(() => {});
    await page.fill('#batch-time', '11:00');
    // The Class Days control must be real, per-day checkboxes (regression: they
    // were once an un-interpolated `${d}` template). Check Wednesday + Thursday.
    const wed = await page.$('#batch-days .batch-day-cb[value="Wednesday"]');
    assert.ok(wed, 'day checkbox with value="Wednesday" exists (not a literal ${d})');
    await page.check('#batch-days .batch-day-cb[value="Wednesday"]');
    await page.check('#batch-days .batch-day-cb[value="Thursday"]');
    const post = page.waitForResponse((x) => x.url().includes('/api/batches') && x.request().method() === 'POST', { timeout: 8000 });
    await page.click('#saveBatchBtn');
    const created = await (await post).json();
    assert.strictEqual((await post).status(), 201, 'batch created with class time');
    // The form must actually persist the checked days (this is what would have
    // caught the broken-checkbox bug).
    assert.deepStrictEqual((created.classDays || []).sort(), ['Thursday', 'Wednesday'], 'class days saved from the form');
    assert.strictEqual(created.classTime, '11:00', 'class time saved from the form');
    await page.waitForFunction(() => /11:00 AM/.test(document.getElementById('batchTableBody')?.textContent || ''), null, { timeout: 8000 });

    // The pre-existing batches' times are untouched by the new one.
    const table = await page.textContent('#batchTableBody');
    assert.match(table, /9:00 AM/, 'Alpha still 9:00 AM');
    assert.match(table, /4:00 PM/, 'Gamma still 4:00 PM');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx');
  } finally { await context.close(); }
});

test('students see only their own batch schedule/time', async () => {
  for (const [email, time] of [['ada@test.local', '9:00 AM'], ['ben@test.local', '2:00 PM'], ['cody@test.local', '4:00 PM']]) {
    const { context, page } = await newPage(DESKTOP);
    try {
      await studentLogin(page, email);
      await page.waitForFunction((t) => /9:00 AM|2:00 PM|4:00 PM/.test(document.getElementById('ovScheduleBadge')?.textContent || '') || document.getElementById('ovScheduleBadge')?.textContent === t, time, { timeout: 8000 });
      const sched = await page.textContent('#ovScheduleBadge');
      assert.match(sched, new RegExp(time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${email} sees own time ${time}`);
      // Must not show either of the other batches' times.
      const others = ['9:00 AM', '2:00 PM', '4:00 PM'].filter((t) => t !== time);
      for (const o of others) assert.doesNotMatch(sched, new RegExp(o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${email} must not see ${o}`);
    } finally { await context.close(); }
  }
});

test('lecturer teaching two batches sees each batch\'s own time', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await lecturerLogin(page, 'lex@test.local'); // teaches b1 (9 AM) and b3 (4 PM)
    await page.waitForTimeout(1000);
    const picker = await page.textContent('#batchPicker').catch(() => '');
    // Both distinct times appear in the batch picker options.
    assert.match(picker, /9:00 AM/, 'lecturer sees 9 AM batch');
    assert.match(picker, /4:00 PM/, 'lecturer sees 4 PM batch (not one global time)');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// STUDENT TRANSFER (one student → one batch): reassigning a student who
// already belongs to a batch requires an intentional-transfer confirm,
// and results in exactly one batch_id (never a second membership).
// ─────────────────────────────────────────────────────────────
test('admin batch transfer: reassigning an enrolled student requires confirmation', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    await adminLogin(page);
    const sl = page.waitForResponse((x) => x.url().includes('/api/students') && x.request().method() === 'GET', { timeout: 10000 });
    await page.evaluate(() => window.navigate && window.navigate('students'));
    await sl.catch(() => {});
    await page.waitForSelector('select[data-student-id="s6-t"]', { timeout: 8000 });

    // Changing an enrolled student's batch pops an intentional-transfer confirm.
    let confirmText = '';
    page.on('dialog', (d) => { confirmText = d.message(); d.accept(); });
    const patch = page.waitForResponse((x) => x.url().includes('/api/students/s6-t') && x.request().method() === 'PATCH', { timeout: 8000 });
    await page.selectOption('select[data-student-id="s6-t"]', 'b2-t');
    const res = await patch;
    assert.match(confirmText, /already in|one batch|transfer/i, 'admin was warned this is a transfer');
    assert.strictEqual(res.status(), 200, 'transfer applied');
    // Still exactly one batch on the student record (no second membership).
    const stu = fake._store.students.find((s) => s.id === 's6-t');
    assert.strictEqual(stu.batch_id, 'b2-t', 'student now has exactly one (new) batch');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// LECTURER LECTURE LIFECYCLE (real editor UI): open → edit slide → save →
// refresh persists → publish → student sees → edit again keeps students on
// last published → republish → student sees update.
// ─────────────────────────────────────────────────────────────
async function openLecturesTab(page) {
  const r = page.waitForResponse((x) => x.url().includes('/api/lectures') && x.request().method() === 'GET', { timeout: 10000 });
  await page.evaluate(() => window.switchTab('lectures'));
  await r;
  await page.waitForFunction(() => /Draft Lecture|Intro to Vars/.test(document.getElementById('lecListWrap')?.textContent || ''), null, { timeout: 8000 });
}
async function openEditorByLabel(page, label) {
  await page.click(`#lecListWrap button:has-text("${label}")`);
  await page.waitForSelector('#lecEditModal #lecEditBody input[data-f="slide_title"]', { timeout: 8000 });
}

test('lecturer lecture lifecycle: edit → save → persist → publish → student → republish', async () => {
  // ── Lecturer A edits the pending lecture's first slide and saves ──
  let ctx = await newPage(DESKTOP);
  try {
    await lecturerLogin(ctx.page, 'lex@test.local');
    await openLecturesTab(ctx.page);
    await openEditorByLabel(ctx.page, 'Review'); // pending_review lecture
    await ctx.page.fill('#lecEditBody input[data-f="slide_title"]', 'EDITED SLIDE TITLE');
    const save = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t') && x.request().method() === 'PATCH', { timeout: 8000 });
    await ctx.page.click('#lecSaveBtn');
    assert.strictEqual((await save).status(), 200, 'save draft persists via PATCH');

    // ── Refresh persistence: reload, reopen, the edit is still there ──
    await ctx.page.reload();
    await openLecturesTab(ctx.page);
    await openEditorByLabel(ctx.page, 'Review');
    const val = await ctx.page.inputValue('#lecEditBody input[data-f="slide_title"]');
    assert.strictEqual(val, 'EDITED SLIDE TITLE', 'edit persisted across refresh');

    // ── Publish to students ──
    const pub = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t/publish'), { timeout: 8000 });
    await ctx.page.click('#lecPublishArea button:has-text("Publish")');
    assert.strictEqual((await pub).status(), 200, 'publish succeeds');
    assert.deepStrictEqual(ctx.serverErrors, [], 'no 5xx during lecturer lecture flow');
  } finally { await ctx.context.close(); }

  // ── Student A now sees the published lecture and the edited slide ──
  ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ada@test.local');
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/student'), { timeout: 8000 });
    await ctx.page.evaluate(() => window.switchTab('lectures'));
    await r;
    await ctx.page.waitForFunction(() => /Draft Lecture/.test(document.getElementById('lecList')?.textContent || ''), null, { timeout: 8000 });
    // Open its slides and confirm the lecturer's edit is what students see.
    const sr = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t/student'), { timeout: 8000 });
    await ctx.page.locator('#lecList div').filter({ hasText: 'Draft Lecture' })
      .filter({ has: ctx.page.locator('button', { hasText: 'View Slides' }) })
      .last().locator('button', { hasText: 'View Slides' }).click();
    await sr;
    await ctx.page.waitForFunction(() => /EDITED SLIDE TITLE/.test(document.body.innerText), null, { timeout: 8000 });
  } finally { await ctx.context.close(); }

  // ── Lecturer edits again (students still see last published) then republishes ──
  ctx = await newPage(DESKTOP);
  try {
    await lecturerLogin(ctx.page, 'lex@test.local');
    await openLecturesTab(ctx.page);
    await openEditorByLabel(ctx.page, 'Open'); // now published → "Open"
    await ctx.page.fill('#lecEditBody input[data-f="slide_title"]', 'REPUBLISHED TITLE');
    const save = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t') && x.request().method() === 'PATCH', { timeout: 8000 });
    await ctx.page.click('#lecSaveBtn');
    await save;
    // republish (status is now edited_after_publishing)
    await ctx.page.waitForSelector('#lecPublishArea button:has-text("Republish")', { timeout: 8000 });
    const rep = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t/republish'), { timeout: 8000 });
    await ctx.page.click('#lecPublishArea button:has-text("Republish")');
    assert.strictEqual((await rep).status(), 200, 'republish succeeds');
  } finally { await ctx.context.close(); }

  // ── Student sees the republished update ──
  ctx = await newPage(DESKTOP);
  try {
    await studentLogin(ctx.page, 'ada@test.local');
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/student'), { timeout: 8000 });
    await ctx.page.evaluate(() => window.switchTab('lectures'));
    await r;
    await ctx.page.waitForFunction(() => /Draft Lecture/.test(document.getElementById('lecList')?.textContent || ''), null, { timeout: 8000 });
    const sr = ctx.page.waitForResponse((x) => x.url().includes('/api/lectures/lec_draft-t/student'), { timeout: 8000 });
    await ctx.page.locator('#lecList div').filter({ hasText: 'Draft Lecture' })
      .filter({ has: ctx.page.locator('button', { hasText: 'View Slides' }) })
      .last().locator('button', { hasText: 'View Slides' }).click();
    await sr;
    await ctx.page.waitForFunction(() => /REPUBLISHED TITLE/.test(document.body.innerText), null, { timeout: 8000 });
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// LECTURER ATTENDANCE MARKING (real UI): open Take Attendance → mark →
// save → refresh persists → student sees it → other batch unaffected.
// ─────────────────────────────────────────────────────────────
test('lecturer attendance: mark → save → persist → student sees → batch B unaffected', async () => {
  // ── Lecturer A marks a new session present and saves ──
  let ctx = await newPage(DESKTOP);
  try {
    await lecturerLogin(ctx.page, 'lex@test.local');
    // L1 now teaches two batches — pick batch b1 (Alpha) explicitly so the
    // session is created for it deterministically.
    await ctx.page.waitForFunction(() => {
      const s = document.getElementById('batchPicker');
      return s && [...s.options].some((o) => o.value === 'b1-t');
    }, null, { timeout: 8000 });
    await ctx.page.evaluate(() => { const s = document.getElementById('batchPicker'); if (s) { s.value = 'b1-t'; s.dispatchEvent(new Event('change')); } });
    await ctx.page.waitForTimeout(400);
    const al = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance') && x.request().method() === 'GET', { timeout: 10000 });
    await ctx.page.evaluate(() => window.switchTab('attendance'));
    await al;
    const roster = ctx.page.waitForResponse((x) => x.url().includes('/api/students') && x.request().method() === 'GET', { timeout: 8000 });
    await ctx.page.click('button:has-text("Take Attendance")');
    await roster;
    await ctx.page.waitForSelector('#att-roster .att-cb', { timeout: 8000 });
    // Distinct slot so it doesn't collide with the seeded week-1 session.
    await ctx.page.fill('#att-week', '3');
    // Pick whatever class day this batch actually offers (its own class_days).
    const day = await ctx.page.evaluate(() => { const s = document.getElementById('att-day'); const o = [...s.options].find((x) => x.value); return o ? o.value : ''; });
    await ctx.page.selectOption('#att-day', day);
    await ctx.page.fill('#att-date', '2026-03-05');
    await ctx.page.fill('#att-topic', 'Marked in browser');
    // Ada is present (default all-present); save.
    const save = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance') && x.request().method() === 'POST', { timeout: 8000 });
    await ctx.page.click('#saveAttBtn');
    assert.strictEqual((await save).status(), 200, 'attendance save succeeds');
    await ctx.page.waitForFunction(() => /Week 3/.test(document.getElementById('attTableBody')?.textContent || ''), null, { timeout: 8000 });

    // ── Refresh persistence ──
    await ctx.page.reload();
    const al2 = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance') && x.request().method() === 'GET', { timeout: 10000 });
    await ctx.page.evaluate(() => window.switchTab('attendance'));
    await al2;
    await ctx.page.waitForFunction(() => /Marked in browser/.test(document.getElementById('attTableBody')?.textContent || ''), null, { timeout: 8000 });
    assert.deepStrictEqual(ctx.serverErrors, [], 'no 5xx during attendance flow');
  } finally { await ctx.context.close(); }

  // ── Student A sees the attendance (present count reflects the new session) ──
  ctx = await newPage(DESKTOP);
  try {
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance/me') && x.status() === 200, { timeout: 8000 });
    await studentLogin(ctx.page, 'ada@test.local');
    const body = await (await r).json();
    assert.ok(body.totalPresent >= 2, 'A now has the seeded + newly marked present records');
  } finally { await ctx.context.close(); }

  // ── Batch B student is unaffected ──
  ctx = await newPage(DESKTOP);
  try {
    const r = ctx.page.waitForResponse((x) => x.url().includes('/api/attendance/me') && x.status() === 200, { timeout: 8000 });
    await studentLogin(ctx.page, 'ben@test.local');
    const body = await (await r).json();
    assert.strictEqual(body.totalPresent || 0, 0, 'batch B student unaffected by batch A marking');
  } finally { await ctx.context.close(); }
});

// ─────────────────────────────────────────────────────────────
// PAYMENT + ONBOARDING (real apply-payment page + real server; ONLY the
// Paystack popup + verify call are mocked). Success, mismatch, fail,
// cancel, duplicate — and full onboarding into an active dashboard.
// ─────────────────────────────────────────────────────────────
const studentsByEmail = (email) => fake._store.students.filter((s) => s.email === email);
const applicantByEmail = (email) => fake._store.applicants.find((a) => a.email === email);

async function drivePayment(page, applicantId, mode) {
  const pi = page.waitForResponse((x) => x.url().includes(`/api/applicants/${applicantId}/payment-info`), { timeout: 8000 });
  await page.goto(base + `/apply-payment.html?id=${applicantId}`);
  await pi;
  await page.waitForTimeout(300);
  // Override ONLY the Paystack popup with a stub that fires the page's real callback.
  await page.evaluate((m) => {
    window.__PAY_MODE__ = m;
    window.PaystackPop = { setup: (opts) => ({ openIframe: () => {
      const mode = window.__PAY_MODE__ || 'good';
      if (mode === 'cancel') { if (opts.onClose) opts.onClose(); return; }
      let ref = opts.ref;
      if (mode === 'mismatch') ref += '-MISMATCH';
      else if (mode === 'fail') ref += '-FAIL';
      else if (mode === 'pending') ref += '-PENDING';
      opts.callback({ reference: ref, status: 'success' });
    } }) };
  }, mode);
  await page.evaluate(() => window.choosePlan('full'));
  await page.click('#paystackBtn');
}

test('payment success: apply-payment → server verify → enrolment consistent', async () => {
  const { context, page, serverErrors } = await newPage(DESKTOP);
  try {
    const pay = page.waitForResponse((x) => x.url().includes('/api/applicants/pay-good/pay-application'), { timeout: 8000 });
    await drivePayment(page, 'pay-good', 'good');
    assert.strictEqual((await pay).status(), 200, 'server accepts the verified payment');
    await page.waitForSelector('#receiptOverlay', { state: 'visible', timeout: 8000 });

    // Transactional integrity: student Active + fee paid + payment rows all present.
    const [stu] = studentsByEmail('grace@test.local');
    assert.ok(stu, 'student created');
    assert.strictEqual(stu.status, 'Active');
    assert.strictEqual(stu.application_fee_paid, true);
    assert.strictEqual(stu.batch_id, 'b1-t', 'enrolled into the AI Development batch');
    assert.strictEqual(applicantByEmail('grace@test.local').application_fee_paid, true);
    const rows = fake._store.payments.filter((p) => p.student_id === stu.id);
    assert.ok(rows.some((p) => p.category === 'application_fee' && p.amount_paid > 0), 'app fee recorded paid');
    assert.ok(rows.some((p) => p.category === 'full_tuition_payment' && p.amount_paid > 0), 'tuition recorded paid');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx during payment');
  } finally { await context.close(); }
});

test('onboarding: paid applicant can log into the active student dashboard', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    // grace paid in the previous test; her acceptance email failed (no RESEND),
    // so the generated password is captured in email_failures — use it to prove
    // the account is truly active and usable.
    const fail = fake._store.email_failures?.find((r) => r.to_email === 'grace@test.local');
    assert.ok(fail && fail.payload && fail.payload.password, 'generated credentials captured');
    await page.goto(base + '/student-login.html');
    await page.fill('#loginEmail', 'grace@test.local');
    await page.fill('#loginPassword', fail.payload.password);
    await Promise.all([page.waitForURL('**/student-dashboard.html'), page.click('#loginBtn')]);
    await page.waitForFunction(() => /Grace/.test(document.body.innerText), null, { timeout: 8000 });
    // Refresh retains access (session persists, no re-enrolment).
    await page.reload();
    await page.waitForURL('**/student-dashboard.html', { timeout: 8000 });
    await page.waitForFunction(() => /Grace/.test(document.body.innerText), null, { timeout: 8000 });
    assert.strictEqual(studentsByEmail('grace@test.local').length, 1, 'refresh did not duplicate the student');
  } finally { await context.close(); }
});

test('payment pending at provider: rejected, no enrolment', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    const pay = page.waitForResponse((x) => x.url().includes('/api/applicants/pay-pending/pay-application'), { timeout: 8000 });
    await drivePayment(page, 'pay-pending', 'pending');
    assert.strictEqual((await pay).status(), 400, 'pending (non-success) rejected');
    assert.strictEqual(studentsByEmail('paula@test.local').length, 0, 'no student while pending');
    assert.strictEqual(applicantByEmail('paula@test.local').application_fee_paid, false);
  } finally { await context.close(); }
});

test('wrong reference (belongs to another applicant): rejected', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    // pay-cancel is still unpaid; POST a reference whose metadata names someone else.
    await page.goto(base + '/apply-payment.html?id=pay-cancel');
    await page.waitForTimeout(300);
    const status = await page.evaluate(async () => {
      const csrf = (document.cookie.match(/_csrf=([^;]+)/) || [])[1] || '';
      const res = await fetch('/api/applicants/pay-cancel/pay-application', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ reference: 'ENROL-someone-else-123456789012', paymentPlan: 'full' }),
      });
      return res.status;
    });
    assert.strictEqual(status, 400, 'reference not belonging to this applicant is rejected');
    assert.strictEqual(studentsByEmail('cara@test.local').length, 0, 'no student created');
  } finally { await context.close(); }
});

test('payment amount mismatch: rejected, no enrolment (no partial state)', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    const pay = page.waitForResponse((x) => x.url().includes('/api/applicants/pay-mismatch/pay-application'), { timeout: 8000 });
    await drivePayment(page, 'pay-mismatch', 'mismatch');
    assert.strictEqual((await pay).status(), 400, 'amount mismatch rejected server-side');
    await page.waitForSelector('#mainError', { state: 'visible', timeout: 8000 });
    assert.strictEqual(studentsByEmail('mia@test.local').length, 0, 'no student on mismatch');
    assert.strictEqual(applicantByEmail('mia@test.local').application_fee_paid, false, 'applicant not marked paid');
  } finally { await context.close(); }
});

test('payment failed at provider: rejected, no enrolment', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    const pay = page.waitForResponse((x) => x.url().includes('/api/applicants/pay-fail/pay-application'), { timeout: 8000 });
    await drivePayment(page, 'pay-fail', 'fail');
    assert.strictEqual((await pay).status(), 400, 'failed verification rejected');
    assert.strictEqual(studentsByEmail('fred@test.local').length, 0, 'no student on failed payment');
    assert.strictEqual(applicantByEmail('fred@test.local').application_fee_paid, false);
  } finally { await context.close(); }
});

test('payment cancelled: no server call, no enrolment', async () => {
  const { context, page, api } = await newPage(DESKTOP);
  try {
    await drivePayment(page, 'pay-cancel', 'cancel');
    await page.waitForTimeout(500);
    assert.ok(!apiHit(api, '/api/applicants/pay-cancel/pay-application'), 'cancel makes no pay-application call');
    assert.strictEqual(studentsByEmail('cara@test.local').length, 0, 'no student on cancel');
    assert.strictEqual(applicantByEmail('cara@test.local').application_fee_paid, false);
  } finally { await context.close(); }
});

test('duplicate callback: same reference does not double-enrol', async () => {
  const { context, page } = await newPage(DESKTOP);
  try {
    const pay = page.waitForResponse((x) => x.url().includes('/api/applicants/pay-dup/pay-application'), { timeout: 8000 });
    await drivePayment(page, 'pay-dup', 'good');
    assert.strictEqual((await pay).status(), 200);
    await page.waitForSelector('#receiptOverlay', { state: 'visible', timeout: 8000 });
    assert.strictEqual(studentsByEmail('dan@test.local').length, 1, 'exactly one student after first callback');

    // Fire the SAME reference again from the page (simulated duplicate callback).
    const ref = applicantByEmail('dan@test.local').application_fee_ref;
    const status = await page.evaluate(async (r) => {
      const csrf = (document.cookie.match(/_csrf=([^;]+)/) || [])[1] || '';
      const res = await fetch('/api/applicants/pay-dup/pay-application', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ reference: r, paymentPlan: 'full' }),
      });
      return res.status;
    }, ref);
    assert.ok([400, 409].includes(status), `duplicate rejected (${status})`);
    assert.strictEqual(studentsByEmail('dan@test.local').length, 1, 'still exactly one student');
  } finally { await context.close(); }
});

// ─────────────────────────────────────────────────────────────
// TABLET 768×1024 — the major Academy interfaces render and operate.
// (No horizontal overflow, no 5xx, no console errors; key content shows.)
// ─────────────────────────────────────────────────────────────
async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.strictEqual(overflow, false, `no horizontal overflow: ${label}`);
}

test('tablet: student dashboard + lectures render', async () => {
  const { context, page, errors, serverErrors } = await newPage(TABLET);
  try {
    await studentLogin(page, 'ada@test.local');
    await page.waitForFunction(() => /Ada/.test(document.body.innerText), null, { timeout: 8000 });
    await assertNoHorizontalOverflow(page, 'student dashboard');
    const r = page.waitForResponse((x) => x.url().includes('/api/lectures/student'), { timeout: 8000 });
    await page.evaluate(() => window.switchTab('lectures'));
    await r;
    await page.waitForFunction(() => /Intro to Vars/.test(document.getElementById('lecList')?.textContent || ''), null, { timeout: 8000 });
    await assertNoHorizontalOverflow(page, 'student lectures');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx');
    assert.deepStrictEqual(errors, [], 'no console errors');
  } finally { await context.close(); }
});

test('tablet: lecturer dashboard + lecture management + attendance render', async () => {
  const { context, page, serverErrors } = await newPage(TABLET);
  try {
    await lecturerLogin(page, 'lex@test.local');
    await page.waitForTimeout(800);
    await assertNoHorizontalOverflow(page, 'lecturer dashboard');
    // Lecture management
    await openLecturesTab(page);
    await assertNoHorizontalOverflow(page, 'lecturer lectures');
    assert.match(await page.textContent('#lecListWrap'), /Draft Lecture|Intro to Vars/);
    // Attendance
    const al = page.waitForResponse((x) => x.url().includes('/api/attendance') && x.request().method() === 'GET', { timeout: 10000 });
    await page.evaluate(() => window.switchTab('attendance'));
    await al;
    await page.waitForSelector('#attTableBody', { timeout: 8000 });
    await assertNoHorizontalOverflow(page, 'lecturer attendance');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx');
  } finally { await context.close(); }
});

test('tablet: admin dashboard + concurrent batch management render', async () => {
  const { context, page, serverErrors } = await newPage(TABLET);
  try {
    await adminLogin(page);
    await page.waitForTimeout(800);
    await assertNoHorizontalOverflow(page, 'admin dashboard');
    const r = page.waitForResponse((x) => x.url().includes('/api/batches') && x.request().method() === 'GET', { timeout: 8000 });
    await page.evaluate(() => window.navigate && window.navigate('batches'));
    await r.catch(() => {});
    await page.evaluate(() => window.loadBatches && window.loadBatches()).catch(() => {});
    await page.waitForFunction(() => /Batch Alpha/.test(document.getElementById('batchTableBody')?.textContent || ''), null, { timeout: 8000 });
    const table = await page.textContent('#batchTableBody');
    assert.match(table, /Batch Alpha/);
    assert.match(table, /Batch Beta/);
    await assertNoHorizontalOverflow(page, 'admin batch management');
    assert.deepStrictEqual(serverErrors, [], 'no 5xx');
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
        '/api/lectures/lec_pub-t',              // b1 lecture (editor)
        '/api/materials/m1-t',                  // b1 material
        '/api/assignments/as1-t',               // b1 assignment
        '/api/assignments/as1-t/submissions',   // b1 submissions
        '/api/flashcards/sets/fs1-t/results',   // b1 flashcard results
        '/api/attendance/att1-t',               // b1 attendance session
      ];
      for (const url of b1Resources) {
        const resp = await page.goto(base + url);
        assert.ok([403, 404].includes(resp.status()), `${url} → ${resp.status()} (expected 403/404)`);
        const txt = await page.textContent('body');
        assert.doesNotMatch(txt, /Intro to Vars|Slides Wk1|HW1|Recursion/, `no b1 content leaked from ${url}`);
        assert.doesNotMatch(txt, /No rows|PGRST|SUPABASE_/i, `no DB internals leaked from ${url}`);
      }
      // Positive control: Lecturer B CAN reach their own batch-b2 lecture.
      const own = await page.goto(base + '/api/lectures/lec_b2-t');
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
