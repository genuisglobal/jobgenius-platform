export const HIRING_PERSONAS = ["in_house", "agency"] as const;
export const ROLE_REQUEST_STATUSES = [
  "new",
  "reviewing",
  "qualified",
  "awaiting_details",
  "candidate_shortlist_sent",
  "active",
  "closed",
  "rejected",
] as const;
export const HIRING_URGENCY_OPTIONS = ["standard", "urgent", "immediate"] as const;
export const RECRUITER_RESPONSE_ACTIONS = [
  "send_profiles",
  "add_details",
  "not_hiring",
  "wrong_contact",
  "refer_teammate",
] as const;

export type HiringPersona = (typeof HIRING_PERSONAS)[number];
export type RoleRequestStatus = (typeof ROLE_REQUEST_STATUSES)[number];
export type HiringUrgency = (typeof HIRING_URGENCY_OPTIONS)[number];
export type RecruiterResponseAction = (typeof RECRUITER_RESPONSE_ACTIONS)[number];

export const RECRUITER_RESPONSE_ACTION_LABELS: Record<RecruiterResponseAction, string> = {
  send_profiles: "Send profiles",
  add_details: "Add more details",
  not_hiring: "Not hiring right now",
  wrong_contact: "Wrong contact",
  refer_teammate: "Refer teammate",
};

export function isHiringPersona(value: string | null | undefined): value is HiringPersona {
  return HIRING_PERSONAS.includes(value as HiringPersona);
}

export function isRoleRequestStatus(
  value: string | null | undefined
): value is RoleRequestStatus {
  return ROLE_REQUEST_STATUSES.includes(value as RoleRequestStatus);
}

export function isHiringUrgency(
  value: string | null | undefined
): value is HiringUrgency {
  return HIRING_URGENCY_OPTIONS.includes(value as HiringUrgency);
}

export function isRecruiterResponseAction(
  value: string | null | undefined
): value is RecruiterResponseAction {
  return RECRUITER_RESPONSE_ACTIONS.includes(value as RecruiterResponseAction);
}

export function inferPartnerTypeFromPersona(persona: HiringPersona) {
  return persona === "agency" ? "agency" : "in_house";
}

export function toNullableTrimmedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeOptionalUrl(value: unknown): string | null {
  const raw = toNullableTrimmedText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (/^[^\s]+\.[^\s]+/.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

export function deriveCompanyDomainFromEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain || null;
}

export function formatPartnerLabel(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function toSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
