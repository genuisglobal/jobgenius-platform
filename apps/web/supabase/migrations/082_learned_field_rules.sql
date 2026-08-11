-- ============================================================
-- Migration 082: learned_field_rules
-- Cache of LLM-classified form fields keyed by (ats, url_host,
-- field_signature). When the runner hits an unknown field, it first
-- consults this table; if there's a hit it skips the LLM call.
-- After N>=3 successful uses an LLM rule auto-promotes to 'rule'
-- (slightly higher confidence, surfaceable in admin UI later).
--
-- This eliminates duplicate LLM spend on the same recurring questions
-- across seekers and dramatically speeds up runs as the cache warms.
-- ============================================================

CREATE TABLE learned_field_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_type          TEXT NOT NULL,
  url_host          TEXT NOT NULL,
  field_signature   TEXT NOT NULL,   -- normalized "label|type|options-hash" key
  field_label       TEXT,            -- human-readable label kept for review
  field_type        TEXT,            -- text|select|radio|checkbox|file|…
  mapping           JSONB NOT NULL,  -- e.g. { kind: "screening_answer", key: "work_authorization" } or { kind: "static", value: "Yes" }
  source            TEXT NOT NULL DEFAULT 'llm'
                      CHECK (source IN ('llm', 'rule', 'am_fix', 'promoted')),
  confidence        NUMERIC(3,2) NOT NULL DEFAULT 0.50
                      CHECK (confidence >= 0 AND confidence <= 1),
  hits              INT NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats_type, url_host, field_signature)
);

CREATE INDEX idx_learned_fields_lookup
  ON learned_field_rules (ats_type, url_host, field_signature);
CREATE INDEX idx_learned_fields_source
  ON learned_field_rules (source, confidence DESC);

CREATE TRIGGER trg_learned_field_rules_updated_at
  BEFORE UPDATE ON learned_field_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE learned_field_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_learned_field_rules"
  ON learned_field_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE learned_field_rules IS
  'Per-(ats,host,field) cache of field classifications. Runner calls lookupFieldRule before invoking LLM; recordFieldClassification persists each new classification and promotes after >=3 hits.';
