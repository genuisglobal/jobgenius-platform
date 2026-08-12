// ============================================================
// Run state machine (application_runs.status).
//
// The single source of truth for which run statuses can transition
// to which under which events. Used by apply/complete, apply/fail,
// apply/pause, apply/retry to:
//   1. Reject illegal transitions early (return 409) instead of silently
//      corrupting state (e.g. a runner reporting "complete" on a run
//      that was already FAILED).
//   2. Provide a stable race-guard column for the UPDATE — by passing
//      the validated `from` status into `.eq("status", from)`, two
//      concurrent transitions can't both win.
//
// Pure module — no DB, no side effects. Routes own their field updates.
// ============================================================

export type RunStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "RETRYING"
  | "NEEDS_ATTENTION"
  | "APPLIED"
  | "FAILED";

export type RunEvent =
  | "CREATE"   // new run inserted as READY
  | "CLAIM"    // claimed by a runner -> RUNNING
  | "COMPLETE" // runner reports success -> APPLIED
  | "PAUSE"    // runner reports needs-attention -> NEEDS_ATTENTION
  | "FAIL"     // runner reports terminal failure -> FAILED
  | "RETRY";   // AM (or auto) retries -> RETRYING

export const RUN_STATUSES: readonly RunStatus[] = [
  "PENDING",
  "READY",
  "RUNNING",
  "RETRYING",
  "NEEDS_ATTENTION",
  "APPLIED",
  "FAILED",
] as const;

export const RUN_EVENTS: readonly RunEvent[] = [
  "CREATE",
  "CLAIM",
  "COMPLETE",
  "PAUSE",
  "FAIL",
  "RETRY",
] as const;

export const TERMINAL_STATUSES: readonly RunStatus[] = ["APPLIED", "FAILED"] as const;

/**
 * Transition matrix. Each row = current status; each entry = which event maps
 * to which next status. Same-from→same-to entries are deliberate idempotency
 * (e.g. APPLIED + COMPLETE remains APPLIED so double-fires from the runner
 * don't error out).
 */
const TRANSITIONS: Record<RunStatus, Partial<Record<RunEvent, RunStatus>>> = {
  PENDING: {
    CREATE: "READY",
  },
  READY: {
    CLAIM: "RUNNING",
  },
  RUNNING: {
    COMPLETE: "APPLIED",
    PAUSE: "NEEDS_ATTENTION",
    FAIL: "FAILED",
  },
  RETRYING: {
    CLAIM: "RUNNING",
    RETRY: "RETRYING", // idempotent
  },
  NEEDS_ATTENTION: {
    RETRY: "RETRYING",
    FAIL: "FAILED",    // AM can mark a paused run as failed manually
  },
  APPLIED: {
    COMPLETE: "APPLIED", // idempotent — runner double-fire is fine
  },
  FAILED: {
    RETRY: "RETRYING",
    FAIL: "FAILED",    // idempotent
  },
};

export type TransitionResult =
  | { ok: true; from: RunStatus; to: RunStatus; idempotent: boolean }
  | { ok: false; from: RunStatus; event: RunEvent; reason: string };

/**
 * Validate a status transition.
 *
 * Returns ok=false on illegal transitions (caller should return 409).
 * Returns ok=true with the target status otherwise. `idempotent` is true
 * when the transition is a no-op (from === to).
 *
 * Unknown statuses or events are treated as illegal — defensive against
 * a renamed column value drifting from this enum.
 */
export function transitionRun(
  current: RunStatus | string | null | undefined,
  event: RunEvent | string
): TransitionResult {
  const from = (current ?? "") as RunStatus;
  if (!RUN_STATUSES.includes(from)) {
    return {
      ok: false,
      from: from as RunStatus,
      event: event as RunEvent,
      reason: `Unknown current status: ${String(current)}`,
    };
  }
  if (!RUN_EVENTS.includes(event as RunEvent)) {
    return {
      ok: false,
      from,
      event: event as RunEvent,
      reason: `Unknown event: ${String(event)}`,
    };
  }

  const to = TRANSITIONS[from][event as RunEvent];
  if (!to) {
    return {
      ok: false,
      from,
      event: event as RunEvent,
      reason: `Illegal transition: ${from} + ${event}`,
    };
  }

  return { ok: true, from, to, idempotent: from === to };
}

/**
 * Lightweight type guard for callers that only need to confirm a string
 * came back as a recognised status.
 */
export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === "string" && RUN_STATUSES.includes(value as RunStatus);
}
