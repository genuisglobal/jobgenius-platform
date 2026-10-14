import { describe, expect, it } from "vitest";
import {
  decideLeadOutcome,
  parseEmiAnalysis,
  scoreLead,
} from "@/lib/voice/lead-qualification";

const NOW = new Date("2026-10-14T16:00:00Z"); // noon Eastern
const TZ = "America/New_York";

const strongLead = {
  call_outcome: "qualified_conversation",
  target_role: "GRC Analyst",
  niche: "cybersecurity_grc",
  years_experience: 6,
  employment_status: "unemployed",
  search_timeline: "now",
  salary_target_usd: "$110,000",
  work_authorization: "us_citizen_or_pr",
  budget_status: "ok",
  fit_rating_1_10: "8",
};

function decide(raw: Record<string, unknown> | null, extra: Partial<Parameters<typeof decideLeadOutcome>[0]> = {}) {
  return decideLeadOutcome({
    analysis: raw ? parseEmiAnalysis(raw) : null,
    connected: true,
    attempts: 1,
    timezone: TZ,
    now: NOW,
    ...extra,
  });
}

describe("parseEmiAnalysis", () => {
  it("tolerates LLM formatting: strings for numbers, N/A, casing, 120k", () => {
    const a = parseEmiAnalysis({
      years_experience: "4",
      salary_target_usd: "120k",
      niche: "Database",
      target_role: "N/A",
      founder_call_booked: "yes",
    });
    expect(a.yearsExperience).toBe(4);
    expect(a.salaryTargetUsd).toBe(120000);
    expect(a.niche).toBe("database");
    expect(a.targetRole).toBeNull();
    expect(a.founderCallBooked).toBe(true);
    expect(a.searchTimeline).toBe("unknown");
  });
});

describe("scoreLead", () => {
  it("scores a strong, ready niche candidate at 100", () => {
    expect(scoreLead(parseEmiAnalysis(strongLead))).toBe(100);
  });
  it("gives unknowns a middling score", () => {
    expect(scoreLead(parseEmiAnalysis({}))).toBe(10 + 8 + 7 + 7 + 6 + 7);
  });
});

describe("decideLeadOutcome", () => {
  it("strong + ready → hot, founder_call", () => {
    const d = decide(strongLead);
    expect(d.temperature).toBe("hot");
    expect(d.status).toBe("qualified");
    expect(d.nextAction).toBe("founder_call");
    expect(d.niche).toBe("cybersecurity_grc");
    expect(d.qualificationPatch.target_role).toBe("GRC Analyst");
  });

  it("booked founder call → hot at the booked time", () => {
    const d = decide({ ...strongLead, budget_status: "no_budget", founder_call_booked: true, founder_call_time_iso: "2026-10-16T18:00:00Z" });
    expect(d.temperature).toBe("hot");
    expect(d.nextActionAt?.toISOString()).toBe("2026-10-16T18:00:00.000Z");
  });

  it("good fit but no budget → warm follow-up call in 3 days, inside the window", () => {
    const d = decide({ ...strongLead, budget_status: "no_budget", search_timeline: "3_6_months" });
    expect(d.temperature).toBe("warm");
    expect(d.nextAction).toBe("callback");
    expect(d.scheduleCallAt?.toISOString()).toBe("2026-10-17T16:00:00.000Z");
  });

  it("second warm call in a row → founder review, no more calls", () => {
    const d = decide({ ...strongLead, budget_status: "no_budget" }, { previousTemperature: "warm" });
    expect(d.nextAction).toBe("founder_review");
    expect(d.scheduleCallAt).toBeNull();
  });

  it("expectation mismatch → realign for founder review", () => {
    const d = decide({ ...strongLead, realign_reason: "Expects a guaranteed job within 2 weeks" });
    expect(d.temperature).toBe("realign");
    expect(d.nextAction).toBe("founder_review");
  });

  it("not authorized to work → disqualified", () => {
    const d = decide({ ...strongLead, work_authorization: "not_authorized" });
    expect(d.temperature).toBe("disqualified");
    expect(d.nextAction).toBe("closed");
  });

  it("do not call → disqualified and opted out", () => {
    const d = decide({ call_outcome: "do_not_call" });
    expect(d.optOut).toBe(true);
    expect(d.nextAction).toBe("closed");
  });

  it("not interested but ok to follow up → nurture email", () => {
    const d = decide({ call_outcome: "not_interested", permission_to_follow_up: true });
    expect(d.temperature).toBe("nurture");
    expect(d.nextAction).toBe("nurture_email");
  });

  it("callback requested at a late hour → moved into the lead's calling window", () => {
    // 10pm Chicago asked → 8am Chicago next day (13:00 UTC)
    const d = decide({ call_outcome: "callback_requested", callback_time_iso: "2026-10-15T03:00:00Z", lead_timezone: "America/Chicago" });
    expect(d.nextAction).toBe("callback");
    expect(d.timezone).toBe("America/Chicago");
    expect(d.scheduleCallAt?.toISOString()).toBe("2026-10-15T13:00:00.000Z");
    expect(d.temperature).toBeUndefined();
  });

  it("no answer → retry +2h, then next day, then nurture email", () => {
    const first = decide(null, { connected: false, attempts: 1 });
    expect(first.scheduleCallAt?.toISOString()).toBe("2026-10-14T18:00:00.000Z");
    const second = decide(null, { connected: false, attempts: 2 });
    expect(second.scheduleCallAt?.toISOString()).toBe("2026-10-15T16:00:00.000Z");
    const third = decide(null, { connected: false, attempts: 3 });
    expect(third.scheduleCallAt).toBeNull();
    expect(third.nextAction).toBe("nurture_email");
  });

  it("connected but no outcome in the analysis → founder review", () => {
    expect(decide({}).nextAction).toBe("founder_review");
  });
});
