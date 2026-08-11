import { describe, it, expect } from "vitest";
import { computePlacementFee } from "@/lib/billing/commission";

// Compute the expected anchored date the same way the function does, so the
// assertion is timezone-agnostic (verifies the +N month offset + anchor choice).
function plusMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

describe("computePlacementFee", () => {
  it("is 5% of base when there is no guaranteed comp", () => {
    const fee = computePlacementFee({ baseSalary: 120_000, offerAcceptedAt: "2026-03-01" });
    expect(fee.commissionAmount).toBe(6_000);
  });

  it("is 5% of (base + guaranteed comp)", () => {
    const fee = computePlacementFee({
      baseSalary: 120_000,
      guaranteedCompensation: 20_000,
      offerAcceptedAt: "2026-03-01",
    });
    expect(fee.commissionAmount).toBe(7_000); // 5% of 140k
  });

  it("anchors due/extended dates on the employment start date (+2 / +3 months)", () => {
    const fee = computePlacementFee({
      baseSalary: 100_000,
      startDate: "2026-04-15",
      offerAcceptedAt: "2026-02-01",
    });
    expect(fee.dueDate).toBe(plusMonths("2026-04-15", 2));
    expect(fee.extendedDueDate).toBe(plusMonths("2026-04-15", 3));
  });

  it("falls back to the acceptance date when the start date is unknown", () => {
    const fee = computePlacementFee({ baseSalary: 100_000, offerAcceptedAt: "2026-02-01" });
    expect(fee.dueDate).toBe(plusMonths("2026-02-01", 2));
  });

  it("handles year-boundary month rollover", () => {
    const fee = computePlacementFee({ baseSalary: 100_000, startDate: "2026-12-10", offerAcceptedAt: "2026-11-01" });
    expect(fee.dueDate).toBe(plusMonths("2026-12-10", 2)); // Feb 2027
  });
});
