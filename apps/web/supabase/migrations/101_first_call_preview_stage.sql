-- Migration 101: First call stage for strategy preview intake
-- Adds an explicit first-call milestone before preview approval.

alter table public.job_seeker_intake_states
  drop constraint if exists job_seeker_intake_states_status_check;

alter table public.job_seeker_intake_states
  add constraint job_seeker_intake_states_status_check
  check (
    status in (
      'draft',
      'submitted',
      'pending_review',
      'call_completed',
      'waitlisted',
      'approved_preview',
      'preview_active',
      'preview_expired',
      'approved_payment_pending',
      'active_client',
      'rejected'
    )
  );

alter table public.job_seeker_intake_states
  add column if not exists call_completed_at timestamptz;
