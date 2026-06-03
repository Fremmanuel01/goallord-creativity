-- ============================================================
-- Migration 012: Attendance flow improvements.
--  - Widen the day constraint so batches can meet on ANY weekday
--    (the old constraint only allowed Tue/Wed/Thu, breaking e.g. Mon/Fri batches).
--  - Add optional self check-in integrity: a per-session code and an
--    auto-close time for the self-mark window.
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_day_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_day_check
  CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_code TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ;
