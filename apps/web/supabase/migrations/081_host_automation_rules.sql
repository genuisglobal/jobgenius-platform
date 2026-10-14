-- ============================================================
-- Migration 081: host_automation_rules
-- Moves the static HOST_RULES array out of lib/apply-host-rules.ts into a
-- DB table so admins can add/edit hosts without a deploy. lib reads with
-- a 5-min cache and falls back to the static array on DB unavailability.
--
-- Adding a new ATS now = an admin form, not an engineer.
-- ============================================================

CREATE TABLE host_automation_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id               TEXT NOT NULL UNIQUE,        -- stable identifier, e.g. "GREENHOUSE"
  hosts                 TEXT[] NOT NULL,             -- e.g. ["greenhouse.io"]
  apply_entry_hints     TEXT[] NOT NULL DEFAULT '{}',
  submit_hints          TEXT[] NOT NULL DEFAULT '{}',
  requires_apply_entry  BOOLEAN NOT NULL DEFAULT false,
  prefer_popup_handoff  BOOLEAN NOT NULL DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'pending_review')),
  priority              INT NOT NULL DEFAULT 0,      -- higher = matched first (future tie-break)
  notes                 TEXT,
  created_by            UUID,
  reviewer_id           UUID,                        -- for pending_review rows promoted from L2 diagnoses
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_host_rules_status ON host_automation_rules(status);
CREATE INDEX idx_host_rules_hosts  ON host_automation_rules USING gin(hosts);

CREATE TRIGGER trg_host_rules_updated_at
  BEFORE UPDATE ON host_automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Service-role only RLS, consistent with the rest of the codebase.
ALTER TABLE host_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_host_rules"
  ON host_automation_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── Seed: mirror current lib/apply-host-rules.ts HOST_RULES ─────

INSERT INTO host_automation_rules
  (rule_id, hosts, apply_entry_hints, submit_hints, requires_apply_entry, prefer_popup_handoff)
VALUES
  ('INDEED_LISTING', ARRAY['indeed.com'],
    ARRAY['apply now','apply on company site','apply on company website','continue application','continue applying','continue to application','view application','visit employer site'],
    ARRAY['continue application','continue to application','review application','submit application'],
    true, true),
  ('LEVER', ARRAY['lever.co'],
    ARRAY['apply for this job','apply now','apply'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('SMARTRECRUITERS', ARRAY['smartrecruiters.com'],
    ARRAY['i''m interested','apply now','apply'],
    ARRAY['next','continue','review','submit application','submit'],
    true, false),
  ('ICIMS', ARRAY['icims.com'],
    ARRAY['apply now','apply for this job online','apply for this position','continue to apply'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('JOBVITE', ARRAY['jobvite.com'],
    ARRAY['apply now','apply','start application'],
    ARRAY['next','continue','review','submit application','submit'],
    true, false),
  ('WORKABLE', ARRAY['workable.com'],
    ARRAY['apply for this job','apply now','apply'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('BAMBOOHR', ARRAY['bamboohr.com'],
    ARRAY['apply for job','apply now','apply'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('THEMUSE', ARRAY['themuse.com'],
    ARRAY['apply on employer site','apply on company site','apply externally','apply now','apply','view application','apply to this job'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('ARBEITNOW', ARRAY['arbeitnow.com'],
    ARRAY['apply now','apply','apply for this position','apply on company website','apply externally','visit employer site'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('REMOTIVE', ARRAY['remotive.com'],
    ARRAY['apply now','apply','apply for this position','apply on company site'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('REMOTEOK', ARRAY['remoteok.com'],
    ARRAY['apply now','apply','apply for this position','apply to this job'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('JOBICY', ARRAY['jobicy.com'],
    ARRAY['apply now','apply','apply for this job','apply on company site'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('HIMALAYAS', ARRAY['himalayas.app'],
    ARRAY['apply now','apply','apply for this role','apply externally'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('STARTUP_JOBS', ARRAY['startup.jobs'],
    ARRAY['apply now','apply','apply for this job','apply to this job'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('ASHBY', ARRAY['ashbyhq.com'],
    ARRAY['apply','apply now','apply for this job'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('RECRUITEE', ARRAY['recruitee.com'],
    ARRAY['apply now','apply','apply for this job'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('BREEZYHR', ARRAY['breezy.hr'],
    ARRAY['apply now','apply','apply for this position'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('JAZZHR', ARRAY['applytojob.com','jazzhr.com'],
    ARRAY['apply now','apply','apply for this job'],
    ARRAY['next','continue','submit application','submit'],
    true, false),
  ('PERSONIO', ARRAY['personio.de','jobs.personio.com','jobs.personio.de'],
    ARRAY['apply now','apply','apply for this position','jetzt bewerben'],
    ARRAY['next','continue','submit application','submit','weiter','absenden'],
    true, false),
  ('WELLFOUND', ARRAY['wellfound.com'],
    ARRAY['apply now','apply','apply for this job','want to work here?'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('GLASSDOOR', ARRAY['glassdoor.com'],
    ARRAY['apply now','apply on company site','apply','easy apply'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('BUILTIN', ARRAY['builtin.com'],
    ARRAY['apply now','apply','apply on company site','apply externally'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('YCOMBINATOR', ARRAY['ycombinator.com','workatastartup.com'],
    ARRAY['apply','apply now','apply to this job'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false),
  ('FINDWORK', ARRAY['findwork.dev'],
    ARRAY['apply now','apply','apply on company site'],
    ARRAY['submit application','submit','apply','next','continue'],
    true, false);

COMMENT ON TABLE host_automation_rules IS
  'Per-host apply-flow rules consumed by lib/apply-host-rules.ts. Admin-editable; lib caches for 5 minutes.';
