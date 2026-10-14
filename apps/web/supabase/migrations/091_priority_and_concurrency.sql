-- ============================================================
-- Migration 091: runner-fleet primitives (Phase 4 — PR-Z)
--
-- 1. priority column on application_queue + application_runs
--      1 = highest, 10 = lowest; default 5 (normal).
--      Used by lib/apply/claim-task.ts to order ready-to-claim rows
--      before falling back to oldest-first.
--
-- 2. Partial index on (status, priority, locked_at, updated_at) so
--    the claim query stays fast as the queue grows.
--
-- This migration is additive — existing inserts that don't specify
-- priority get the default and behave as they did before.
-- ============================================================

ALTER TABLE application_queue
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 5
  CHECK (priority BETWEEN 1 AND 10);

ALTER TABLE application_runs
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 5
  CHECK (priority BETWEEN 1 AND 10);

-- Index used by claim-task.ts. Only ready-to-claim rows live in the
-- partial set so the index stays small.
CREATE INDEX IF NOT EXISTS idx_application_runs_ready_claim
  ON application_runs (priority ASC, updated_at ASC)
  WHERE status IN ('READY', 'RETRYING') AND locked_at IS NULL;

-- Queue-side index for fleet-throughput dashboards.
CREATE INDEX IF NOT EXISTS idx_application_queue_priority
  ON application_queue (priority ASC, updated_at ASC)
  WHERE status IN ('QUEUED', 'READY', 'IN_PROGRESS');

COMMENT ON COLUMN application_queue.priority IS
  '1=highest, 10=lowest. Default 5 (normal). Used by claim-task to order ready rows.';
COMMENT ON COLUMN application_runs.priority IS
  '1=highest, 10=lowest. Inherited from application_queue on creation; can be overridden per-run.';
