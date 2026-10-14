-- ============================================================
-- Migration 100: Client Collaboration Agreement (placement-fee-only)
--
-- Stores e-signed acceptances of the Client Collaboration, Communication,
-- Offer Disclosure & Placement Fee Agreement. Kept separate from the legacy
-- registration-fee contract (job_seeker_contracts) so the placement-fee model
-- can roll forward without disturbing existing billing flows.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_agreements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id     UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  agreement_version TEXT NOT NULL,
  agreement_html    TEXT NOT NULL,
  signature_name    TEXT NOT NULL,
  client_email      TEXT,
  commission_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  effective_date    DATE,
  agreed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  agreed_ip         TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One acceptance row per seeker per agreement version; re-signing a new
  -- version inserts a new row.
  UNIQUE (job_seeker_id, agreement_version)
);

CREATE INDEX IF NOT EXISTS idx_client_agreements_seeker
  ON client_agreements (job_seeker_id);

-- Agreement lifecycle on the seeker:
--   requested_at → an admin/AM pushed the agreement; the portal makes it
--                  signable. Until then the client only sees a read-only glimpse.
--   signed_at    → the client accepted the current agreement.
ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS collaboration_agreement_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collaboration_agreement_requested_by UUID,
  ADD COLUMN IF NOT EXISTS collaboration_agreement_signed_at TIMESTAMPTZ;

-- RLS — all API access is via the service-role key (supabaseAdmin).
ALTER TABLE client_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_client_agreements"
  ON client_agreements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
