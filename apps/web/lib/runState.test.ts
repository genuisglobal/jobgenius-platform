import { describe, it, expect } from "vitest";
import {
  transitionRun,
  isRunStatus,
  RUN_STATUSES,
  RUN_EVENTS,
  TERMINAL_STATUSES,
  type RunStatus,
  type RunEvent,
} from "./runState";

describe("transitionRun — happy path", () => {
  const valid: Array<[RunStatus, RunEvent, RunStatus]> = [
    ["PENDING", "CREATE", "READY"],
    ["READY", "CLAIM", "RUNNING"],
    ["RETRYING", "CLAIM", "RUNNING"],
    ["RUNNING", "COMPLETE", "APPLIED"],
    ["RUNNING", "PAUSE", "NEEDS_ATTENTION"],
    ["RUNNING", "FAIL", "FAILED"],
    ["NEEDS_ATTENTION", "RETRY", "RETRYING"],
    ["NEEDS_ATTENTION", "FAIL", "FAILED"],
    ["FAILED", "RETRY", "RETRYING"],
  ];

  for (const [from, event, expected] of valid) {
    it(`${from} + ${event} -> ${expected}`, () => {
      const result = transitionRun(from, event);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.from).toBe(from);
        expect(result.to).toBe(expected);
        expect(result.idempotent).toBe(from === expected);
      }
    });
  }
});

describe("transitionRun — idempotency", () => {
  const idempotent: Array<[RunStatus, RunEvent]> = [
    ["APPLIED", "COMPLETE"],
    ["FAILED", "FAIL"],
    ["RETRYING", "RETRY"],
  ];

  for (const [from, event] of idempotent) {
    it(`${from} + ${event} is idempotent`, () => {
      const result = transitionRun(from, event);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.idempotent).toBe(true);
        expect(result.from).toBe(result.to);
      }
    });
  }
});

describe("transitionRun — illegal transitions", () => {
  const illegal: Array<[RunStatus, RunEvent]> = [
    // Terminal states can't accept non-idempotent events
    ["APPLIED", "PAUSE"],
    ["APPLIED", "FAIL"],
    ["APPLIED", "RETRY"],
    ["FAILED", "COMPLETE"],
    ["FAILED", "PAUSE"],
    // Can't complete or pause a run that hasn't been claimed
    ["READY", "COMPLETE"],
    ["READY", "PAUSE"],
    ["READY", "FAIL"],
    ["RETRYING", "COMPLETE"],
    ["RETRYING", "PAUSE"],
    ["RETRYING", "FAIL"],
    // Can't claim what's not ready
    ["RUNNING", "CLAIM"],
    ["NEEDS_ATTENTION", "CLAIM"],
    ["APPLIED", "CLAIM"],
    ["FAILED", "CLAIM"],
    // Can't retry a not-yet-failed run
    ["READY", "RETRY"],
    ["RUNNING", "RETRY"],
    // CREATE is only for PENDING
    ["READY", "CREATE"],
    ["RUNNING", "CREATE"],
    ["APPLIED", "CREATE"],
  ];

  for (const [from, event] of illegal) {
    it(`rejects ${from} + ${event}`, () => {
      const result = transitionRun(from, event);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain(from);
      }
    });
  }
});

describe("transitionRun — defensive parsing", () => {
  it("rejects unknown status", () => {
    const result = transitionRun("FOO" as RunStatus, "CLAIM");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Unknown current status/);
  });

  it("rejects unknown event", () => {
    const result = transitionRun("READY", "BAR" as RunEvent);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Unknown event/);
  });

  it("rejects null status", () => {
    const result = transitionRun(null, "CLAIM");
    expect(result.ok).toBe(false);
  });
});

describe("isRunStatus", () => {
  it("accepts every value in RUN_STATUSES", () => {
    for (const s of RUN_STATUSES) {
      expect(isRunStatus(s)).toBe(true);
    }
  });

  it("rejects junk", () => {
    expect(isRunStatus("FOO")).toBe(false);
    expect(isRunStatus("running")).toBe(false); // case-sensitive
    expect(isRunStatus(null)).toBe(false);
    expect(isRunStatus(123)).toBe(false);
    expect(isRunStatus(undefined)).toBe(false);
  });
});

describe("constants", () => {
  it("RUN_EVENTS covers every event used in the matrix", () => {
    // Should at least contain the ones used by the routes
    const expected: RunEvent[] = ["CREATE", "CLAIM", "COMPLETE", "PAUSE", "FAIL", "RETRY"];
    for (const e of expected) {
      expect(RUN_EVENTS).toContain(e);
    }
  });

  it("TERMINAL_STATUSES are exactly APPLIED and FAILED", () => {
    expect(new Set(TERMINAL_STATUSES)).toEqual(new Set(["APPLIED", "FAILED"]));
  });
});
