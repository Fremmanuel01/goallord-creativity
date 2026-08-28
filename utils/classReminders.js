// Class reminders — two windows off the same batch-timezone schedule:
//   • same-day   (runClassReminders):        class is today
//   • day-before (runClassRemindersDayBefore): class is tomorrow
// For each active batch whose class falls on the target date, we email + notify
// every active student and every assigned active lecturer, naming the batch's
// curriculum topic for that date when there is one. Idempotent: a per-day dedup
// on the notifications table (keyed by reminder type) means a restart or a
// double-trigger never double-sends, and the two windows never collide.
// Best-effort: failures are logged, never thrown.
const supabase        = require('../lib/supabase');
const studentsDb      = require('../db/students');
const notificationsDb = require('../db/notifications');
const { sendMail } = require('./mailer');
const { classReminderEmail } = require('./emailTemplates');

const DAY = 86400000;
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Calendar date of a curriculum (week, day) for a batch — same mapping the
// flashcard nudges use, so "today's topic" lines up with the rest of the portal.
function dateForWeekDay(startMs, startDow, week, dayName) {
  const t = WEEKDAY[dayName];
  if (t === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (t - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// Today's calendar date in WAT (UTC+1, no DST).
function todayWAT() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

// Add n whole days to a YYYY-MM-DD date, returning YYYY-MM-DD.
function addDays(isoDate, n) {
  return new Date(new Date(isoDate + 'T00:00:00Z').getTime() + n * DAY).toISOString().slice(0, 10);
}

// Active lecturers mapped to a batch (via the lecturer_batches junction).
async function lecturersForBatch(batchId) {
  const { data: links } = await supabase.from('lecturer_batches')
    .select('lecturer_id').eq('batch_id', batchId);
  const ids = (links || []).map(l => l.lecturer_id);
  if (!ids.length) return [];
  const { data: lecturers } = await supabase.from('lecturers')
    .select('id, full_name, email').in('id', ids).eq('status', 'Active');
  return lecturers || [];
}

// mode: 'today' (same-day) | 'tomorrow' (day-before). opts.todayOverride pins
// "today" for deterministic tests; production leaves it undefined.
async function runReminders(mode = 'today', opts = {}) {
  const when = mode === 'tomorrow' ? 'tomorrow' : 'today';
  const notifType = when === 'tomorrow' ? 'class_reminder_tomorrow' : 'class_reminder';
  const runDay = opts.todayOverride || todayWAT();          // the calendar day we run on
  const targetDate = when === 'tomorrow' ? addDays(runDay, 1) : runDay; // the class day
  const dayName = DAY_NAMES[new Date(targetDate + 'T00:00:00Z').getUTCDay()];
  const host = process.env.HOST || '';
  const logoUrl  = host + '/assets/images/logo/goallord-logo.png';
  const studentLoginUrl  = host + '/student-login.html';
  const lecturerLoginUrl = host + '/lecturer-login.html';
  // Dedup within the day we run on, per reminder type — so re-runs never
  // double-send and the today/tomorrow windows stay independent.
  const dedupSince = runDay + 'T00:00:00Z';

  const { data: batches } = await supabase.from('batches')
    .select('id, name, start_date').eq('is_active', true);

  const totals = { notified: 0, emailed: 0, emailFailed: 0, batchesHit: 0 };

  // Send (notification + push + email) to one audience, skipping anyone already
  // reminded earlier today so a restart can't double-send.
  async function deliver(people, { recipientType, audience, loginUrl, link, batchName, topic, details }) {
    if (!people.length) return false;
    const ids = people.map(p => p.id);
    const { data: already } = await supabase.from('notifications')
      .select('recipient_id').eq('type', notifType).in('recipient_id', ids).gte('created_at', dedupSince);
    const done = new Set((already || []).map(n => n.recipient_id));
    const todo = people.filter(p => !done.has(p.id));
    if (!todo.length) return false;

    await notificationsDb.insertMany(todo.map(p => ({
      recipient_id: p.id, recipient_type: recipientType, type: notifType,
      title: audience === 'lecturer' ? `You’re teaching ${when}` : `You have class ${when}`,
      message: topic
        ? `${when === 'tomorrow' ? "Tomorrow's" : "Today's"} class: ${topic}. See you there.`
        : (audience === 'lecturer' ? `You’re scheduled to teach ${when}.` : `Class holds ${when}. See you there.`),
      link,
    })));
    totals.notified += todo.length;

    for (const p of todo) {
      if (!p.email) continue;
      try {
        await sendMail({
          to: p.email,
          subject: topic
            ? `Class ${when}: ${topic}`
            : (audience === 'lecturer' ? `You’re teaching ${when}` : `You have class ${when}`),
          html: classReminderEmail({
            fullName: p.full_name, batchName, dayName, topic, details, loginUrl, logoUrl, audience, when,
          }),
        });
        totals.emailed++;
      } catch (e) {
        totals.emailFailed++;
        console.error('[ClassReminders] email failed for', p.email, '-', e.message);
      }
    }
    return true;
  }

  for (const batch of batches || []) {
    const students  = await studentsDb.findByBatch(batch.id); // active only
    const lecturers = await lecturersForBatch(batch.id);      // active only
    if (!students.length && !lecturers.length) continue;

    // Resolve today's topic from the curriculum, if the batch has one for today.
    let topic = '', details = '';
    if (batch.start_date) {
      const startMs = new Date(batch.start_date + 'T00:00:00Z').getTime();
      const startDow = new Date(startMs).getUTCDay();
      const { data: entries } = await supabase.from('curriculum_entries')
        .select('week, day, topic, objectives, subtopics').eq('batch_id', batch.id);
      const match = (entries || []).find(e =>
        e.day === dayName && dateForWeekDay(startMs, startDow, e.week, e.day) === targetDate);
      if (match) {
        topic = match.topic || '';
        details = (match.objectives && match.objectives.trim())
          || (Array.isArray(match.subtopics) && match.subtopics.length ? match.subtopics.join(', ') : '');
      }
    }

    const hitStudents = await deliver(students, {
      recipientType: 'Student', audience: 'student', loginUrl: studentLoginUrl,
      link: '/student-dashboard.html', batchName: batch.name, topic, details,
    });
    const hitLecturers = await deliver(lecturers, {
      recipientType: 'Lecturer', audience: 'lecturer', loginUrl: lecturerLoginUrl,
      link: '/lecturer-dashboard.html', batchName: batch.name, topic, details,
    });
    if (hitStudents || hitLecturers) totals.batchesHit++;
  }

  if (totals.notified) console.log(`[ClassReminders:${when}] ${dayName}: notified ${totals.notified} across ${totals.batchesHit} batch(es); ${totals.emailed} email${totals.emailFailed ? `, ${totals.emailFailed} failed` : ''}.`);
  return totals;
}

// Same-day: class is today.
function runClassReminders(opts) { return runReminders('today', opts); }
// Day-before: class is tomorrow.
function runClassRemindersDayBefore(opts) { return runReminders('tomorrow', opts); }

module.exports = { runClassReminders, runClassRemindersDayBefore };
