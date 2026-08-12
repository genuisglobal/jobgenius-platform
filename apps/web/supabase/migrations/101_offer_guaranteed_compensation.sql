-- ============================================================
-- Migration 101: guaranteed compensation on job offers
--
-- The placement fee is 5% of the client's gross first-year base salary PLUS
-- guaranteed cash compensation (Client Collaboration Agreement §6). The
-- job_offers table only stored base_salary, so the commission under-charged.
-- ============================================================

ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS guaranteed_compensation NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN job_offers.guaranteed_compensation IS
  'Guaranteed cash compensation (signing bonus, guaranteed bonus, etc.) added to '
  'base salary when computing the 5% placement fee.';
