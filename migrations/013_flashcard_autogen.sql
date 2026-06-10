-- 013: Auto-generated flashcards
-- Flashcard sets are now created automatically the moment attendance is taken,
-- for every member of the batch, from the curriculum topic that was treated.
-- We store a short "what was taught" recap (summary) and the class day on the
-- set so the notification emails can show context, and allow a null lecturer so
-- the system can generate a set even when no lecturer is mapped to the batch.

ALTER TABLE flashcard_sets ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE flashcard_sets ADD COLUMN IF NOT EXISTS day     TEXT NOT NULL DEFAULT '';
ALTER TABLE flashcard_sets ALTER COLUMN lecturer_id DROP NOT NULL;
