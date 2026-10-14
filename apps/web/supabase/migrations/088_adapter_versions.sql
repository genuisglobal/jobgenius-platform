-- ============================================================
-- Migration 088: adapter_versions
-- Versioned per-ATS adapter configuration. The runner pulls the
-- currently-active config at run-start so we can patch selectors,
-- timeouts, and step lists without redeploying the runner binary.
--
-- Only ONE row per ats_type can be 'active'. New rows are 'pending'
-- until an admin promotes them via /api/admin/adapter-versions/[id].
-- ============================================================

CREATE TYPE adapter_version_status AS ENUM (
  'active',
  'pending',
  'archived',
  'rolled_back'
);

CREATE TABLE adapter_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_type       TEXT NOT NULL,
  version        INT NOT NULL,
  config         JSONB NOT NULL,        -- arbitrary per-adapter shape, kept opaque server-side
  notes          TEXT,
  status         adapter_version_status NOT NULL DEFAULT 'pending',
  created_by     UUID,
  promoted_by    UUID,
  promoted_at    TIMESTAMPTZ,
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats_type, version)
);

CREATE INDEX idx_adapter_versions_ats_status
  ON adapter_versions (ats_type, status);

-- At most one ACTIVE row per ats_type — enforce via partial unique index.
CREATE UNIQUE INDEX idx_adapter_versions_one_active_per_ats
  ON adapter_versions (ats_type)
  WHERE status = 'active';

CREATE TRIGGER trg_adapter_versions_updated_at
  BEFORE UPDATE ON adapter_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE adapter_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_adapter_versions"
  ON adapter_versions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE adapter_versions IS
  'Versioned per-ATS adapter config. Runner pulls the active row at run-start. Phase 3 ships the schema + read API; runner-side integration is its own follow-up.';
