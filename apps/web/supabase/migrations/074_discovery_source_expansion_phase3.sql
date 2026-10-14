-- Migration 074: Discovery source expansion (Workday + SmartRecruiters)
-- ====================================================================
-- Seed new direct ATS feed sources for the discovery runner.

INSERT INTO job_sources (
  name,
  base_url,
  source_type,
  rate_limit_per_minute,
  adapter_config,
  selectors
)
VALUES
  (
    'workday',
    'https://www.myworkdayjobs.com',
    'feed',
    20,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'smartrecruiters',
    'https://api.smartrecruiters.com/v1/companies',
    'feed',
    30,
    '{}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (name) DO NOTHING;
