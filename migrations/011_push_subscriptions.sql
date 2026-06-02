-- ============================================================
-- Migration 011: Web Push subscriptions for the Goallord Portal PWA.
-- Stores one row per device/browser endpoint so the server can send
-- push notifications (new messages, assignments, payments, etc.).
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL,                                   -- matches notifications.recipient_id
  user_type  TEXT NOT NULL CHECK (user_type IN ('student', 'lecturer', 'admin')),
  endpoint   TEXT NOT NULL,                                   -- push service URL (unique per device)
  p256dh     TEXT NOT NULL,                                   -- client public key
  auth       TEXT NOT NULL,                                   -- client auth secret
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per endpoint; re-subscribing upserts instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- RLS: the server uses the service key (bypasses RLS). Enable + lock down
-- so the anon/auth roles can never read raw subscription keys directly.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
