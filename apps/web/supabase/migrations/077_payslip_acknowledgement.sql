-- ============================================================
-- Migration 077: Payslip acknowledgement ("worker signed/received")
-- Lets the worker confirm receipt of an issued payslip via their
-- self-service view. Records timestamp + IP, same e-sign pattern
-- used by job_seeker_contracts and employment_contracts.
-- ============================================================

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_ip TEXT;
