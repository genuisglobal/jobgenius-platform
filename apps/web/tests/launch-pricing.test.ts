import { describe, expect, it } from "vitest";
import {
  PRICING_PLANS,
  currentSetupFeeUsd,
  isLaunchPricingActive,
} from "@/app/components/homepage/marketingContent";

const [essentials, premium] = PRICING_PLANS;

describe("20% registration promotion", () => {
  it("is exactly 20% off the list setup fees", () => {
    expect(essentials.launchSetupFeeUsd).toBe(essentials.listSetupFeeUsd * 0.8);
    expect(premium.launchSetupFeeUsd).toBe(premium.listSetupFeeUsd * 0.8);
  });

  it("charges promotional prices through Jan 31, 2027 (US Eastern)", () => {
    const lastMinute = new Date("2027-01-31T23:59:00-05:00");
    expect(isLaunchPricingActive(lastMinute)).toBe(true);
    expect(currentSetupFeeUsd(essentials, lastMinute)).toBe(400);
    expect(currentSetupFeeUsd(premium, lastMinute)).toBe(800);
  });

  it("switches to list prices at midnight Eastern on Feb 1, 2027", () => {
    const feb1 = new Date("2027-02-01T00:00:00-05:00");
    expect(isLaunchPricingActive(feb1)).toBe(false);
    expect(currentSetupFeeUsd(essentials, feb1)).toBe(500);
    expect(currentSetupFeeUsd(premium, feb1)).toBe(1000);
  });
});
