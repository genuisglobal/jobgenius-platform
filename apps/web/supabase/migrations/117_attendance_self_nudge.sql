-- ============================================================
-- Migration 117: Nudge the worker before escalating to a manager
--
-- Migration 116 told people managers about shifts left open past 10
-- hours. Most of those are not a management problem — they are somebody
-- who lost power or closed a laptop and simply forgot. Handing every one
-- of them to a manager makes work for two people instead of one.
--
-- So the ladder gains a lower rung: at SELF_NUDGE_HOURS (9) the person
-- themselves is asked whether they forgot to sign out, an hour before
-- their manager hears about it at LONG_SHIFT_HOURS (10). Anyone still at
-- their desk signs out normally when they leave and the escalation never
-- fires.
--
-- Separate column from long_shift_alerted_at on purpose: the two rungs
-- fire independently, and a shift that skipped straight past both between
-- sweeps must still send each exactly once.
-- ============================================================

alter table public.attendance_days
  add column if not exists self_nudge_sent_at timestamptz;

comment on column public.attendance_days.self_nudge_sent_at is
  'When the worker was asked whether they forgot to sign out. Idempotency key for the hourly sweep''s first rung — set once, never cleared.';
