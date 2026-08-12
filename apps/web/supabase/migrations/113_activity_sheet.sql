-- ============================================================
-- Migration 113: Activity Sheet
--
-- Replaces the daily work report system (migration 095) with the
-- shared sheet the team actually used before the platform existed:
-- one row per client per day, five numbers the account manager types
-- in, and everybody sees everybody's.
--
-- What went away and why: 095 asked an AM to write three narrative
-- comments (summary / blockers / focus-next), submit the day for
-- review, and wait for a people manager to lock it — plus it split
-- every metric into system-detected vs manually-entered. Nobody fills
-- that in daily. A sheet with five number cells does get filled in,
-- and because it is visible team-wide it drives the competition that
-- made the original Google Sheet work.
-- ============================================================

create table if not exists public.activity_sheet_entries (
  id uuid primary key default gen_random_uuid(),
  -- Local calendar day the work happened on (not a timestamp — the
  -- sheet is a day grid, and AMs backfill yesterday).
  entry_date date not null,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  -- Who typed the numbers. Stamped at write time rather than derived
  -- on read, so reassigning a client later does not silently move
  -- last month's credit to a different AM's leaderboard.
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,

  easy_applications   integer not null default 0 check (easy_applications   between 0 and 500),
  company_applications integer not null default 0 check (company_applications between 0 and 500),
  follow_ups          integer not null default 0 check (follow_ups          between 0 and 500),
  interviews          integer not null default 0 check (interviews          between 0 and 500),
  offers              integer not null default 0 check (offers              between 0 and 500),

  -- Optional free text, e.g. "First stage interview with DTMB-AS-MSP"
  -- — the old sheet used the Interviews cell for this.
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per client per day. The AM is not part of the key: two
  -- AMs must not be able to double-log the same client's day.
  unique (entry_date, job_seeker_id)
);

-- The sheet view: everyone's rows for one day.
create index if not exists idx_activity_sheet_entries_date
  on public.activity_sheet_entries (entry_date desc);

-- The leaderboard: one AM's rows over a date range.
create index if not exists idx_activity_sheet_entries_am_date
  on public.activity_sheet_entries (account_manager_id, entry_date desc);

-- A client's own history.
create index if not exists idx_activity_sheet_entries_seeker_date
  on public.activity_sheet_entries (job_seeker_id, entry_date desc);

alter table public.activity_sheet_entries enable row level security;

drop policy if exists "service_role_all_activity_sheet_entries" on public.activity_sheet_entries;
create policy "service_role_all_activity_sheet_entries"
  on public.activity_sheet_entries
  for all
  to service_role
  using (true)
  with check (true);

-- Every account manager reads the whole sheet — that is the point.
drop policy if exists "am_select_all_activity_sheet_entries" on public.activity_sheet_entries;
create policy "am_select_all_activity_sheet_entries"
  on public.activity_sheet_entries
  for select
  using (
    exists (
      select 1
      from public.account_managers am
      where am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- But only writes their own rows.
drop policy if exists "am_insert_own_activity_sheet_entries" on public.activity_sheet_entries;
create policy "am_insert_own_activity_sheet_entries"
  on public.activity_sheet_entries
  for insert
  with check (
    exists (
      select 1
      from public.account_managers am
      where am.id = activity_sheet_entries.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_own_activity_sheet_entries" on public.activity_sheet_entries;
create policy "am_update_own_activity_sheet_entries"
  on public.activity_sheet_entries
  for update
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = activity_sheet_entries.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_activity_sheet_entries_updated_at on public.activity_sheet_entries;
create trigger trg_activity_sheet_entries_updated_at
  before update on public.activity_sheet_entries
  for each row execute function set_updated_at();

comment on table public.activity_sheet_entries is
  'Shared team activity sheet: one row per client per day, counts typed in by the assigned account manager. Replaces daily_work_reports + manual_work_activity_logs (migration 095).';

-- ============================================================
-- Retire migration 095.
--
-- IRREVERSIBLE: this drops every historical daily work report and
-- manual activity log. If you want that history, snapshot the two
-- tables before running this migration, or comment out this block
-- and drop them once you are satisfied the sheet has replaced them.
-- ============================================================

drop table if exists public.manual_work_activity_logs;
drop table if exists public.daily_work_reports;
