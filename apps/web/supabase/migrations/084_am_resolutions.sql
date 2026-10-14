-- ============================================================
-- Migration 084: am_resolutions
-- Captures the structured action an AM took to resolve a paused/failed
-- run. Each row becomes a learned signal:
--   action_type='answered_screening' -> promotes to learned_field_rules
--   action_type='clicked_button'     -> proposes a submit_hints addition
--                                       on host_automation_rules
--   action_type='entered_otp_email'  -> stamps an ATS hint (used later)
--
-- Closing the human loop: every fix an AM does becomes future automation.
-- ============================================================

CREATE TYPE am_resolution_action AS ENUM (
  'answered_screening',
  'clicked_button',
  'entered_otp_email',
  'entered_otp_sms',
  'uploaded_resume',
  'manual_continue',
  'other'
);

CREATE TABLE am_resolutions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  UUID REFERENCES application_runs(id) ON DELETE CASCADE,
  am_id                   UUID NOT NULL REFERENCES account_managers(id) ON DELETE CASCADE,
  ats_type                TEXT,
  url_host                TEXT,
  step                    TEXT,
  action_type             am_resolution_action NOT NULL,
  action_value            JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                   TEXT,
  -- promotion linkages — populated when this resolution generates a learned rule
  promoted_field_rule_id  UUID REFERENCES learned_field_rules(id) ON DELETE SET NULL,
  promoted_host_rule_id   UUID REFERENCES host_automation_rules(id) ON DELETE SET NULL,
  resolved_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_am_resolutions_run        ON am_resolutions(run_id);
CREATE INDEX idx_am_resolutions_am         ON am_resolutions(am_id, resolved_at DESC);
CREATE INDEX idx_am_resolutions_ats_host   ON am_resolutions(ats_type, url_host);
CREATE INDEX idx_am_resolutions_action     ON am_resolutions(action_type, resolved_at DESC);

ALTER TABLE am_resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_am_resolutions"
  ON am_resolutions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE am_resolutions IS
  'Per-fix structured record of what an AM did to resolve a paused/failed run. Auto-promotes to learned_field_rules / host_automation_rules where possible.';
