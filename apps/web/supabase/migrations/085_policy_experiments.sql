-- ============================================================
-- Migration 085: policy_experiments
-- Trial log for the bandit primitive in lib/bandit.ts.
-- Used today by retry-strategy choice per (ats_type, error_class).
-- Phase 3 follow-up: session/proxy strategy when bot-detection is suspected.
--
-- Reward semantics:
--   1.0  full success (e.g. retry succeeded)
--   0.0  failure
--   0..1 partial credit for "succeeded but needed another retry", etc.
-- ============================================================

CREATE TYPE policy_outcome AS ENUM ('success', 'failure', 'partial');

CREATE TABLE policy_experiments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL,     -- e.g. "retry:GREENHOUSE:REQUIRED_FIELDS"
  arm          TEXT NOT NULL,     -- one of the candidate strategies
  trial_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_id       UUID REFERENCES application_runs(id) ON DELETE SET NULL,
  outcome      policy_outcome,    -- null = pending; set by recordOutcome
  reward       NUMERIC(5,4),      -- null = pending; 0..1
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at   TIMESTAMPTZ        -- when outcome+reward were stamped
);

CREATE INDEX idx_policy_experiments_key_trial  ON policy_experiments (key, trial_at DESC);
CREATE INDEX idx_policy_experiments_key_arm    ON policy_experiments (key, arm);
CREATE INDEX idx_policy_experiments_run        ON policy_experiments (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_policy_experiments_pending    ON policy_experiments (key, trial_at DESC) WHERE outcome IS NULL;

ALTER TABLE policy_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_policy_experiments"
  ON policy_experiments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE policy_experiments IS
  'Bandit trial log. pickArm inserts (outcome=null); recordOutcome stamps outcome+reward+decided_at.';
