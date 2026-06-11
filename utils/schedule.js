// Shared scheduling helpers for curriculum-driven jobs (class reminders,
// flashcards, lectures). Class dates are derived from a batch's start_date plus
// the curriculum entry's (week, day), all in West Africa Time (UTC+1, no DST).
const DAY = 86400000;
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Calendar date (YYYY-MM-DD) of a curriculum (week, day) for a batch.
function dateForWeekDay(startMs, startDow, week, dayName) {
  const t = WEEKDAY[dayName];
  if (t === undefined) return null;
  const windowStart = startMs + (week - 1) * 7 * DAY;
  const offset = (t - startDow + 7) % 7;
  return new Date(windowStart + offset * DAY).toISOString().slice(0, 10);
}

// Today's calendar date in WAT; offsetDays shifts it (e.g. -1 yesterday, +1 tomorrow).
function todayWAT(offsetDays = 0) {
  return new Date(Date.now() + 3600000 + offsetDays * DAY).toISOString().slice(0, 10);
}

// Weekday name for a YYYY-MM-DD WAT date.
function weekdayName(dateStr) {
  return DAY_NAMES[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

// Map a batch.track to the lecture course_type. Videography/Film School →
// 'Film' (cinematic, image-led); everything else (coding tracks) → 'Programming'.
function courseTypeFor(track) {
  const t = String(track || '').toLowerCase();
  if (t.includes('film') || t.includes('video') || t.includes('cinema') || t.includes('photo')) return 'Film';
  return 'Programming';
}

module.exports = { DAY, WEEKDAY, DAY_NAMES, dateForWeekDay, todayWAT, weekdayName, courseTypeFor };
