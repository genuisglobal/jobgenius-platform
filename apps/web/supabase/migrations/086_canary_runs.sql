-- ============================================================
-- Migration 086: canary_runs
-- Daily per-ATS health probes. The probe is a SHALLOW preflight
-- (resolve host rule, fetch a known-good job URL HEAD/GET, parse
-- the apply-entry button). It does NOT submit anything.
--
-- The drift detector (PR-T) reads consecutive canary failures to
-- decide when to open a drift_incident.
-- ============================================================

CREATE TYPE canary_outcome AS ENUM (
  'pass',
  'fail',
  'degraded',
  'skipped'
);

CREATE TABLE canary_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_type      TEXT NOT NULL,
  probe_url     TEXT,
  outcome       canary_outcome NOT NULL,
  duration_ms   INTEGER,
  http_status   INTEGER,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_canary_runs_ats_at      ON canary_runs (ats_type, created_at DESC);
CREATE INDEX idx_canary_runs_outcome_at  ON canary_runs (outcome, created_at DESC);

ALTER TABLE canary_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_canary_runs"
  ON canary_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE canary_runs IS
  'Daily per-ATS health probes (HEAD/GET on a known-good URL). Read by the drift detector.';
