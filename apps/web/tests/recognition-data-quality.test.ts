import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/activity-sheet";
import { buildDataQualityWeeks } from "@/lib/recognition-data-quality";

const managers = [{ id: "am", name: "Ada" }];
const attendance = [
  { account_manager_id: "am", work_date: "2026-10-26", signed_out_at: "2026-10-26T17:00:00Z" },
  { account_manager_id: "am", work_date: "2026-10-27", signed_out_at: null },
  { account_manager_id: "am", work_date: "2026-10-28", signed_out_at: "2026-10-28T17:00:00Z" },
];

describe("recognition pilot data confidence", () => {
  it("surfaces missing check-ins, open shifts, and sheet gaps without treating no-client-work as a gap", () => {
    const checkins = [
      { account_manager_id: "am", work_date: "2026-10-26", sheet_status: "complete" },
      { account_manager_id: "am", work_date: "2026-10-28", sheet_status: "no_client_work" },
    ];
    const entries = [{ ...emptyCounts(), account_manager_id: "am", job_seeker_id: "client", entry_date: "2026-10-26", easy_applications: 1 }];
    const week = buildDataQualityWeeks("2026-10-26", managers, attendance, checkins, entries, [], [])[3];
    expect(week.attendedDays).toBe(3);
    expect(week.rows[0].missingCheckinDates).toEqual(["2026-10-27"]);
    expect(week.rows[0].noSheetActivityDates).toEqual(["2026-10-27"]);
    expect(week.rows[0].openShiftDates).toEqual(["2026-10-27"]);
    expect(week.noSheetActivityDays).toBe(1);
  });

  it("does not call unobserved attendance a completed day", () => {
    const week = buildDataQualityWeeks("2026-10-26", managers, [], [], [], [], [])[3];
    expect(week.attendedDays).toBe(0);
    expect(week.missingCheckins).toBe(0);
    expect(week.missingAttendance).toBe(5);
  });

  it("treats an all-zero sheet row as no logged client activity", () => {
    const entries = [{ ...emptyCounts(), account_manager_id: "am", job_seeker_id: "client", entry_date: "2026-10-26" }];
    const week = buildDataQualityWeeks("2026-10-26", managers, attendance.slice(0, 1), [], entries, [], [])[3];
    expect(week.rows[0].noSheetActivityDates).toEqual(["2026-10-26"]);
  });

  it("respects a custom roster and both company and individual exemptions", () => {
    const week = buildDataQualityWeeks("2026-10-26", managers, [], [], [],
      [{ account_manager_id: "am", work_days: [1, 3, 5] }],
      [
        { id: "holiday", account_manager_id: null, start_date: "2026-10-28", end_date: "2026-10-28", reason: "holiday" },
        { id: "leave", account_manager_id: "am", start_date: "2026-10-30", end_date: "2026-10-30", reason: "leave" },
      ])[3];
    expect(week.rows[0].missingAttendanceDates).toEqual(["2026-10-26"]);
    expect(week.expectedDays).toBe(1);
  });

  it("shows logged work without a clock-in as a record gap", () => {
    const entries = [{ ...emptyCounts(), account_manager_id: "am", job_seeker_id: "client", entry_date: "2026-10-27", easy_applications: 2 }];
    const week = buildDataQualityWeeks("2026-10-26", managers, attendance.filter((day) => day.work_date !== "2026-10-27"), [], entries, [], [])[3];
    expect(week.rows[0].missingAttendanceDates).toContain("2026-10-27");
    expect(week.rows[0].activityWithoutAttendanceDates).toEqual(["2026-10-27"]);
  });
});
