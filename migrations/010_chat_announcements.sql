-- ============================================================
-- Migration 010: Announcements mode for batch group chat.
--
-- Adds chat_threads.post_policy:
--   'open'     → any participant may post (default; current behaviour)
--   'announce' → only lecturers/admin may post; students read-only
--
-- Staff posts to a batch thread also generate notifications to all
-- batch members (see routes/messages.js) — fixing silently-missed
-- group messages.
--
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS post_policy TEXT NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_post_policy_check'
  ) THEN
    ALTER TABLE chat_threads
      ADD CONSTRAINT chat_threads_post_policy_check
      CHECK (post_policy IN ('open', 'announce'));
  END IF;
END $$;
