-- Migration 063: Screening answers table + runner screenshot support
-- Supports autonomous application by providing pre-configured answers to common screening questions
-- and storing failure screenshots for debugging.

-- ============================================================
-- 1. Screening answers: per-jobseeker answers to common questions
-- ============================================================
create table if not exists job_seeker_screening_answers (
  id            uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references job_seekers(id) on delete cascade,
  question_key  text not null,
  question_text text not null default '',
  answer_value  text not null,
  answer_type   text not null default 'text' check (answer_type in ('text','select','radio','checkbox')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(job_seeker_id, question_key)
);

create index if not exists idx_screening_answers_seeker
  on job_seeker_screening_answers(job_seeker_id);

-- Seed common question keys with descriptions
comment on table job_seeker_screening_answers is
  'Pre-configured answers for common screening questions on job applications. '
  'question_key is a normalized identifier like work_authorization, sponsorship, '
  'salary_expectations, years_experience, willing_to_relocate, etc.';

-- RLS
alter table job_seeker_screening_answers enable row level security;

create policy "Service role full access on screening_answers"
  on job_seeker_screening_answers
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 2. Runner screenshots: store failure screenshots for debugging
-- ============================================================
create table if not exists apply_run_screenshots (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references application_runs(id) on delete cascade,
  step        text not null default '',
  reason      text not null default '',
  url         text not null default '',
  screenshot_path text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_run_screenshots_run_id
  on apply_run_screenshots(run_id);

alter table apply_run_screenshots enable row level security;

create policy "Service role full access on run_screenshots"
  on apply_run_screenshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 3. Create storage bucket for runner screenshots
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('runner-screenshots', 'runner-screenshots', false, 5242880)
on conflict (id) do nothing;
