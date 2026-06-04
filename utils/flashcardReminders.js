// Flashcard nudges:
//  - 6 PM on a class day: remind students who haven't done that day's flashcards.
//  - Next morning: follow up with students who missed the previous day's set.
// Push for everyone (via the notifications chokepoint), with a branded email as a
// fallback for students who have no push subscription.
const supabase = require('../lib/supabase');
const notificationsDb = require('../db/notifications');
const pushDb = require('../db/pushSubscriptions');
const { sendMail } = require('./mailer');
const { flashcardReminderEmail, flashcardMissedEmail } = require('./emailTemplates');

const DAY = 86400000;
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function dateForWeekDay(startMs, startDow, week, dayName) {
  const t = WEEKDAY[dayName];
  if (t === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (t - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// Calendar date in West Africa Time (UTC+1, no DST). offsetDays shifts the day.
function dateWAT(offsetDays = 0) {
  return new Date(Date.now() + 3600000 + offsetDays * DAY).toISOString().slice(0, 10);
}

// Core: for every published set whose class date is `targetDate`, nudge the
// students in that batch who still haven't completed it.
async function processNudges({ targetDate, notifType, notifTitle, notifMessage, emailFor }) {
  const host = process.env.HOST || '';
  const urls = { loginUrl: host + '/student-login.html', logoUrl: host + '/assets/images/logo/goallord-logo.png' };
  const since = new Date(Date.now() - 18 * 3600000).toISOString(); // dedup window

  const { data: batches } = await supabase.from('batches').select('id, start_date').eq('is_active', true);
  let reminded = 0, emailed = 0, emailFailed = 0;

  for (const batch of batches || []) {
    if (!batch.start_date) continue;
    const startMs = new Date(batch.start_date + 'T00:00:00Z').getTime();
    const startDow = new Date(startMs).getUTCDay();

    const { data: entries } = await supabase.from('curriculum_entries')
      .select('week, day, topic').eq('batch_id', batch.id);
    const matching = (entries || []).filter(e => dateForWeekDay(startMs, startDow, e.week, e.day) === targetDate);
    if (!matching.length) continue;

    for (const entry of matching) {
      const { data: sets } = await supabase.from('flashcard_sets')
        .select('id, topic, week').eq('batch_id', batch.id)
        .eq('week', entry.week).eq('topic', entry.topic).eq('published', true).limit(1);
      const set = sets && sets[0];
      if (!set) continue;

      const { count: cardCount } = await supabase.from('flashcards')
        .select('id', { count: 'exact', head: true }).eq('set_id', set.id);

      const { data: students } = await supabase.from('students')
        .select('id, full_name, email').eq('batch_id', batch.id).eq('status', 'Active');
      if (!students || !students.length) continue;
      const ids = students.map(s => s.id);

      const { data: resp } = await supabase.from('flashcard_responses')
        .select('student_id').eq('set_id', set.id).in('student_id', ids);
      const done = new Set((resp || []).map(r => r.student_id));

      const { data: already } = await supabase.from('notifications')
        .select('recipient_id').eq('type', notifType).in('recipient_id', ids).gte('created_at', since);
      const nudgedRecently = new Set((already || []).map(n => n.recipient_id));

      const todo = students.filter(s => !done.has(s.id) && !nudgedRecently.has(s.id));
      if (!todo.length) continue;

      // 1) In-app + push for everyone.
      await notificationsDb.insertMany(todo.map(s => ({
        recipient_id: s.id, recipient_type: 'Student', type: notifType,
        title: notifTitle, message: notifMessage(set),
        link: '/student-dashboard.html#flashcards',
      })));
      reminded += todo.length;

      // 2) Email fallback for students with no push subscription.
      for (const s of todo) {
        try {
          const subs = await pushDb.findByUser(s.id);
          if (subs && subs.length) continue;
          if (!s.email) continue;
          const { subject, html } = emailFor(s, set, entry, cardCount || 10, urls);
          await sendMail({ to: s.email, subject, html });
          emailed++;
        } catch (e) {
          emailFailed++;
          console.error('[FlashcardNudges] email failed for', s.email, '-', e.message);
        }
      }
    }
  }
  return { reminded, emailed, emailFailed };
}

// 6 PM same-day reminder.
async function runFlashcardReminders() {
  const r = await processNudges({
    targetDate: dateWAT(0),
    notifType: 'flashcard_reminder',
    notifTitle: 'Flashcards due today',
    notifMessage: (set) => `Do today's ${set.topic} flashcards before the day ends.`,
    emailFor: (s, set, entry, count, urls) => ({
      subject: `Reminder: today's flashcards (${set.topic})`,
      html: flashcardReminderEmail({ fullName: s.full_name, topic: set.topic, week: set.week, day: entry.day, count, ...urls }),
    }),
  });
  if (r.reminded) console.log(`[FlashcardReminders] reminded ${r.reminded}; ${r.emailed} email${r.emailFailed ? `, ${r.emailFailed} failed` : ''}`);
  return r;
}

// Next-morning follow-up for the previous day's missed set.
async function runFlashcardFollowups() {
  const r = await processNudges({
    targetDate: dateWAT(-1),
    notifType: 'flashcard_missed',
    notifTitle: "You missed yesterday's flashcards",
    notifMessage: (set) => `You haven't done ${set.topic} flashcards yet — they're still open, catch up now.`,
    emailFor: (s, set, entry, count, urls) => ({
      subject: `Catch up: ${set.topic} flashcards`,
      html: flashcardMissedEmail({ fullName: s.full_name, topic: set.topic, week: set.week, day: entry.day, count, ...urls }),
    }),
  });
  if (r.reminded) console.log(`[FlashcardFollowups] followed up ${r.reminded}; ${r.emailed} email${r.emailFailed ? `, ${r.emailFailed} failed` : ''}`);
  return r;
}

module.exports = { runFlashcardReminders, runFlashcardFollowups };
