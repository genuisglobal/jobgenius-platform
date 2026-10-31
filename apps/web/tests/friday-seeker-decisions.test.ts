import { describe, expect, it } from "vitest";
import { parseFridayDecision } from "@/lib/friday-seeker-decisions";

const input = {
  weekStart: "2026-10-26", jobSeekerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  decision: " Focus on targeted roles ", nextAction: " Send five follow-ups ",
  ownerId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", dueDate: "2026-11-02", status: "open",
};

describe("Friday seeker decisions", () => {
  it("accepts a complete weekly decision and trims its text", () => {
    expect(parseFridayDecision(input)).toEqual({ value: { ...input, decision: "Focus on targeted roles", nextAction: "Send five follow-ups" } });
  });

  it("rejects invalid weeks, missing actions, and deadlines before the meeting week", () => {
    expect(parseFridayDecision({ ...input, weekStart: "2026-10-27" }).error).toContain("review week");
    expect(parseFridayDecision({ ...input, nextAction: " " }).error).toContain("next action");
    expect(parseFridayDecision({ ...input, dueDate: "2026-10-25" }).error).toContain("due date");
  });
});
