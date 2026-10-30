import { describe, expect, it } from "vitest";
import { canTransitionPayslip, validPayAmount } from "@/lib/payroll";

describe("payslip issuance safeguards", () => {
  it("requires review before payment and prevents reversing an issued slip", () => {
    expect(canTransitionPayslip("draft", "issued")).toBe(true);
    expect(canTransitionPayslip("issued", "paid")).toBe(true);
    expect(canTransitionPayslip("draft", "paid")).toBe(false);
    expect(canTransitionPayslip("issued", "draft")).toBe(false);
    expect(canTransitionPayslip("paid", "issued")).toBe(false);
  });

  it("accepts currency amounts but rejects negative, fractional-cent, and non-finite values", () => {
    expect(validPayAmount(0.29)).toBe(true);
    expect(validPayAmount(1250.5)).toBe(true);
    expect(validPayAmount(-1)).toBe(false);
    expect(validPayAmount(1.001)).toBe(false);
    expect(validPayAmount(Infinity)).toBe(false);
  });
});
