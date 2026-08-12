-- ============================================================
-- Migration 111: Campaign Tier & Setup Fee Tracking
--
-- Tracks which paid campaign plan (Essentials/Premium) a client selected
-- and whether the one-time Campaign Setup & Execution Fee has been paid.
-- Payment itself happens out-of-band (invoice/wire, coordinated by the AM,
-- same as the placement fee) — this just records tier + paid status so the
-- signed service agreement (see lib/collaboration-agreement.ts) can state
-- the client's actual fee instead of a generic range, and so AMs can see
-- fee status on the seeker detail page.
-- ============================================================

ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS campaign_tier TEXT
    CHECK (campaign_tier IN ('essentials', 'premium')),
  ADD COLUMN IF NOT EXISTS campaign_tier_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_tier_selected_by UUID,
  ADD COLUMN IF NOT EXISTS setup_fee_usd NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS setup_fee_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS setup_fee_marked_paid_by UUID;

-- Snapshot the tier/fee onto each signed agreement row too, same rationale
-- as the existing commission_rate column: the signed record must stay
-- accurate even if the seeker's live campaign_tier changes later.
ALTER TABLE client_agreements
  ADD COLUMN IF NOT EXISTS campaign_tier TEXT,
  ADD COLUMN IF NOT EXISTS setup_fee_usd NUMERIC(10,2);
