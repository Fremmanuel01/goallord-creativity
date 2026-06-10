// Automatic flashcards.
//
//  1) generateForAttendance(session, actor)
//     Fires the moment a lecturer/admin records attendance. It looks up the
//     curriculum topic that was actually treated, generates a published
//     flashcard set from it, and emails EVERY active member of the batch (not
//     just those who showed up) that their flashcards are waiting — with a
//     short recap of what was taught and a direct link.
//
//  2) runFlashcardDayAfterReminders()
//     A daily cron. For sets generated ~a day ago, it nudges the students who
//     still haven't completed them with the same branded, summarised email.
//
// Both are best-effort: failures are logged, never thrown into the request.
const supabase        = require('../lib/supabase');
const flashcardsDb    = require('../db/flashcards');
const studentsDb      = require('../db/students');
const notificationsDb = require('../db/notifications');
const { sendMail } = require('./mailer');
const { generateCardsForEntry, generateLessonSummary } = require('./flashcardGenerator');
const { flashcardReadyEmail, flashcardDayAfterEmail } = require('./emailTemplates');

const CARD_COUNT = 10;
const FLASHCARDS_PATH = '/student-dashboard.html#flashcards';

function urls() {
  const host = process.env.HOST || '';
  return {
    flashcardsUrl: host + FLASHCARDS_PATH,
    logoUrl: host + '/assets/images/logo/goallord-logo.png',
  };
}

// Best curriculum match for an attendance session: prefer the exact (week, day)
// entry, fall back to (week, topic) so a renamed/misaligned day still resolves.
async function findCurriculumEntry({ batch_id, week, day, topic }) {
  const { data } = await supabase.from('curriculum_entries')
    .select('topic, subtopics, objectives, resources, day, week')
    .eq('batch_id', batch_id).eq('week', Number(week));
  const entries = data || [];
  if (!entries.length) return null;
  return entries.find(e => e.day === day)
    || (topic && entries.find(e => e.topic === topic))
    || entries[0];
}

// Which lecturer owns the set: the person taking attendance if they're a
// lecturer, otherwise any lecturer mapped to the batch, otherwise null.
async function resolveLecturerId(batchId, actor) {
  if (actor && actor.role === 'lecturer' && actor.id) return actor.id;
  const { data } = await supabase.from('lecturer_batches')
    .select('lecturer_id').eq('batch_id', batchId).limit(1);
  return (data && data[0] && data[0].lecturer_id) || null;
}

// Notify + email every active student in the batch.
async function notifyBatch({ batchId, set, count, template, notifType, notifTitle, notifMessage }) {
  const students = await studentsDb.findByBatch(batchId); // active only
  if (!students.length) return { emailed: 0, emailFailed: 0, notified: 0 };
  const { flashcardsUrl, logoUrl } = urls();

  // In-app + push for everyone (the notifications chokepoint fans out push).
  await notificationsDb.insertMany(students.map(s => ({
    recipient_id: s.id, recipient_type: 'Student', type: notifType,
    title: notifTitle, message: notifMessage, link: FLASHCARDS_PATH,
  })));

  let emailed = 0, emailFailed = 0;
  for (const s of students) {
    if (!s.email) continue;
    try {
      const { subject, html } = template({
        fullName: s.full_name, topic: set.topic, week: set.week, day: set.day,
        count, summary: set.summary, flashcardsUrl, logoUrl,
      });
      await sendMail({ to: s.email, subject, html });
      emailed++;
    } catch (e) {
      emailFailed++;
      console.error('[FlashcardAutoGen] email failed for', s.email, '-', e.message);
    }
  }
  return { emailed, emailFailed, notified: students.length };
}

// ── 1) Generate the moment attendance is taken ───────────────
async function generateForAttendance(session, actor) {
  try {
    if (!session || !session.batch_id || !session.week) return;
    const batchId = session.batch_id;

    const entry = await findCurriculumEntry(session);
    if (!entry) {
      console.warn(`[FlashcardAutoGen] no curriculum for batch ${batchId} week ${session.week} — skipping auto-gen.`);
      return;
    }
    const topic = entry.topic;
    const day = session.day || entry.day || '';

    // Idempotent: never regenerate if a set for this exact topic already exists
    // (attendance can be re-saved/edited many times).
    const existing = await flashcardsDb.findSets({ batch_id: batchId, week: Number(session.week), topic });
    if (existing && existing.length) {
      return;
    }

    const [cards, summary, lecturerId] = await Promise.all([
      generateCardsForEntry(entry, Number(session.week), CARD_COUNT),
      generateLessonSummary(entry, Number(session.week)),
      resolveLecturerId(batchId, actor),
    ]);
    if (!cards.length) {
      console.error(`[FlashcardAutoGen] no usable cards for "${topic}" (batch ${batchId} week ${session.week}).`);
      return;
    }

    const set = await flashcardsDb.createSet({
      batch_id: batchId, lecturer_id: lecturerId, title: topic, topic,
      week: Number(session.week), day, summary, generated_by: 'ai', published: true,
    });
    await flashcardsDb.createCards(cards.map((c, i) => ({
      set_id: set.id, batch_id: batchId, question: c.question,
      correct_answer: c.correctAnswer, options: c.options,
      explanation: c.explanation || '', topic, week: Number(session.week), order: i,
    })));

    const r = await notifyBatch({
      batchId, set: { ...set, summary, topic, day, week: Number(session.week) },
      count: cards.length, template: (p) => ({
        subject: `Your flashcards are ready: ${topic}`,
        html: flashcardReadyEmail(p),
      }),
      notifType: 'flashcard_ready',
      notifTitle: 'New flashcards are ready',
      notifMessage: `Your ${topic} flashcards are waiting — about 5 minutes.`,
    });
    console.log(`[FlashcardAutoGen] generated "${topic}" (${cards.length} cards) for batch ${batchId}; notified ${r.notified}, emailed ${r.emailed}${r.emailFailed ? `, ${r.emailFailed} failed` : ''}.`);
  } catch (e) {
    console.error('[FlashcardAutoGen] generateForAttendance failed:', e.message);
  }
}

// ── 2) Next-day reminder for sets still not done ─────────────
async function runFlashcardDayAfterReminders() {
  const now = Date.now();
  const windowStart = new Date(now - 48 * 3600000).toISOString();
  const windowEnd   = new Date(now - 24 * 3600000).toISOString();

  // AI sets that became available roughly a day ago.
  const { data: sets } = await supabase.from('flashcard_sets')
    .select('id, batch_id, topic, week, day, summary')
    .eq('generated_by', 'ai').eq('published', true)
    .gte('created_at', windowStart).lt('created_at', windowEnd);
  if (!sets || !sets.length) return { reminded: 0, emailed: 0 };

  const dedupSince = new Date(now - 20 * 3600000).toISOString();
  let reminded = 0, emailed = 0, emailFailed = 0;
  const { flashcardsUrl, logoUrl } = urls();

  for (const set of sets) {
    const { count: cardCount } = await supabase.from('flashcards')
      .select('id', { count: 'exact', head: true }).eq('set_id', set.id);

    const students = await studentsDb.findByBatch(set.batch_id); // active only
    if (!students.length) continue;
    const ids = students.map(s => s.id);

    // Drop students who've completed the set…
    const { data: resp } = await supabase.from('flashcard_responses')
      .select('student_id').eq('set_id', set.id).in('student_id', ids);
    const done = new Set((resp || []).map(r => r.student_id));

    // …and those already reminded in the last 20h (restart-safety).
    const { data: already } = await supabase.from('notifications')
      .select('recipient_id').eq('type', 'flashcard_day_after').in('recipient_id', ids).gte('created_at', dedupSince);
    const nudged = new Set((already || []).map(n => n.recipient_id));

    const todo = students.filter(s => !done.has(s.id) && !nudged.has(s.id));
    if (!todo.length) continue;

    await notificationsDb.insertMany(todo.map(s => ({
      recipient_id: s.id, recipient_type: 'Student', type: 'flashcard_day_after',
      title: 'Don’t forget your flashcards',
      message: `Your ${set.topic} flashcards are still waiting — finish them today.`,
      link: FLASHCARDS_PATH,
    })));
    reminded += todo.length;

    for (const s of todo) {
      if (!s.email) continue;
      try {
        await sendMail({
          to: s.email,
          subject: `Don’t forget: ${set.topic} flashcards`,
          html: flashcardDayAfterEmail({
            fullName: s.full_name, topic: set.topic, week: set.week, day: set.day,
            count: cardCount || CARD_COUNT, summary: set.summary, flashcardsUrl, logoUrl,
          }),
        });
        emailed++;
      } catch (e) {
        emailFailed++;
        console.error('[FlashcardAutoGen] day-after email failed for', s.email, '-', e.message);
      }
    }
  }
  if (reminded) console.log(`[FlashcardDayAfter] reminded ${reminded}; ${emailed} email${emailFailed ? `, ${emailFailed} failed` : ''}.`);
  return { reminded, emailed, emailFailed };
}

module.exports = { generateForAttendance, runFlashcardDayAfterReminders };
