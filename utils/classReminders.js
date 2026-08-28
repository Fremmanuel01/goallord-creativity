// Class reminders — resolved PER BATCH (each active batch has its own class days
// and class time), never from one global Academy time.
//   • same-day   (runClassReminders):        class is today; fired only inside
//     each batch's lead window (default 2h before ITS class time)
//   • day-before (runClassRemindersDayBefore): class is tomorrow; names the
//     batch's own class time in the copy
// For each active batch that meets on the target weekday, we email + notify every
// active student and every assigned active lecturer, naming the batch's class
// time and its curriculum topic for that date when there is one. Idempotent: a
// per-day dedup on the notifications table (keyed by reminder type) means a
// restart or a repeated poll never double-sends. Best-effort: failures logged.
//
// All schedule maths is in Africa/Lagos (WAT = UTC+1, no DST).
const supabase        = require('../lib/supabase');
const studentsDb      = require('../db/students');
const notificationsDb = require('../db/notifications');
const { sendMail } = require('./mailer');
const { classReminderEmail } = require('./emailTemplates');
const { parseHHMM, formatClassTime, DEFAULT_CLASS_TIME } = require('./batchSchedule');

const DAY = 86400000;
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Batches with no class_days fall back to the academy's historical class days.
const DEFAULT_DAYS = ['Tuesday', 'Wednesday', 'Thursday'];
// Same-day reminder lead: how long before class it may fire (minutes).
const LEAD_MIN = Number(process.env.SAME_DAY_REMINDER_LEAD_MINUTES) || 120;

// Calendar date of a curriculum (week, day) for a batch — same mapping the
// flashcard nudges use, so "today's topic" lines up with the rest of the portal.
function dateForWeekDay(startMs, startDow, week, dayName) {
  const t = WEEKDAY[dayName];
  if (t === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (t - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// WAT calendar parts of a UTC timestamp: date (YYYY-MM-DD) and minutes-of-day.
function watParts(ms) {
  const d = new Date(ms + 3600000); // shift into WAT then read as UTC
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
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

// mode: 'today' (same-day) | 'tomorrow' (day-before).
// opts.todayOverride pins the run day; opts.nowOverride pins "now" (for the
// same-day window); opts.ignoreWindow bypasses the window gate. Tests use these;
// production leaves them undefined.
async function runReminders(mode = 'today', opts = {}) {
  const when = mode === 'tomorrow' ? 'tomorrow' : 'today';
  const notifType = when === 'tomorrow' ? 'class_reminder_tomorrow' : 'class_reminder';
  const nowMs = opts.nowOverride != null ? new Date(opts.nowOverride).getTime() : Date.now();
  const nowW = watParts(nowMs);
  const runDay = opts.todayOverride || nowW.date;                       // the calendar day we run on (WAT)
  const targetDate = when === 'tomorrow' ? addDays(runDay, 1) : runDay; // the class day
  const dayName = DAY_NAMES[new Date(targetDate + 'T00:00:00Z').getUTCDay()];
  const host = process.env.HOST || '';
  const logoUrl  = host + '/assets/images/logo/goallord-logo.png';
  const studentLoginUrl  = host + '/student-login.html';
  const lecturerLoginUrl = host + '/lecturer-login.html';
  const dedupSince = runDay + 'T00:00:00Z';

  const { data: batches } = await supabase.from('batches')
    .select('id, name, start_date, class_days, class_time').eq('is_active', true);

  const totals = { notified: 0, emailed: 0, emailFailed: 0, batchesHit: 0 };

  // Deliver to one audience, skipping anyone already reminded earlier today.
  async function deliver(people, { recipientType, audience, loginUrl, link, batchName, topic, details, timeLabel }) {
    if (!people.length) return false;
    const ids = people.map(p => p.id);
    const { data: already } = await supabase.from('notifications')
      .select('recipient_id').eq('type', notifType).in('recipient_id', ids).gte('created_at', dedupSince);
    const done = new Set((already || []).map(n => n.recipient_id));
    const todo = people.filter(p => !done.has(p.id));
    if (!todo.length) return false;

    const at = timeLabel ? ` at ${timeLabel}` : '';
    await notificationsDb.insertMany(todo.map(p => ({
      recipient_id: p.id, recipient_type: recipientType, type: notifType,
      title: audience === 'lecturer' ? `You’re teaching ${when}` : `You have class ${when}`,
      message: audience === 'lecturer'
        ? `You’re teaching ${batchName} ${when}${at}.${topic ? ` Topic: ${topic}.` : ''}`
        : `Your ${batchName} class is ${when}${at}.${topic ? ` Topic: ${topic}.` : ''}`,
      link,
    })));
    totals.notified += todo.length;

    for (const p of todo) {
      if (!p.email) continue;
      try {
        await sendMail({
          to: p.email,
          subject: audience === 'lecturer'
            ? `Teaching ${when}${at}${topic ? `: ${topic}` : ''}`
            : `Your class is ${when}${at}${topic ? `: ${topic}` : ''}`,
          html: classReminderEmail({
            fullName: p.full_name, batchName, dayName, topic, details, loginUrl, logoUrl, audience, when, timeLabel,
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
    // Each batch meets on ITS OWN class days — skip batches not meeting on the target day.
    const days = Array.isArray(batch.class_days) && batch.class_days.length ? batch.class_days : DEFAULT_DAYS;
    if (!days.includes(dayName)) continue;

    // Each batch has ITS OWN class time. Same-day reminders fire only inside this
    // batch's lead window (so a 9 AM batch and a 4 PM batch are reminded at
    // different times, not together). Day-before ignores the window.
    const classTime = batch.class_time || DEFAULT_CLASS_TIME;
    const classMin = parseHHMM(classTime);
    if (when === 'today' && !opts.ignoreWindow && classMin != null) {
      const open = classMin - LEAD_MIN;
      if (!(nowW.min >= open && nowW.min < classMin)) continue; // window not open, or class already started
    }
    const timeLabel = formatClassTime(classTime);

    const students  = await studentsDb.findByBatch(batch.id); // active only
    const lecturers = await lecturersForBatch(batch.id);      // active only
    if (!students.length && !lecturers.length) continue;

    // Resolve the batch's own curriculum topic for the target date, if any.
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
      link: '/student-dashboard.html', batchName: batch.name, topic, details, timeLabel,
    });
    const hitLecturers = await deliver(lecturers, {
      recipientType: 'Lecturer', audience: 'lecturer', loginUrl: lecturerLoginUrl,
      link: '/lecturer-dashboard.html', batchName: batch.name, topic, details, timeLabel,
    });
    if (hitStudents || hitLecturers) totals.batchesHit++;
  }

  if (totals.notified) console.log(`[ClassReminders:${when}] ${dayName}: notified ${totals.notified} across ${totals.batchesHit} batch(es); ${totals.emailed} email${totals.emailFailed ? `, ${totals.emailFailed} failed` : ''}.`);
  return totals;
}

// Same-day: class is today (fires inside each batch's lead window).
function runClassReminders(opts) { return runReminders('today', opts); }
// Day-before: class is tomorrow.
function runClassRemindersDayBefore(opts) { return runReminders('tomorrow', opts); }

module.exports = { runClassReminders, runClassRemindersDayBefore };
