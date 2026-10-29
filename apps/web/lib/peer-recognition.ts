export const CONTRIBUTION_LABELS = {
  client_help: "Helped a client move forward",
  blocker_help: "Helped resolve a blocker",
  teamwork: "Supported a teammate",
} as const;

export type ContributionType = keyof typeof CONTRIBUTION_LABELS;

export function parsePeerRecognition(input: unknown): { nomineeAmId: string; contributionType: ContributionType; detail: string } | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const nomineeAmId = typeof value.nomineeAmId === "string" ? value.nomineeAmId.trim() : "";
  const contributionType = value.contributionType;
  const detail = typeof value.detail === "string" ? value.detail.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nomineeAmId)) return null;
  if (typeof contributionType !== "string" || !(contributionType in CONTRIBUTION_LABELS)) return null;
  if (detail.length < 20 || detail.length > 500) return null;
  return { nomineeAmId, contributionType: contributionType as ContributionType, detail };
}
