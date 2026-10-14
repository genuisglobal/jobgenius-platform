-- 126: Make the platform the record of interviews and manual applications.
-- In production (Oct 2026) interviews had 0 rows ever and manual applications
-- were not recorded at all; both lived in AM↔client WhatsApp groups.
-- (125 is reserved by the Emi lead-agent branch.)

begin;

-- Manual applications are application_runs with source = 'manual', so every
-- existing report, the client tracker and the duplicate guard count them.
alter table public.application_runs
  add column if not exists source text not null default 'automated'
    check (source in ('automated', 'manual')),
  add column if not exists logged_by_am_id uuid
    references public.account_managers(id) on delete set null,
  -- When the application was actually submitted (successful runs only).
  add column if not exists applied_at timestamptz;

-- Backfill successful automated runs; completion time is the best record we have.
update public.application_runs
  set applied_at = updated_at
  where applied_at is null
    and status in ('APPLIED', 'COMPLETED');

-- Stamp applied_at whenever a run reaches a success status, so the runner's
-- completion route needs no change (and no deploy-order coupling).
create or replace function public.application_runs_stamp_applied_at()
returns trigger
language plpgsql
as $$
begin
  if new.applied_at is null and new.status in ('APPLIED', 'COMPLETED') then
    new.applied_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists application_runs_stamp_applied_at on public.application_runs;
create trigger application_runs_stamp_applied_at
  before insert or update of status on public.application_runs
  for each row execute function public.application_runs_stamp_applied_at();

create index if not exists application_runs_applied_at_idx
  on public.application_runs (applied_at)
  where applied_at is not null;

alter table public.interviews
  add column if not exists source text not null default 'scheduled'
    check (source in ('scheduled', 'manual_log', 'email_detected', 'client_reported')),
  add column if not exists logged_by_am_id uuid
    references public.account_managers(id) on delete set null,
  add column if not exists round text,
  add column if not exists interviewer text,
  -- Context for Emi's prep call (phase 4); never shown to the client.
  add column if not exists note_for_emi text,
  add column if not exists emi_prep_enabled boolean not null default true;

commit;
