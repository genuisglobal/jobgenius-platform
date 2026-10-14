alter table public.recruiter_role_requests
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_inbound_action_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_role_requests_last_inbound_action_type_check'
  ) then
    alter table public.recruiter_role_requests
      add constraint recruiter_role_requests_last_inbound_action_type_check
      check (
        last_inbound_action_type is null
        or last_inbound_action_type in (
          'send_profiles',
          'add_details',
          'not_hiring',
          'wrong_contact',
          'refer_teammate'
        )
      )
      not valid;
  end if;
end $$;

create index if not exists recruiter_role_requests_last_inbound_idx
  on public.recruiter_role_requests (last_inbound_at desc);

create table if not exists public.recruiter_partner_activity (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  role_request_id uuid references public.recruiter_role_requests(id) on delete cascade,
  activity_type text not null,
  source text not null default 'system',
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_partner_activity_source_check'
  ) then
    alter table public.recruiter_partner_activity
      add constraint recruiter_partner_activity_source_check
      check (source in ('system', 'admin', 'recruiter', 'intake'))
      not valid;
  end if;
end $$;

create index if not exists recruiter_partner_activity_role_request_idx
  on public.recruiter_partner_activity (role_request_id, created_at desc);

create index if not exists recruiter_partner_activity_recruiter_idx
  on public.recruiter_partner_activity (recruiter_id, created_at desc);

create index if not exists recruiter_partner_activity_type_idx
  on public.recruiter_partner_activity (activity_type, created_at desc);

alter table public.recruiter_partner_activity enable row level security;

drop policy if exists "admin_select_recruiter_partner_activity" on public.recruiter_partner_activity;
create policy "admin_select_recruiter_partner_activity"
  on public.recruiter_partner_activity for select
  using (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "admin_insert_recruiter_partner_activity" on public.recruiter_partner_activity;
create policy "admin_insert_recruiter_partner_activity"
  on public.recruiter_partner_activity for insert
  with check (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "service_role_all_recruiter_partner_activity" on public.recruiter_partner_activity;
create policy "service_role_all_recruiter_partner_activity"
  on public.recruiter_partner_activity for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.recruiter_partner_action_tokens (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  role_request_id uuid not null references public.recruiter_role_requests(id) on delete cascade,
  action_type text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_partner_action_tokens_action_type_check'
  ) then
    alter table public.recruiter_partner_action_tokens
      add constraint recruiter_partner_action_tokens_action_type_check
      check (
        action_type in (
          'send_profiles',
          'add_details',
          'not_hiring',
          'wrong_contact',
          'refer_teammate'
        )
      )
      not valid;
  end if;
end $$;

create index if not exists recruiter_partner_action_tokens_role_request_idx
  on public.recruiter_partner_action_tokens (role_request_id, created_at desc);

create index if not exists recruiter_partner_action_tokens_expires_idx
  on public.recruiter_partner_action_tokens (expires_at);

create index if not exists recruiter_partner_action_tokens_unused_idx
  on public.recruiter_partner_action_tokens (role_request_id, action_type)
  where used_at is null;

alter table public.recruiter_partner_action_tokens enable row level security;

drop policy if exists "service_role_all_recruiter_partner_action_tokens" on public.recruiter_partner_action_tokens;
create policy "service_role_all_recruiter_partner_action_tokens"
  on public.recruiter_partner_action_tokens for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
