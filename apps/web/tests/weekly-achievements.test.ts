import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/activity-sheet";
import { buildAchievementRows, buildAchievements } from "@/lib/weekly-achievements";
import type { DeliveryEntry } from "@/lib/am-weekly-delivery";

const assignments = ["a", "b"].map((id) => ({ account_manager_id: "am", job_seeker_id: id, name: id, assigned_date: "2026-09-01" }));
const managers = [{ id: "am", name: "Ada" }];
function row(client: string, date: string, applications: number, phone = 0): DeliveryEntry {
  return { ...emptyCounts(), account_manager_id: "am", job_seeker_id: client, entry_date: date, easy_applications: applications, phone_interviews: phone };
}

describe("Friday achievements", () => {
  it("does not recognize the tolerated minimum as client coverage", () => {
    const entries = [row("a", "2026-10-26", 30, 1), row("b", "2026-10-26", 30, 1)];
    const rows = buildAchievementRows(managers, assignments, entries, "2026-10-26", new Set(), new Set());
    expect(buildAchievements(rows, false)).toEqual([]);
    const awards = buildAchievements(rows, true);
    expect(awards.map((award) => award.kind)).toEqual(["phone_interviews", "outcomes"]);
    expect(awards.some((award) => "rank" in award || "score" in award)).toBe(false);
  });

  it("recognizes coverage only when every full-week client reaches 50 applications", () => {
    const entries = [row("a", "2026-10-26", 50), row("b", "2026-10-26", 50)];
    const rows = buildAchievementRows(managers, assignments, entries, "2026-10-26", new Set(), new Set());
    expect(buildAchievements(rows, true)).toContainEqual(expect.objectContaining({
      kind: "client_coverage", detail: "2 of 2 clients reached the 50-application target",
    }));
  });

  it("pauses recognition when leave or a sheet correction makes comparison unreliable", () => {
    const entries = [row("a", "2026-10-26", 50, 1)];
    const leave = buildAchievementRows(managers, assignments, entries, "2026-10-26", new Set(["am"]), new Set());
    const correction = buildAchievementRows(managers, assignments, entries, "2026-10-26", new Set(), new Set(["am"]));
    expect(buildAchievements(leave, true)).toEqual([]);
    expect(buildAchievements(correction, true)).toEqual([]);
  });

  it("compares personal best by applications per eligible client across three prior weeks", () => {
    const entries = [
      row("a", "2026-10-26", 40), row("b", "2026-10-26", 40),
      row("a", "2026-10-19", 30), row("b", "2026-10-19", 30),
      row("a", "2026-10-12", 35), row("b", "2026-10-12", 35),
      row("a", "2026-10-05", 25), row("b", "2026-10-05", 25),
    ];
    const rows = buildAchievementRows(managers, assignments, entries, "2026-10-26", new Set(), new Set());
    expect(buildAchievements(rows, true).some((award) => award.kind === "personal_best")).toBe(true);
  });
});
