import { describe, it, expect } from "vitest";
import { detectSchedulingLink } from "@/lib/interview-link-detector";

describe("detectSchedulingLink", () => {
  it("detects Calendly links", () => {
    const result = detectSchedulingLink(
      "Great, let's connect! Please pick a time here: https://calendly.com/acme-recruiter/30min"
    );
    expect(result).toEqual({
      url: "https://calendly.com/acme-recruiter/30min",
      provider: "Calendly",
    });
  });

  it("detects HubSpot Meetings, Chili Piper, and Cal.com links", () => {
    expect(detectSchedulingLink("book here: https://meetings.hubspot.com/jane/intro")).toMatchObject({
      provider: "HubSpot Meetings",
    });
    expect(detectSchedulingLink("https://acme.chilipiper.com/book/jane")).toMatchObject({
      provider: "Chili Piper",
    });
    expect(detectSchedulingLink("https://cal.com/jane/30min")).toMatchObject({
      provider: "Cal.com",
    });
  });

  it("strips trailing punctuation from the extracted URL", () => {
    const result = detectSchedulingLink(
      "See you soon (https://calendly.com/acme/30min)."
    );
    expect(result?.url).toBe("https://calendly.com/acme/30min");
  });

  it("returns null when no scheduling link is present", () => {
    expect(detectSchedulingLink("Thanks, we'll follow up next week.")).toBeNull();
    expect(detectSchedulingLink("")).toBeNull();
    expect(
      detectSchedulingLink("Check out our careers page: https://acme.com/careers")
    ).toBeNull();
  });

  it("requires a booking-flavored path for Google Calendar / Microsoft Bookings hosts", () => {
    // Plain calendar link (not a booking page) — too ambiguous, must not match.
    expect(
      detectSchedulingLink("Here's my calendar: https://calendar.google.com/calendar/u/0")
    ).toBeNull();
    // Actual appointment scheduling page — should match.
    expect(
      detectSchedulingLink(
        "Book a slot: https://calendar.google.com/calendar/appointments/schedules/abc123"
      )
    ).toMatchObject({ provider: "Google Calendar" });
  });

  it("finds the first scheduling link when multiple URLs are present", () => {
    const result = detectSchedulingLink(
      "Here's our careers page https://acme.com/careers and my Calendly https://calendly.com/jane/30min"
    );
    expect(result?.provider).toBe("Calendly");
  });

  it("ignores malformed URL-like text without throwing", () => {
    expect(() => detectSchedulingLink("http://" + "x".repeat(5))).not.toThrow();
  });
});
