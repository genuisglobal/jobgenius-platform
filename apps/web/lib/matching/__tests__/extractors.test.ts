import { describe, expect, it } from "vitest";
import {
  extractSalaryRangeFromSources,
  extractWorkType,
  parseJobPost,
} from "@/lib/matching/extractors";

describe("matching extractors", () => {
  it("parses annual salary ranges from scraped salary text", () => {
    expect(extractSalaryRangeFromSources("Compensation: USD 120k - 150k annual")).toEqual({
      min: 120_000,
      max: 150_000,
    });
  });

  it("annualizes hourly salary ranges when needed", () => {
    expect(extractSalaryRangeFromSources("$60 - $75/hour")).toEqual({
      min: 124_800,
      max: 156_000,
    });
  });

  it("uses scraped salary text when description does not mention compensation", () => {
    const parsed = parseJobPost(
      "Backend Engineer",
      "Acme",
      "Remote",
      "Build APIs for our platform.",
      "USD 120k - 150k annual"
    );

    expect(parsed.salary_min).toBe(120_000);
    expect(parsed.salary_max).toBe(150_000);
  });

  it("detects hybrid work type from location formatting", () => {
    expect(
      extractWorkType("New York, NY (Hybrid)", "Collaborate with the product team.")
    ).toBe("hybrid");
  });
});
