// The caller brief: everything JobGenius already knows about a lead, packed
// into Retell dynamic variables for Emi's prompt ({{lead_background}} etc.).
// Emi confirms what is known and only asks what is still missing. Pure.

import {
  LAUNCH_PRICING_END_LABEL,
  PRICING_PLANS,
  currentSetupFeeUsd,
  isLaunchPricingActive,
} from "@/app/components/homepage/marketingContent";
import type { ParsedResume } from "@/lib/resume-parser";
import { isValidTimeZone } from "@/lib/voice/calling-window";

export const FOUNDER_NAME = "Fidelis";

export type BriefLead = {
  full_name: string | null;
  source: string;
  location: string | null;
  target_roles: string[] | null;
  notes: string | null;
  agent_background: string | null;
  qualification: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  call_attempts: number;
  next_action: string | null;
  created_at: string;
  timezone?: string | null;
};

export type BriefPriorCall = {
  created_at: string;
  status: string;
  summary: string | null;
};

export type CallContext = "first_call" | "retry" | "callback" | "follow_up";

/** Answers Emi needs before she can categorise a lead, with the qualification key that holds each. */
const REQUIRED_ANSWERS: Array<{ key: string; label: string }> = [
  { key: "target_role", label: "the role they are targeting" },
  { key: "years_experience", label: "years of relevant experience" },
  { key: "employment_status", label: "whether they are currently employed" },
  { key: "search_timeline", label: "how soon they want a new role" },
  { key: "salary_target_usd", label: "their target salary" },
  { key: "work_authorization", label: "US work authorization" },
  { key: "budget_status", label: "whether the setup fee works for them" },
  { key: "decision_makers", label: "whether anyone else is involved in the decision" },
];

const ANSWER_LABELS: Record<string, string> = {
  target_role: "Target role",
  years_experience: "Years of experience",
  employment_status: "Employment status",
  search_timeline: "Search timeline",
  salary_target_usd: "Target salary (USD)",
  work_authorization: "Work authorization",
  budget_status: "Setup fee",
  decision_makers: "Others in the decision",
  concerns: "Concerns raised",
  fit_rating_1_10: "Fit rating they gave (1-10)",
  fit_missing: "What they said was missing",
};

const MAX_BACKGROUND_CHARS = 1500;

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function firstName(fullName: string | null) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

function howTheyCameToUs(lead: BriefLead, context: CallContext): string {
  const minutesOld = (Date.now() - new Date(lead.created_at).getTime()) / 60_000;
  switch (lead.source) {
    case "marketing_form":
      return context === "first_call" && minutesOld < 60
        ? "just filled in the free job-search form on the JobGenius website"
        : "filled in the job-search form on the JobGenius website";
    case "signup":
      return "created a free JobGenius account";
    case "linkedin":
      return `has been chatting with ${FOUNDER_NAME} on LinkedIn about their job search`;
    case "cal_booking":
      return "booked this call through the JobGenius booking page";
    case "referral":
      return "was referred to JobGenius";
    default:
      return "was added to JobGenius by the team";
  }
}

function resumeHighlights(metadata: Record<string, unknown> | null): string | null {
  const parsed = metadata?.parsed_resume as ParsedResume | undefined;
  if (!parsed || typeof parsed !== "object") return null;
  const parts: string[] = [];
  const current = parsed.work_history?.find((w) => w.current) ?? parsed.work_history?.[0];
  if (current?.title) {
    parts.push(`Resume: ${current.title}${current.company ? ` at ${current.company}` : ""}${current.current ? " (current)" : ""}`);
  }
  if (parsed.skills?.length) parts.push(`Key skills: ${parsed.skills.slice(0, 8).join(", ")}`);
  return parts.length ? parts.join(". ") : null;
}

function formatAnswer(key: string, value: unknown): string {
  if (key === "salary_target_usd" && typeof value === "number") return `$${value.toLocaleString("en-US")}`;
  return String(value).replace(/_/g, " ");
}

export function buildLeadCallBrief(params: {
  lead: BriefLead;
  priorCalls: BriefPriorCall[];
  context: CallContext;
  now?: Date;
}): Record<string, string> {
  const { lead, priorCalls, context } = params;
  const q = lead.qualification ?? {};

  const known: string[] = [];
  for (const [key, label] of Object.entries(ANSWER_LABELS)) {
    const v = q[key];
    if (v !== undefined && v !== null && v !== "") known.push(`${label}: ${formatAnswer(key, v)}`);
  }
  if (!q.target_role && lead.target_roles?.length) {
    known.push(`Target roles from their form: ${lead.target_roles.join(", ")}`);
  }
  if (lead.location) known.push(`Location: ${lead.location}`);

  const missing = REQUIRED_ANSWERS.filter(({ key }) => {
    if (key === "target_role" && lead.target_roles?.length) return false;
    const v = q[key];
    return v === undefined || v === null || v === "";
  }).map(({ label }) => label);

  const background = [
    lead.agent_background?.trim() ? clip(lead.agent_background.trim(), MAX_BACKGROUND_CHARS) : null,
    resumeHighlights(lead.metadata),
    lead.notes?.trim() ? `Note from their form: ${clip(lead.notes.trim(), 300)}` : null,
  ].filter(Boolean);

  const previous = priorCalls
    .filter((c) => c.summary)
    .slice(0, 2)
    .map((c) => `${new Date(c.created_at).toDateString()}: ${clip(c.summary as string, 400)}`);

  const contextNote = {
    first_call: "This is the first call. Introduce yourself and check it is a good time.",
    retry: "Earlier attempts to reach them did not connect. Do not mention missed calls unless they do.",
    callback: "They asked to be called back at this time. Thank them for making the time.",
    follow_up: "You spoke before. Pick up where the last call left off; do not repeat questions already answered.",
  }[context];

  const [essentials, premium] = PRICING_PLANS;
  const now = params.now ?? new Date();
  const launch = isLaunchPricingActive(now);
  const knownZone = isValidTimeZone(lead.timezone) ? lead.timezone : null;
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone: knownZone ?? "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return {
    lead_first_name: firstName(lead.full_name),
    lead_full_name: lead.full_name ?? "",
    how_they_came_to_us: howTheyCameToUs(lead, context),
    call_context: context,
    call_context_note: contextNote,
    lead_background: background.length ? background.join("\n") : "Nothing beyond what is listed under known answers.",
    known_answers: known.length ? known.join("\n") : "Nothing yet.",
    questions_still_needed: missing.length ? missing.join("; ") : "None. Confirm briefly and move to next steps.",
    previous_calls: previous.length ? previous.join("\n") : "None.",
    current_time_local: localNow,
    lead_timezone: knownZone ?? "unknown",
    founder_name: FOUNDER_NAME,
    essentials_price: `$${currentSetupFeeUsd(essentials, now)}`,
    premium_price: `$${currentSetupFeeUsd(premium, now)}`,
    pricing_note: launch
      ? `Launch pricing through ${LAUNCH_PRICING_END_LABEL}; it rises to $${essentials.listSetupFeeUsd} and $${premium.listSetupFeeUsd} after that.`
      : "Standard pricing.",
    success_fee_terms:
      "5% of first-year base salary plus guaranteed cash, only after they accept an offer, due within two months of their start date.",
  };
}
