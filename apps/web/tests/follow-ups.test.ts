import { describe, it, expect } from "vitest";
import {
  buildFollowUpDraft,
  completionWindowForDay,
  FOLLOW_UP_DAYS,
} from "@/lib/apply/follow-ups";

describe("buildFollowUpDraft", () => {
  it("day-3 draft is a light check-in naming the role and company", () => {
    const draft = buildFollowUpDraft({
      seekerName: "Ada Lovelace",
      jobTitle: "Data Analyst",
      company: "Acme",
      followUpDay: 3,
    });
    expect(draft).toContain("Data Analyst position at Acme");
    expect(draft).toContain("follow up briefly");
    expect(draft).toContain("Best regards,\nAda"); // signed as the seeker, first name
    expect(draft).not.toContain("JobGenius"); // sent AS the seeker — no branding
  });

  it("day-7 draft escalates politely with a value hook and an out", () => {
    const draft = buildFollowUpDraft({
      seekerName: "Ada Lovelace",
      jobTitle: "Data Analyst",
      company: "Acme",
      followUpDay: 7,
    });
    expect(draft).toContain("from last week");
    expect(draft).toContain("work samples, references");
    expect(draft).toContain("moved forward with other candidates");
  });

  it("handles a missing seeker name without a dangling signature", () => {
    const draft = buildFollowUpDraft({
      seekerName: "",
      jobTitle: "Data Analyst",
      company: "Acme",
      followUpDay: 3,
    });
    expect(draft.trim().endsWith("Best regards")).toBe(true);
  });
});

describe("completionWindowForDay", () => {
  const NOW = new Date("2026-07-10T07:00:00Z");

  it("produces a 1-day-wide window ending exactly `day` days ago", () => {
    const window = completionWindowForDay(3, NOW);
    expect(window.end).toBe("2026-07-07T07:00:00.000Z");
    expect(window.start).toBe("2026-07-06T07:00:00.000Z");
  });

  it("day-3 and day-7 windows never overlap (each run hits each checkpoint once)", () => {
    const [d3, d7] = FOLLOW_UP_DAYS.map((d) => completionWindowForDay(d, NOW));
    expect(d7.end <= d3.start).toBe(true);
  });
});
