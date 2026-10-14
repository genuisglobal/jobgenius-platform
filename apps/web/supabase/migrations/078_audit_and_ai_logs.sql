-- ============================================================
-- Migration 078: Persistent audit + AI call logs
-- Currently lib/audit.ts and AI calls only write to console.
-- These tables give us forensics + AI cost/quality observability.
-- ============================================================

-- ─── audit_logs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID,
  actor_email  TEXT,
  actor_role   TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created   ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created  ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target          ON audit_logs (target_type, target_id);

-- ─── ai_call_logs ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route           TEXT,
  function_name   TEXT,
  model           TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  total_tokens    INTEGER,
  latency_ms      INTEGER,
  status          TEXT NOT NULL,            -- 'success' | 'error' | 'fallback'
  error           TEXT,
  prompt_hash     TEXT,
  seeker_id       UUID,
  am_id           UUID,
  cost_usd        NUMERIC(10,6),
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_created     ON ai_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_am          ON ai_call_logs (am_id, created_at DESC) WHERE am_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_seeker      ON ai_call_logs (seeker_id, created_at DESC) WHERE seeker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_function    ON ai_call_logs (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_status      ON ai_call_logs (status, created_at DESC);

-- ─── RLS: service role only (all routes use supabaseAdmin) ───

ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_call_logs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_logs"
  ON audit_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ai_call_logs"
  ON ai_call_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE audit_logs IS
  'Persistent record of admin actions. Written by lib/audit.ts:logAdminAction in addition to console.';
COMMENT ON TABLE ai_call_logs IS
  'Per-call AI usage log written by lib/ai-logging.ts:logAiCall. Used for cost guards + quality dashboards.';
