// ============================================================
// test/classReminders.test.js — per-batch class-time reminders
//
// Each active batch has its OWN class days + class time. Same-day reminders
// fire only inside each batch's lead window (default 2h before ITS time), so a
// 9:00 AM batch and a 4:00 PM batch are reminded at different times — never
// together just because they share a program. Day-before names each batch's
// own time. Deterministic via nowOverride / todayOverride pinned near the fake's
// timestamp epoch (BASE_TS ≈ 2023-11-14) so the notifications dedup is exercised.
//
// Run: node --test test/classReminders.test.js
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { createFakeSupabase } = require('./support/fake-supabase');

const ROOT = path.join(__dirname, '..');
const P = (rel) => require.resolve(path.join(ROOT, rel));
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CLASS_DAY = '2023-11-14';                 // Tuesday, == fake epoch day
const RUN_DAY = '2023-11-13';                   // day the day-before job runs
const CLASS_DOW = DAY_NAMES[new Date(CLASS_DAY + 'T00:00:00Z').getUTCDay()];
// UTC timestamps → WAT (UTC+1) local times on CLASS_DAY.
const AT_WAT = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${CLASS_DAY}T${String(h - 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`; };

function seed() {
  return {
    batches: [
      { id: 'bM', name: 'WebDev Morning', number: 1, track: 'Web Development', is_active: true, start_date: CLASS_DAY, class_days: [CLASS_DOW], class_time: '09:00' },
      { id: 'bE', name: 'WebDev Evening', number: 2, track: 'Web Development', is_active: true, start_date: CLASS_DAY, class_days: [CLASS_DOW], class_time: '16:00' },
    ],
    students: [
      { id: 'sM', full_name: 'Morn Student', email: 'm@t.local', batch_id: 'bM', status: 'Active' },
      { id: 'sE', full_name: 'Eve Student', email: 'e@t.local', batch_id: 'bE', status: 'Active' },
    ],
    lecturers: [
      { id: 'lM', full_name: 'Morn Lec', email: 'lm@t.local', status: 'Active' },
      { id: 'lE', full_name: 'Eve Lec', email: 'le@t.local', status: 'Active' },
    ],
    lecturer_batches: [{ lecturer_id: 'lM', batch_id: 'bM' }, { lecturer_id: 'lE', batch_id: 'bE' }],
    curriculum_entries: [
      { id: 'cM', batch_id: 'bM', week: 1, day: CLASS_DOW, topic: 'Morning Topic', objectives: 'AM', subtopics: [] },
      { id: 'cE', batch_id: 'bE', week: 1, day: CLASS_DOW, topic: 'Evening Topic', objectives: 'PM', subtopics: [] },
    ],
    notifications: [],
  };
}

function load(seedData) {
  const fake = createFakeSupabase(seedData);
  ['lib/supabase.js', 'db/students.js', 'db/notifications.js', 'utils/classReminders.js', 'utils/emailTemplates.js', 'utils/mailer.js', 'utils/batchSchedule.js']
    .forEach((rel) => { try { delete require.cache[P(rel)]; } catch (_) {} });
  const sp = P('lib/supabase.js');
  require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };
  const mod = require(P('utils/classReminders.js'));
  return { fake, ...mod };
}

const notes = (fake, type) => fake._store.notifications.filter((n) => n.type === type);
const msgFor = (fake, type, rid) => (notes(fake, type).find((n) => n.recipient_id === rid) || {}).message || '';

test('same-day: only the batch whose lead window is open is reminded (9 AM batch at 7 AM)', async () => {
  const { fake, runClassReminders } = load(seed());
  // 07:00 WAT — inside the Morning (09:00) window [07:00,09:00); Evening (16:00) window is [14:00,16:00).
  const totals = await runClassReminders({ nowOverride: AT_WAT('07:00') });
  assert.strictEqual(totals.notified, 2, 'Morning student + lecturer only');
  const recips = notes(fake, 'class_reminder').map((n) => n.recipient_id).sort();
  assert.deepStrictEqual(recips, ['lM', 'sM']);
  assert.ok(!recips.includes('sE'), 'evening batch NOT reminded at 7 AM');
  assert.match(msgFor(fake, 'class_reminder', 'sM'), /9:00 AM/, 'names the batch class time');
  assert.match(msgFor(fake, 'class_reminder', 'sM'), /Morning Topic/);
});

test('same-day: the 4 PM batch is reminded at 2:30 PM (its own window), not the 9 AM batch', async () => {
  const { fake, runClassReminders } = load(seed());
  const totals = await runClassReminders({ nowOverride: AT_WAT('14:30') });
  assert.strictEqual(totals.notified, 2, 'Evening student + lecturer only');
  const recips = notes(fake, 'class_reminder').map((n) => n.recipient_id).sort();
  assert.deepStrictEqual(recips, ['lE', 'sE']);
  assert.match(msgFor(fake, 'class_reminder', 'sE'), /4:00 PM/);
  assert.match(msgFor(fake, 'class_reminder', 'sE'), /Evening Topic/);
});

test('same-day: after class time has passed, no reminder fires', async () => {
  const { fake, runClassReminders } = load(seed());
  const totals = await runClassReminders({ nowOverride: AT_WAT('09:30') }); // Morning already started; Evening not yet in window
  assert.strictEqual(totals.notified, 0, 'started class does not generate a reminder, evening not yet due');
  assert.strictEqual(notes(fake, 'class_reminder').length, 0);
});

test('same-day is idempotent within a batch window (a re-poll sends nothing more)', async () => {
  const { fake, runClassReminders } = load(seed());
  await runClassReminders({ nowOverride: AT_WAT('07:00') });
  const again = await runClassReminders({ nowOverride: AT_WAT('08:00') }); // still in Morning window
  assert.strictEqual(again.notified, 0, 'no double-send on repeated polls');
  assert.strictEqual(notes(fake, 'class_reminder').length, 2);
});

test('day-before: each batch names its OWN class time and topic', async () => {
  const { fake, runClassRemindersDayBefore } = load(seed());
  const totals = await runClassRemindersDayBefore({ todayOverride: RUN_DAY });
  assert.strictEqual(totals.notified, 4, 'both batches: student + lecturer');
  const t = notes(fake, 'class_reminder_tomorrow');
  assert.strictEqual(t.length, 4);
  assert.match(msgFor(fake, 'class_reminder_tomorrow', 'sM'), /tomorrow at 9:00 AM/);
  assert.match(msgFor(fake, 'class_reminder_tomorrow', 'sM'), /Morning Topic/);
  assert.match(msgFor(fake, 'class_reminder_tomorrow', 'sE'), /tomorrow at 4:00 PM/);
  assert.match(msgFor(fake, 'class_reminder_tomorrow', 'sE'), /Evening Topic/);
});

test('day-before: no topic → time-only message, no invented topic', async () => {
  const s = seed();
  s.curriculum_entries = []; // no curriculum
  const { fake, runClassRemindersDayBefore } = load(s);
  await runClassRemindersDayBefore({ todayOverride: RUN_DAY });
  const m = msgFor(fake, 'class_reminder_tomorrow', 'sM');
  assert.match(m, /tomorrow at 9:00 AM/);
  assert.doesNotMatch(m, /Topic:/, 'no topic line when curriculum is absent');
});

test('batch not meeting on the target day is skipped', async () => {
  const s = seed();
  s.batches[0].class_days = ['Friday']; // Morning batch does not meet on Tuesday
  const { fake, runClassReminders } = load(s);
  await runClassReminders({ nowOverride: AT_WAT('07:00') });
  assert.strictEqual(notes(fake, 'class_reminder').length, 0, 'Morning batch not meeting Tuesday → skipped');
});
