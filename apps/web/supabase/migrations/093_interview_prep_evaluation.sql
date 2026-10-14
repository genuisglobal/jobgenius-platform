-- Migration 093: Deep interview-prep evaluation (Phase 2)
-- Adds structured AI scoring + feedback-report storage to the OpenAI Realtime
-- mock-interview tables. Fully additive and backward-safe: existing sessions
-- and turns keep their data; new columns are nullable / defaulted.

begin;

-- ------------------------------------------------------------
-- Session-level structured report + competency scores
-- ------------------------------------------------------------
alter table public.voice_interview_sessions
  add column if not exists feedback_report jsonb;

alter table public.voice_interview_sessions
  add column if not exists star_score integer;

alter table public.voice_interview_sessions
  add column if not exists communication_score integer;

alter table public.voice_interview_sessions
  add column if not exists relevance_score integer;

alter table public.voice_interview_sessions
  add column if not exists am_coaching_note text;

alter table public.voice_interview_sessions
  add column if not exists resume_grounded boolean not null default false;

alter table public.voice_interview_sessions
  add column if not exists scored_by text not null default 'heuristic';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'voice_interview_sessions_scored_by_check'
  ) then
    alter table public.voice_interview_sessions
      add constraint voice_interview_sessions_scored_by_check
      check (scored_by in ('ai', 'heuristic'));
  end if;
end$$;

-- ------------------------------------------------------------
-- Per-answer coaching detail
-- ------------------------------------------------------------
alter table public.voice_interview_turns
  add column if not exists star_score integer;

alter table public.voice_interview_turns
  add column if not exists relevance_score integer;

alter table public.voice_interview_turns
  add column if not exists specificity_score integer;

alter table public.voice_interview_turns
  add column if not exists confidence_coaching text;

alter table public.voice_interview_turns
  add column if not exists rewrite_suggestions jsonb not null default '[]'::jsonb;

commit;
