-- Migration 064: Rejection Feedback Loop, Application Analytics, Adapter Health,
-- Smart Retry Learning, Activity Feed, and Stale Match Archival
-- ============================================================

-- ============================================================
-- 1. Rejection feedback: capture why applications/interviews failed
-- ============================================================
create table if not exists application_feedback (
  id              uuid primary key default gen_random_uuid(),
  job_seeker_id   uuid not null references job_seekers(id) on delete cascade,
  job_post_id     uuid references job_posts(id) on delete set null,
  run_id          uuid references application_runs(id) on delete set null,
  interview_id    uuid references interviews(id) on delete set null,
  feedback_type   text not null check (feedback_type in ('application_rejected','interview_rejected','ghosted','withdrawn','ats_failure')),
  rejection_reason text,
  rejection_category text check (rejection_category in (
    'experience_mismatch','skills_gap','overqualified','underqualified',
    'salary_mismatch','location_mismatch','culture_fit','visa_sponsorship',
    'internal_candidate','position_filled','company_freeze','no_response','other'
  )),
  source          text not null default 'manual' check (source in ('manual','auto_detected','gmail_scan','am_recorded')),
  ats_type        text,
  company         text,
  role_title      text,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references account_managers(id) on delete set null
);

create index if not exists idx_app_feedback_seeker on application_feedback(job_seeker_id);
create index if not exists idx_app_feedback_category on application_feedback(rejection_category);
create index if not exists idx_app_feedback_type on application_feedback(feedback_type);
create index if not exists idx_app_feedback_created on application_feedback(created_at desc);

alter table application_feedback enable row level security;
create policy "Service role full access on application_feedback"
  on application_feedback for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 2. Adapter health tracking: per-ATS success/failure metrics
-- ============================================================
create table if not exists adapter_health_events (
  id          uuid primary key default gen_random_uuid(),
  ats_type    text not null,
  run_id      uuid references application_runs(id) on delete cascade,
  outcome     text not null check (outcome in ('success','failure','timeout','captcha_blocked','session_expired')),
  step        text,
  error_code  text,
  duration_ms integer,
  url_host    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_adapter_health_ats on adapter_health_events(ats_type, created_at desc);
create index if not exists idx_adapter_health_outcome on adapter_health_events(outcome);

alter table adapter_health_events enable row level security;
create policy "Service role full access on adapter_health_events"
  on adapter_health_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Materialized view for fast dashboard queries
create materialized view if not exists adapter_health_summary as
select
  ats_type,
  count(*) as total_runs,
  count(*) filter (where outcome = 'success') as successes,
  count(*) filter (where outcome = 'failure') as failures,
  count(*) filter (where outcome = 'timeout') as timeouts,
  count(*) filter (where outcome = 'captcha_blocked') as captcha_blocks,
  count(*) filter (where outcome = 'session_expired') as session_expires,
  round(100.0 * count(*) filter (where outcome = 'success') / nullif(count(*), 0), 1) as success_rate,
  avg(duration_ms) filter (where outcome = 'success') as avg_success_ms,
  max(created_at) as last_event_at
from adapter_health_events
where created_at > now() - interval '30 days'
group by ats_type;

-- ============================================================
-- 3. Smart retry: track retry strategies and outcomes
-- ============================================================
create table if not exists retry_strategies (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references application_runs(id) on delete cascade,
  attempt_number  integer not null default 1,
  strategy        text not null check (strategy in ('same','skip_optional','alt_resume','simplified_fields','different_session')),
  changes_applied jsonb not null default '{}',
  outcome         text check (outcome in ('success','failure','pending')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_retry_strategies_run on retry_strategies(run_id);

alter table retry_strategies enable row level security;
create policy "Service role full access on retry_strategies"
  on retry_strategies for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 4. Seeker activity feed: unified timeline of all events
-- ============================================================
create table if not exists seeker_activity_feed (
  id              uuid primary key default gen_random_uuid(),
  job_seeker_id   uuid not null references job_seekers(id) on delete cascade,
  event_type      text not null,
  title           text not null,
  description     text,
  meta            jsonb default '{}',
  ref_type        text,
  ref_id          uuid,
  created_at      timestamptz not null default now()
);

create index if not exists idx_activity_feed_seeker on seeker_activity_feed(job_seeker_id, created_at desc);
create index if not exists idx_activity_feed_type on seeker_activity_feed(event_type);

alter table seeker_activity_feed enable row level security;
create policy "Service role full access on seeker_activity_feed"
  on seeker_activity_feed for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 5. Outreach reply classification (only if outreach_messages exists)
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'outreach_messages') then
    alter table outreach_messages add column if not exists reply_classification text
      check (reply_classification in ('positive_interest','scheduling','follow_up','rejection','info_request','out_of_office','other'));
    alter table outreach_messages add column if not exists ai_draft_reply text;
    alter table outreach_messages add column if not exists ai_draft_status text default 'none'
      check (ai_draft_status in ('none','generated','sent','dismissed'));
  end if;
end $$;

-- ============================================================
-- 5b. Smart retry columns on application_runs
-- ============================================================
alter table application_runs add column if not exists retry_strategy text;
alter table application_runs add column if not exists retry_changes jsonb default '{}';

-- ============================================================
-- 6. Match archival: flag for stale matches
-- ============================================================
alter table job_match_scores add column if not exists archived_at timestamptz;
alter table job_match_scores add column if not exists archive_reason text;

create index if not exists idx_match_scores_archived on job_match_scores(archived_at) where archived_at is null;

-- ============================================================
-- 7. Scoring feedback: link feedback to match weight adjustments
-- ============================================================
create table if not exists match_weight_adjustments (
  id              uuid primary key default gen_random_uuid(),
  job_seeker_id   uuid not null references job_seekers(id) on delete cascade,
  trigger_type    text not null check (trigger_type in ('rejection_feedback','manual','auto_tune')),
  previous_weights jsonb not null,
  new_weights     jsonb not null,
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_weight_adj_seeker on match_weight_adjustments(job_seeker_id);

alter table match_weight_adjustments enable row level security;
create policy "Service role full access on match_weight_adjustments"
  on match_weight_adjustments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 7. RPC to refresh adapter health materialized view
-- ============================================================
create or replace function refresh_adapter_health_summary()
returns void
language sql
security definer
as $$
  refresh materialized view adapter_health_summary;
$$;
