import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/activity-sheet";
import { buildRecognitionPilotWeeks, pilotPercent } from "@/lib/recognition-pilot";

describe("four-week recognition pilot", () => {
  it("counts full-week clients, excludes leave from coverage, and keeps logged outcomes visible", () => {
    const assignments = [
      { account_manager_id: "a", job_seeker_id: "one", name: "One", assigned_date: "2026-09-01" },
      { account_manager_id: "a", job_seeker_id: "new", name: "New", assigned_date: "2026-10-28" },
      { account_manager_id: "b", job_seeker_id: "two", name: "Two", assigned_date: "2026-09-01" },
    ];
    const entries = [
      { ...emptyCounts(), account_manager_id: "a", job_seeker_id: "one", entry_date: "2026-10-26", easy_applications: 30, phone_interviews: 1, offers: 1 },
      { ...emptyCounts(), account_manager_id: "a", job_seeker_id: "new", entry_date: "2026-10-29", easy_applications: 10 },
      { ...emptyCounts(), account_manager_id: "b", job_seeker_id: "two", entry_date: "2026-10-26", easy_applications: 50, phone_interviews: 1 },
    ];
    const weeks = buildRecognitionPilotWeeks("2026-10-26", ["a", "b"], assignments, entries,
      [{ account_manager_id: "a", work_date: "2026-10-29", sheet_status: "needs_update" }],
      [{ account_manager_id: "b", start_date: "2026-10-27", end_date: "2026-10-27" }]);
    const latest = weeks[3];
    expect(latest.eligibleClients).toBe(1);
    expect(latest.clientsAtMinimum).toBe(1);
    expect(latest.clientsWithPhoneInterview).toBe(1);
    expect(latest.applications).toBe(90);
    expect(latest.offers).toBe(1);
    expect(latest.newClients).toBe(1);
    expect(latest.sheetNeedsUpdate).toBe(1);
    expect(latest.excludedAmCount).toBe(1);
  });

  it("leaves coverage unscored when there are no eligible clients", () => {
    expect(pilotPercent(0, 0)).toBeNull();
    expect(pilotPercent(3, 4)).toBe(75);
  });
});
