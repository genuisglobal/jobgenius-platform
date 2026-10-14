-- ============================================================
-- Migration 095: Daily work reports phase 1
-- Adds self-reported daily work summaries plus manual activity
-- supplements for staff/account managers.
-- ============================================================

create table if not exists public.daily_work_reports (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  report_date date not null,
  summary_comment text,
  blockers_comment text,
  focus_next_comment text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'locked')),
  submitted_at timestamptz,
  locked_at timestamptz,
  locked_by_account_manager_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_manager_id, report_date)
);

create index if not exists idx_daily_work_reports_report_date
  on public.daily_work_reports (report_date desc);

create index if not exists idx_daily_work_reports_am_report_date
  on public.daily_work_reports (account_manager_id, report_date desc);

create table if not exists public.manual_work_activity_logs (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  report_date date not null,
  activity_type text not null check (
    activity_type in (
      'application_manual',
      'follow_up_manual',
      'interview_manual',
      'offer_manual'
    )
  ),
  quantity integer not null check (quantity > 0 and quantity <= 500),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_manual_work_activity_logs_report_date
  on public.manual_work_activity_logs (report_date desc);

create index if not exists idx_manual_work_activity_logs_am_report_date
  on public.manual_work_activity_logs (account_manager_id, report_date desc);

alter table public.daily_work_reports enable row level security;
alter table public.manual_work_activity_logs enable row level security;

drop policy if exists "service_role_all_daily_work_reports" on public.daily_work_reports;
create policy "service_role_all_daily_work_reports"
  on public.daily_work_reports
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_manual_work_activity_logs" on public.manual_work_activity_logs;
create policy "service_role_all_manual_work_activity_logs"
  on public.manual_work_activity_logs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "am_select_daily_work_reports" on public.daily_work_reports;
create policy "am_select_daily_work_reports"
  on public.daily_work_reports
  for select
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = daily_work_reports.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_write_own_daily_work_reports" on public.daily_work_reports;
create policy "am_write_own_daily_work_reports"
  on public.daily_work_reports
  for insert
  with check (
    exists (
      select 1
      from public.account_managers am
      where am.id = daily_work_reports.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_own_daily_work_reports" on public.daily_work_reports;
create policy "am_update_own_daily_work_reports"
  on public.daily_work_reports
  for update
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = daily_work_reports.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_manual_work_activity_logs" on public.manual_work_activity_logs;
create policy "am_select_manual_work_activity_logs"
  on public.manual_work_activity_logs
  for select
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = manual_work_activity_logs.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_manual_work_activity_logs" on public.manual_work_activity_logs;
create policy "am_insert_manual_work_activity_logs"
  on public.manual_work_activity_logs
  for insert
  with check (
    exists (
      select 1
      from public.account_managers am
      where am.id = manual_work_activity_logs.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_manual_work_activity_logs" on public.manual_work_activity_logs;
create policy "am_update_manual_work_activity_logs"
  on public.manual_work_activity_logs
  for update
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = manual_work_activity_logs.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_delete_manual_work_activity_logs" on public.manual_work_activity_logs;
create policy "am_delete_manual_work_activity_logs"
  on public.manual_work_activity_logs
  for delete
  using (
    exists (
      select 1
      from public.account_managers am
      where am.id = manual_work_activity_logs.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_daily_work_reports_updated_at on public.daily_work_reports;
create trigger trg_daily_work_reports_updated_at
  before update on public.daily_work_reports
  for each row execute function set_updated_at();

drop trigger if exists trg_manual_work_activity_logs_updated_at on public.manual_work_activity_logs;
create trigger trg_manual_work_activity_logs_updated_at
  before update on public.manual_work_activity_logs
  for each row execute function set_updated_at();

comment on table public.daily_work_reports is
  'Per-account-manager daily narrative report with status, comments, and blocker context.';

comment on table public.manual_work_activity_logs is
  'Manual count supplements for work the system cannot reliably detect automatically.';
