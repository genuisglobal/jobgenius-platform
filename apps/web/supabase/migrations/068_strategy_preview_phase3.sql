-- Migration 068: Strategy preview phase 3
-- Adds preview timing fields to intake state so preview approval, activation,
-- expiration, and conversion can be tracked explicitly.

alter table public.job_seeker_intake_states
  add column if not exists preview_agreed_at timestamptz,
  add column if not exists preview_started_at timestamptz,
  add column if not exists preview_expires_at timestamptz,
  add column if not exists preview_converted_at timestamptz;

create index if not exists idx_job_seeker_intake_states_preview_expires
  on public.job_seeker_intake_states(status, preview_expires_at);
