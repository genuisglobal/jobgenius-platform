import { describe, expect, it } from "vitest";
import { buildLeadCallBrief, type BriefLead } from "@/lib/voice/lead-brief";

const baseLead: BriefLead = {
  full_name: "Sarah Mensah",
  source: "linkedin",
  location: "Houston, TX",
  target_roles: [],
  notes: null,
  agent_background: "Ex-Deloitte GRC consultant, laid off in August. Asked about SOC 2 roles.",
  qualification: {},
  metadata: {
    parsed_resume: {
      skills: ["NIST 800-53", "SOC 2", "ISO 27001"],
      work_history: [{ title: "GRC Consultant", company: "Deloitte", current: false, start_date: "", end_date: "", description: "" }],
    },
  },
  call_attempts: 0,
  next_action: null,
  created_at: "2026-10-10T10:00:00Z",
};

describe("buildLeadCallBrief", () => {
  it("passes the founder's background and resume highlights to Emi", () => {
    const v = buildLeadCallBrief({ lead: baseLead, priorCalls: [], context: "first_call", now: new Date("2026-10-14T16:00:00Z") });
    expect(v.lead_first_name).toBe("Sarah");
    expect(v.how_they_came_to_us).toContain("LinkedIn");
    expect(v.lead_background).toContain("Ex-Deloitte GRC consultant");
    expect(v.lead_background).toContain("Resume: GRC Consultant at Deloitte");
    expect(v.essentials_price).toBe("$399");
    expect(v.pricing_note).toContain("Launch pricing");
    expect(v.lead_timezone).toBe("unknown");
    expect(v.current_time_local).toContain("October 14, 2026");
  });

  it("gives Emi the lead's local time when the zone is known", () => {
    const v = buildLeadCallBrief({ lead: { ...baseLead, timezone: "America/Chicago" }, priorCalls: [], context: "callback", now: new Date("2026-10-14T16:00:00Z") });
    expect(v.lead_timezone).toBe("America/Chicago");
    expect(v.current_time_local).toContain("11:00");
    expect(v.current_time_local).toContain("CDT");
  });

  it("lists known answers and only asks for what is missing", () => {
    const v = buildLeadCallBrief({
      lead: { ...baseLead, qualification: { target_role: "GRC Analyst", years_experience: 6, salary_target_usd: 110000 } },
      priorCalls: [{ created_at: "2026-10-12T15:00:00Z", status: "completed", summary: "Interested, asked to talk Thursday." }],
      context: "follow_up",
      now: new Date("2026-10-14T16:00:00Z"),
    });
    expect(v.known_answers).toContain("Target role: GRC Analyst");
    expect(v.known_answers).toContain("Target salary (USD): $110,000");
    expect(v.questions_still_needed).not.toContain("role they are targeting");
    expect(v.questions_still_needed).not.toContain("years of relevant experience");
    expect(v.questions_still_needed).toContain("US work authorization");
    expect(v.previous_calls).toContain("asked to talk Thursday");
  });

  it("switches to list prices after the launch period", () => {
    const v = buildLeadCallBrief({ lead: baseLead, priorCalls: [], context: "first_call", now: new Date("2027-01-02T16:00:00Z") });
    expect(v.essentials_price).toBe("$500");
    expect(v.premium_price).toBe("$1000");
  });

  it("never sends empty strings for the prompt to trip on", () => {
    const v = buildLeadCallBrief({
      lead: { ...baseLead, agent_background: null, metadata: null, location: null },
      priorCalls: [],
      context: "retry",
    });
    for (const [key, value] of Object.entries(v)) {
      if (key === "lead_full_name") continue;
      expect(value, key).not.toBe("");
    }
  });
});
