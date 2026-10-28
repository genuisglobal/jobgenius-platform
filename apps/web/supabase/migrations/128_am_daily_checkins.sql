-- A short, structured daily reflection beside the activity sheet.
-- Self-reported distraction is coaching context, never an automated
-- performance score or disciplinary record.
create table if not exists public.am_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  work_date date not null,
  sheet_status text not null check (sheet_status in ('complete', 'needs_update', 'no_client_work')),
  focus_area text not null check (focus_area in ('applications', 'outreach', 'interviews', 'client_support', 'other')),
  blocker_kind text not null check (blocker_kind in ('none', 'client_info', 'technical', 'capacity', 'other')),
  distraction_level text check (distraction_level in ('none', 'some', 'significant', 'prefer_not_to_say')),
  next_step text check (char_length(next_step) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_manager_id, work_date)
);

create index if not exists idx_am_daily_checkins_date on public.am_daily_checkins (work_date desc);
alter table public.am_daily_checkins enable row level security;

create policy "service_role_all_am_daily_checkins" on public.am_daily_checkins
  for all to service_role using (true) with check (true);

create policy "am_select_own_daily_checkins" on public.am_daily_checkins
  for select using (exists (
    select 1 from public.account_managers am
    where am.id = am_daily_checkins.account_manager_id
      and am.email = coalesce(auth.jwt() ->> 'email', '')
  ));

drop trigger if exists trg_am_daily_checkins_updated_at on public.am_daily_checkins;
create trigger trg_am_daily_checkins_updated_at before update on public.am_daily_checkins
  for each row execute function set_updated_at();
