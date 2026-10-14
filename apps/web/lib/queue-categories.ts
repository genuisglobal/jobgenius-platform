export const ADJACENT_QUEUE_CATEGORY = "adjacent_review";

type ResolveQueueCategoryOptions = {
  requestedCategory?: string | null;
  defaultCategory: string;
  adjacentEligible?: boolean;
};

export function isManualQueueCategory(category: string | null | undefined) {
  return category === "manual" || category === ADJACENT_QUEUE_CATEGORY;
}

export function resolveQueueCategory({
  requestedCategory,
  defaultCategory,
  adjacentEligible = false,
}: ResolveQueueCategoryOptions) {
  const normalized = (requestedCategory ?? "").trim() || defaultCategory;

  if (
    adjacentEligible &&
    (normalized === "manual" || normalized === "matched")
  ) {
    return ADJACENT_QUEUE_CATEGORY;
  }

  return normalized;
}
