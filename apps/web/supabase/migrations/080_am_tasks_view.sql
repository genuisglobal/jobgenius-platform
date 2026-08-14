-- ============================================================
-- Migration 080: AM Task Inbox view (v_am_tasks)
-- Aggregates everything an AM needs to act on into one queryable
-- surface. Backed by an am_task_dismissals table so the AM can
-- snooze/resolve individual tasks without mutating source rows.
-- ============================================================

-- ─── am_task_dismissals ─────────────────────────────────────

CREATE TABLE am_task_dismissals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  am_id         UUID NOT NULL REFERENCES account_managers(id) ON DELETE CASCADE,
  task_key      TEXT NOT NULL,            -- 'kind:source_id', e.g. 'attention_item:abc-123'
  action        TEXT NOT NULL CHECK (action IN ('snooze', 'resolve')),
  snooze_until  TIMESTAMPTZ,              -- for action='snooze'; the task reappears after this
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (am_id, task_key, action)
);

-- Partial-index predicates must be immutable, so split the hot paths:
--   1. resolved tasks
--   2. snoozed tasks with a non-null wake-up time
CREATE INDEX idx_am_task_dismissals_am_resolve
  ON am_task_dismissals (am_id, task_key)
  WHERE action = 'resolve';

CREATE INDEX idx_am_task_dismissals_am_snooze
  ON am_task_dismissals (am_id, task_key, snooze_until)
  WHERE action = 'snooze' AND snooze_until IS NOT NULL;

ALTER TABLE am_task_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_am_task_dismissals"
  ON am_task_dismissals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── v_am_tasks view ────────────────────────────────────────
-- One row per actionable item for an AM. Sources are UNION ALL'd:
--   1. attention_items assigned to the AM
--   2. job_offers where commission is overdue (billing escalation)
--   3. payslips awaiting worker signature (AMs who ARE workers)
--   4. outreach_messages with an AI draft awaiting approval
--   5. interviews in the next 48h that are not yet confirmed
--
-- The dismissal join filters out snoozed/resolved items.
-- Reading code should ORDER BY priority DESC, due_at ASC.
-- ============================================================

CREATE OR REPLACE VIEW v_am_tasks AS
WITH raw_tasks AS (
  -- 1. Attention items (existing manual-intervention queue)
  SELECT
    a.assigned_am_id                            AS am_id,
    'attention_item'::text                      AS kind,
    a.id::text                                  AS source_id,
    'attention_item:' || a.id::text             AS task_key,
    COALESCE(a.reason, 'Attention required')    AS title,
    NULL::text                                  AS body,
    8                                           AS priority,
    a.created_at                                AS due_at,
    '/dashboard/attention?item=' || a.id::text  AS link_url,
    jsonb_build_object(
      'queue_id', a.queue_id,
      'reason', a.reason
    )                                            AS meta,
    a.created_at                                AS created_at
  FROM attention_items a
  WHERE a.status = 'OPEN'
    AND a.assigned_am_id IS NOT NULL

  UNION ALL

  -- 2. Job offers with overdue commission for an AM's assigned seekers
  SELECT
    jsa.account_manager_id                       AS am_id,
    'billing_overdue'::text                      AS kind,
    jo.id::text                                  AS source_id,
    'billing_overdue:' || jo.id::text            AS task_key,
    'Commission overdue: ' || jo.company         AS title,
    'Offer accepted ' || jo.offer_accepted_at::text AS body,
    9                                            AS priority,
    COALESCE(jo.commission_extended_due_date, jo.commission_due_date)::timestamptz
                                                 AS due_at,
    '/dashboard/seekers/' || jo.job_seeker_id::text || '?tab=billing'
                                                 AS link_url,
    jsonb_build_object(
      'commission_amount', jo.commission_amount,
      'company', jo.company,
      'role', jo.role
    )                                            AS meta,
    jo.created_at                                AS created_at
  FROM job_offers jo
  JOIN job_seeker_assignments jsa
    ON jsa.job_seeker_id = jo.job_seeker_id
  WHERE jo.commission_status IN ('pending', 'partial', 'overdue')
    AND COALESCE(jo.commission_extended_due_date, jo.commission_due_date) < now()::date

  UNION ALL

  -- 3. Issued payslips that THIS AM (as a worker) hasn't acknowledged.
  --    Phase 1 audit flagged "no nudge to sign your own payslip".
  SELECT
    pw.account_manager_id                        AS am_id,
    'payslip_sign'::text                         AS kind,
    p.id::text                                   AS source_id,
    'payslip_sign:' || p.id::text                AS task_key,
    'Payslip awaiting your signature'            AS title,
    'Period ' || COALESCE(pp.label, p.pay_period_id::text) AS body,
    5                                            AS priority,
    COALESCE(p.issued_at, p.created_at)          AS due_at,
    '/dashboard/me/payslips'                     AS link_url,
    jsonb_build_object(
      'net_pay', p.net_pay,
      'currency', p.currency,
      'period_label', pp.label
    )                                            AS meta,
    p.created_at                                 AS created_at
  FROM payslips p
  JOIN payroll_workers pw ON pw.id = p.worker_id
  LEFT JOIN pay_periods pp ON pp.id = p.pay_period_id
  WHERE p.status IN ('issued', 'paid')
    AND p.acknowledged_at IS NULL
    AND pw.account_manager_id IS NOT NULL

  UNION ALL

  -- 4. Outreach replies with AI draft awaiting approval (assigned AM owns the seeker)
  SELECT
    jsa.account_manager_id                       AS am_id,
    'outreach_reply'::text                       AS kind,
    om.id::text                                  AS source_id,
    'outreach_reply:' || om.id::text             AS task_key,
    'Reply needs review'                         AS title,
    COALESCE(om.subject, '(no subject)')         AS body,
    7                                            AS priority,
    om.replied_at                                AS due_at,
    '/dashboard/outreach/threads/' || rt.id::text AS link_url,
    jsonb_build_object(
      'classification', to_jsonb(om) ->> 'reply_classification',
      'ai_draft_status', COALESCE(to_jsonb(om) ->> 'ai_draft_status', 'none')
    )                                            AS meta,
    om.replied_at                                AS created_at
  FROM outreach_messages om
  JOIN recruiter_threads rt ON rt.id = om.recruiter_thread_id
  JOIN job_seeker_assignments jsa ON jsa.job_seeker_id = rt.job_seeker_id
  WHERE COALESCE(to_jsonb(om) ->> 'ai_draft_status', 'none') = 'generated'
    AND om.replied_at IS NOT NULL

  UNION ALL

  -- 5. Interviews within the next 48h that aren't confirmed
  SELECT
    jsa.account_manager_id                       AS am_id,
    'interview_upcoming'::text                   AS kind,
    i.id::text                                   AS source_id,
    'interview_upcoming:' || i.id::text          AS task_key,
    'Interview: ' || COALESCE(jp.company, 'company tbd') AS title,
    'Scheduled ' || i.scheduled_at::text         AS body,
    6                                            AS priority,
    i.scheduled_at                               AS due_at,
    '/dashboard/interviews/' || i.id::text       AS link_url,
    jsonb_build_object(
      'company', jp.company,
      'role', jp.title,
      'scheduled_at', i.scheduled_at
    )                                            AS meta,
    i.created_at                                 AS created_at
  FROM interviews i
  LEFT JOIN job_posts jp ON jp.id = i.job_post_id
  JOIN job_seeker_assignments jsa ON jsa.job_seeker_id = i.job_seeker_id
  WHERE i.scheduled_at BETWEEN now() AND now() + interval '48 hours'
    AND COALESCE(i.status::text, 'pending_candidate') <> 'confirmed'
)
SELECT
  rt.*
FROM raw_tasks rt
LEFT JOIN am_task_dismissals d
  ON d.am_id = rt.am_id
 AND d.task_key = rt.task_key
 AND (d.action = 'resolve' OR d.snooze_until > now())
WHERE d.id IS NULL;

COMMENT ON VIEW v_am_tasks IS
  'Unified AM task queue. ORDER BY priority DESC, due_at ASC. Dismissals via am_task_dismissals.';
