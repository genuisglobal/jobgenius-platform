import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  evaluateSeekerVelocity,
  getLocalDayStartUtc,
  getLocalHour,
  normalizePacingProfile,
  DEFAULT_DAILY_APPLY_CAP,
  type SeekerVelocityInput,
} from "@/lib/apply/velocity";

// Deterministic base: 2026-07-08 18:00 UTC = 14:00 in New York (EDT, UTC-4).
const NOW = new Date("2026-07-08T18:00:00Z");
const NY = "America/New_York";

const originalQuietHours = process.env.APPLY_QUIET_HOURS;

function input(overrides: Partial<SeekerVelocityInput> = {}): SeekerVelocityInput {
  return {
    dailyCap: DEFAULT_DAILY_APPLY_CAP,
    pacingProfile: "normal",
    timezone: NY,
    recentRunStarts: [],
    now: NOW,
    random: () => 0, // min jitter → gap = profile minimum
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.APPLY_QUIET_HOURS; // default window 22-7
});

afterAll(() => {
  if (originalQuietHours === undefined) delete process.env.APPLY_QUIET_HOURS;
  else process.env.APPLY_QUIET_HOURS = originalQuietHours;
});

describe("timezone helpers", () => {
  it("getLocalHour converts UTC to the seeker's local hour", () => {
    expect(getLocalHour(NOW, NY)).toBe(14); // 18:00Z = 14:00 EDT
    expect(getLocalHour(NOW, "UTC")).toBe(18);
    expect(getLocalHour(NOW, "not/a-zone")).toBeNull();
  });

  it("getLocalDayStartUtc returns the seeker-local midnight as a UTC instant", () => {
    // NY midnight on 2026-07-08 (EDT) = 04:00 UTC.
    expect(getLocalDayStartUtc(NOW, NY).toISOString()).toBe(
      "2026-07-08T04:00:00.000Z"
    );
    // Null/invalid tz falls back to UTC midnight.
    expect(getLocalDayStartUtc(NOW, null).toISOString()).toBe(
      "2026-07-08T00:00:00.000Z"
    );
    expect(getLocalDayStartUtc(NOW, "not/a-zone").toISOString()).toBe(
      "2026-07-08T00:00:00.000Z"
    );
  });
});

describe("evaluateSeekerVelocity — daily cap", () => {
  it("allows when under the cap", () => {
    const starts = [new Date("2026-07-08T10:00:00Z")]; // 1 run today
    expect(
      evaluateSeekerVelocity(input({ recentRunStarts: starts })).allowed
    ).toBe(true);
  });

  it("blocks at the cap, counting only seeker-local 'today'", () => {
    // 2 runs today (after NY midnight 04:00Z), 1 yesterday (03:00Z).
    const starts = [
      new Date("2026-07-08T03:00:00Z"), // yesterday NY time
      new Date("2026-07-08T05:00:00Z"),
      new Date("2026-07-08T10:00:00Z"),
    ];
    const capped = evaluateSeekerVelocity(
      input({ dailyCap: 2, recentRunStarts: starts })
    );
    expect(capped).toMatchObject({ allowed: false, reason: "DAILY_CAP_REACHED" });

    // With cap 3 the yesterday run doesn't count → allowed (pacing off: last
    // start was 8h ago, beyond every profile's max gap).
    expect(
      evaluateSeekerVelocity(input({ dailyCap: 3, recentRunStarts: starts }))
        .allowed
    ).toBe(true);
  });

  it("cap 0 pauses automation entirely", () => {
    const verdict = evaluateSeekerVelocity(input({ dailyCap: 0 }));
    expect(verdict).toMatchObject({ allowed: false, reason: "DAILY_CAP_REACHED" });
  });
});

describe("evaluateSeekerVelocity — pacing cooldown", () => {
  it("blocks when the last run started inside the min gap", () => {
    const starts = [new Date(NOW.getTime() - 2 * 60 * 1000)]; // 2 min ago
    const verdict = evaluateSeekerVelocity(
      input({ recentRunStarts: starts }) // normal min gap = 3 min
    );
    expect(verdict).toMatchObject({ allowed: false, reason: "PACING_COOLDOWN" });
    if (!verdict.allowed) {
      expect(verdict.retryAfterMs).toBeGreaterThan(0);
      expect(verdict.retryAfterMs!).toBeLessThanOrEqual(60 * 1000 + 1);
    }
  });

  it("allows once the jittered gap has elapsed", () => {
    const starts = [new Date(NOW.getTime() - 4 * 60 * 1000)]; // 4 min ago
    expect(
      evaluateSeekerVelocity(input({ recentRunStarts: starts })).allowed
    ).toBe(true);
  });

  it("respects the pacing profile ranges", () => {
    const fourMinAgo = [new Date(NOW.getTime() - 4 * 60 * 1000)];
    // conservative min gap = 8 min → still cooling down.
    expect(
      evaluateSeekerVelocity(
        input({ pacingProfile: "conservative", recentRunStarts: fourMinAgo })
      )
    ).toMatchObject({ allowed: false, reason: "PACING_COOLDOWN" });
    // aggressive min gap = 2 min → clear.
    expect(
      evaluateSeekerVelocity(
        input({ pacingProfile: "aggressive", recentRunStarts: fourMinAgo })
      ).allowed
    ).toBe(true);
  });

  it("max jitter widens the gap (random = 1)", () => {
    const nineMinAgo = [new Date(NOW.getTime() - 9 * 60 * 1000)];
    // normal profile: min 3 (random 0) allows, max 10 (random 1) blocks.
    expect(
      evaluateSeekerVelocity(
        input({ recentRunStarts: nineMinAgo, random: () => 0 })
      ).allowed
    ).toBe(true);
    expect(
      evaluateSeekerVelocity(
        input({ recentRunStarts: nineMinAgo, random: () => 1 })
      )
    ).toMatchObject({ allowed: false, reason: "PACING_COOLDOWN" });
  });
});

describe("evaluateSeekerVelocity — quiet hours", () => {
  // 2026-07-09T03:00:00Z = 23:00 on 07-08 in New York → inside 22-7.
  const NIGHT = new Date("2026-07-09T03:00:00Z");

  it("blocks during the seeker's local night", () => {
    const verdict = evaluateSeekerVelocity(input({ now: NIGHT }));
    expect(verdict).toMatchObject({ allowed: false, reason: "QUIET_HOURS" });
  });

  it("does not apply when the timezone is unknown (03:00Z is daytime somewhere)", () => {
    // Without a tz we can't honestly evaluate quiet hours — must not block.
    expect(
      evaluateSeekerVelocity(input({ now: NIGHT, timezone: null })).allowed
    ).toBe(true);
  });

  it("honors APPLY_QUIET_HOURS overrides, including 'off'", () => {
    process.env.APPLY_QUIET_HOURS = "off";
    expect(evaluateSeekerVelocity(input({ now: NIGHT })).allowed).toBe(true);

    process.env.APPLY_QUIET_HOURS = "13-15"; // non-wrapping window; NOW=14:00 NY
    expect(evaluateSeekerVelocity(input())).toMatchObject({
      allowed: false,
      reason: "QUIET_HOURS",
    });
  });
});

describe("normalizePacingProfile", () => {
  it("falls back to 'normal' for unknown values", () => {
    expect(normalizePacingProfile("conservative")).toBe("conservative");
    expect(normalizePacingProfile("aggressive")).toBe("aggressive");
    expect(normalizePacingProfile("turbo")).toBe("normal");
    expect(normalizePacingProfile(null)).toBe("normal");
    expect(normalizePacingProfile(undefined)).toBe("normal");
  });
});
