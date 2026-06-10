// Early-morning class reminder.
// Runs at 6 AM (West Africa Time) on class days and emails every active student
// in every active batch that they have class today. When the batch has a
// curriculum entry for the day, the email also names the topic and what will be
// taught; batches without a matching curriculum entry simply get the reminder
// without a topic. Best-effort: failures are logged, never thrown.
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

async function runClassReminders() {
  const targetDate = todayWAT();
  const dayName = DAY_NAMES[new Date(targetDate + 'T00:00:00Z').getUTCDay()];
  const host = process.env.HOST || '';
  const logoUrl  = host + '/assets/images/logo/goallord-logo.png';
  const studentLoginUrl  = host + '/student-login.html';
  const lecturerLoginUrl = host + '/lecturer-login.html';
  const dedupSince = targetDate + 'T00:00:00Z'; // anything sent earlier today (WAT-ish)

  const { data: batches } = await supabase.from('batches')
    .select('id, name, start_date').eq('is_active', true);

  const totals = { notified: 0, emailed: 0, emailFailed: 0, batchesHit: 0 };

  // Send (notification + push + email) to one audience, skipping anyone already
  // reminded earlier today so a restart can't double-send.
  async function deliver(people, { recipientType, audience, loginUrl, link, batchName, topic, details }) {
    if (!people.length) return false;
    const ids = people.map(p => p.id);
    const { data: already } = await supabase.from('notifications')
      .select('recipient_id').eq('type', 'class_reminder').in('recipient_id', ids).gte('created_at', dedupSince);
    const done = new Set((already || []).map(n => n.recipient_id));
    const todo = people.filter(p => !done.has(p.id));
    if (!todo.length) return false;

    await notificationsDb.insertMany(todo.map(p => ({
      recipient_id: p.id, recipient_type: recipientType, type: 'class_reminder',
      title: audience === 'lecturer' ? 'You’re teaching today' : 'You have class today',
      message: topic
        ? `Today's class: ${topic}. See you there.`
        : (audience === 'lecturer' ? 'You’re scheduled to teach today.' : 'Class holds today. See you there.'),
      link,
    })));
    totals.notified += todo.length;

    for (const p of todo) {
      if (!p.email) continue;
      try {
        await sendMail({
          to: p.email,
          subject: topic
            ? `Class today: ${topic}`
            : (audience === 'lecturer' ? 'You’re teaching today' : 'You have class today'),
          html: classReminderEmail({
            fullName: p.full_name, batchName, dayName, topic, details, loginUrl, logoUrl, audience,
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

  if (totals.notified) console.log(`[ClassReminders] ${dayName}: notified ${totals.notified} across ${totals.batchesHit} batch(es); ${totals.emailed} email${totals.emailFailed ? `, ${totals.emailFailed} failed` : ''}.`);
  return totals;
}

module.exports = { runClassReminders };
