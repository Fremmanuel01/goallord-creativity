-- Fix the unique index on payments.reference.
--
-- Migration 002 created a UNIQUE index on payments.reference, but a single
-- Paystack transaction legitimately produces several payment rows that
-- share the same reference (application_fee + full_tuition_payment, or
-- application_fee + tuition_month_1..3). The second insert always crashes
-- on the unique constraint.
--
-- The real invariant we want is: "the same reference cannot be processed
-- twice for the same category on the same student". A composite index on
-- (reference, category) captures that without blocking the legitimate
-- multi-row case.

DROP INDEX IF EXISTS payments_reference_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_category_unique_idx
  ON payments (reference, category)
  WHERE reference IS NOT NULL AND reference <> '';
