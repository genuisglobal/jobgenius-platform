-- 112_application_outcomes.sql
-- Outcome tracking (Lean v1): one materialized row per submitted application,
-- capturing the practices applied (résumé tailored?, match score, ATS, and —
-- best-effort — how many answers came from AI vs memory vs the seeker's saved
-- answers) alongside the outcome (interview / rejected / no_response). Lets us
-- MEASURE application→interview conversion by segment instead of asserting it.
--
-- Refreshed by POST /api/ops/outcomes-rollup, which derives everything except
-- the answer counts from existing tables (application_runs, tailored_resumes,
-- job_match_scores, interviews, application_feedback, job_seeker_assignments).
-- The answer counts are populated separately by the extension at fill time and
-- are deliberately NOT overwritten by the rollup.

create table if not exists public.application_outcomes (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  application_run_id uuid references public.application_runs(id) on delete set null,
  account_manager_id uuid references public.account_managers(id) on delete set null,

  ats_type text,
  submitted_at timestamptz not null,

  -- Practice snapshot (what we did on this application).
  match_score int,
  recommendation text,
  resume_tailored boolean not null default false,
  coverage_before int,
  coverage_after int,
  ai_answer_count int,
  memory_answer_count int,
  screening_answer_count int,
  default_answer_count int,

  -- Outcome (derived by the rollup).
  outcome text not null default 'applied'
    check (outcome in ('applied', 'interview', 'rejected', 'no_response')),
  first_interview_at timestamptz,
  days_to_interview numeric,
  rejected_at timestamptz,
  rejection_category text,

  computed_at timestamptz not null default now(),

  -- One outcome per application. The duplicate-application gate already prevents
  -- a seeker applying to the same job twice, so (seeker, job) is a safe key.
  unique (job_seeker_id, job_post_id)
);

create index if not exists idx_application_outcomes_am
  on public.application_outcomes (account_manager_id);
create index if not exists idx_application_outcomes_outcome
  on public.application_outcomes (outcome);
create index if not exists idx_application_outcomes_submitted
  on public.application_outcomes (submitted_at);
create index if not exists idx_application_outcomes_tailored
  on public.application_outcomes (resume_tailored);

-- All access is via service-role API routes (supabaseAdmin); lock the table to
-- the service role so it is never reachable from a client anon/user key.
alter table public.application_outcomes enable row level security;

drop policy if exists application_outcomes_service_all on public.application_outcomes;
create policy application_outcomes_service_all
  on public.application_outcomes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Answer-source counts captured at FILL time by the extension (which knows,
-- per field, whether the answer came from AI / memory / a saved answer / a
-- default). Kept in a side table rather than written straight to
-- application_outcomes: a Mode-3 fill does NOT always become a submitted
-- application, so writing outcome rows here would inflate the denominator. The
-- rollup left-joins these counts onto outcomes only for real submissions.
create table if not exists public.application_answer_stats (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  ai_answer_count int not null default 0,
  memory_answer_count int not null default 0,
  screening_answer_count int not null default 0,
  default_answer_count int not null default 0,
  captured_at timestamptz not null default now(),
  unique (job_seeker_id, job_post_id)
);

create index if not exists idx_application_answer_stats_seeker
  on public.application_answer_stats (job_seeker_id);

alter table public.application_answer_stats enable row level security;

drop policy if exists application_answer_stats_service_all on public.application_answer_stats;
create policy application_answer_stats_service_all
  on public.application_answer_stats
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
