-- 015 — Lecture engagement: completion tracking + published version history.
-- Apply in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS guards).

-- Who has opened/finished each lecture (one row per student per lecture).
CREATE TABLE IF NOT EXISTS lecture_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id  uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL,
  batch_id    uuid,
  last_slide  int  NOT NULL DEFAULT 0,
  completed   boolean NOT NULL DEFAULT false,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lecture_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_lecture_views_lecture ON lecture_views(lecture_id);
CREATE INDEX IF NOT EXISTS idx_lecture_views_student ON lecture_views(student_id);

-- Rolling history of previously-published snapshots, for rollback.
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS published_history jsonb NOT NULL DEFAULT '[]'::jsonb;
