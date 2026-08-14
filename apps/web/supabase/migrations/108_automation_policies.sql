-- 108_automation_policies.sql
-- Automation kill switches (ticket 13).
--
-- One row per switch; a MISSING row means enabled (default-open, so the
-- table never has to be seeded). Checked at every claim/start (no caching —
-- one PK-indexed read buys the "halts in under 60s" guarantee, actually
-- next-poll). Keys:
--   GLOBAL_APPLY   — master switch for all application automation
--   ATS:<TYPE>     — per-ATS (ATS:WORKDAY, ATS:LINKEDIN, ATS:INDEED, ...)
-- Running runs are never interrupted (no orphaned half-submitted
-- applications); the switch stops NEW claims and run creation.

CREATE TABLE IF NOT EXISTS automation_policies (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  note        text,
  updated_by  uuid REFERENCES account_managers(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on automation_policies"
  ON automation_policies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
