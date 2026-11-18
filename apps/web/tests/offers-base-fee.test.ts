import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ supabaseAdmin: {} }));

import { getPlanBaseFee } from "@/lib/offers";

describe("portal contract base fee", () => {
  it("charges the 20% promotional setup fee through Jan 31, 2027", () => {
    const jan = new Date("2027-01-15T12:00:00Z");
    expect(getPlanBaseFee("essentials", jan)).toBe(400);
    expect(getPlanBaseFee("premium", jan)).toBe(800);
  });

  it("charges list prices from Feb 1, 2027", () => {
    const feb = new Date("2027-02-02T12:00:00Z");
    expect(getPlanBaseFee("essentials", feb)).toBe(500);
    expect(getPlanBaseFee("premium", feb)).toBe(1000);
  });
});
