import { describe, expect, it } from "vitest";
import { parseDailyCheckin } from "@/lib/am-daily-checkin";
import { buildProductivity, type ShiftRow } from "@/lib/am-productivity";
import { emptyCounts, type SheetRow } from "@/lib/activity-sheet";
import { detectWeeklyActivityDrop } from "@/lib/productivity-digest";

describe("daily AM check-in", () => {
  const valid = { sheet_status: "complete", focus_area: "applications", blocker_kind: "none" };
  it("accepts structured choices without requiring a distraction disclosure", () => {
    expect(parseDailyCheckin(valid)).toEqual({ ...valid, distraction_level: null, next_step: null });
    expect(parseDailyCheckin({ ...valid, distraction_level: "prefer_not_to_say" })?.distraction_level).toBe("prefer_not_to_say");
  });
  it("rejects unknown choices and oversized notes", () => {
    expect(parseDailyCheckin({ ...valid, sheet_status: "maybe" })).toBeNull();
    expect(parseDailyCheckin({ ...valid, next_step: "x".repeat(1001) })).toBeNull();
  });
});

describe("weekly activity drop signal", () => {
  const rows: SheetRow[] = [{ id: null, entry_date: "2026-10-26", job_seeker_id: "s1", seeker_name: "", account_manager_id: "am1", am_name: "AM", note: null, updated_at: null, ...emptyCounts(), easy_applications: 9 }];
  const shifts: ShiftRow[] = [26, 27, 28].map((day) => ({ id: `d${day}`, account_manager_id: "am1", am_name: "AM", work_date: `2026-10-${day}`, signed_in_at: `2026-10-${day}T08:00:00Z`, signed_out_at: `2026-10-${day}T16:00:00Z`, breaks: [] }));
  const current = buildProductivity(rows, shifts, new Date("2026-10-29T00:00:00Z")).managers[0];
  it("flags a substantial drop backed by multiple worked and logged days", () => {
    expect(detectWeeklyActivityDrop(current, 20, 3)).toBe(true);
  });
  it("does not label thin or absent comparison data as a drop", () => {
    expect(detectWeeklyActivityDrop(current, 20, 1)).toBe(false);
    expect(detectWeeklyActivityDrop(current, 9, 3)).toBe(false);
    expect(detectWeeklyActivityDrop({ ...current, days_on_clock: 1 }, 20, 3)).toBe(false);
  });
});
