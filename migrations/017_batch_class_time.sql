-- ============================================================
-- Migration 017: Per-batch class time.
--   Class time is no longer a single global Academy setting. Each batch has its
--   own class time so Morning / Midday / Evening cohorts of the same program can
--   run at different times of day.
--
--   class_time is stored as a 24h "HH:MM" string in Africa/Lagos (WAT) local
--   time (matches how class_days already stores plain weekday names).
--
-- Backfill: existing batches with no class time inherit the Academy's historical
--   weekday start (4:00 PM = '16:00'). Admins can adjust each batch afterwards.
--   The WHERE class_time IS NULL guard means a re-run never overwrites a value an
--   admin has already set.
--
-- Reversible:  ALTER TABLE batches DROP COLUMN IF EXISTS class_time;
-- Idempotent:  safe to re-run.
-- ============================================================

ALTER TABLE batches ADD COLUMN IF NOT EXISTS class_time TEXT;

UPDATE batches SET class_time = '16:00' WHERE class_time IS NULL;
