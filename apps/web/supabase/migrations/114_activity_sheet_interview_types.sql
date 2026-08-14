-- ============================================================
-- Migration 114: Split the Activity Sheet's Interviews column by type
--
-- "Interviews" was one number, which hid the thing the team actually
-- wants to compare: a video interview and an AI screener are not the
-- same unit of work or the same signal of progress. Replaces the single
-- column with three.
--
-- The sheet and leaderboard still show a combined Interviews figure —
-- it is now computed as the sum of the three rather than stored, so the
-- parts can never disagree with the total.
-- ============================================================

alter table public.activity_sheet_entries
  add column if not exists phone_interviews integer not null default 0
    check (phone_interviews between 0 and 500),
  add column if not exists ai_interviews integer not null default 0
    check (ai_interviews between 0 and 500),
  add column if not exists video_interviews integer not null default 0
    check (video_interviews between 0 and 500);

-- Preserve anything already logged. The old column carried no type, and
-- a phone screen is the most common first-stage interview, so that is
-- the least-wrong bucket to land uncategorised history in.
-- (No-op on an empty table; written so this migration is safe to run
-- against a populated database too.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_sheet_entries'
      and column_name = 'interviews'
  ) then
    update public.activity_sheet_entries
      set phone_interviews = interviews
      where interviews > 0
        and phone_interviews = 0;

    alter table public.activity_sheet_entries drop column interviews;
  end if;
end $$;

comment on column public.activity_sheet_entries.phone_interviews is
  'Phone / recruiter screen calls.';
comment on column public.activity_sheet_entries.ai_interviews is
  'Asynchronous AI screeners (HireVue-style one-way and chat-based).';
comment on column public.activity_sheet_entries.video_interviews is
  'Live video interviews with a human interviewer.';
