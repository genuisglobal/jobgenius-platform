-- ============================================================
-- Migration 116: Long-running shifts and admin sign-out corrections
--
-- A shift only closes when someone signs out. That is deliberate — a
-- power cut, a dead battery or a browser crash must never be recorded as
-- "went home", and nothing auto-closes a day behind the worker's back.
--
-- The cost of that choice is the stranded shift: sign in at 08:00, lose
-- power at 14:00, come back the next morning and the WAT date has rolled
-- over, so the clock offers "Sign In" again for the new day while
-- yesterday's row stays open forever. `isStale()` correctly refuses to
-- report an eighteen-hour day as fact, which means those hours vanish
-- from the productivity report entirely.
--
-- This migration adds the correction path:
--   * after LONG_SHIFT_HOURS (10) still open, people managers are
--     notified once — `long_shift_alerted_at` is the idempotency key,
--   * an admin sets the true sign-out time, and who did it, when, and
--     why is recorded alongside.
--
-- The audit columns are not optional bookkeeping. This table feeds hours
-- worked, which feeds the productivity report and, downstream, pay. An
-- edited time record with no trail of who edited it is a dispute nobody
-- can settle.
-- ============================================================

alter table public.attendance_days
  -- Set once, when the alert fires. Not cleared on correction: it records
  -- that the shift ran long, which stays true after the fix.
  add column if not exists long_shift_alerted_at timestamptz,
  -- Null for the overwhelming majority of rows — the worker signed
  -- themselves out and there is nothing to explain.
  add column if not exists adjusted_by uuid
    references public.account_managers(id) on delete set null,
  add column if not exists adjusted_at timestamptz,
  add column if not exists adjustment_note text;

-- The alert sweep's query: open shifts, oldest sign-in first. Partial, so
-- it stays small — closed days are the overwhelming majority and are of no
-- interest here.
create index if not exists idx_attendance_days_open_shifts
  on public.attendance_days (signed_in_at)
  where signed_out_at is null;

comment on column public.attendance_days.long_shift_alerted_at is
  'When people managers were notified this shift had run past the long-shift threshold. Idempotency key for the hourly sweep — set once, never cleared.';
comment on column public.attendance_days.adjusted_by is
  'Admin who set signed_out_at by hand. Null when the worker signed themselves out normally.';
comment on column public.attendance_days.adjustment_note is
  'Why the sign-out time was corrected, e.g. "power cut at 14:00, confirmed with Ada".';

-- Corrections go through the service role (POST/PATCH under /api/am/attendance),
-- which bypasses RLS, so no admin UPDATE policy is added here. The existing
-- am_update_own policy stays as it is: a worker still cannot edit anyone
-- else's day, and cannot backdate their own sign-out either — that route
-- checks the caller's role before it writes.
