-- Reminder tracking on applicants.
--
-- Previously the payment-reminder job deduped by appending a
-- "[payment-reminder-sent]" tag to the free-text notes field; any admin edit
-- of notes wiped the tag and re-triggered the email. Dedicated timestamp
-- columns survive note edits.
--
-- verify_reminder_sent_at also lets the daily job nudge applicants who never
-- verified their email (e.g. the original verification send failed) - they
-- previously received nothing, ever.

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS verify_reminder_sent_at  TIMESTAMPTZ;

-- Backfill from the old notes tag so already-reminded applicants aren't
-- emailed a second time after this migration.
UPDATE applicants
   SET payment_reminder_sent_at = NOW()
 WHERE payment_reminder_sent_at IS NULL
   AND notes LIKE '%[payment-reminder-sent]%';
