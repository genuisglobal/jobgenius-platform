import { describe, expect, it } from "vitest";
import {
  ADJACENT_QUEUE_CATEGORY,
  isManualQueueCategory,
  resolveQueueCategory,
} from "../queue-categories";

describe("queue-categories", () => {
  it("treats adjacent review queues as manual-review work", () => {
    expect(isManualQueueCategory("manual")).toBe(true);
    expect(isManualQueueCategory(ADJACENT_QUEUE_CATEGORY)).toBe(true);
    expect(isManualQueueCategory("matched")).toBe(false);
  });

  it("upgrades manual or matched queues to adjacent_review when adjacent fit is detected", () => {
    expect(
      resolveQueueCategory({
        requestedCategory: "manual",
        defaultCategory: "manual",
        adjacentEligible: true,
      })
    ).toBe(ADJACENT_QUEUE_CATEGORY);

    expect(
      resolveQueueCategory({
        requestedCategory: "matched",
        defaultCategory: "matched",
        adjacentEligible: true,
      })
    ).toBe(ADJACENT_QUEUE_CATEGORY);
  });

  it("preserves non-manual categories and normal manual queueing when adjacent fit is absent", () => {
    expect(
      resolveQueueCategory({
        requestedCategory: "auto_matched",
        defaultCategory: "manual",
        adjacentEligible: true,
      })
    ).toBe("auto_matched");

    expect(
      resolveQueueCategory({
        requestedCategory: "manual",
        defaultCategory: "manual",
        adjacentEligible: false,
      })
    ).toBe("manual");
  });
});
