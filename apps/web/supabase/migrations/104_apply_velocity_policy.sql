-- 104_apply_velocity_policy.sql
-- Per-seeker application velocity controls (lib/apply/velocity.ts).
--
-- Before this migration the only throttles were per-AM concurrency (5) and
-- per-ATS concurrency (MAX_CONCURRENT_PER_ATS). Nothing prevented a single
-- seeker's account from firing dozens of applications in a burst — the
-- fastest way to get a LinkedIn/Indeed account restricted. These columns are
-- read at claim time (lib/apply/claim-task.ts and GET /api/apply/next):
--   * daily_apply_cap        — max application runs *started* per local day
--   * apply_pacing_profile   — jittered minimum gap between runs:
--                                conservative 8–15 min | normal 3–10 min |
--                                aggressive 2–5 min
--   * timezone               — IANA tz for the local-day boundary and quiet
--                              hours; falls back to the seeker's
--                              job_seeker_availability timezone, else UTC day
--                              boundary and no quiet hours.

ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS daily_apply_cap integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS apply_pacing_profile text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE job_seekers
  DROP CONSTRAINT IF EXISTS chk_apply_pacing_profile;
ALTER TABLE job_seekers
  ADD CONSTRAINT chk_apply_pacing_profile
  CHECK (apply_pacing_profile IN ('conservative', 'normal', 'aggressive'));

ALTER TABLE job_seekers
  DROP CONSTRAINT IF EXISTS chk_daily_apply_cap;
ALTER TABLE job_seekers
  ADD CONSTRAINT chk_daily_apply_cap
  CHECK (daily_apply_cap >= 0 AND daily_apply_cap <= 100);

COMMENT ON COLUMN job_seekers.daily_apply_cap IS
  'Max application runs started per seeker-local day. 0 pauses automation for the seeker. Enforced at claim time by lib/apply/velocity.ts.';
COMMENT ON COLUMN job_seekers.apply_pacing_profile IS
  'Jittered minimum spacing between application runs: conservative (8-15m), normal (3-10m), aggressive (2-5m).';
COMMENT ON COLUMN job_seekers.timezone IS
  'IANA timezone (e.g. America/New_York) for daily-cap day boundary and quiet hours. Null = fall back to job_seeker_availability.timezone, else UTC.';

-- Claim-time velocity checks scan recent run starts per seeker.
CREATE INDEX IF NOT EXISTS idx_application_runs_seeker_locked_at
  ON application_runs (job_seeker_id, locked_at DESC)
  WHERE locked_at IS NOT NULL;
