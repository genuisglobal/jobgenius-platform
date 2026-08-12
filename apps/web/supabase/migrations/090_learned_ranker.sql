-- ============================================================
-- Migration 090: learned ranker (Phase 4 — PR-Y)
--
-- ranker_models      — versioned logistic-regression weights. One row
--                      per (family, version). Only one row can be ACTIVE
--                      per family at a time (partial unique index).
--
-- match_features     — per-(seeker, job_post) snapshot of the heuristic's
--                      7 component scores at match time, plus the realised
--                      outcome once known. Joining features×outcomes is
--                      what the trainer learns from.
--
-- The trainer is in lib/learned-ranker.ts:trainLogisticRegression — pure
-- Node, no external ML libs. Inference is sigmoid(intercept + Σ wᵢ·xᵢ).
--
-- Phase 4 ships shadow logging + offline training. A follow-up PR (Y.2)
-- flips live ranking once we trust the model on holdout data.
-- ============================================================

CREATE TYPE ranker_model_status AS ENUM (
  'pending',
  'active',
  'archived',
  'rolled_back'
);

CREATE TABLE ranker_models (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family              TEXT NOT NULL DEFAULT 'logistic_regression',
  version             INTEGER NOT NULL,
  weights             JSONB NOT NULL,            -- { intercept, skills, title, experience, salary, location, company_fit, penalties }
  training_size       INTEGER,
  training_positive   INTEGER,
  training_negative   INTEGER,
  metrics             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { log_loss, accuracy, auc, holdout_accuracy }
  status              ranker_model_status NOT NULL DEFAULT 'pending',
  created_by          UUID,
  promoted_by         UUID,
  promoted_at         TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family, version)
);

-- At most one ACTIVE row per family.
CREATE UNIQUE INDEX idx_ranker_models_one_active_per_family
  ON ranker_models (family) WHERE status = 'active';

CREATE INDEX idx_ranker_models_status_created
  ON ranker_models (status, created_at DESC);

CREATE TRIGGER trg_ranker_models_updated_at
  BEFORE UPDATE ON ranker_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── match_features ────────────────────────────────────────

CREATE TABLE match_features (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id     UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  job_post_id       UUID NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  match_id          UUID,                          -- optional FK to job_seeker_job_matches
  heuristic_score   NUMERIC(6,2),                  -- the heuristic's output at the time
  features          JSONB NOT NULL,                -- { skills, title, experience, salary, location, company_fit, penalties } (each 0-1)
  outcome           TEXT,                          -- 'applied' | 'interview' | 'offer' | 'rejection' | 'ghosted' | null
  outcome_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_seeker_id, job_post_id)
);

CREATE INDEX idx_match_features_outcome
  ON match_features (outcome, created_at DESC)
  WHERE outcome IS NOT NULL;

CREATE INDEX idx_match_features_seeker
  ON match_features (job_seeker_id, created_at DESC);

CREATE TRIGGER trg_match_features_updated_at
  BEFORE UPDATE ON match_features
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE ranker_models   ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_features  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ranker_models"
  ON ranker_models FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_match_features"
  ON match_features FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE ranker_models IS
  'Versioned weights for the learned ranker. Trained offline from match_features × outcomes.';
COMMENT ON TABLE match_features IS
  'Per-(seeker, job_post) snapshot of heuristic component scores + realised outcome. Joined to train the ranker.';
