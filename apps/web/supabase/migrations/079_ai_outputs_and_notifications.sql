-- ============================================================
-- Migration 079: AI HITL pipeline + notifications fan-out
-- ai_outputs gives every AI-generated artifact an approval lifecycle.
-- notifications is the durable record + queue for email + in-app.
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────

CREATE TYPE ai_output_kind AS ENUM (
  'qa_card',
  'quiz_card',
  'lesson',
  'outreach_draft',
  'interview_followup',
  'cover_letter',
  'jobgenius_report',
  'tailored_resume',
  'other'
);

CREATE TYPE ai_output_status AS ENUM (
  'pending',        -- awaiting human review
  'auto_approved',  -- low-risk policy auto-approved
  'approved',       -- approved by a reviewer
  'rejected',       -- rejected by a reviewer
  'published',      -- approved + downstream artifact created/sent
  'expired'         -- approval window passed without decision
);

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'both');
CREATE TYPE notification_user_type AS ENUM ('am', 'job_seeker');
CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'read'
);

-- ─── ai_outputs ──────────────────────────────────────────────

CREATE TABLE ai_outputs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              ai_output_kind NOT NULL,
  ref_type          TEXT,           -- denormalized target table name (e.g. 'job_seekers', 'interview_prep')
  ref_id            UUID,           -- target row id
  payload           JSONB NOT NULL,
  status            ai_output_status NOT NULL DEFAULT 'pending',
  reviewer_id       UUID,
  decided_at        TIMESTAMPTZ,
  decision_notes    TEXT,
  ai_call_log_id    UUID,           -- soft FK to ai_call_logs.id (migration 078)
  seeker_id         UUID REFERENCES job_seekers(id) ON DELETE SET NULL,
  am_id             UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_outputs_status_created   ON ai_outputs (status, created_at DESC);
CREATE INDEX idx_ai_outputs_kind_status      ON ai_outputs (kind, status, created_at DESC);
CREATE INDEX idx_ai_outputs_ref              ON ai_outputs (ref_type, ref_id);
CREATE INDEX idx_ai_outputs_seeker           ON ai_outputs (seeker_id, created_at DESC) WHERE seeker_id IS NOT NULL;
CREATE INDEX idx_ai_outputs_am               ON ai_outputs (am_id, status, created_at DESC) WHERE am_id IS NOT NULL;
CREATE INDEX idx_ai_outputs_pending_expires  ON ai_outputs (expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

CREATE TRIGGER trg_ai_outputs_updated_at
  BEFORE UPDATE ON ai_outputs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── notifications ───────────────────────────────────────────

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,                              -- account_managers.id or job_seekers.id
  user_type    notification_user_type NOT NULL,
  channel      notification_channel NOT NULL DEFAULT 'in_app',
  category     TEXT NOT NULL,                              -- e.g. 'payslip_issued', 'application_paused'
  subject      TEXT,
  body         TEXT,
  link_url     TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       notification_status NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  read_at      TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user        ON notifications (user_id, user_type, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, user_type) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_pending     ON notifications (status, created_at) WHERE status = 'pending';
CREATE INDEX idx_notifications_category    ON notifications (category, created_at DESC);

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS: service-role only (all routes use supabaseAdmin) ───

ALTER TABLE ai_outputs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_outputs"
  ON ai_outputs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE ai_outputs IS
  'HITL approval pipeline for AI-generated content. Generators write pending; reviewers approve/reject; published artifacts reference back via ai_call_log_id.';
COMMENT ON TABLE notifications IS
  'Durable record + queue for in-app and email notifications. lib/notify.ts writes here; the background poller sends pending rows via Resend.';
