import { describe, expect, it } from "vitest";
import {
  compactOutcomeMetadata,
  normalizeOutcomeOccurredAt,
  resolveLeadOutcomeSourceChannel,
} from "../outcomes";

describe("outcome helpers", () => {
  it("resolves signup-intake lead sources from intake metadata", () => {
    expect(
      resolveLeadOutcomeSourceChannel({
        submissionSource: "marketing_form",
        metadata: {
          intake_variant: "jobseeker_light_signup",
          submitted_via: "marketing_form",
        },
      })
    ).toBe("signup_intake");
  });

  it("keeps true marketing-form leads on the marketing channel", () => {
    expect(
      resolveLeadOutcomeSourceChannel({
        submissionSource: "marketing_form",
        metadata: {
          submitted_via: "marketing_form",
          source: "website",
        },
      })
    ).toBe("marketing_form");
  });

  it("compacts empty metadata values without dropping meaningful booleans", () => {
    expect(
      compactOutcomeMetadata({
        emptyString: "   ",
        keepFalse: false,
        keepZero: 0,
        nestedEmpty: {},
        nestedKeep: { status: "queued" },
      })
    ).toEqual({
      keepFalse: false,
      keepZero: 0,
      nestedKeep: { status: "queued" },
    });
  });

  it("normalizes valid timestamps and falls back for invalid ones", () => {
    expect(normalizeOutcomeOccurredAt("2026-06-20T12:00:00Z")).toBe(
      "2026-06-20T12:00:00.000Z"
    );
    expect(new Date(normalizeOutcomeOccurredAt("invalid")).toString()).not.toBe(
      "Invalid Date"
    );
  });
});
