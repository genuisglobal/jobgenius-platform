-- ============================================================
-- Migration 119: Give the pace band somewhere to go
--
-- The productivity report computes a pace band and mails it out every
-- Friday, and then nothing happens. A metric with no decision attached
-- becomes decoration: people learn to ignore it, or — worse — infer a
-- consequence nobody agreed and manage to it defensively.
--
-- This adds the missing step, with three deliberate limits.
--
-- 1. SUSTAINED, NOT SINGLE. One slow week is illness, a client crisis, a
--    hard search, or a fortnight of interviews that happened to land in
--    the next week. A flag needs several consecutive rated weeks.
--
-- 2. FLAGS A CONVERSATION, NEVER A CONSEQUENCE. This table cannot
--    discipline anyone. It raises an item for a people manager, carrying
--    the evidence, and a human decides what it means — including deciding
--    it means nothing, which is what `dismissed` is for. The existing
--    disciplinary_records table is reachable from that conversation but is
--    never written automatically: the numbers here measure logged activity
--    per hour, which is not the same thing as somebody's work, and no
--    employment record should be created by a cron job.
--
-- 3. BOTH DIRECTIONS. The same detector raises a commendation for people
--    sustained above pace. Partly because consistent good work is worth
--    surfacing to the Leader of the Month and leadership-eligibility flows
--    that already exist, and partly because a detector that only ever
--    produces bad news gets read as surveillance and quietly resented.
--
-- The evidence is snapshotted as jsonb at flag time. Sheet rows get
-- corrected and shifts get adjusted; a flag that silently re-derives from
-- live data would stop matching the conversation it started.
-- ============================================================

create table if not exists public.productivity_review_flags (
  id uuid primary key default gen_random_uuid(),
  account_manager_id uuid not null
    references public.account_managers(id) on delete cascade,

  -- Monday of the week that completed the streak.
  week_start date not null,

  kind text not null,
  -- How many consecutive rated weeks the streak ran to.
  streak_weeks integer not null check (streak_weeks >= 1),

  -- Frozen at flag time. See the header on why this is not re-derived.
  evidence jsonb not null default '{}'::jsonb,

  status text not null default 'open',
  resolved_by uuid references public.account_managers(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_review_flag_kind check (kind in ('concern', 'commendation')),
  constraint chk_review_flag_status
    check (status in ('open', 'acknowledged', 'dismissed')),

  -- One flag per person per week per direction. The weekly sweep is
  -- therefore safe to re-run, and a retry cannot duplicate a conversation.
  unique (account_manager_id, week_start, kind)
);

create index if not exists idx_productivity_review_flags_open
  on public.productivity_review_flags (status, week_start desc)
  where status = 'open';

create index if not exists idx_productivity_review_flags_am
  on public.productivity_review_flags (account_manager_id, week_start desc);

alter table public.productivity_review_flags enable row level security;

drop policy if exists "service_role_all_productivity_review_flags"
  on public.productivity_review_flags;
create policy "service_role_all_productivity_review_flags"
  on public.productivity_review_flags for all to service_role
  using (true) with check (true);

-- Unlike the Activity Sheet and the attendance board, this one is not
-- team-readable. A flag is a judgement about a named person mid-review;
-- the API restricts reads to people managers and to the person themselves.
drop policy if exists "am_select_own_productivity_review_flags"
  on public.productivity_review_flags;
create policy "am_select_own_productivity_review_flags"
  on public.productivity_review_flags for select
  using (
    exists (
      select 1 from public.account_managers am
      where am.id = productivity_review_flags.account_manager_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop trigger if exists trg_productivity_review_flags_updated_at
  on public.productivity_review_flags;
create trigger trg_productivity_review_flags_updated_at
  before update on public.productivity_review_flags
  for each row execute function set_updated_at();

comment on table public.productivity_review_flags is
  'Sustained pace streaks raised for a human review. Never auto-disciplines: see migration header.';
comment on column public.productivity_review_flags.evidence is
  'Snapshot of the weeks behind the flag, frozen at detection time so later corrections cannot silently change what was discussed.';
