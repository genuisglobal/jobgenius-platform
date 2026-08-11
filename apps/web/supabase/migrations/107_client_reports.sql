-- 107_client_reports.sql
-- Weekly client activity reports (ticket 11).
--
-- A Friday cron (POST /api/ops/client-reports, scheduled-jobs.yml) generates
-- a DRAFT report per active client for the current week: applications
-- submitted (with companies), in-progress/needs-attention counts, interviews
-- scheduled, recruiter replies. The assigned AM reviews it at
-- /dashboard/client-reports, adds a personal note, and sends — delivery is a
-- portal conversation message (the seeker's inbox doubles as the archive),
-- recorded here via conversation_id.

CREATE TABLE IF NOT EXISTS client_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id       uuid NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  account_manager_id  uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  -- Monday (UTC) of the reported week.
  week_start          date NOT NULL,
  -- Computed activity snapshot; see lib/client-reports.ts buildWeeklyStats.
  stats               jsonb NOT NULL DEFAULT '{}'::jsonb,
  am_note             text,
  status              text NOT NULL DEFAULT 'DRAFT',
  generated_at        timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  sent_by             uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  -- The portal conversation that delivered the report.
  conversation_id     uuid REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT chk_client_report_status CHECK (status IN ('DRAFT', 'SENT', 'SKIPPED')),
  UNIQUE (job_seeker_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_client_reports_week
  ON client_reports (week_start DESC, status);
CREATE INDEX IF NOT EXISTS idx_client_reports_seeker
  ON client_reports (job_seeker_id, week_start DESC);

ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on client_reports"
  ON client_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
