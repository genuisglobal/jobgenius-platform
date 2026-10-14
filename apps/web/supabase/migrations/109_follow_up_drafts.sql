-- 109_follow_up_drafts.sql
-- Day-3/7 follow-up drafts for applied-no-response runs (ticket 14).
--
-- A daily cron (POST /api/ops/follow-ups) finds applications submitted 3 or
-- 7 days ago with no interview for that (seeker, job) and drafts a short
-- follow-up message into the AM's queue at /dashboard/follow-ups. Drafts are
-- NEVER auto-sent: the AM copies the text into whatever channel fits
-- (LinkedIn, email, the outreach CRM) and marks the row handled — recruiter
-- relationships are a human's to spend.

CREATE TABLE IF NOT EXISTS follow_up_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES application_runs(id) ON DELETE CASCADE,
  job_seeker_id       uuid NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  account_manager_id  uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  -- Which checkpoint produced this draft: 3 or 7 days post-application.
  follow_up_day       integer NOT NULL,
  draft_text          text NOT NULL,
  status              text NOT NULL DEFAULT 'PENDING',
  created_at          timestamptz NOT NULL DEFAULT now(),
  handled_at          timestamptz,
  handled_by          uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  CONSTRAINT chk_follow_up_day CHECK (follow_up_day IN (3, 7)),
  CONSTRAINT chk_follow_up_status
    CHECK (status IN ('PENDING', 'HANDLED', 'DISMISSED')),
  UNIQUE (run_id, follow_up_day)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_drafts_status
  ON follow_up_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_up_drafts_am
  ON follow_up_drafts (account_manager_id, status);

ALTER TABLE follow_up_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on follow_up_drafts"
  ON follow_up_drafts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
