import { describe, expect, it } from "vitest";
import {
  PRICING_PLANS,
  currentSetupFeeUsd,
  isLaunchPricingActive,
} from "@/app/components/homepage/marketingContent";

const [essentials, premium] = PRICING_PLANS;

describe("launch pricing", () => {
  it("charges launch prices through Dec 31, 2026 (US Eastern)", () => {
    const lastMinute = new Date("2026-12-31T23:59:00-05:00");
    expect(isLaunchPricingActive(lastMinute)).toBe(true);
    expect(currentSetupFeeUsd(essentials, lastMinute)).toBe(399);
    expect(currentSetupFeeUsd(premium, lastMinute)).toBe(799);
  });

  it("switches to list prices at midnight Eastern on Jan 1, 2027", () => {
    const newYear = new Date("2027-01-01T00:00:00-05:00");
    expect(isLaunchPricingActive(newYear)).toBe(false);
    expect(currentSetupFeeUsd(essentials, newYear)).toBe(500);
    expect(currentSetupFeeUsd(premium, newYear)).toBe(1000);
  });
});
