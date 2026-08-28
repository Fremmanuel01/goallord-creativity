// Per-batch schedule helpers. Class time is stored as a 24h "HH:MM" string
// (Africa/Lagos local time) on batches.class_time. Display is 12h.
'use strict';

// Academy default class time (WAT) for batches that have not set their own —
// 4:00 PM matches the historical global weekday schedule start.
const DEFAULT_CLASS_TIME = process.env.DEFAULT_CLASS_TIME || '16:00';

// "HH:MM" → minutes since midnight, or null if unparseable.
function parseHHMM(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// "16:00" → "4:00 PM". Empty/invalid → ''.
function formatClassTime(t) {
  const min = parseHHMM(t);
  if (min == null) return '';
  let h = Math.floor(min / 60);
  const mi = min % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, '0')} ${ap}`;
}

module.exports = { DEFAULT_CLASS_TIME, parseHHMM, formatClassTime };
