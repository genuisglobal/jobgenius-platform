-- Migration 095: Decision Engine (Act/Ask/Escalate) — Org Singularity Phase 2
-- Records a verdict + reason for every gated work item. Additive + backward-safe.
-- See docs/organizational-singularity/01-fact-ledger-and-decision-engine.md

begin;

create table if not exists public.consultant_decisions (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  subject_type text not null
    check (subject_type in ('job','application','application_question',
                            'recruiter_message','inbound_email','offer')),
  subject_ref text not null,
  verdict text not null check (verdict in ('act','ask','escalate','pause')),
  confidence numeric,
  reason_codes jsonb not null default '[]'::jsonb,
  recommended_action text,
  required_facts jsonb not null default '[]'::jsonb,
  risk_category text not null default 'none'
    check (risk_category in ('none','sensitive','financial','legal','scam','contractual')),
  decided_by text not null default 'system'
    check (decided_by in ('system','ai','am')),
  status text not null default 'open'
    check (status in ('open','resolved','auto_executed','dismissed')),
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open decision per subject (idempotent recording).
create unique index if not exists consultant_decisions_open_uidx
  on public.consultant_decisions(subject_type, subject_ref) where status = 'open';
create index if not exists consultant_decisions_seeker_status_idx
  on public.consultant_decisions(job_seeker_id, status, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_consultant_decisions_updated_at') then
    create trigger trg_consultant_decisions_updated_at
      before update on public.consultant_decisions
      for each row execute function public.set_updated_at();
  end if;
end$$;

alter table public.consultant_decisions enable row level security;
drop policy if exists "service_role_all_consultant_decisions" on public.consultant_decisions;
create policy "service_role_all_consultant_decisions" on public.consultant_decisions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
