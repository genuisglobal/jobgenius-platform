import { describe, it, expect } from "vitest";
import { isUpcomingInterview } from "@/lib/portal/interview-bucketing";

const NOW = new Date("2026-07-11T12:00:00Z");

describe("isUpcomingInterview", () => {
  it("is upcoming when pending_candidate/confirmed with a future time", () => {
    expect(isUpcomingInterview("pending_candidate", "2026-07-15T12:00:00Z", NOW)).toBe(true);
    expect(isUpcomingInterview("confirmed", "2026-07-15T12:00:00Z", NOW)).toBe(true);
  });

  it("is upcoming when the status is pre-completion but no time is booked yet", () => {
    // The core regression: a scheduling-link interview with no scheduled_at
    // yet must NOT be silently dropped into "Past".
    expect(isUpcomingInterview("pending_candidate", null, NOW)).toBe(true);
  });

  it("is NOT upcoming once completed/cancelled/no_show, regardless of date", () => {
    expect(isUpcomingInterview("completed", "2026-07-15T12:00:00Z", NOW)).toBe(false);
    expect(isUpcomingInterview("cancelled", null, NOW)).toBe(false);
    expect(isUpcomingInterview("no_show", "2026-07-15T12:00:00Z", NOW)).toBe(false);
  });

  it("is NOT upcoming once the booked time has passed", () => {
    expect(isUpcomingInterview("confirmed", "2026-07-01T12:00:00Z", NOW)).toBe(false);
  });

  it("never matches the old, nonexistent 'SCHEDULED' status value", () => {
    // Regression guard for the original bug: this status was never real.
    expect(isUpcomingInterview("SCHEDULED", "2026-07-15T12:00:00Z", NOW)).toBe(false);
  });
});
