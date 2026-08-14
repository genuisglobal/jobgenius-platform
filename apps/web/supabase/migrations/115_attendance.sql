-- ============================================================
-- Migration 115: Office attendance clock
--
-- One record per account manager per working day: they sign in on
-- arrival, toggle breaks through the day, and sign out when they leave.
-- Visible to the whole team, same open model as the Activity Sheet.
--
-- Timezone: every instant is stored as timestamptz (UTC). `work_date` is
-- the WAT calendar day the shift belongs to — West Africa Time is UTC+1
-- year-round with no daylight saving, so a WAT date never straddles two
-- offsets and this stays a stable key. The application derives it via
-- Africa/Lagos; never write it from a client's local clock.
-- ============================================================

create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  -- WAT calendar date. See the timezone note above.
  work_date date not null,
  signed_in_at timestamptz not null,
  signed_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Someone cannot leave before they arrived.
  constraint chk_attendance_days_order
    check (signed_out_at is null or signed_out_at >= signed_in_at),

  -- One shift per person per day.
  unique (account_manager_id, work_date)
);

-- The team view: everyone's day.
create index if not exists idx_attendance_days_work_date
  on public.attendance_days (work_date desc);

-- One person's history.
create index if not exists idx_attendance_days_am_date
  on public.attendance_days (account_manager_id, work_date desc);

create table if not exists public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null
    references public.attendance_days(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_attendance_breaks_order
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_attendance_breaks_day
  on public.attendance_breaks (attendance_day_id, started_at);

-- A day can have many breaks but only one running at a time. Enforced here
-- rather than in application code so a double-click cannot open two.
create unique index if not exists idx_attendance_breaks_single_open
  on public.attendance_breaks (attendance_day_id)
  where ended_at is null;

alter table public.attendance_days enable row level security;
alter table public.attendance_breaks enable row level security;

drop policy if exists "service_role_all_attendance_days" on public.attendance_days;
create policy "service_role_all_attendance_days"
  on public.attendance_days for all to service_role
  using (true) with check (true);

drop policy if exists "service_role_all_attendance_breaks" on public.attendance_breaks;
create policy "service_role_all_attendance_breaks"
  on public.attendance_breaks for all to service_role
  using (true) with check (true);

-- Every account manager reads the whole board — that is the point.
drop policy if exists "am_select_all_attendance_days" on public.attendance_days;
create policy "am_select_all_attendance_days"
  on public.attendance_days for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_all_attendance_breaks" on public.attendance_breaks;
create policy "am_select_all_attendance_breaks"
  on public.attendance_breaks for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- But clocks only themselves in and out.
drop policy if exists "am_insert_own_attendance_days" on public.attendance_days;
create policy "am_insert_own_attendance_days"
  on public.attendance_days for insert
  with check (
    exists (
      select 1 from public.account_managers am
      where am.id = attendance_days.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_own_attendance_days" on public.attendance_days;
create policy "am_update_own_attendance_days"
  on public.attendance_days for update
  using (
    exists (
      select 1 from public.account_managers am
      where am.id = attendance_days.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_attendance_days_updated_at on public.attendance_days;
create trigger trg_attendance_days_updated_at
  before update on public.attendance_days
  for each row execute function set_updated_at();

drop trigger if exists trg_attendance_breaks_updated_at on public.attendance_breaks;
create trigger trg_attendance_breaks_updated_at
  before update on public.attendance_breaks
  for each row execute function set_updated_at();

comment on table public.attendance_days is
  'Office attendance: one sign-in/sign-out shift per account manager per WAT day.';
comment on column public.attendance_days.work_date is
  'WAT (Africa/Lagos, UTC+1, no DST) calendar date the shift belongs to.';
comment on table public.attendance_breaks is
  'Breaks within a shift. At most one may be open (ended_at is null) at a time.';
