-- ============================================================
-- Migration 098: Delivery tasks in the AM Today queue
-- Extends v_am_tasks with command-center delivery work:
--   1. overdue next actions
--   2. blockers due in the next 24 hours
--   3. stale cases with no touch in 5+ days
--   4. high-risk cases with no manual review in 48h
-- ============================================================

create index if not exists idx_client_delivery_blockers_active_due
  on public.client_delivery_blockers(case_id, due_at)
  where status = 'active';

create or replace view public.v_am_tasks as
with raw_tasks as (
  -- 1. Attention items (existing manual-intervention queue)
  select
    a.assigned_am_id                            as am_id,
    'attention_item'::text                      as kind,
    a.id::text                                  as source_id,
    'attention_item:' || a.id::text             as task_key,
    coalesce(a.reason, 'Attention required')    as title,
    null::text                                  as body,
    8                                           as priority,
    a.created_at                                as due_at,
    '/dashboard/attention?item=' || a.id::text  as link_url,
    jsonb_build_object(
      'queue_id', a.queue_id,
      'reason', a.reason
    )                                           as meta,
    a.created_at                                as created_at
  from public.attention_items a
  where a.status = 'OPEN'
    and a.assigned_am_id is not null

  union all

  -- 2. Job offers with overdue commission for an AM's assigned seekers
  select
    jsa.account_manager_id                       as am_id,
    'billing_overdue'::text                      as kind,
    jo.id::text                                  as source_id,
    'billing_overdue:' || jo.id::text            as task_key,
    'Commission overdue: ' || jo.company         as title,
    'Offer accepted ' || jo.offer_accepted_at::text as body,
    9                                            as priority,
    coalesce(jo.commission_extended_due_date, jo.commission_due_date)::timestamptz
                                                 as due_at,
    '/dashboard/seekers/' || jo.job_seeker_id::text || '?tab=billing'
                                                 as link_url,
    jsonb_build_object(
      'commission_amount', jo.commission_amount,
      'company', jo.company,
      'role', jo.role
    )                                            as meta,
    jo.created_at                                as created_at
  from public.job_offers jo
  join public.job_seeker_assignments jsa
    on jsa.job_seeker_id = jo.job_seeker_id
  where jo.commission_status in ('pending', 'partial', 'overdue')
    and coalesce(jo.commission_extended_due_date, jo.commission_due_date) < now()::date

  union all

  -- 3. Issued payslips awaiting acknowledgement by an AM who is also a worker
  select
    pw.account_manager_id                        as am_id,
    'payslip_sign'::text                         as kind,
    p.id::text                                   as source_id,
    'payslip_sign:' || p.id::text                as task_key,
    'Payslip awaiting your signature'            as title,
    'Period ' || coalesce(pp.label, p.pay_period_id::text) as body,
    5                                            as priority,
    coalesce(p.issued_at, p.created_at)          as due_at,
    '/dashboard/me/payslips'                     as link_url,
    jsonb_build_object(
      'net_pay', p.net_pay,
      'currency', p.currency,
      'period_label', pp.label
    )                                            as meta,
    p.created_at                                 as created_at
  from public.payslips p
  join public.payroll_workers pw on pw.id = p.worker_id
  left join public.pay_periods pp on pp.id = p.pay_period_id
  where p.status in ('issued', 'paid')
    and p.acknowledged_at is null
    and pw.account_manager_id is not null

  union all

  -- 4. Outreach replies with AI drafts awaiting approval
  select
    jsa.account_manager_id                       as am_id,
    'outreach_reply'::text                       as kind,
    om.id::text                                  as source_id,
    'outreach_reply:' || om.id::text             as task_key,
    'Reply needs review'                         as title,
    coalesce(om.subject, '(no subject)')         as body,
    7                                            as priority,
    om.replied_at                                as due_at,
    '/dashboard/outreach/threads/' || rt.id::text as link_url,
    jsonb_build_object(
      'classification', to_jsonb(om) ->> 'reply_classification',
      'ai_draft_status', coalesce(to_jsonb(om) ->> 'ai_draft_status', 'none')
    )                                            as meta,
    om.replied_at                                as created_at
  from public.outreach_messages om
  join public.recruiter_threads rt on rt.id = om.recruiter_thread_id
  join public.job_seeker_assignments jsa on jsa.job_seeker_id = rt.job_seeker_id
  where coalesce(to_jsonb(om) ->> 'ai_draft_status', 'none') = 'generated'
    and om.replied_at is not null

  union all

  -- 5. Interviews in the next 48h that are not confirmed
  select
    jsa.account_manager_id                        as am_id,
    'interview_upcoming'::text                    as kind,
    i.id::text                                    as source_id,
    'interview_upcoming:' || i.id::text           as task_key,
    'Interview: ' || coalesce(jp.company, 'company tbd') as title,
    'Scheduled ' || i.scheduled_at::text          as body,
    6                                             as priority,
    i.scheduled_at                                as due_at,
    '/dashboard/interviews/' || i.id::text        as link_url,
    jsonb_build_object(
      'company', jp.company,
      'role', jp.title,
      'scheduled_at', i.scheduled_at
    )                                             as meta,
    i.created_at                                  as created_at
  from public.interviews i
  left join public.job_posts jp on jp.id = i.job_post_id
  join public.job_seeker_assignments jsa on jsa.job_seeker_id = i.job_seeker_id
  where i.scheduled_at between now() and now() + interval '48 hours'
    and coalesce(i.status::text, 'pending_candidate') <> 'confirmed'

  union all

  -- 6. Delivery next action overdue
  select
    cds.account_manager_id                        as am_id,
    'delivery_next_action'::text                  as kind,
    coalesce(cds.case_id::text, cds.job_seeker_id::text) as source_id,
    'delivery_next_action:' || coalesce(cds.case_id::text, cds.job_seeker_id::text)
                                                 as task_key,
    'Delivery action overdue: ' || cds.full_name as title,
    coalesce(cds.next_action_title, 'Review delivery case') as body,
    case
      when cds.risk_level = 'critical' then 10
      when cds.risk_level = 'high' then 9
      else 8
    end                                           as priority,
    cds.next_action_due_at                        as due_at,
    '/dashboard/seekers/' || cds.job_seeker_id::text as link_url,
    jsonb_build_object(
      'job_seeker_id', cds.job_seeker_id,
      'stage', cds.effective_stage,
      'risk', cds.risk_level,
      'next_action_type', cds.next_action_type,
      'next_action_due_at', cds.next_action_due_at
    )                                             as meta,
    coalesce(cds.case_updated_at, cds.last_touch_at) as created_at
  from public.v_client_delivery_snapshot cds
  where cds.account_manager_id is not null
    and cds.paused = false
    and cds.overdue_next_action = true

  union all

  -- 7. Delivery blockers due in the next 24 hours
  select
    cds.account_manager_id                        as am_id,
    'delivery_blocker'::text                      as kind,
    cdb.id::text                                  as source_id,
    'delivery_blocker:' || cdb.id::text           as task_key,
    'Blocker due: ' || cds.full_name              as title,
    cdb.title                                     as body,
    case
      when coalesce(cdb.escalated, false) then 10
      else 8
    end                                           as priority,
    cdb.due_at                                    as due_at,
    '/dashboard/seekers/' || cds.job_seeker_id::text as link_url,
    jsonb_build_object(
      'job_seeker_id', cds.job_seeker_id,
      'blocker_type', cdb.blocker_type,
      'blocker_status', cdb.status,
      'escalated', cdb.escalated
    )                                             as meta,
    cdb.created_at                                as created_at
  from public.client_delivery_blockers cdb
  join public.client_delivery_cases cdc on cdc.id = cdb.case_id
  join public.v_client_delivery_snapshot cds on cds.case_id = cdc.id
  where cdb.status = 'active'
    and cdb.due_at is not null
    and cdb.due_at between now() and now() + interval '24 hours'
    and cds.account_manager_id is not null
    and cds.paused = false

  union all

  -- 8. Delivery cases stale with no touch in 5+ days
  select
    cds.account_manager_id                        as am_id,
    'delivery_stale'::text                        as kind,
    coalesce(cds.case_id::text, cds.job_seeker_id::text) as source_id,
    'delivery_stale:' || coalesce(cds.case_id::text, cds.job_seeker_id::text)
                                                 as task_key,
    'Stale delivery case: ' || cds.full_name      as title,
    'No meaningful touch in ' || cds.days_since_last_touch::text || ' days'
                                                 as body,
    case
      when cds.risk_level in ('high', 'critical') then 9
      else 7
    end                                           as priority,
    (cds.last_touch_at + interval '5 days')       as due_at,
    '/dashboard/seekers/' || cds.job_seeker_id::text as link_url,
    jsonb_build_object(
      'job_seeker_id', cds.job_seeker_id,
      'stage', cds.effective_stage,
      'risk', cds.risk_level,
      'days_since_last_touch', cds.days_since_last_touch
    )                                             as meta,
    cds.last_touch_at                             as created_at
  from public.v_client_delivery_snapshot cds
  where cds.account_manager_id is not null
    and cds.paused = false
    and cds.days_since_last_touch >= 5
    and cds.has_placed_offer = false

  union all

  -- 9. High-risk cases without manual review in the last 48h
  select
    cds.account_manager_id                        as am_id,
    'delivery_risk_review'::text                  as kind,
    coalesce(cds.case_id::text, cds.job_seeker_id::text) as source_id,
    'delivery_risk_review:' || coalesce(cds.case_id::text, cds.job_seeker_id::text)
                                                 as task_key,
    'High-risk case needs review: ' || cds.full_name as title,
    coalesce(cds.manager_notes, cds.next_action_title, 'Review blocker, follow-up, and execution plan')
                                                 as body,
    case
      when cds.risk_level = 'critical' then 10
      else 9
    end                                           as priority,
    (
      coalesce(cds.last_manual_review_at, cds.case_updated_at, cds.last_touch_at)
      + interval '48 hours'
    )                                             as due_at,
    '/dashboard/seekers/' || cds.job_seeker_id::text as link_url,
    jsonb_build_object(
      'job_seeker_id', cds.job_seeker_id,
      'stage', cds.effective_stage,
      'risk', cds.risk_level,
      'last_manual_review_at', cds.last_manual_review_at
    )                                             as meta,
    coalesce(cds.case_updated_at, cds.last_touch_at) as created_at
  from public.v_client_delivery_snapshot cds
  where cds.account_manager_id is not null
    and cds.paused = false
    and cds.risk_level in ('high', 'critical')
    and (
      cds.last_manual_review_at is null
      or cds.last_manual_review_at < now() - interval '48 hours'
    )
)
select
  rt.*
from raw_tasks rt
left join public.am_task_dismissals d
  on d.am_id = rt.am_id
 and d.task_key = rt.task_key
 and (d.action = 'resolve' or d.snooze_until > now())
where d.id is null;

comment on view public.v_am_tasks is
  'Unified AM task queue. Includes attention, billing, payslips, outreach, interviews, and delivery control tasks. ORDER BY priority DESC, due_at ASC. Dismissals via am_task_dismissals.';
