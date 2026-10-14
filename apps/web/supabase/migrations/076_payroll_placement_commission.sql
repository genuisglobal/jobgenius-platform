-- ============================================================
-- Migration 076: AM placement commission rate (Phase 3)
-- Optional rate used to compute an AM's cut of the placement
-- commission JobGenius collected on offers for their assigned
-- seekers. Default 0 = no auto commission until configured.
-- ============================================================

ALTER TABLE payroll_workers
  ADD COLUMN IF NOT EXISTS placement_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0;
