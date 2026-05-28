-- ============================================================
-- Migration 008: Payment recovery flow
-- Supports Paystack-failure retry emails, bank-transfer SMS
-- confirmations, and proforma invoices for corporate payers.
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS retry_email_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proforma_number          TEXT,
  ADD COLUMN IF NOT EXISTS proforma_issued_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_name             TEXT,
  ADD COLUMN IF NOT EXISTS company_address          TEXT;
