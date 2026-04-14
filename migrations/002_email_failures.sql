-- Records outbound emails that failed to send so admins can manually resend.
-- Used by the Paystack webhook and the pay-application endpoint when Brevo
-- is down, so a paid student is never left without credentials silently.

CREATE TABLE IF NOT EXISTS email_failures (
  id           BIGSERIAL PRIMARY KEY,
  to_email     TEXT NOT NULL,
  kind         TEXT NOT NULL,              -- e.g. 'acceptance', 'verification'
  student_id   BIGINT,
  applicant_id BIGINT,
  error        TEXT,
  payload      JSONB,
  resolved     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_failures_unresolved_idx
  ON email_failures (created_at DESC) WHERE resolved = FALSE;

-- Ensure the payments.reference column has a unique guard so the idempotency
-- check in the webhook and pay-application endpoint cannot race.
CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_unique_idx
  ON payments (reference) WHERE reference IS NOT NULL AND reference <> '';
