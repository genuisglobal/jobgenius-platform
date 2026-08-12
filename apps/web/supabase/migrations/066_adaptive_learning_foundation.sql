-- Migration: Adaptive Learning Foundation
-- Adds mastery/review metadata, track targeting metadata, and assessment records.

-- ============================================================================
-- 1. TRACK TARGETING METADATA
-- ============================================================================

alter table public.learning_tracks
  add column if not exists creation_mode text not null default 'blank'
    check (creation_mode in ('blank', 'job_gap_refresh', 'manual_skill_refresh')),
  add column if not exists target_skill text,
  add column if not exists target_skill_slug text,
  add column if not exists focus_skills text[] not null default '{}';

create index if not exists idx_learning_tracks_creation_mode
  on public.learning_tracks (creation_mode);

create index if not exists idx_learning_tracks_target_skill_slug
  on public.learning_tracks (target_skill_slug)
  where target_skill_slug is not null;

-- ============================================================================
-- 2. LESSON TARGETING METADATA
-- ============================================================================

alter table public.learning_lessons
  add column if not exists skill_slug text,
  add column if not exists learning_objective text,
  add column if not exists difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard'));

create index if not exists idx_learning_lessons_skill_slug
  on public.learning_lessons (skill_slug)
  where skill_slug is not null;

-- ============================================================================
-- 3. PROGRESS MASTERY + REVIEW STATE
-- ============================================================================

alter table public.learning_progress
  add column if not exists mastery_score integer not null default 0
    check (mastery_score >= 0 and mastery_score <= 100),
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0),
  add column if not exists last_assessed_at timestamptz,
  add column if not exists next_review_at timestamptz,
  add column if not exists review_stage integer not null default 0
    check (review_stage >= 0);

create index if not exists idx_learning_progress_due_review
  on public.learning_progress (job_seeker_id, next_review_at)
  where next_review_at is not null;

-- ============================================================================
-- 4. LEARNING ASSESSMENTS
-- ============================================================================

create table if not exists public.learning_assessments (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.learning_tracks(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  lesson_id uuid references public.learning_lessons(id) on delete cascade,
  assessment_type text not null default 'diagnostic'
    check (assessment_type in ('diagnostic', 'checkpoint', 'review')),
  skill_slug text,
  title text not null,
  prompt text,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  score integer check (score >= 0 and score <= 100),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_assessments_track
  on public.learning_assessments (track_id, created_at desc);

create index if not exists idx_learning_assessments_seeker
  on public.learning_assessments (job_seeker_id, status, created_at desc);

create index if not exists idx_learning_assessments_skill_slug
  on public.learning_assessments (skill_slug)
  where skill_slug is not null;

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

alter table public.learning_assessments enable row level security;

drop policy if exists "service_role_all_learning_assessments" on public.learning_assessments;
create policy "service_role_all_learning_assessments"
  on public.learning_assessments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "seekers_manage_own_learning_assessments" on public.learning_assessments;
create policy "seekers_manage_own_learning_assessments"
  on public.learning_assessments for all
  using (
    job_seeker_id in (
      select js.id from public.job_seekers js where js.auth_id = auth.uid()
    )
  )
  with check (
    job_seeker_id in (
      select js.id from public.job_seekers js where js.auth_id = auth.uid()
    )
  );

drop policy if exists "am_manage_learning_assessments" on public.learning_assessments;
create policy "am_manage_learning_assessments"
  on public.learning_assessments for all
  using (
    track_id in (
      select lt.id from public.learning_tracks lt
      join public.account_managers am on lt.account_manager_id = am.id
      where am.auth_id = auth.uid()
    )
  )
  with check (
    track_id in (
      select lt.id from public.learning_tracks lt
      join public.account_managers am on lt.account_manager_id = am.id
      where am.auth_id = auth.uid()
    )
  );

comment on column public.learning_tracks.creation_mode is 'How the learning track was initiated: blank, job_gap_refresh, or manual_skill_refresh';
comment on column public.learning_tracks.target_skill is 'Primary human-readable skill this track is intended to refresh';
comment on column public.learning_tracks.target_skill_slug is 'Normalized slug for the primary target skill';
comment on column public.learning_tracks.focus_skills is 'Ordered list of learning target skills associated with the track';
comment on column public.learning_lessons.skill_slug is 'Normalized skill slug the lesson is mapped to';
comment on column public.learning_lessons.learning_objective is 'Short statement describing the learner outcome for the lesson';
comment on column public.learning_progress.mastery_score is 'Current mastery estimate for the learner on this lesson or skill, from 0 to 100';
comment on column public.learning_progress.next_review_at is 'When this lesson should next surface in the review queue';
comment on table public.learning_assessments is 'Track-level or lesson-level assessments used for diagnostics, checkpoints, and spaced review';
