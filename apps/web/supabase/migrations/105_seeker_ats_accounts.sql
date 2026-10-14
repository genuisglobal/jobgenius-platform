-- 105_seeker_ats_accounts.sql
-- Per-seeker ATS account credentials (Workday deep adapter, ticket 7).
--
-- Workday requires an account per (seeker, tenant) before an application can
-- be submitted. The cloud runner asks POST /api/apply/ats-account for the
-- credentials of (job_seeker_id, host); the server creates them on first use
-- (email = seeker email, generated password meeting Workday complexity) and
-- stores the password AES-256-GCM-encrypted with ATS_ACCOUNT_ENCRYPTION_KEY
-- (lib/apply/ats-accounts.ts). Plaintext passwords exist only in the response
-- to an authenticated runner/AM, never at rest.

CREATE TABLE IF NOT EXISTS seeker_ats_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id   uuid NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  -- Tenant host, lowercased (e.g. acme.wd5.myworkdayjobs.com). Workday
  -- accounts are per-tenant, so the same seeker has one row per company.
  host            text NOT NULL,
  ats_type        text NOT NULL DEFAULT 'WORKDAY',
  account_email   text NOT NULL,
  -- JSON blob {iv, tag, data} from AES-256-GCM (lib/apply/ats-accounts.ts).
  password_encrypted text NOT NULL,
  -- ACTIVE: usable | LOGIN_FAILED: runner reported bad credentials (AM must
  -- reset via the ATS "forgot password" flow) | RESET_REQUIRED: manually set.
  status          text NOT NULL DEFAULT 'ACTIVE',
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ats_account_status
    CHECK (status IN ('ACTIVE', 'LOGIN_FAILED', 'RESET_REQUIRED')),
  UNIQUE (job_seeker_id, host)
);

CREATE INDEX IF NOT EXISTS idx_seeker_ats_accounts_seeker
  ON seeker_ats_accounts (job_seeker_id);

ALTER TABLE seeker_ats_accounts ENABLE ROW LEVEL SECURITY;

-- Credentials are service-role only; every read goes through the
-- authenticated API route, never PostgREST directly.
CREATE POLICY "Service role full access on seeker_ats_accounts"
  ON seeker_ats_accounts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
