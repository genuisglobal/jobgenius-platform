import { describe, expect, it } from "vitest";
import { zonedWallTimeToDate, zonedWallTimeToIso } from "@/lib/zoned-time";
import {
  isManualPlaceholderUrl,
  normalizeJobUrl,
  parseZonedDateTime,
  validateManualJob,
} from "@/lib/manual-capture";

describe("zoned wall time", () => {
  it("converts an Eastern interview time to UTC (EDT)", () => {
    expect(zonedWallTimeToDate("2026-10-20", "14:00", "America/New_York")?.toISOString()).toBe(
      "2026-10-20T18:00:00.000Z"
    );
    expect(zonedWallTimeToIso("2026-10-20", "14:00", "America/New_York")).toBe("2026-10-20T14:00:00-04:00");
  });

  it("handles standard time after the November DST change", () => {
    expect(zonedWallTimeToIso("2026-11-10", "09:30", "America/Chicago")).toBe("2026-11-10T09:30:00-06:00");
  });

  it("handles West Africa Time and Pacific", () => {
    expect(zonedWallTimeToDate("2026-10-20", "14:00", "Africa/Lagos")?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(zonedWallTimeToDate("2026-10-20", "09:00", "America/Los_Angeles")?.toISOString()).toBe(
      "2026-10-20T16:00:00.000Z"
    );
  });

  it("rejects malformed input", () => {
    expect(zonedWallTimeToDate("20-10-2026", "14:00", "America/New_York")).toBeNull();
    expect(zonedWallTimeToDate("2026-10-20", "2pm", "America/New_York")).toBeNull();
    expect(zonedWallTimeToDate("2026-10-20", "14:00", "Not/AZone")).toBeNull();
  });
});

describe("manual capture validation", () => {
  it("requires company and title, normalizes links", () => {
    expect(validateManualJob({ company: "  ", title: "GRC Analyst" })).toEqual({ error: "Company is required." });
    expect(validateManualJob({ company: "Acme", title: "" })).toEqual({ error: "Role / job title is required." });
    const ok = validateManualJob({ company: " Acme  Corp ", title: "GRC Analyst", url: "acme.com/jobs/1#apply" });
    expect(ok).toEqual({ company: "Acme Corp", title: "GRC Analyst", url: "https://acme.com/jobs/1", location: null });
  });

  it("rejects links that are not web addresses", () => {
    expect(validateManualJob({ company: "Acme", title: "Analyst", url: "not a link" })).toEqual({
      error: "Job link must be a web address (https://…).",
    });
    expect(normalizeJobUrl("javascript:alert(1)")).toBeNull();
  });

  it("only accepts timestamps that carry a timezone", () => {
    expect(parseZonedDateTime("2026-10-20T14:00:00-04:00")?.toISOString()).toBe("2026-10-20T18:00:00.000Z");
    expect(parseZonedDateTime("2026-10-20T18:00:00Z")).not.toBeNull();
    expect(parseZonedDateTime("2026-10-20T14:00")).toBeNull();
  });

  it("recognizes placeholder job links", () => {
    expect(isManualPlaceholderUrl("manual-log:abc")).toBe(true);
    expect(isManualPlaceholderUrl("https://acme.com")).toBe(false);
  });
});
