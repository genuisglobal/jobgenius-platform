import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/activity-sheet";
import { buildWeeklyReview, type WeeklyReviewEntry } from "@/lib/weekly-seeker-review";

const seeker = [{ id: "s1", name: "Ada", owner: "Sam" }];
function entry(date: string, patch: Partial<WeeklyReviewEntry> = {}): WeeklyReviewEntry {
  return { ...emptyCounts(), entry_date: date, job_seeker_id: "s1", note: null, ...patch };
}

describe("weekly seeker review", () => {
  it("keeps unlogged active seekers visible without treating zero as confirmed inactivity", () => {
    const [row] = buildWeeklyReview(seeker, [], []);
    expect(row.loggedDays).toBe(0);
    expect(row.prompts[0]).toContain("No activity logged");
  });

  it("summarizes a week by seeker and compares the prior week", () => {
    const [row] = buildWeeklyReview(seeker, [
      entry("2026-10-19", { easy_applications: 2, note: "Resume updated" }),
      entry("2026-10-20", { company_applications: 1, phone_interviews: 1 }),
    ], [entry("2026-10-12", { company_applications: 5 })]);
    expect(row.loggedDays).toBe(2);
    expect(row.counts.easy_applications + row.counts.company_applications).toBe(3);
    expect(row.prompts).toContain("Applications fell from 5 last week to 3. What changed?");
    expect(row.prompts).toContain("Review interview outcomes and the next preparation step.");
    expect(row.notes).toEqual([{ date: "2026-10-19", text: "Resume updated" }]);
  });
});
