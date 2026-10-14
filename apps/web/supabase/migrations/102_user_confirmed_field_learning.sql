-- ============================================================
-- Migration 102: Mode 3 live-autofill learning
--
-- 1. Allow a new 'user_confirmed' source on learned_field_rules — a human
--    confirmed/corrected the value live via interactive autofill. Higher trust
--    than 'llm', below an explicit admin 'rule'.
-- 2. learned_field_events: append-only audit log of the raw human field events
--    (accepted / corrected / filled_blank). Values are stored as hashes only so
--    no PII lands in the audit trail; the canonical mapping is kept for replay.
-- ============================================================

-- 1. Extend the source CHECK constraint (082 created it inline as
--    learned_field_rules_source_check). Adding a value never violates existing rows.
ALTER TABLE learned_field_rules
  DROP CONSTRAINT IF EXISTS learned_field_rules_source_check;

ALTER TABLE learned_field_rules
  ADD CONSTRAINT learned_field_rules_source_check
  CHECK (source IN ('llm', 'rule', 'am_fix', 'promoted', 'user_confirmed'));

-- 2. Raw event audit log (pre-canonicalization) for replay / future retraining.
CREATE TABLE IF NOT EXISTS learned_field_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_seeker_id         UUID,
  account_manager_id    UUID,
  ats_type              TEXT,
  url_host              TEXT,
  field_signature       TEXT,
  field_label           TEXT,
  field_type            TEXT,
  field_options         JSONB,
  outcome               TEXT NOT NULL
                          CHECK (outcome IN ('accepted', 'corrected', 'filled_blank')),
  autofilled_value_hash TEXT,   -- sha256 hex; never the raw value
  final_value_hash      TEXT,   -- sha256 hex; never the raw value
  mapping               JSONB,
  source_mode           TEXT NOT NULL DEFAULT 'live_autofill'
);

CREATE INDEX IF NOT EXISTS idx_learned_field_events_host
  ON learned_field_events (url_host, field_signature);
CREATE INDEX IF NOT EXISTS idx_learned_field_events_seeker
  ON learned_field_events (job_seeker_id, created_at DESC);

ALTER TABLE learned_field_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_learned_field_events"
  ON learned_field_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE learned_field_events IS
  'Append-only audit of human field events from Mode 3 live autofill. Values hashed; canonical mapping kept. Feeds learned_field_rules (user_confirmed) + job_seeker_screening_answers.';
