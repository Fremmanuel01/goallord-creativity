-- Update track CHECK constraints to match new academy tracks
-- Old: 'Web Design', 'WordPress', 'Brand Identity', 'Other'
-- New: 'AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'

-- Step 1: Drop old constraints first
ALTER TABLE applicants DROP CONSTRAINT IF EXISTS applicants_track_check;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_track_check;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_track_check;

-- Step 2: Migrate existing rows BEFORE adding new constraints
UPDATE applicants SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');
UPDATE batches SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');
UPDATE students SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');

-- Step 3: Add new constraints
ALTER TABLE applicants ADD CONSTRAINT applicants_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));

ALTER TABLE batches ADD CONSTRAINT batches_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));

ALTER TABLE students ADD CONSTRAINT students_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));
