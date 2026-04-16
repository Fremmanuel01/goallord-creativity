-- Update track CHECK constraints to match new academy tracks
-- Old: 'Web Design', 'WordPress', 'Brand Identity', 'Other'
-- New: 'AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'

-- applicants.track
ALTER TABLE applicants DROP CONSTRAINT IF EXISTS applicants_track_check;
ALTER TABLE applicants ADD CONSTRAINT applicants_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));

-- batches.track
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_track_check;
ALTER TABLE batches ADD CONSTRAINT batches_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));

-- students.track
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_track_check;
ALTER TABLE students ADD CONSTRAINT students_track_check
  CHECK (track IN ('AI Software Development', 'UI/UX', 'WordPress', 'AI App Development', 'Videography', 'Other'));

-- Migrate existing rows to new track names
UPDATE applicants SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');
UPDATE batches SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');
UPDATE students SET track = 'Other' WHERE track IN ('Web Design', 'Brand Identity', 'Digital Marketing');
