-- ============================================================
-- COMBINED MIGRATION — apply 006 → 009 in one paste
-- Goallord Academy · SYSTEM_AUDIT M5–M8
--
-- HOW TO RUN: open the Supabase SQL Editor, paste this whole
-- file, and click Run. Idempotent + additive (only CREATE … IF
-- NOT EXISTS / ADD COLUMN IF NOT EXISTS / ENABLE RLS) — no data
-- is modified or dropped, and re-running is safe.
--
-- Source files (kept individually in /migrations):
--   006_add_2fa.sql           (M5 two-factor auth)
--   007_audit_log.sql         (M6 admin audit log)
--   008_payment_recovery.sql  (M7 payment recovery)
--   009_chat.sql              (M8 in-app chat)
-- ============================================================

BEGIN;


-- ════════════════════════════════════════════════════════
-- 006_add_2fa.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 006: Two-factor authentication (TOTP)
-- Adds per-account 2FA columns to every identity table:
--   users (admin/staff), students, lecturers.
--
--   totp_enabled         — 2FA is active for this account
--   totp_secret          — base32 TOTP secret (set once enrolment is confirmed)
--   totp_pending_secret  — base32 secret generated during setup, before the
--                          first valid code confirms it; cleared on enable/cancel
--   totp_backup_codes    — sha256 hashes of single-use recovery codes
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_secret         TEXT,
  ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_backup_codes   TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS totp_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_secret         TEXT,
  ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_backup_codes   TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE lecturers
  ADD COLUMN IF NOT EXISTS totp_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_secret         TEXT,
  ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_backup_codes   TEXT[] NOT NULL DEFAULT '{}';

-- ════════════════════════════════════════════════════════
-- 007_audit_log.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 007: Admin audit log
-- Append-only record of state-changing actions by dashboard
-- accounts (admin/staff) plus auth events, for dispute
-- resolution and accountability.
--
-- Actor identity is denormalised (snapshot) so entries survive
-- the actor's account being deleted. entity_* identify the
-- target row; metadata holds a sanitised request snapshot.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID,
  actor_name  TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,            -- e.g. 'students.update', 'auth.login', 'auth.login_failed'
  entity_type TEXT NOT NULL DEFAULT '', -- e.g. 'students', 'payments', 'auth'
  entity_id   TEXT,                     -- target row id (text: not always a uuid)
  summary     TEXT NOT NULL DEFAULT '',
  method      TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  status      INT,
  ip          TEXT NOT NULL DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log (action);

-- Lock the table to the service role (server). No anon/public policy is
-- created, so RLS denies all client access; the server uses the service key.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════
-- 008_payment_recovery.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 008: Payment recovery flow
-- Supports Paystack-failure retry emails, bank-transfer SMS
-- confirmations, and proforma invoices for corporate payers.
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS retry_email_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proforma_number          TEXT,
  ADD COLUMN IF NOT EXISTS proforma_issued_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_name             TEXT,
  ADD COLUMN IF NOT EXISTS company_address          TEXT;

-- ════════════════════════════════════════════════════════
-- 009_chat.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 009: In-app chat (student ↔ lecturer DMs + batch group chat)
-- Replaces fragmented WhatsApp with a trackable in-app system.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_threads (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                 TEXT NOT NULL CHECK (type IN ('dm', 'batch')),
  batch_id             UUID REFERENCES batches(id) ON DELETE CASCADE,   -- set for batch threads
  dm_key               TEXT,                                            -- deterministic key for DM dedup
  title                TEXT NOT NULL DEFAULT '',
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One DM thread per participant pair; one group thread per batch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_threads_dm_key  ON chat_threads (dm_key)  WHERE dm_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_threads_batch   ON chat_threads (batch_id) WHERE type = 'batch';

CREATE TABLE IF NOT EXISTS chat_participants (
  thread_id    UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_type    TEXT NOT NULL CHECK (user_type IN ('student', 'lecturer', 'admin')),
  user_id      UUID NOT NULL,
  user_name    TEXT NOT NULL DEFAULT '',
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_type, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('student', 'lecturer', 'admin')),
  sender_id   UUID NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread   ON chat_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants (user_type, user_id);

-- Locked to the service role (server). No public policy → RLS denies clients.
ALTER TABLE chat_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;

COMMIT;
