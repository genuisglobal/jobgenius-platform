-- ============================================================
-- Migration 096: Employee permissions and authorizations
-- Allowance windows plus employee permission/authorization requests.
-- ============================================================

create type employee_permission_period_kind as enum (
  'six_months',
  'one_year',
  'two_years'
);

create type employee_permission_request_type as enum (
  'permission',
  'authorization'
);

create type employee_permission_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table if not exists employee_permission_policies (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period_kind employee_permission_period_kind not null,
  period_start_date date not null,
  period_end_date date not null,
  allowed_days integer not null check (allowed_days >= 0 and allowed_days <= 365),
  active boolean not null default true,
  notes text,
  configured_by uuid references account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end_date >= period_start_date)
);

create unique index if not exists idx_employee_permission_policies_active_employee
  on employee_permission_policies (employee_id)
  where active = true;

create index if not exists idx_employee_permission_policies_employee_created
  on employee_permission_policies (employee_id, created_at desc);

create table if not exists employee_permission_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  policy_id uuid references employee_permission_policies(id) on delete set null,
  request_type employee_permission_request_type not null default 'permission',
  title text not null,
  reason text,
  requested_start_date date not null,
  requested_end_date date not null,
  requested_days integer not null check (requested_days > 0 and requested_days <= 365),
  approved_days integer check (
    approved_days is null or (approved_days >= 0 and approved_days <= requested_days)
  ),
  status employee_permission_request_status not null default 'pending',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references account_managers(id) on delete set null,
  manager_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_end_date >= requested_start_date)
);

create index if not exists idx_employee_permission_requests_employee_created
  on employee_permission_requests (employee_id, created_at desc);

create index if not exists idx_employee_permission_requests_status_created
  on employee_permission_requests (status, created_at desc);

create index if not exists idx_employee_permission_requests_policy_status
  on employee_permission_requests (policy_id, status);

alter table employee_permission_policies enable row level security;
alter table employee_permission_requests enable row level security;

drop policy if exists "service_role_all_employee_permission_policies" on employee_permission_policies;
create policy "service_role_all_employee_permission_policies"
  on employee_permission_policies
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_employee_permission_requests" on employee_permission_requests;
create policy "service_role_all_employee_permission_requests"
  on employee_permission_requests
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "employee_select_own_permission_policies" on employee_permission_policies;
create policy "employee_select_own_permission_policies"
  on employee_permission_policies
  for select
  using (
    exists (
      select 1
      from employees e
      join account_managers am
        on am.id = e.account_manager_id
      where e.id = employee_permission_policies.employee_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "employee_select_own_permission_requests" on employee_permission_requests;
create policy "employee_select_own_permission_requests"
  on employee_permission_requests
  for select
  using (
    exists (
      select 1
      from employees e
      join account_managers am
        on am.id = e.account_manager_id
      where e.id = employee_permission_requests.employee_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "employee_insert_own_permission_requests" on employee_permission_requests;
create policy "employee_insert_own_permission_requests"
  on employee_permission_requests
  for insert
  with check (
    exists (
      select 1
      from employees e
      join account_managers am
        on am.id = e.account_manager_id
      where e.id = employee_permission_requests.employee_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_employee_permission_policies_updated_at on employee_permission_policies;
create trigger trg_employee_permission_policies_updated_at
  before update on employee_permission_policies
  for each row execute function set_updated_at();

drop trigger if exists trg_employee_permission_requests_updated_at on employee_permission_requests;
create trigger trg_employee_permission_requests_updated_at
  before update on employee_permission_requests
  for each row execute function set_updated_at();

comment on table employee_permission_policies is
  'Allowance windows that define how many permission/authorization days an employee may request over 6-month, 1-year, or 2-year periods.';

comment on table employee_permission_requests is
  'Employee permission/authorization day requests linked to the allowance policy active when the request was submitted.';
