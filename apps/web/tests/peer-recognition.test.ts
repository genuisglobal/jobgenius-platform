import { describe, expect, it } from "vitest";
import { parsePeerRecognition } from "@/lib/peer-recognition";

const nomineeAmId = "b5b7d31f-a4b6-48e8-a68c-3b933bf17a41";

describe("peer recognition input", () => {
  it("accepts a specific contribution and trims the detail", () => {
    expect(parsePeerRecognition({ nomineeAmId, contributionType: "blocker_help", detail: "  Helped unblock two client applications.  " }))
      .toEqual({ nomineeAmId, contributionType: "blocker_help", detail: "Helped unblock two client applications." });
  });

  it("rejects vague, oversized, and unknown contributions", () => {
    expect(parsePeerRecognition({ nomineeAmId, contributionType: "teamwork", detail: "Thanks" })).toBeNull();
    expect(parsePeerRecognition({ nomineeAmId, contributionType: "teamwork", detail: "x".repeat(501) })).toBeNull();
    expect(parsePeerRecognition({ nomineeAmId, contributionType: "points", detail: "Helped unblock two client applications." })).toBeNull();
  });
});
