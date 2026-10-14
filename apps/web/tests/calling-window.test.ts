import { describe, expect, it } from "vitest";
import {
  isValidTimeZone,
  isWithinCallingWindow,
  nextCallingTime,
} from "@/lib/voice/calling-window";

describe("calling window", () => {
  it("allows 8am–9pm in the lead's own zone", () => {
    // 8:00 in Chicago (CDT, UTC-5) = 13:00 UTC
    expect(isWithinCallingWindow(new Date("2026-10-14T13:00:00Z"), "America/Chicago")).toBe(true);
    // 7:59 in Chicago
    expect(isWithinCallingWindow(new Date("2026-10-14T12:59:00Z"), "America/Chicago")).toBe(false);
    // 20:59 ok, 21:00 not
    expect(isWithinCallingWindow(new Date("2026-10-15T01:59:00Z"), "America/Chicago")).toBe(true);
    expect(isWithinCallingWindow(new Date("2026-10-15T02:00:00Z"), "America/Chicago")).toBe(false);
  });

  it("uses 11am–9pm Eastern when the zone is unknown or invalid", () => {
    // 10:30 ET (EDT, UTC-4) = 14:30 UTC — would be 7:30am Pacific
    expect(isWithinCallingWindow(new Date("2026-10-14T14:30:00Z"), null)).toBe(false);
    expect(isWithinCallingWindow(new Date("2026-10-14T15:00:00Z"), "Not/AZone")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("returns now when inside the window", () => {
    const at = new Date("2026-10-14T16:00:00Z");
    expect(nextCallingTime(at, "America/New_York")).toEqual(at);
  });

  it("moves a late-night lead to 8am the next local morning", () => {
    // 22:30 Los Angeles (PDT, UTC-7) = 05:30 UTC next day
    const next = nextCallingTime(new Date("2026-10-15T05:30:00Z"), "America/Los_Angeles");
    expect(next.toISOString()).toBe("2026-10-15T15:00:00.000Z"); // 8:00 PDT
  });

  it("handles the DST change (first Sunday of November)", () => {
    // 2026-11-01: clocks fall back in New York; 8:00 EST = 13:00 UTC
    const next = nextCallingTime(new Date("2026-11-01T06:00:00Z"), "America/New_York");
    expect(next.toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });
});
