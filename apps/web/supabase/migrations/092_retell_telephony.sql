-- Migration 092: Retell telephony migration (Phase 1)
-- Goal: migrate the provider-agnostic voice stack from Bland AI to Retell AI for
--       telephony call types, while preserving all historical call data.
--
-- Safety notes:
--   * BACKWARD-SAFE. We only change the DEFAULT for new voice_calls/voice_call_events
--     rows. Existing rows keep their stored provider value ('bland'), so historical
--     call logs, transcripts, outcomes, and AM notes are untouched.
--   * Adds voice_playbooks.retell_agent_id (one Retell agent per call type).
--   * Renames the telephony call type 'interview_prep' -> 'interview_warmup'.
--     The string 'interview_prep' is now reserved for the (separate, later-phase)
--     OpenAI Realtime deep interview-prep system. The interview_prep CONTENT table
--     is unrelated and is NOT touched by this migration.
--   * Adds a partial unique index on (provider, provider_event_id) so Retell webhook
--     deliveries are idempotent.
--
-- This migration is idempotent and can be re-run safely.

begin;

-- ------------------------------------------------------------
-- 1. New-row provider default -> 'retell' (existing rows unchanged)
-- ------------------------------------------------------------
alter table public.voice_calls        alter column provider set default 'retell';
alter table public.voice_call_events  alter column provider set default 'retell';

-- ------------------------------------------------------------
-- 2. Per-call-type Retell agent mapping
-- ------------------------------------------------------------
alter table public.voice_playbooks
  add column if not exists retell_agent_id text;

comment on column public.voice_playbooks.retell_agent_id is
  'Retell agent id used as override_agent_id when dispatching this call type.';

-- ------------------------------------------------------------
-- 3. Drop existing call_type CHECK constraints (names vary by env)
--    then rename data, then re-add named constraints with the new
--    'interview_warmup' value.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in (
        'public.voice_calls'::regclass,
        'public.voice_playbooks'::regclass
      )
      and pg_get_constraintdef(c.oid) ilike '%call_type%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end$$;

-- Rename existing data from interview_prep -> interview_warmup (telephony only)
update public.voice_playbooks set call_type = 'interview_warmup' where call_type = 'interview_prep';
update public.voice_calls     set call_type = 'interview_warmup' where call_type = 'interview_prep';

-- Re-add named CHECK constraints with the full, updated call-type set
alter table public.voice_playbooks
  add constraint voice_playbooks_call_type_check check (call_type in (
    'lead_qualification',
    'onboarding',
    'follow_up',
    'discovery',
    'check_in',
    'interview_warmup',
    'upsell_retention'
  ));

alter table public.voice_calls
  add constraint voice_calls_call_type_check check (call_type in (
    'lead_qualification',
    'onboarding',
    'follow_up',
    'discovery',
    'check_in',
    'interview_warmup',
    'upsell_retention'
  ));

-- ------------------------------------------------------------
-- 4. Webhook idempotency: one row per (provider, provider_event_id)
-- ------------------------------------------------------------
create unique index if not exists voice_call_events_provider_event_uidx
  on public.voice_call_events (provider, provider_event_id)
  where provider_event_id is not null;

commit;
