-- 125: Emi lead-qualification agent.
-- Adds the qualification result, categorisation and next-step fields Emi's
-- post-call analysis writes onto each lead, plus the founder's background
-- notes the caller brief is built from. Additive and backward-safe.

begin;

alter table public.lead_intake_submissions
  add column if not exists temperature text
    check (temperature in ('hot', 'warm', 'nurture', 'realign', 'disqualified')),
  add column if not exists niche text
    check (niche in (
      'cybersecurity_grc', 'it_infrastructure', 'database', 'project_management',
      'construction_safety', 'other'
    )),
  add column if not exists fit_score int check (fit_score between 0 and 100),
  -- Structured answers collected across calls (Emi's custom analysis fields).
  add column if not exists qualification jsonb not null default '{}'::jsonb,
  add column if not exists next_action text
    check (next_action in (
      'call', 'callback', 'founder_call', 'founder_review', 'nurture_email', 'closed'
    )),
  add column if not exists next_action_at timestamptz,
  -- IANA zone (e.g. America/Chicago); null = unknown, dispatcher uses a window safe for all US zones.
  add column if not exists timezone text,
  -- Founder-written context for Emi (LinkedIn conversation, referral notes, ...).
  add column if not exists agent_background text,
  -- 'founder' = Fidelis takes this lead himself; Emi never calls it.
  add column if not exists handled_by text not null default 'emi'
    check (handled_by in ('emi', 'founder')),
  add column if not exists call_attempts int not null default 0,
  add column if not exists disqualify_reason text,
  add column if not exists qualified_at timestamptz;

create index if not exists lead_intake_temperature_idx
  on public.lead_intake_submissions(temperature, created_at desc);

-- Widen the source list for LinkedIn / booking / referral leads.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid = 'public.lead_intake_submissions'::regclass
      and pg_get_constraintdef(c.oid) ilike '%source%'
  loop
    execute format('alter table public.lead_intake_submissions drop constraint %I', r.conname);
  end loop;
end$$;

alter table public.lead_intake_submissions
  add constraint lead_intake_submissions_source_check
  check (source in (
    'signup', 'marketing_form', 'excel_import', 'manual', 'linkedin', 'cal_booking', 'referral'
  ));

-- Webhook idempotency for lead outcomes: Retell sends call_ended and
-- call_analyzed (and retries); the lead is advanced exactly once per call.
alter table public.voice_calls
  add column if not exists outcome_applied_at timestamptz;

commit;
