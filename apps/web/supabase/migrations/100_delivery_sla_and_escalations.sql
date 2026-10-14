-- ============================================================
-- Migration 100: Delivery Phase 2 SLA and escalation controls
-- Adds escalation workflow and case review metadata on top of
-- the Client Delivery Command Center foundation.
-- ============================================================

do $$
begin
  create type client_delivery_escalation_status as enum (
    'none',
    'needs_manager_review',
    'manager_reviewed',
    'ops_escalated',
    'resolved'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type client_delivery_escalation_reason as enum (
    'client_unresponsive',
    'low_market_fit',
    'delivery_execution_gap',
    'blocker_unresolved',
    'interview_readiness',
    'payment_or_contract_hold',
    'offer_or_background_issue',
    'manager_attention_requested',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.client_delivery_cases
  add column if not exists escalation_status client_delivery_escalation_status not null default 'none',
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  add column if not exists manager_reviewed_at timestamptz,
  add column if not exists manager_reviewed_by_account_manager_id uuid references public.account_managers(id) on delete set null;

create index if not exists idx_client_delivery_cases_escalation_status
  on public.client_delivery_cases(escalation_status, account_manager_id);

create table if not exists public.client_delivery_escalations (
  id uuid primary key default gen_random_uuid(),
  delivery_case_id uuid not null references public.client_delivery_cases(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  status client_delivery_escalation_status not null default 'needs_manager_review',
  reason client_delivery_escalation_reason not null,
  details text,
  opened_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  reviewed_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  resolved_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  opened_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_delivery_escalations_case_status
  on public.client_delivery_escalations(delivery_case_id, status, opened_at desc);

create index if not exists idx_client_delivery_escalations_job_seeker
  on public.client_delivery_escalations(job_seeker_id, opened_at desc);

alter table public.client_delivery_escalations enable row level security;

drop policy if exists "service_role_all_client_delivery_escalations" on public.client_delivery_escalations;
create policy "service_role_all_client_delivery_escalations"
  on public.client_delivery_escalations
  for all
  to service_role
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_client_delivery_escalations_updated_at'
  ) then
    create trigger trg_client_delivery_escalations_updated_at
      before update on public.client_delivery_escalations
      for each row execute function set_updated_at();
  end if;
end $$;
