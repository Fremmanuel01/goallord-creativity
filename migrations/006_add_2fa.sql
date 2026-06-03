-- ============================================================
-- Migration 006: Two-factor authentication (TOTP)
-- Adds per-account 2FA columns to every identity table:
--   users (admin/staff), students, lecturers.
--
--   totp_enabled         - 2FA is active for this account
--   totp_secret          - base32 TOTP secret (set once enrolment is confirmed)
--   totp_pending_secret  - base32 secret generated during setup, before the
--                          first valid code confirms it; cleared on enable/cancel
--   totp_backup_codes    - sha256 hashes of single-use recovery codes
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
