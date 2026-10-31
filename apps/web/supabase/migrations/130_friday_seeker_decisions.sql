-- One decision and follow-through action per assigned seeker per Friday review week.
create table if not exists public.friday_seeker_decisions (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  decision text not null check (char_length(decision) between 1 and 2000),
  next_action text not null check (char_length(next_action) between 1 and 500),
  owner_account_manager_id uuid not null references public.account_managers(id),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  recorded_by uuid references public.account_managers(id),
  updated_by uuid references public.account_managers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, job_seeker_id)
);

create index if not exists friday_seeker_decisions_open_idx
  on public.friday_seeker_decisions(owner_account_manager_id, due_date)
  where status = 'open';

alter table public.friday_seeker_decisions enable row level security;
create policy "service_role_all_friday_seeker_decisions"
  on public.friday_seeker_decisions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create trigger trg_friday_seeker_decisions_updated_at
  before update on public.friday_seeker_decisions
  for each row execute function public.set_updated_at();
