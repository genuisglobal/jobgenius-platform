-- Migration 094: Confirmed-Fact Ledger + Sensitive-Information Gate (Org Singularity Phase 1a)
-- Governs per-client facts with provenance + freshness so automation can only ASSERT
-- confirmed values; everything else becomes Ask/Escalate. Additive + backward-safe.
-- See docs/organizational-singularity/01-fact-ledger-and-decision-engine.md

begin;

-- Registry of known facts: sensitivity tier + freshness policy + inference policy.
create table if not exists public.fact_definitions (
  fact_key text primary key,
  label text not null,
  category text not null,
  sensitivity text not null default 'standard'
    check (sensitivity in ('standard', 'sensitive', 'legal')),
  value_type text not null default 'text'
    check (value_type in ('text', 'select', 'boolean', 'number', 'date', 'json')),
  default_ttl_days int,
  ai_inference_allowed boolean not null default false,
  applies_to text not null default 'both'
    check (applies_to in ('apply', 'recruiter', 'both')),
  created_at timestamptz not null default now()
);

-- The ledger: one ACTIVE fact per (seeker, key), with provenance + freshness + audit.
create table if not exists public.client_facts (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  fact_key text not null,
  fact_value text,
  provenance text not null
    check (provenance in ('client_confirmed', 'am_entered', 'ai_inferred', 'imported')),
  confidence numeric,
  source_ref text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'stale', 'superseded', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_facts_active_uidx
  on public.client_facts(job_seeker_id, fact_key) where status = 'active';
create index if not exists client_facts_seeker_idx
  on public.client_facts(job_seeker_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_client_facts_updated_at') then
    create trigger trg_client_facts_updated_at
      before update on public.client_facts
      for each row execute function public.set_updated_at();
  end if;
end$$;

-- Seed the registry from the course's sensitive-information categories (M1L3 / M2L6).
insert into public.fact_definitions
  (fact_key, label, category, sensitivity, value_type, default_ttl_days, ai_inference_allowed) values
  ('work_authorization',       'Authorized to work in the US?',              'work_auth',    'sensitive', 'select', 180, false),
  ('requires_sponsorship',     'Will you now/in future require sponsorship?','work_auth',    'sensitive', 'select', 180, false),
  ('security_clearance',       'Active security clearance',                  'clearance',    'sensitive', 'select', 90,  false),
  ('government_experience',    'Government sector experience',               'clearance',    'sensitive', 'text',   180, false),
  ('salary_expectations',      'Salary expectation',                         'compensation', 'sensitive', 'text',   90,  false),
  ('hourly_rate',              'Hourly rate expectation',                    'compensation', 'sensitive', 'text',   90,  false),
  ('open_to_c2c',              'Open to Corp-to-Corp (C2C)',                 'employment',   'sensitive', 'select', 180, false),
  ('open_to_1099',            'Open to 1099',                               'employment',   'sensitive', 'select', 180, false),
  ('availability',             'Interview availability',                     'logistics',    'sensitive', 'text',   14,  false),
  ('willing_to_relocate',      'Willing to relocate',                        'logistics',    'sensitive', 'select', 180, false),
  ('relocation',               'Relocation preference',                      'logistics',    'sensitive', 'text',   180, false),
  ('work_arrangement',         'Remote / hybrid / onsite preference',        'logistics',    'standard',  'select', null, true),
  ('start_date',               'Earliest start date',                        'logistics',    'standard',  'text',   null, true),
  ('notice_period',            'Notice period',                              'logistics',    'standard',  'text',   null, true),
  ('years_experience',         'Years of relevant experience',              'background',   'standard',  'text',   null, true),
  ('highest_education',        'Highest level of education',                 'background',   'standard',  'text',   null, true),
  ('how_did_you_hear',         'How did you hear about the position',        'background',   'standard',  'text',   null, true),
  ('gender',                   'Gender (EEO)',                               'eeo',          'legal',     'select', null, false),
  ('race_ethnicity',           'Race/Ethnicity (EEO)',                       'eeo',          'legal',     'select', null, false),
  ('veteran_status',           'Veteran status (EEO)',                       'eeo',          'legal',     'select', null, false),
  ('disability_status',        'Disability status (EEO)',                    'eeo',          'legal',     'select', null, false),
  ('non_compete',              'Non-compete agreement',                      'legal',        'legal',     'text',   null, false),
  ('background_check_consent', 'Background check consent',                   'legal',        'legal',     'select', null, false)
on conflict (fact_key) do nothing;

-- Backfill existing screening answers as imported facts (idempotent; history preserved).
insert into public.client_facts (job_seeker_id, fact_key, fact_value, provenance, confirmed_at, status)
select sa.job_seeker_id, sa.question_key, sa.answer_value, 'imported', now(), 'active'
from public.job_seeker_screening_answers sa
where not exists (
  select 1 from public.client_facts cf
  where cf.job_seeker_id = sa.job_seeker_id
    and cf.fact_key = sa.question_key
    and cf.status = 'active'
);

alter table public.fact_definitions enable row level security;
alter table public.client_facts enable row level security;

drop policy if exists "service_role_all_fact_definitions" on public.fact_definitions;
create policy "service_role_all_fact_definitions" on public.fact_definitions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service_role_all_client_facts" on public.client_facts;
create policy "service_role_all_client_facts" on public.client_facts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
