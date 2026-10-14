-- ============================================================
-- Migration 099: Outcome attribution phase 1
-- Append-only funnel and ownership-aware event ledger
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'outcome_event_type'
  ) then
    create type public.outcome_event_type as enum (
      'lead_captured',
      'lead_imported',
      'qualification_call_queued',
      'qualification_call_completed',
      'lead_qualified',
      'lead_nurture',
      'lead_disqualified',
      'consultation_booked',
      'consultation_completed',
      'consultation_no_show',
      'consultation_cancelled',
      'payment_confirmed',
      'client_activated',
      'application_submitted',
      'interview_scheduled',
      'interview_outcome_recorded',
      'offer_reported',
      'offer_verified',
      'placement_confirmed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'outcome_source_channel'
  ) then
    create type public.outcome_source_channel as enum (
      'marketing_form',
      'signup_intake',
      'excel_import',
      'manual_admin',
      'voice_automation',
      'billing',
      'application_runner',
      'am_portal',
      'finance',
      'system'
    );
  end if;
end
$$;

create table if not exists public.consultation_records (
  id uuid primary key default gen_random_uuid(),
  lead_submission_id uuid references public.lead_intake_submissions(id) on delete set null,
  job_seeker_id uuid references public.job_seekers(id) on delete set null,
  owner_account_manager_id uuid references public.account_managers(id) on delete set null,
  scheduled_for timestamptz,
  status text not null default 'booked'
    check (status in ('booked', 'completed', 'no_show', 'cancelled')),
  outcome text,
  decision text
    check (decision in ('qualified', 'nurture', 'disqualified', 'defer')),
  meeting_link text,
  notes text,
  booked_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  completed_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_consultation_records_lead
  on public.consultation_records(lead_submission_id, created_at desc);

create index if not exists idx_consultation_records_seeker
  on public.consultation_records(job_seeker_id, created_at desc);

create index if not exists idx_consultation_records_owner
  on public.consultation_records(owner_account_manager_id, created_at desc);

create index if not exists idx_consultation_records_status_due
  on public.consultation_records(status, scheduled_for);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (
       select 1 from pg_trigger where tgname = 'trg_consultation_records_updated_at'
     ) then
    create trigger trg_consultation_records_updated_at
      before update on public.consultation_records
      for each row execute function public.set_updated_at();
  end if;
end
$$;

create table if not exists public.outcome_events (
  id uuid primary key default gen_random_uuid(),
  event_type public.outcome_event_type not null,
  occurred_at timestamptz not null,
  lead_submission_id uuid references public.lead_intake_submissions(id) on delete set null,
  job_seeker_id uuid references public.job_seekers(id) on delete set null,
  consultation_record_id uuid references public.consultation_records(id) on delete set null,
  application_run_id uuid references public.application_runs(id) on delete set null,
  interview_id uuid references public.interviews(id) on delete set null,
  accepted_offer_record_id uuid references public.accepted_offer_records(id) on delete set null,
  payment_screenshot_id uuid references public.payment_screenshots(id) on delete set null,
  registration_payment_id uuid references public.registration_payments(id) on delete set null,
  voice_call_id uuid references public.voice_calls(id) on delete set null,
  actor_user_id uuid,
  actor_account_manager_id uuid references public.account_managers(id) on delete set null,
  owner_account_manager_id_snapshot uuid references public.account_managers(id) on delete set null,
  source_channel public.outcome_source_channel not null,
  source_record_type text,
  source_record_id uuid,
  event_value numeric,
  currency_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_outcome_events_type_occurred
  on public.outcome_events(event_type, occurred_at desc);

create index if not exists idx_outcome_events_seeker_occurred
  on public.outcome_events(job_seeker_id, occurred_at desc);

create index if not exists idx_outcome_events_lead_occurred
  on public.outcome_events(lead_submission_id, occurred_at desc);

create index if not exists idx_outcome_events_owner_occurred
  on public.outcome_events(owner_account_manager_id_snapshot, occurred_at desc);

create index if not exists idx_outcome_events_source_occurred
  on public.outcome_events(source_channel, occurred_at desc);

create index if not exists idx_outcome_events_consultation
  on public.outcome_events(consultation_record_id)
  where consultation_record_id is not null;

create index if not exists idx_outcome_events_application_run
  on public.outcome_events(application_run_id)
  where application_run_id is not null;

create index if not exists idx_outcome_events_interview
  on public.outcome_events(interview_id)
  where interview_id is not null;

create index if not exists idx_outcome_events_offer
  on public.outcome_events(accepted_offer_record_id)
  where accepted_offer_record_id is not null;

create unique index if not exists idx_outcome_events_dedup
  on public.outcome_events(event_type, source_record_type, source_record_id)
  where source_record_type is not null
    and source_record_id is not null;

alter table public.consultation_records enable row level security;
alter table public.outcome_events enable row level security;

drop policy if exists "service_role_all_consultation_records" on public.consultation_records;
create policy "service_role_all_consultation_records"
  on public.consultation_records for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_outcome_events" on public.outcome_events;
create policy "service_role_all_outcome_events"
  on public.outcome_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
