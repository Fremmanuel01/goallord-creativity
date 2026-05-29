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
