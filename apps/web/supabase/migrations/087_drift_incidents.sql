-- ============================================================
-- Migration 087: drift_incidents
-- Auto-opened when an ATS shows correlated signs of breakage:
--   1. >=2 consecutive canary failures
--   2. Week-over-week failure-rate increase > 20% on a host
--   3. >=3 'selector_changed' diagnoses in 24h on the same host
--
-- Admin resolves via the drift command-center page (PR-T UI).
-- Open incidents are deduped per (ats_type, url_host, kind).
-- ============================================================

CREATE TYPE drift_incident_kind AS ENUM (
  'canary_failing',
  'failure_rate_spike',
  'selector_change_cluster'
);

CREATE TYPE drift_incident_status AS ENUM (
  'open',
  'acknowledged',
  'resolved',
  'auto_closed'
);

CREATE TABLE drift_incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_type         TEXT NOT NULL,
  url_host         TEXT,
  kind             drift_incident_kind NOT NULL,
  status           drift_incident_status NOT NULL DEFAULT 'open',
  signal           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- numbers/IDs that triggered the open
  summary          TEXT,
  related_run_ids  UUID[],                              -- example runs that hit the issue
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by  UUID,
  acknowledged_at  TIMESTAMPTZ,
  resolved_by      UUID,
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drift_incidents_open
  ON drift_incidents (ats_type, url_host, kind)
  WHERE status IN ('open', 'acknowledged');
CREATE INDEX idx_drift_incidents_recent
  ON drift_incidents (opened_at DESC);

CREATE TRIGGER trg_drift_incidents_updated_at
  BEFORE UPDATE ON drift_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE drift_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_drift_incidents"
  ON drift_incidents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE drift_incidents IS
  'Auto-opened when an ATS shows breakage signal. Resolved via /dashboard/admin/drift.';
