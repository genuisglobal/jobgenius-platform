create table if not exists public.recruiter_magic_links (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  role_request_id uuid references public.recruiter_role_requests(id) on delete set null,
  token_hash text not null unique,
  sent_to_email text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists recruiter_magic_links_recruiter_idx
  on public.recruiter_magic_links (recruiter_id, created_at desc);

create index if not exists recruiter_magic_links_expires_idx
  on public.recruiter_magic_links (expires_at);

create index if not exists recruiter_magic_links_unused_idx
  on public.recruiter_magic_links (recruiter_id, used_at, expires_at);

create table if not exists public.recruiter_partner_sessions (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  magic_link_id uuid references public.recruiter_magic_links(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists recruiter_partner_sessions_recruiter_idx
  on public.recruiter_partner_sessions (recruiter_id, created_at desc);

create index if not exists recruiter_partner_sessions_expires_idx
  on public.recruiter_partner_sessions (expires_at);

alter table public.recruiter_magic_links enable row level security;
alter table public.recruiter_partner_sessions enable row level security;

drop policy if exists "service_role_all_recruiter_magic_links" on public.recruiter_magic_links;
create policy "service_role_all_recruiter_magic_links"
  on public.recruiter_magic_links for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_recruiter_partner_sessions" on public.recruiter_partner_sessions;
create policy "service_role_all_recruiter_partner_sessions"
  on public.recruiter_partner_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
