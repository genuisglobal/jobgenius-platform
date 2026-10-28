import { describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/activity-sheet";
import {
  composeDailyDeliveryEmail,
  composeFridayDeliveryEmail,
  dailyPace,
  summarizeDelivery,
  type DeliveryAssignment,
  type DeliveryEntry,
} from "@/lib/am-weekly-delivery";

const assignments: DeliveryAssignment[] = ["a", "b", "c"].map((id) => ({ account_manager_id: "am", job_seeker_id: id, name: `Client ${id}`, assigned_date: "2026-10-01" }));
function row(id: string, patch: Partial<DeliveryEntry>): DeliveryEntry {
  return { ...emptyCounts(), account_manager_id: "am", job_seeker_id: id, entry_date: "2026-10-26", ...patch };
}

describe("client delivery capacity", () => {
  it("shows client-equivalents alongside per-client minimum coverage", () => {
    const summary = summarizeDelivery("am", "2026-10-26", assignments, [
      row("a", { easy_applications: 20, phone_interviews: 1 }),
      row("b", { company_applications: 20, video_interviews: 1 }),
      row("c", { easy_applications: 20 }),
    ]);
    expect(summary.applications).toBe(60);
    expect(summary.applicationClientEquivalents).toBe(2);
    expect(summary.clientsAtMinimum).toBe(0);
    expect(summary.clientsWithPhoneInterview).toBe(1);
    expect(summary.clientsWithInterview).toBe(2);
  });

  it("excludes midweek assignments from full-week targets", () => {
    const late = [...assignments, { account_manager_id: "am", job_seeker_id: "d", name: "Client d", assigned_date: "2026-10-28" }];
    const summary = summarizeDelivery("am", "2026-10-26", late, [row("d", { easy_applications: 50 })]);
    expect(summary.clients).toHaveLength(3);
    expect(summary.newClients).toBe(1);
    expect(summary.applications).toBe(50);
    expect(summary.eligibleApplications).toBe(0);
  });
});

describe("daily and Friday email copy", () => {
  const current = summarizeDelivery("am", "2026-10-26", assignments, [row("a", { easy_applications: 20, phone_interviews: 1 })]);
  const previous = summarizeDelivery("am", "2026-10-19", assignments, [row("a", { easy_applications: 50, offers: 1 })]);
  it("welcomes the AM on Monday and states the exact amount to beat last week", () => {
    const email = composeDailyDeliveryEmail("Ada", "2026-10-26", summarizeDelivery("am", "2026-10-26", assignments, []), previous);
    expect(email.body).toContain("Welcome to a fresh week");
    expect(email.body).toContain("51 more applications");
    expect(email.body).toContain("too early to project");
  });
  it("projects pace through Friday from completed days only", () => {
    const pace = dailyPace("2026-10-28", 20, 50, 3); // Wednesday morning, 2 completed days
    expect(pace.projectedApplications).toBe(50);
    expect(pace.outlook).toBe("behind");
    expect(pace.neededForMinimum).toBe(70);
    expect(pace.projectedSurpassDate).toBeNull();
  });
  it("names the projected day of surpassing last week when the pace supports it", () => {
    const pace = dailyPace("2026-10-28", 40, 50, 1);
    expect(pace.projectedApplications).toBe(100);
    expect(pace.projectedSurpassDate).toBe("2026-10-28");
    expect(pace.neededForTarget).toBe(10);
  });
  it("thanks the AM and names improvements and declines", () => {
    const email = composeFridayDeliveryEmail("Ada", current, previous);
    expect(email.body).toContain("Thank you for your contribution");
    expect(email.body).toContain("Applications: 20 (down 30");
    expect(email.body).toContain("Phone interviews: 1 (up 1");
    expect(email.body).toContain("0/3 reached 30 applications");
  });
});
