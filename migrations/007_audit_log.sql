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
