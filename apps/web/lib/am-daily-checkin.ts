export const SHEET_STATUSES = ["complete", "needs_update", "no_client_work"] as const;
export const FOCUS_AREAS = ["applications", "outreach", "interviews", "client_support", "other"] as const;
export const BLOCKER_KINDS = ["none", "client_info", "technical", "capacity", "other"] as const;
export const DISTRACTION_LEVELS = ["none", "some", "significant", "prefer_not_to_say"] as const;

export type DailyCheckin = {
  sheet_status: (typeof SHEET_STATUSES)[number];
  focus_area: (typeof FOCUS_AREAS)[number];
  blocker_kind: (typeof BLOCKER_KINDS)[number];
  distraction_level: (typeof DISTRACTION_LEVELS)[number] | null;
  next_step: string | null;
};

function oneOf<T extends readonly string[]>(choices: T, value: unknown): value is T[number] {
  return typeof value === "string" && choices.includes(value);
}

export function parseDailyCheckin(value: unknown): DailyCheckin | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!oneOf(SHEET_STATUSES, row.sheet_status) || !oneOf(FOCUS_AREAS, row.focus_area) || !oneOf(BLOCKER_KINDS, row.blocker_kind)) return null;
  if (row.distraction_level != null && !oneOf(DISTRACTION_LEVELS, row.distraction_level)) return null;
  if (row.next_step != null && typeof row.next_step !== "string") return null;
  const nextStep = typeof row.next_step === "string" ? row.next_step.trim() : "";
  if (nextStep.length > 1000) return null;
  return {
    sheet_status: row.sheet_status,
    focus_area: row.focus_area,
    blocker_kind: row.blocker_kind,
    distraction_level: row.distraction_level ?? null,
    next_step: nextStep || null,
  };
}
