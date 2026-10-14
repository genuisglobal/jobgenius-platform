import { describe, it, expect } from "vitest";
import {
  evaluatePolicies,
  atsPolicyKey,
  GLOBAL_APPLY_KEY,
} from "@/lib/apply/kill-switch";

describe("evaluatePolicies", () => {
  it("allows everything when no switches are flipped (missing rows = enabled)", () => {
    expect(evaluatePolicies([], "WORKDAY")).toEqual({ halted: false });
    expect(
      evaluatePolicies([{ key: atsPolicyKey("LINKEDIN"), enabled: true }], "LINKEDIN")
    ).toEqual({ halted: false });
  });

  it("global halt beats everything", () => {
    const verdict = evaluatePolicies(
      [{ key: GLOBAL_APPLY_KEY, enabled: false }],
      "GREENHOUSE"
    );
    expect(verdict).toEqual({
      halted: true,
      reason: "AUTOMATION_HALTED",
      key: GLOBAL_APPLY_KEY,
    });
  });

  it("ATS halt only affects that ATS", () => {
    const rows = [{ key: atsPolicyKey("WORKDAY"), enabled: false }];
    expect(evaluatePolicies(rows, "WORKDAY")).toEqual({
      halted: true,
      reason: "ATS_HALTED",
      key: "ATS:WORKDAY",
    });
    expect(evaluatePolicies(rows, "GREENHOUSE")).toEqual({ halted: false });
    expect(evaluatePolicies(rows, null)).toEqual({ halted: false });
  });

  it("atsPolicyKey normalizes case and whitespace", () => {
    expect(atsPolicyKey(" workday ")).toBe("ATS:WORKDAY");
    expect(atsPolicyKey("Indeed")).toBe("ATS:INDEED");
  });
});
