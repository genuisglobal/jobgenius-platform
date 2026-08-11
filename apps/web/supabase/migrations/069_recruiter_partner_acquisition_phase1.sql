alter table public.recruiters
  add column if not exists phone text,
  add column if not exists company_domain text,
  add column if not exists company_website text,
  add column if not exists partner_type text,
  add column if not exists intake_source text,
  add column if not exists preferred_contact_method text,
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists owner_account_manager_id uuid references public.account_managers(id) on delete set null,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiters_partner_type_check'
  ) then
    alter table public.recruiters
      add constraint recruiters_partner_type_check
      check (
        partner_type is null
        or partner_type in (
          'in_house',
          'agency',
          'staffing_partner',
          'search_firm',
          'independent_recruiter'
        )
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiters_intake_source_check'
  ) then
    alter table public.recruiters
      add constraint recruiters_intake_source_check
      check (
        intake_source is null
        or intake_source in ('public_form', 'manual_add', 'outbound', 'import', 'referral')
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiters_preferred_contact_method_check'
  ) then
    alter table public.recruiters
      add constraint recruiters_preferred_contact_method_check
      check (
        preferred_contact_method is null
        or preferred_contact_method in ('email', 'phone', 'linkedin')
      )
      not valid;
  end if;
end $$;

create index if not exists recruiters_partner_type_idx
  on public.recruiters (partner_type, created_at desc);

create index if not exists recruiters_owner_account_manager_idx
  on public.recruiters (owner_account_manager_id, created_at desc);

create index if not exists recruiters_company_domain_idx
  on public.recruiters (company_domain);

drop policy if exists "admin_select_recruiters_global" on public.recruiters;
create policy "admin_select_recruiters_global"
  on public.recruiters for select
  using (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "admin_update_recruiters_global" on public.recruiters;
create policy "admin_update_recruiters_global"
  on public.recruiters for update
  using (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

create table if not exists public.recruiter_role_requests (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  submitted_by_name text,
  submitted_by_email text not null,
  persona_type text not null,
  company_name text not null,
  client_company_name text,
  role_title text,
  job_url text,
  location text not null,
  employment_type text,
  seniority_level text,
  hiring_urgency text,
  details text,
  internal_note text,
  status text not null default 'new',
  assigned_account_manager_id uuid references public.account_managers(id) on delete set null,
  first_response_at timestamptz,
  last_outbound_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_role_requests_persona_type_check'
  ) then
    alter table public.recruiter_role_requests
      add constraint recruiter_role_requests_persona_type_check
      check (persona_type in ('in_house', 'agency'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_role_requests_status_check'
  ) then
    alter table public.recruiter_role_requests
      add constraint recruiter_role_requests_status_check
      check (
        status in (
          'new',
          'reviewing',
          'qualified',
          'awaiting_details',
          'candidate_shortlist_sent',
          'active',
          'closed',
          'rejected'
        )
      )
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_role_requests_hiring_urgency_check'
  ) then
    alter table public.recruiter_role_requests
      add constraint recruiter_role_requests_hiring_urgency_check
      check (
        hiring_urgency is null
        or hiring_urgency in ('standard', 'urgent', 'immediate')
      )
      not valid;
  end if;
end $$;

create index if not exists recruiter_role_requests_status_created_idx
  on public.recruiter_role_requests (status, created_at desc);

create index if not exists recruiter_role_requests_persona_status_idx
  on public.recruiter_role_requests (persona_type, status, created_at desc);

create index if not exists recruiter_role_requests_assigned_idx
  on public.recruiter_role_requests (assigned_account_manager_id, status, created_at desc);

create index if not exists recruiter_role_requests_recruiter_idx
  on public.recruiter_role_requests (recruiter_id, created_at desc);

create index if not exists recruiter_role_requests_submitted_email_idx
  on public.recruiter_role_requests (submitted_by_email, created_at desc);

alter table public.recruiter_role_requests enable row level security;

drop policy if exists "admin_select_recruiter_role_requests" on public.recruiter_role_requests;
create policy "admin_select_recruiter_role_requests"
  on public.recruiter_role_requests for select
  using (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "admin_insert_recruiter_role_requests" on public.recruiter_role_requests;
create policy "admin_insert_recruiter_role_requests"
  on public.recruiter_role_requests for insert
  with check (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "admin_update_recruiter_role_requests" on public.recruiter_role_requests;
create policy "admin_update_recruiter_role_requests"
  on public.recruiter_role_requests for update
  using (
    exists (
      select 1
      from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
        and role in ('admin', 'superadmin')
    )
  );

drop policy if exists "service_role_all_recruiter_role_requests" on public.recruiter_role_requests;
create policy "service_role_all_recruiter_role_requests"
  on public.recruiter_role_requests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
