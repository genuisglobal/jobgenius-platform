-- ============================================================
-- Migration 089: v_client_timeline view
-- Unifies all per-seeker events into one chronological feed:
--   resume versions, applications, outreach replies, interviews,
--   payments, contracts, payslips, AI outputs, feedback.
--
-- Consumed by /dashboard/seekers/[id]/timeline. Each source UNIONs in
-- a canonical shape (job_seeker_id, kind, at, title, body, link, meta).
-- ============================================================

CREATE OR REPLACE VIEW v_client_timeline AS

-- 1. Application runs (significant statuses only)
SELECT
  r.job_seeker_id                                 AS job_seeker_id,
  'application_run'::text                         AS kind,
  COALESCE(r.updated_at, r.created_at)            AS at,
  CASE
    WHEN r.status = 'APPLIED' THEN 'Application submitted'
    WHEN r.status = 'FAILED' THEN 'Application failed'
    WHEN r.status = 'NEEDS_ATTENTION' THEN 'Application paused'
    ELSE 'Application ' || lower(r.status)
  END                                              AS title,
  COALESCE(jp.title || ' @ ' || jp.company, 'Job') AS body,
  '/dashboard/attention?run=' || r.id::text        AS link,
  jsonb_build_object(
    'status', r.status,
    'ats_type', r.ats_type,
    'job_post_id', r.job_post_id,
    'last_error_code', r.last_error_code
  )                                                 AS meta
FROM application_runs r
LEFT JOIN job_posts jp ON jp.id = r.job_post_id
WHERE r.status IN ('APPLIED', 'FAILED', 'NEEDS_ATTENTION')

UNION ALL

-- 2. Outreach messages — both inbound replies and outbound sends
SELECT
  rt.job_seeker_id                                AS job_seeker_id,
  CASE WHEN om.direction = 'inbound'
    THEN 'outreach_reply'::text
    ELSE 'outreach_send'::text
  END                                              AS kind,
  COALESCE(om.replied_at, om.created_at)          AS at,
  CASE WHEN om.direction = 'inbound'
    THEN 'Reply received'
    ELSE 'Outreach sent'
  END                                              AS title,
  COALESCE(om.subject, '(no subject)')             AS body,
  '/dashboard/outreach/threads/' || rt.id::text    AS link,
  jsonb_build_object(
    'direction', om.direction,
    'classification', to_jsonb(om) ->> 'reply_classification',
    'status', om.status
  )                                                 AS meta
FROM outreach_messages om
JOIN recruiter_threads rt ON rt.id = om.recruiter_thread_id

UNION ALL

-- 3. Interviews
SELECT
  i.job_seeker_id                                  AS job_seeker_id,
  'interview'::text                                AS kind,
  COALESCE(i.scheduled_at, i.created_at)           AS at,
  COALESCE('Interview: ' || jp.company, 'Interview') AS title,
  COALESCE(jp.title, NULL)                         AS body,
  '/dashboard/interviews/' || i.id::text           AS link,
  jsonb_build_object(
    'company', jp.company,
    'role', jp.title,
    'confirmation_status', i.status,
    'scheduled_at', i.scheduled_at
  )                                                 AS meta
FROM interviews i
LEFT JOIN job_posts jp ON jp.id = i.job_post_id

UNION ALL

-- 4. Job offers
SELECT
  jo.job_seeker_id                                 AS job_seeker_id,
  'job_offer'::text                                AS kind,
  COALESCE(jo.offer_accepted_at::timestamptz, jo.created_at) AS at,
  'Offer ' || lower(jo.status::text) || ': ' || jo.company AS title,
  jo.role                                          AS body,
  '/dashboard/seekers/' || jo.job_seeker_id::text || '?tab=billing' AS link,
  jsonb_build_object(
    'company', jo.company,
    'role', jo.role,
    'base_salary', jo.base_salary,
    'commission_status', jo.commission_status
  )                                                 AS meta
FROM job_offers jo

UNION ALL

-- 5. Payments (registration_payments)
SELECT
  rp.job_seeker_id                                 AS job_seeker_id,
  'payment'::text                                  AS kind,
  rp.updated_at                                    AS at,
  'Payment ' || rp.status::text                    AS title,
  'Paid ' || rp.amount_paid::text || ' of ' || rp.total_amount::text AS body,
  '/dashboard/seekers/' || rp.job_seeker_id::text || '?tab=billing' AS link,
  jsonb_build_object(
    'amount_paid', rp.amount_paid,
    'total_amount', rp.total_amount,
    'status', rp.status
  )                                                 AS meta
FROM registration_payments rp

UNION ALL

-- 6. Client engagement contracts (signed)
SELECT
  jsc.job_seeker_id                                AS job_seeker_id,
  'contract_signed'::text                          AS kind,
  jsc.agreed_at                                    AS at,
  jsc.plan_type::text || ' plan signed'            AS title,
  'Registration fee: ' || jsc.registration_fee::text AS body,
  '/dashboard/seekers/' || jsc.job_seeker_id::text || '?tab=billing' AS link,
  jsonb_build_object(
    'plan_type', jsc.plan_type,
    'registration_fee', jsc.registration_fee,
    'commission_rate', jsc.commission_rate
  )                                                 AS meta
FROM job_seeker_contracts jsc
WHERE jsc.agreed_at IS NOT NULL

UNION ALL

-- 7. AI outputs that completed
SELECT
  ao.seeker_id                                     AS job_seeker_id,
  'ai_output'::text                                AS kind,
  COALESCE(ao.decided_at, ao.created_at)           AS at,
  ao.kind::text || ' ' || ao.status::text          AS title,
  ao.decision_notes                                AS body,
  '/dashboard/admin/ai-outputs?status=' || ao.status::text AS link,
  jsonb_build_object(
    'kind', ao.kind,
    'status', ao.status,
    'ref_type', ao.ref_type,
    'ref_id', ao.ref_id
  )                                                 AS meta
FROM ai_outputs ao
WHERE ao.seeker_id IS NOT NULL

UNION ALL

-- 8. Application feedback (rejections, ghosts, etc.)
SELECT
  af.job_seeker_id                                 AS job_seeker_id,
  'feedback'::text                                 AS kind,
  af.created_at                                    AS at,
  af.feedback_type                                 AS title,
  COALESCE(af.rejection_category::text || ' — ' || af.company, af.company) AS body,
  NULL::text                                        AS link,
  jsonb_build_object(
    'feedback_type', af.feedback_type,
    'rejection_category', af.rejection_category,
    'company', af.company,
    'role_title', af.role_title
  )                                                 AS meta
FROM application_feedback af;

COMMENT ON VIEW v_client_timeline IS
  'Unified per-seeker activity feed. ORDER BY at DESC. Source UNIONs may need column-name tweaks if local schemas drift.';
