// Flashcard reminders: at 6 PM on a class day, nudge students who haven't done
// that day's flashcards. Push for everyone (via the notifications chokepoint),
// with a branded email as a fallback for students who have no push subscription.
const supabase = require('../lib/supabase');
const notificationsDb = require('../db/notifications');
const pushDb = require('../db/pushSubscriptions');
const { sendMail } = require('./mailer');
const { flashcardReminderEmail } = require('./emailTemplates');

const DAY = 86400000;
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

// Date (YYYY-MM-DD) of `dayName` in `week` of a batch that began on `startMs`.
function dateForWeekDay(startMs, startDow, week, dayName) {
  const t = WEEKDAY[dayName];
  if (t === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (t - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// Calendar date in West Africa Time (UTC+1, no DST), used for "today".
function todayWAT() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

async function runFlashcardReminders() {
  const today = todayWAT();
  const host = process.env.HOST || '';
  const loginUrl = host + '/student-login.html';
  const logoUrl = host + '/assets/images/logo/goallord-logo.png';

  const { data: batches } = await supabase.from('batches').select('id, start_date').eq('is_active', true);
  let reminded = 0, emailed = 0, emailFailed = 0;

  for (const batch of batches || []) {
    if (!batch.start_date) continue;
    const startMs = new Date(batch.start_date + 'T00:00:00Z').getTime();
    const startDow = new Date(startMs).getUTCDay();

    // Which curriculum session(s) fall on today?
    const { data: entries } = await supabase.from('curriculum_entries')
      .select('week, day, topic').eq('batch_id', batch.id);
    const todays = (entries || []).filter(e => dateForWeekDay(startMs, startDow, e.week, e.day) === today);
    if (!todays.length) continue;

    for (const entry of todays) {
      // The published flashcard set for this session (matched by week + topic).
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

      // Drop students who already completed this set.
      const { data: resp } = await supabase.from('flashcard_responses')
        .select('student_id').eq('set_id', set.id).in('student_id', ids);
      const done = new Set((resp || []).map(r => r.student_id));

      // Drop students already reminded in this cycle (idempotent across re-runs).
      // 18h lookback: catches a same-day re-run without matching yesterday's (24h ago).
      const since = new Date(Date.now() - 18 * 3600000).toISOString();
      const { data: already } = await supabase.from('notifications')
        .select('recipient_id').eq('type', 'flashcard_reminder')
        .in('recipient_id', ids).gte('created_at', since);
      const remindedToday = new Set((already || []).map(n => n.recipient_id));

      const todo = students.filter(s => !done.has(s.id) && !remindedToday.has(s.id));
      if (!todo.length) continue;

      // 1) In-app notification + push (push fires for those with a subscription).
      await notificationsDb.insertMany(todo.map(s => ({
        recipient_id: s.id, recipient_type: 'Student', type: 'flashcard_reminder',
        title: 'Flashcards due today',
        message: `Do today's ${set.topic} flashcards before the day ends.`,
        link: '/student-dashboard.html#flashcards',
      })));
      reminded += todo.length;

      // 2) Email fallback — only students with no push subscription.
      for (const s of todo) {
        try {
          const subs = await pushDb.findByUser(s.id);
          if (subs && subs.length) continue;   // has push → no email
          if (!s.email) continue;
          await sendMail({
            to: s.email,
            subject: `Reminder: today's flashcards (${set.topic})`,
            html: flashcardReminderEmail({
              fullName: s.full_name, topic: set.topic, week: set.week,
              day: entry.day, count: cardCount || 10, loginUrl, logoUrl,
            }),
          });
          emailed++;
        } catch (e) {
          emailFailed++;
          console.error('[FlashcardReminders] email failed for', s.email, '-', e.message);
        }
      }
    }
  }

  if (reminded) console.log(`[FlashcardReminders] reminded ${reminded} student(s); ${emailed} email fallback(s)${emailFailed ? `, ${emailFailed} failed` : ''}`);
  return { reminded, emailed, emailFailed };
}

module.exports = { runFlashcardReminders };
