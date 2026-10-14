-- ============================================================
-- Migration 097: Client Delivery Command Center foundation
-- Delivery overlay tables + derived snapshot view
-- ============================================================

create type client_delivery_stage as enum (
  'onboarding',
  'ready_to_launch',
  'active_search',
  'interviewing',
  'offer',
  'placed',
  'paused'
);

create type client_delivery_risk_level as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type client_delivery_blocker_type as enum (
  'seeker_unresponsive',
  'billing_hold',
  'document_gap',
  'resume_gap',
  'availability_conflict',
  'interview_prep_gap',
  'recruiter_reply_pending',
  'background_check',
  'offer_decision',
  'internal_ops',
  'technical_issue'
);

create type client_delivery_blocker_status as enum (
  'active',
  'resolved',
  'escalated'
);

create type client_delivery_action_type as enum (
  'application_push',
  'outreach_follow_up',
  'interview_prep',
  'client_check_in',
  'billing_follow_up',
  'document_request',
  'offer_support',
  'manager_escalation'
);

create table if not exists public.client_delivery_cases (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null unique references public.job_seekers(id) on delete cascade,
  account_manager_id uuid references public.account_managers(id) on delete set null,
  stage_override client_delivery_stage,
  risk_level client_delivery_risk_level not null default 'low',
  paused boolean not null default false,
  next_action_type client_delivery_action_type,
  next_action_title text,
  next_action_notes text,
  next_action_due_at timestamptz,
  next_action_completed_at timestamptz,
  next_action_completed_by uuid references public.account_managers(id) on delete set null,
  manager_notes text,
  last_manual_review_at timestamptz,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_delivery_cases_account_manager
  on public.client_delivery_cases(account_manager_id);

create index if not exists idx_client_delivery_cases_risk_due
  on public.client_delivery_cases(risk_level, next_action_due_at)
  where paused = false;

create table if not exists public.client_delivery_blockers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.client_delivery_cases(id) on delete cascade,
  blocker_type client_delivery_blocker_type not null,
  status client_delivery_blocker_status not null default 'active',
  title text not null,
  description text,
  owner_account_manager_id uuid references public.account_managers(id) on delete set null,
  due_at timestamptz,
  escalated boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.account_managers(id) on delete set null,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_delivery_blockers_case_status
  on public.client_delivery_blockers(case_id, status);

create index if not exists idx_client_delivery_blockers_due
  on public.client_delivery_blockers(status, due_at);

alter table public.client_delivery_cases enable row level security;
alter table public.client_delivery_blockers enable row level security;

drop policy if exists "service_role_all_client_delivery_cases" on public.client_delivery_cases;
create policy "service_role_all_client_delivery_cases"
  on public.client_delivery_cases
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_client_delivery_blockers" on public.client_delivery_blockers;
create policy "service_role_all_client_delivery_blockers"
  on public.client_delivery_blockers
  for all
  to service_role
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_client_delivery_cases_updated_at'
  ) then
    create trigger trg_client_delivery_cases_updated_at
      before update on public.client_delivery_cases
      for each row execute function set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_client_delivery_blockers_updated_at'
  ) then
    create trigger trg_client_delivery_blockers_updated_at
      before update on public.client_delivery_blockers
      for each row execute function set_updated_at();
  end if;
end $$;

with active_delivery_seekers as (
  select
    js.id as job_seeker_id,
    jsa.account_manager_id
  from public.job_seekers js
  left join public.job_seeker_assignments jsa
    on jsa.job_seeker_id = js.id
  where exists (
    select 1
    from public.job_seeker_intake_states intake
    where intake.job_seeker_id = js.id
      and intake.status = 'active_client'
  )
    or exists (
      select 1
      from public.registration_payments rp
      where rp.job_seeker_id = js.id
        and (
          coalesce(rp.work_started, false)
          or coalesce(rp.amount_paid, 0) > 0
        )
    )
    or exists (
      select 1
      from public.application_runs ar
      where ar.job_seeker_id = js.id
    )
    or exists (
      select 1
      from public.recruiter_threads rt
      where rt.job_seeker_id = js.id
    )
    or exists (
      select 1
      from public.interviews i
      where i.job_seeker_id = js.id
    )
    or exists (
      select 1
      from public.job_offers jo
      where jo.job_seeker_id = js.id
    )
)
insert into public.client_delivery_cases (
  job_seeker_id,
  account_manager_id,
  created_at,
  updated_at
)
select
  ads.job_seeker_id,
  ads.account_manager_id,
  now(),
  now()
from active_delivery_seekers ads
on conflict (job_seeker_id) do update
set account_manager_id = coalesce(public.client_delivery_cases.account_manager_id, excluded.account_manager_id);

drop view if exists public.v_client_delivery_snapshot;

create or replace view public.v_client_delivery_snapshot as
with latest_assignments as (
  select
    jsa.job_seeker_id,
    jsa.account_manager_id,
    jsa.created_at
  from public.job_seeker_assignments jsa
),
latest_intake as (
  select *
  from (
    select
      intake.*,
      row_number() over (
        partition by intake.job_seeker_id
        order by coalesce(intake.updated_at, intake.created_at) desc
      ) as rn
    from public.job_seeker_intake_states intake
  ) ranked
  where rn = 1
),
latest_payments as (
  select *
  from (
    select
      rp.*,
      row_number() over (
        partition by rp.job_seeker_id
        order by coalesce(rp.updated_at, rp.created_at) desc
      ) as rn
    from public.registration_payments rp
  ) ranked
  where rn = 1
),
latest_contracts as (
  select *
  from (
    select
      contract.*,
      row_number() over (
        partition by contract.job_seeker_id
        order by coalesce(contract.updated_at, contract.created_at) desc
      ) as rn
    from public.job_seeker_contracts contract
  ) ranked
  where rn = 1
),
application_metrics as (
  select
    ar.job_seeker_id,
    max(coalesce(ar.updated_at, ar.created_at)) as last_application_touch_at,
    max(coalesce(ar.updated_at, ar.created_at))
      filter (where ar.status in ('APPLIED', 'COMPLETED')) as last_application_at,
    count(*) filter (
      where ar.status in ('APPLIED', 'COMPLETED')
        and coalesce(ar.updated_at, ar.created_at) >= now() - interval '7 days'
    )::int as applications_7d,
    count(*) filter (
      where ar.status in ('APPLIED', 'COMPLETED')
        and coalesce(ar.updated_at, ar.created_at) >= now() - interval '30 days'
    )::int as applications_30d,
    count(*) filter (
      where ar.status in ('READY', 'RUNNING', 'RETRYING', 'NEEDS_ATTENTION')
    )::int as open_application_runs
  from public.application_runs ar
  group by ar.job_seeker_id
),
queue_metrics as (
  select
    aq.job_seeker_id,
    count(*) filter (
      where coalesce(aq.status, 'QUEUED') not in ('APPLIED', 'FAILED', 'CANCELLED', 'COMPLETED')
    )::int as open_queue_count,
    max(aq.created_at) as last_queue_at
  from public.application_queue aq
  group by aq.job_seeker_id
),
outreach_metrics as (
  select
    rt.job_seeker_id,
    max(
      greatest(
        coalesce(rt.updated_at, rt.created_at),
        coalesce(rt.last_reply_at, rt.created_at),
        coalesce(om.sent_at, om.created_at)
      )
    ) as last_outreach_touch_at,
    max(coalesce(om.sent_at, om.created_at))
      filter (where om.direction = 'outbound') as last_outreach_at,
    min(rt.next_follow_up_at)
      filter (
        where rt.thread_status = 'FOLLOW_UP_DUE'
          and rt.next_follow_up_at is not null
      ) as next_follow_up_at,
    count(*) filter (
      where rt.thread_status in ('ACTIVE', 'WAITING_REPLY', 'FOLLOW_UP_DUE')
    )::int as active_thread_count,
    count(*) filter (
      where rt.thread_status = 'FOLLOW_UP_DUE'
    )::int as follow_ups_due_count
  from public.recruiter_threads rt
  left join public.outreach_messages om
    on om.recruiter_thread_id = rt.id
  group by rt.job_seeker_id
),
interview_metrics as (
  select
    i.job_seeker_id,
    max(
      greatest(
        coalesce(i.updated_at, i.created_at),
        coalesce(i.confirmed_at, i.created_at),
        coalesce(i.scheduled_at, i.created_at)
      )
    ) as last_interview_touch_at,
    min(i.scheduled_at)
      filter (
        where i.status in ('pending_candidate', 'confirmed')
          and i.scheduled_at is not null
          and i.scheduled_at >= now() - interval '12 hours'
      ) as next_interview_at,
    count(*) filter (
      where i.status in ('pending_candidate', 'confirmed')
    )::int as open_interview_count
  from public.interviews i
  group by i.job_seeker_id
),
prep_metrics as (
  select
    ip.job_seeker_id,
    max(coalesce(ip.updated_at, ip.created_at)) as last_prep_at,
    count(*)::int as prep_count
  from public.interview_prep ip
  group by ip.job_seeker_id
),
offer_metrics as (
  select
    jo.job_seeker_id,
    max(
      greatest(
        jo.created_at,
        coalesce(jo.seeker_confirmed_at, jo.created_at),
        coalesce(jo.am_confirmed_at, jo.created_at),
        coalesce(jo.offer_accepted_at::timestamptz, jo.created_at),
        coalesce(jo.start_date::timestamptz, jo.created_at)
      )
    ) as last_offer_touch_at,
    max(jo.created_at) as last_offer_at,
    bool_or(
      jo.status in ('reported', 'confirmed')
      or (
        jo.status = 'accepted'
        and (jo.start_date is null or jo.start_date > current_date)
      )
    ) as has_open_offer,
    bool_or(
      jo.status = 'accepted'
      and jo.start_date is not null
      and jo.start_date <= current_date
    ) as has_placed_offer,
    min(jo.start_date)
      filter (
        where jo.status = 'accepted'
          and jo.start_date is not null
          and jo.start_date > current_date
      ) as next_start_date
  from public.job_offers jo
  group by jo.job_seeker_id
),
escalation_metrics as (
  select
    te.job_seeker_id,
    bool_or(te.decision is null) as has_active_escalation,
    max(coalesce(te.updated_at, te.created_at)) as last_escalation_at
  from public.termination_escalations te
  group by te.job_seeker_id
),
blocker_metrics as (
  select
    cdc.job_seeker_id,
    count(*) filter (where cdb.status = 'active')::int as active_blocker_count,
    coalesce(
      array_agg(cdb.title order by cdb.created_at desc)
        filter (where cdb.status = 'active'),
      '{}'::text[]
    ) as active_blocker_titles,
    min(cdb.due_at) filter (where cdb.status = 'active') as next_blocker_due_at,
    max(
      greatest(
        coalesce(cdb.updated_at, cdb.created_at),
        coalesce(cdb.resolved_at, cdb.created_at)
      )
    ) as last_blocker_touch_at
  from public.client_delivery_cases cdc
  left join public.client_delivery_blockers cdb
    on cdb.case_id = cdc.id
  group by cdc.job_seeker_id
),
base as (
  select
    js.id as job_seeker_id,
    js.full_name,
    js.email,
    js.location,
    js.seniority,
    js.target_titles,
    js.created_at as seeker_created_at,
    coalesce(cdc.account_manager_id, la.account_manager_id) as account_manager_id,
    cdc.id as case_id,
    cdc.stage_override,
    cdc.risk_level,
    cdc.paused,
    cdc.next_action_type,
    cdc.next_action_title,
    cdc.next_action_notes,
    cdc.next_action_due_at,
    cdc.next_action_completed_at,
    cdc.next_action_completed_by,
    cdc.manager_notes,
    cdc.last_manual_review_at,
    cdc.created_at as case_created_at,
    cdc.updated_at as case_updated_at,
    li.status as intake_status,
    li.onboarding_completed_at,
    coalesce(lp.work_started, false) as work_started,
    lp.status as payment_status,
    lp.amount_paid,
    lp.total_amount,
    lp.payment_deadline,
    lp.created_at as payment_created_at,
    lp.updated_at as payment_updated_at,
    lc.agreed_at as contract_agreed_at,
    lc.updated_at as contract_updated_at,
    coalesce(am.last_application_at, null) as last_application_at,
    coalesce(am.applications_7d, 0) as applications_7d,
    coalesce(am.applications_30d, 0) as applications_30d,
    coalesce(am.open_application_runs, 0) as open_application_runs,
    coalesce(qm.open_queue_count, 0) as open_queue_count,
    om.last_outreach_at,
    om.next_follow_up_at,
    coalesce(om.active_thread_count, 0) as active_thread_count,
    coalesce(om.follow_ups_due_count, 0) as follow_ups_due_count,
    im.next_interview_at,
    coalesce(im.open_interview_count, 0) as open_interview_count,
    coalesce(pm.prep_count, 0) as prep_count,
    offer.last_offer_at,
    coalesce(offer.has_open_offer, false) as has_open_offer,
    coalesce(offer.has_placed_offer, false) as has_placed_offer,
    offer.next_start_date,
    coalesce(em.has_active_escalation, false) as has_active_escalation,
    coalesce(bm.active_blocker_count, 0) as active_blocker_count,
    coalesce(bm.active_blocker_titles, '{}'::text[]) as active_blocker_titles,
    greatest(
      js.created_at,
      coalesce(cdc.updated_at, cdc.created_at, js.created_at),
      coalesce(am.last_application_touch_at, js.created_at),
      coalesce(qm.last_queue_at, js.created_at),
      coalesce(om.last_outreach_touch_at, js.created_at),
      coalesce(im.last_interview_touch_at, js.created_at),
      coalesce(pm.last_prep_at, js.created_at),
      coalesce(offer.last_offer_touch_at, js.created_at),
      coalesce(em.last_escalation_at, js.created_at),
      coalesce(bm.last_blocker_touch_at, js.created_at),
      coalesce(li.updated_at, js.created_at),
      coalesce(lp.updated_at, js.created_at),
      coalesce(lc.updated_at, js.created_at)
    ) as last_touch_at
  from public.job_seekers js
  left join latest_assignments la
    on la.job_seeker_id = js.id
  left join public.client_delivery_cases cdc
    on cdc.job_seeker_id = js.id
  left join latest_intake li
    on li.job_seeker_id = js.id
  left join latest_payments lp
    on lp.job_seeker_id = js.id
  left join latest_contracts lc
    on lc.job_seeker_id = js.id
  left join application_metrics am
    on am.job_seeker_id = js.id
  left join queue_metrics qm
    on qm.job_seeker_id = js.id
  left join outreach_metrics om
    on om.job_seeker_id = js.id
  left join interview_metrics im
    on im.job_seeker_id = js.id
  left join prep_metrics pm
    on pm.job_seeker_id = js.id
  left join offer_metrics offer
    on offer.job_seeker_id = js.id
  left join escalation_metrics em
    on em.job_seeker_id = js.id
  left join blocker_metrics bm
    on bm.job_seeker_id = js.id
  where
    cdc.id is not null
    or coalesce(li.status, '') = 'active_client'
    or coalesce(lp.work_started, false)
    or coalesce(am.last_application_touch_at, null) is not null
    or coalesce(om.last_outreach_touch_at, null) is not null
    or coalesce(im.last_interview_touch_at, null) is not null
    or coalesce(offer.last_offer_touch_at, null) is not null
),
staged as (
  select
    base.*,
    (
      coalesce(base.payment_status::text, '') = 'overdue'
      or (
        base.work_started
        and base.payment_deadline is not null
        and base.payment_deadline < now()
        and coalesce(base.payment_status::text, '') <> 'complete'
      )
    ) as has_payment_hold,
    case
      when base.has_placed_offer then 'placed'::client_delivery_stage
      when base.has_open_offer then 'offer'::client_delivery_stage
      when base.next_interview_at is not null or base.open_interview_count > 0 then 'interviewing'::client_delivery_stage
      when (
        base.open_application_runs > 0
        or base.open_queue_count > 0
        or base.applications_30d > 0
        or base.active_thread_count > 0
        or (base.last_outreach_at is not null and base.last_outreach_at >= now() - interval '30 days')
      ) then 'active_search'::client_delivery_stage
      when (
        (base.work_started or coalesce(base.intake_status, '') = 'active_client')
        and base.onboarding_completed_at is null
      ) then 'onboarding'::client_delivery_stage
      when (
        base.work_started or coalesce(base.intake_status, '') = 'active_client'
      ) then 'ready_to_launch'::client_delivery_stage
      else 'onboarding'::client_delivery_stage
    end as system_stage
  from base
)
select
  staged.case_id,
  staged.job_seeker_id,
  staged.account_manager_id,
  staged.full_name,
  staged.email,
  staged.location,
  staged.seniority,
  staged.target_titles,
  staged.intake_status,
  staged.work_started,
  staged.payment_status::text as payment_status,
  staged.amount_paid,
  staged.total_amount,
  staged.payment_deadline,
  staged.system_stage,
  case
    when staged.paused then 'paused'::client_delivery_stage
    when staged.stage_override is not null then staged.stage_override
    else staged.system_stage
  end as effective_stage,
  staged.stage_override,
  staged.risk_level,
  staged.paused,
  staged.last_application_at,
  staged.applications_7d,
  staged.applications_30d,
  staged.open_application_runs,
  staged.open_queue_count,
  staged.last_outreach_at,
  staged.next_follow_up_at,
  staged.active_thread_count,
  staged.follow_ups_due_count,
  staged.next_interview_at,
  staged.open_interview_count,
  staged.prep_count,
  staged.last_offer_at,
  staged.has_open_offer,
  staged.has_placed_offer,
  staged.next_start_date,
  staged.has_payment_hold,
  staged.has_active_escalation,
  staged.active_blocker_count,
  staged.active_blocker_titles,
  staged.next_action_type,
  staged.next_action_title,
  staged.next_action_notes,
  staged.next_action_due_at,
  staged.next_action_completed_at,
  staged.next_action_completed_by,
  staged.manager_notes,
  staged.last_manual_review_at,
  (
    staged.next_action_due_at is not null
    and staged.next_action_completed_at is null
    and staged.next_action_due_at < now()
  ) as overdue_next_action,
  staged.last_touch_at,
  greatest(
    floor(extract(epoch from (now() - staged.last_touch_at)) / 86400)::int,
    0
  ) as days_since_last_touch,
  (
    staged.active_blocker_count > 0
    or staged.has_payment_hold
    or staged.has_active_escalation
    or (
      staged.next_action_due_at is not null
      and staged.next_action_completed_at is null
      and staged.next_action_due_at < now()
    )
    or staged.risk_level in ('high', 'critical')
    or staged.last_touch_at <= now() - interval '5 days'
    or (
      staged.next_follow_up_at is not null
      and staged.next_follow_up_at <= now()
    )
  ) as needs_attention,
  staged.case_created_at,
  staged.case_updated_at
from staged;

comment on view public.v_client_delivery_snapshot is
  'Derived delivery operating snapshot for post-sale managed job seekers.';
