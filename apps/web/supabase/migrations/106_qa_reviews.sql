-- 106_qa_reviews.sql
-- QA sampling + human review of auto-submitted applications (ticket 10).
--
-- A nightly job (POST /api/ops/qa-sample, scheduled-jobs.yml) samples
-- COMPLETED runs into this table as PENDING reviews: 100% of each seeker's
-- first 3 completed runs (new-seeker trust gate) plus QA_SAMPLE_RATE
-- (default 5%) of the rest. Reviewers grade them at /dashboard/admin/qa
-- against the run's proof screenshots + event trail. A review flagging a
-- sensitive-answer error (work auth / sponsorship / salary / relocation /
-- demographics answered wrongly) raises a HIGH ops_alert — the one QA
-- failure class with zero tolerance.

CREATE TABLE IF NOT EXISTS qa_reviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid NOT NULL REFERENCES application_runs(id) ON DELETE CASCADE,
  job_seeker_id           uuid NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  -- Why this run was sampled: NEW_SEEKER_FIRST_RUNS | RANDOM_SAMPLE | MANUAL
  sampled_reason          text NOT NULL DEFAULT 'RANDOM_SAMPLE',
  status                  text NOT NULL DEFAULT 'PENDING',
  reviewer_id             uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  -- PASS | MINOR_ISSUES | MAJOR_ISSUES
  verdict                 text,
  -- Reviewer's 0-100 judgment of how accurately fields matched the profile.
  field_accuracy_score    integer,
  -- Zero-tolerance class: a sensitive question answered incorrectly.
  sensitive_answer_error  boolean NOT NULL DEFAULT false,
  -- [{ field, expected, actual, note }]
  issues                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz,
  CONSTRAINT chk_qa_review_status CHECK (status IN ('PENDING', 'REVIEWED')),
  CONSTRAINT chk_qa_review_verdict
    CHECK (verdict IS NULL OR verdict IN ('PASS', 'MINOR_ISSUES', 'MAJOR_ISSUES')),
  CONSTRAINT chk_qa_review_accuracy
    CHECK (field_accuracy_score IS NULL
           OR (field_accuracy_score >= 0 AND field_accuracy_score <= 100)),
  CONSTRAINT chk_qa_review_reason
    CHECK (sampled_reason IN ('NEW_SEEKER_FIRST_RUNS', 'RANDOM_SAMPLE', 'MANUAL')),
  UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_reviews_status_created
  ON qa_reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_reviews_seeker
  ON qa_reviews (job_seeker_id);

ALTER TABLE qa_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on qa_reviews"
  ON qa_reviews
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
