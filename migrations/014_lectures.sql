-- 014: Lectures
-- Auto-generated lecture slides + lesson notes built from the curriculum the day
-- before each class. Slides and notes are kept as JSONB so there is no separate
-- slide table. The "working" copy (slides/lesson_notes) is what the teacher edits;
-- published_slides/published_notes is the frozen copy students see, so editing a
-- published lecture never changes what students see until it is republished.
-- ai_generation_logs records every model call so admin can monitor cost.
-- Idempotent + additive; safe to re-run.

CREATE TABLE IF NOT EXISTS lectures (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id          UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  lecturer_id       UUID REFERENCES lecturers(id) ON DELETE SET NULL,
  week              INT  NOT NULL,
  day               TEXT NOT NULL,
  lecture_date      DATE,
  course_type       TEXT NOT NULL DEFAULT 'Programming',   -- 'Programming' | 'Film'
  course_title      TEXT NOT NULL DEFAULT '',
  lecture_title     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','generating','pending_review',
                                        'published','edited_after_publishing','republished','failed')),
  slides            JSONB NOT NULL DEFAULT '[]'::jsonb,     -- working (editable) copy
  lesson_notes      JSONB NOT NULL DEFAULT '{}'::jsonb,     -- working (editable) copy
  published_slides  JSONB,                                  -- frozen copy students see
  published_notes   JSONB,
  premium           BOOLEAN NOT NULL DEFAULT false,
  generated_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  republished_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One lecture per class slot; lets generation be safely idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lectures_slot ON lectures (batch_id, week, day);
CREATE INDEX IF NOT EXISTS idx_lectures_batch_status ON lectures (batch_id, status);

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_id    UUID REFERENCES lectures(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,         -- 'lecture_text' | 'slide_text' | 'image' | 'email'
  model         TEXT NOT NULL DEFAULT '',
  input_tokens  INT,
  output_tokens INT,
  images        INT NOT NULL DEFAULT 0,
  ok            BOOLEAN NOT NULL DEFAULT true,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_generation_logs (created_at DESC);

-- Match the project's RLS posture (service-role key bypasses these).
ALTER TABLE lectures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_logs  ENABLE ROW LEVEL SECURITY;
