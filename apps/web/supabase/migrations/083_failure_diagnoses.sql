-- ============================================================
-- Migration 083: failure_diagnoses
-- Stores per-failure Vision-LLM diagnosis output. The runner reports a
-- failure -> /api/apply/fail enqueues DIAGNOSE_FAILURE -> background
-- handler calls diagnoseRunFailure() (lib/failure-diagnosis.ts) and
-- writes a row here. Admin reviews at /dashboard/admin/failure-diagnoses
-- and either applies the proposed_rule into host_automation_rules
-- (PR-Q) or marks it reviewed.
-- ============================================================

CREATE TYPE failure_root_cause AS ENUM (
  'captcha',
  'required_field_missing',
  'overlay',
  'selector_changed',
  'auth_expired',
  'popup_handoff_needed',
  'rate_limit',
  'layout_drift',
  'unknown'
);

CREATE TYPE failure_proposed_action AS ENUM (
  'retry_same',
  'rotate_session',
  'skip_optional',
  'simplified_fields',
  'alt_resume',
  'add_host_rule',
  'human_review'
);

CREATE TYPE failure_diagnosis_status AS ENUM (
  'pending',
  'reviewed',
  'applied',
  'rejected',
  'expired'
);

CREATE TABLE failure_diagnoses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES application_runs(id) ON DELETE CASCADE,
  screenshot_path   TEXT,
  dom_excerpt       TEXT,
  root_cause        failure_root_cause NOT NULL,
  proposed_action   failure_proposed_action NOT NULL,
  proposed_rule     JSONB,
  confidence        NUMERIC(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reasoning         TEXT,
  model             TEXT,
  ai_call_log_id    UUID,
  status            failure_diagnosis_status NOT NULL DEFAULT 'pending',
  reviewer_id       UUID,
  decided_at        TIMESTAMPTZ,
  applied_rule_id   UUID,  -- host_automation_rules.id once the proposal is applied
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_failure_diagnoses_run         ON failure_diagnoses (run_id);
CREATE INDEX idx_failure_diagnoses_status_at   ON failure_diagnoses (status, created_at DESC);
CREATE INDEX idx_failure_diagnoses_root_cause  ON failure_diagnoses (root_cause, created_at DESC);

CREATE TRIGGER trg_failure_diagnoses_updated_at
  BEFORE UPDATE ON failure_diagnoses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE failure_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_failure_diagnoses"
  ON failure_diagnoses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE failure_diagnoses IS
  'Per-failure Vision-LLM diagnosis output. Populated by background DIAGNOSE_FAILURE jobs; reviewed at /dashboard/admin/failure-diagnoses.';
