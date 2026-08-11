-- Migration 067: Capacity and intake approval phase 2
-- Adds seeker intake states, AM monthly capacity, and links registration payments to intake state.

create table if not exists public.job_seeker_intake_states (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null unique references public.job_seekers(id) on delete cascade,
  selected_plan plan_type,
  offer_path text not null default 'discount' check (offer_path in ('discount', 'strategy_preview')),
  submitted_code text,
  discount_source text,
  discount_code text,
  base_registration_fee numeric(10,2),
  discount_amount numeric(10,2) not null default 0,
  final_registration_fee numeric(10,2),
  status text not null default 'draft' check (
    status in (
      'draft',
      'submitted',
      'pending_review',
      'waitlisted',
      'approved_preview',
      'preview_active',
      'preview_expired',
      'approved_payment_pending',
      'active_client',
      'rejected'
    )
  ),
  onboarding_completed_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  waitlisted_at timestamptz,
  rejected_at timestamptz,
  assigned_account_manager_id uuid references public.account_managers(id) on delete set null,
  reviewed_by uuid references public.account_managers(id) on delete set null,
  capacity_month date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_seeker_intake_states_status
  on public.job_seeker_intake_states(status);

create index if not exists idx_job_seeker_intake_states_capacity
  on public.job_seeker_intake_states(capacity_month, status);

create index if not exists idx_job_seeker_intake_states_assigned_am
  on public.job_seeker_intake_states(assigned_account_manager_id, capacity_month);

alter table public.job_seeker_intake_states enable row level security;

drop policy if exists "service_role_all_job_seeker_intake_states" on public.job_seeker_intake_states;
create policy "service_role_all_job_seeker_intake_states"
  on public.job_seeker_intake_states
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.account_manager_capacity (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  capacity_month date not null,
  monthly_new_client_limit int not null default 4 check (monthly_new_client_limit >= 0 and monthly_new_client_limit <= 50),
  notes text,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_manager_id, capacity_month)
);

create index if not exists idx_account_manager_capacity_month
  on public.account_manager_capacity(capacity_month);

alter table public.account_manager_capacity enable row level security;

drop policy if exists "service_role_all_account_manager_capacity" on public.account_manager_capacity;
create policy "service_role_all_account_manager_capacity"
  on public.account_manager_capacity
  for all
  to service_role
  using (true)
  with check (true);

alter table public.registration_payments
  add column if not exists intake_state_id uuid references public.job_seeker_intake_states(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_job_seeker_intake_states_updated_at'
  ) then
    create trigger trg_job_seeker_intake_states_updated_at
      before update on public.job_seeker_intake_states
      for each row execute function set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_account_manager_capacity_updated_at'
  ) then
    create trigger trg_account_manager_capacity_updated_at
      before update on public.account_manager_capacity
      for each row execute function set_updated_at();
  end if;
end $$;

with latest_contracts as (
  select *
  from (
    select
      c.*,
      row_number() over (partition by c.job_seeker_id order by c.created_at desc) as rn
    from public.job_seeker_contracts c
  ) ranked
  where rn = 1
),
latest_payments as (
  select *
  from (
    select
      rp.*,
      row_number() over (partition by rp.job_seeker_id order by rp.created_at desc) as rn
    from public.registration_payments rp
  ) ranked
  where rn = 1
),
latest_assignments as (
  select *
  from (
    select
      a.*,
      row_number() over (partition by a.job_seeker_id order by a.created_at desc) as rn
    from public.job_seeker_assignments a
  ) ranked
  where rn = 1
)
insert into public.job_seeker_intake_states (
  job_seeker_id,
  selected_plan,
  offer_path,
  submitted_code,
  discount_source,
  discount_code,
  base_registration_fee,
  discount_amount,
  final_registration_fee,
  status,
  onboarding_completed_at,
  submitted_at,
  reviewed_at,
  approved_at,
  assigned_account_manager_id,
  capacity_month,
  metadata
)
select
  js.id,
  coalesce(lc.plan_type, js.plan_type) as selected_plan,
  'discount' as offer_path,
  js.offer_code,
  lc.discount_source,
  lc.discount_code,
  coalesce(lc.base_registration_fee, lc.registration_fee) as base_registration_fee,
  coalesce(lc.discount_amount, 0) as discount_amount,
  coalesce(lc.final_registration_fee, lc.registration_fee) as final_registration_fee,
  case
    when coalesce(lp.work_started, false) then 'active_client'
    when lc.id is not null then 'approved_payment_pending'
    when js.onboarding_completed_at is not null then 'pending_review'
    else 'draft'
  end as status,
  js.onboarding_completed_at,
  case
    when js.onboarding_completed_at is not null then js.onboarding_completed_at
    else null
  end as submitted_at,
  case
    when lc.id is not null then coalesce(lc.agreed_at, lc.created_at)
    else null
  end as reviewed_at,
  case
    when lc.id is not null then coalesce(lc.agreed_at, lc.created_at)
    else null
  end as approved_at,
  la.account_manager_id,
  date_trunc('month', coalesce(lc.agreed_at, js.onboarding_completed_at, js.created_at))::date as capacity_month,
  jsonb_build_object(
    'backfilled_from_phase1', true
  ) as metadata
from public.job_seekers js
left join latest_contracts lc
  on lc.job_seeker_id = js.id
left join latest_payments lp
  on lp.job_seeker_id = js.id
left join latest_assignments la
  on la.job_seeker_id = js.id
where not exists (
  select 1
  from public.job_seeker_intake_states existing
  where existing.job_seeker_id = js.id
)
and (
  js.onboarding_completed_at is not null
  or lc.id is not null
  or js.plan_type is not null
);

update public.registration_payments rp
set intake_state_id = intake.id
from public.job_seeker_intake_states intake
where rp.job_seeker_id = intake.job_seeker_id
and rp.intake_state_id is null;
