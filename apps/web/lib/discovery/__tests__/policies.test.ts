import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: {},
}));

import {
  buildDiscoveryPolicyVariants,
  buildDiscoverySearchUrl,
} from "../policies";

describe("buildDiscoveryPolicyVariants", () => {
  it("expands a senior backend role into exact, core-title, alias, and city variants", () => {
    const variants = buildDiscoveryPolicyVariants(
      "policy-1",
      "Senior Backend Engineer",
      "New York, NY"
    );

    expect(variants.some((variant) => variant.key === "exact")).toBe(true);
    expect(
      variants.some(
        (variant) =>
          variant.title === "Backend Engineer" && variant.location === "New York, NY"
      )
    ).toBe(true);
    expect(
      variants.some(
        (variant) =>
          variant.title === "Senior Backend Engineer" && variant.location === "New York"
      )
    ).toBe(true);
    expect(
      variants.some((variant) =>
        ["Backend Developer", "API Engineer", "Back-End Engineer"].includes(variant.title)
      )
    ).toBe(true);
    expect(
      variants.some(
        (variant) =>
          variant.queryStrategy === "skill_keyword" &&
          variant.title === "Backend Engineer Node.js API Microservices" &&
          variant.keywords.includes("Node.js")
      )
    ).toBe(true);

    const uniqueCombinations = new Set(
      variants.map(
        (variant) => `${variant.key}::${variant.title.toLowerCase()}::${variant.location.toLowerCase()}`
      )
    );
    expect(uniqueCombinations.size).toBe(variants.length);
  });

  it("adds remote-friendly location variants without dropping the exact query", () => {
    const variants = buildDiscoveryPolicyVariants(
      "policy-2",
      "Product Manager",
      "Remote, United States"
    );

    expect(
      variants.some(
        (variant) =>
          variant.title === "Product Manager" &&
          variant.location === "Remote, United States"
      )
    ).toBe(true);
    expect(
      variants.some((variant) => variant.location === "Remote")
    ).toBe(true);
    expect(
      variants.some((variant) => ["United States", "USA"].includes(variant.location))
    ).toBe(true);
    expect(
      variants.some((variant) => variant.title === "Product Owner")
    ).toBe(true);
  });

  it("adds controlled stack-keyword variants for data roles", () => {
    const variants = buildDiscoveryPolicyVariants(
      "policy-3",
      "Data Analyst",
      "Toronto, ON"
    );

    expect(
      variants.some(
        (variant) =>
          variant.queryStrategy === "skill_keyword" &&
          variant.title === "Data Analyst SQL Tableau Power BI" &&
          variant.location === "Toronto, ON" &&
          variant.keywords.includes("Tableau")
      )
    ).toBe(true);
  });
});

describe("buildDiscoverySearchUrl", () => {
  it("builds a LinkedIn search url with the variant title and location", () => {
    const url = new URL(
      buildDiscoverySearchUrl(
        "linkedin",
        "https://www.linkedin.com/jobs/search",
        "Backend Engineer",
        "Remote"
      )
    );

    expect(url.searchParams.get("keywords")).toBe("Backend Engineer");
    expect(url.searchParams.get("location")).toBe("Remote");
  });

  it("builds an Indeed search url with source-specific params", () => {
    const url = new URL(
      buildDiscoverySearchUrl(
        "indeed",
        "https://www.indeed.com/jobs",
        "Business Intelligence Analyst",
        "USA"
      )
    );

    expect(url.searchParams.get("q")).toBe("Business Intelligence Analyst");
    expect(url.searchParams.get("l")).toBe("USA");
  });
});
