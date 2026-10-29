-- Weekly peer recognition for the Friday achievements view.
-- Nominations are private until a people manager approves them.
create table if not exists public.am_peer_recognitions (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  nominator_am_id uuid not null references public.account_managers(id) on delete cascade,
  nominee_am_id uuid not null references public.account_managers(id) on delete cascade,
  contribution_type text not null check (contribution_type in ('client_help', 'blocker_help', 'teamwork')),
  detail text not null check (char_length(detail) between 20 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by_am_id uuid references public.account_managers(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (nominator_am_id <> nominee_am_id),
  unique (week_start, nominator_am_id, nominee_am_id)
);

create index if not exists idx_am_peer_recognitions_week_status
  on public.am_peer_recognitions (week_start desc, status);

-- Serialize a nominator's submissions so concurrent requests cannot exceed two.
create or replace function public.limit_am_peer_recognitions()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.nominator_am_id::text || ':' || new.week_start::text)::bigint);
  if (select count(*) from public.am_peer_recognitions
      where week_start = new.week_start and nominator_am_id = new.nominator_am_id) >= 2 then
    raise exception 'Weekly peer recognition limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limit_am_peer_recognitions on public.am_peer_recognitions;
create trigger trg_limit_am_peer_recognitions before insert on public.am_peer_recognitions
  for each row execute function public.limit_am_peer_recognitions();

alter table public.am_peer_recognitions enable row level security;
create policy "service_role_all_am_peer_recognitions" on public.am_peer_recognitions
  for all to service_role using (true) with check (true);
