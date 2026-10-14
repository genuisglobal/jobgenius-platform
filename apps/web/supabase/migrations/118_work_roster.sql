-- ============================================================
-- Migration 118: Who was expected in, and who was excused
--
-- The productivity report can only see people who appear in the data. An
-- account manager who simply never signs in has no shift, no activity, no
-- idle days — they do not appear at all. So the report could distinguish
-- "worked badly" from "worked well", but not either of those from "was
-- not there", and the one way to disappear from measurement entirely was
-- to stop clocking in.
--
-- Two tables close that hole:
--
--   work_schedules       which weekdays a person is expected in
--   attendance_exemptions  approved reasons a day does not count
--
-- ─── Missing rows mean the common case ───────────────────────────────────
--
-- A missing work_schedules row means Monday–Friday, the same way a missing
-- automation_policies row means enabled (migration 108). That is not
-- laziness: a roster nobody fills in is worse than no roster, because it
-- reports the whole team as absent. Defaulting to the ordinary week means
-- this works the day it ships with zero configuration, and only genuine
-- exceptions — a four-day week, a public holiday, someone's leave — ever
-- need typing in.
--
-- ─── Absence is reported, never folded into the rate ─────────────────────
--
-- A day someone was not there produces no hours and no activity. Dividing
-- by it would punish them twice for one absence and make the hourly rate
-- mean something different for part-timers than for everyone else. So
-- absent days are counted and shown on their own, and stay out of every
-- denominator.
-- ============================================================

create table if not exists public.work_schedules (
  account_manager_id uuid primary key
    references public.account_managers(id) on delete cascade,
  -- ISO weekday numbers: 1 = Monday … 7 = Sunday.
  work_days smallint[] not null default '{1,2,3,4,5}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.account_managers(id) on delete set null,

  -- Rejects an empty roster and any number outside a week. Without this a
  -- typo silently makes someone permanently absent or permanently excused.
  constraint chk_work_days_valid check (
    array_length(work_days, 1) between 1 and 7
    and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]
  )
);

create table if not exists public.attendance_exemptions (
  id uuid primary key default gen_random_uuid(),
  -- Null means the whole company: a public holiday, an office closure.
  -- Anything else is one person's leave.
  account_manager_id uuid
    references public.account_managers(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null,
  note text,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chk_exemption_order check (end_date >= start_date),
  constraint chk_exemption_reason check (
    reason in ('leave', 'holiday', 'sick', 'training', 'other')
  )
);

-- The roster lookup: every exemption overlapping a date range.
create index if not exists idx_attendance_exemptions_range
  on public.attendance_exemptions (start_date, end_date);

create index if not exists idx_attendance_exemptions_am
  on public.attendance_exemptions (account_manager_id, start_date desc);

alter table public.work_schedules enable row level security;
alter table public.attendance_exemptions enable row level security;

drop policy if exists "service_role_all_work_schedules" on public.work_schedules;
create policy "service_role_all_work_schedules"
  on public.work_schedules for all to service_role
  using (true) with check (true);

drop policy if exists "service_role_all_attendance_exemptions"
  on public.attendance_exemptions;
create policy "service_role_all_attendance_exemptions"
  on public.attendance_exemptions for all to service_role
  using (true) with check (true);

-- Everyone reads both: knowing who is on leave is how a team stops
-- assigning work to someone who is away. Writes go through the service
-- role, where the route checks for a people-manager role first.
drop policy if exists "am_select_all_work_schedules" on public.work_schedules;
create policy "am_select_all_work_schedules"
  on public.work_schedules for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_all_attendance_exemptions"
  on public.attendance_exemptions;
create policy "am_select_all_attendance_exemptions"
  on public.attendance_exemptions for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_work_schedules_updated_at on public.work_schedules;
create trigger trg_work_schedules_updated_at
  before update on public.work_schedules
  for each row execute function set_updated_at();

comment on table public.work_schedules is
  'Which weekdays an account manager is expected in. A missing row means Monday-Friday.';
comment on column public.work_schedules.work_days is
  'ISO weekday numbers, 1 = Monday through 7 = Sunday.';
comment on table public.attendance_exemptions is
  'Days that do not count as absence. account_manager_id null = whole company (public holiday).';
