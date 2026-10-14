// Turns Emi's post-call analysis (Retell custom_analysis_data) into a lead
// decision: temperature, niche, fit score and the next action. Pure — the
// webhook persists the result. Field names here must match the Post Call
// Extraction fields configured on the Retell agent (docs/emi-agent.md).

import { nextCallingTime } from "@/lib/voice/calling-window";

export const EMI_CALL_OUTCOMES = [
  "qualified_conversation",
  "callback_requested",
  "not_interested",
  "wrong_person",
  "do_not_call",
  "no_conversation",
] as const;
export type EmiCallOutcome = (typeof EMI_CALL_OUTCOMES)[number];

export const LEAD_NICHES = [
  "cybersecurity_grc",
  "it_infrastructure",
  "database",
  "project_management",
  "construction_safety",
  "other",
] as const;
export type LeadNiche = (typeof LEAD_NICHES)[number];

const TIMELINES = ["now", "within_3_months", "3_6_months", "later", "unknown"] as const;
const AUTHORIZATIONS = [
  "us_citizen_or_pr",
  "visa_sponsorship_needed",
  "opt_or_temporary",
  "not_authorized",
  "unknown",
] as const;
const BUDGETS = ["ok", "needs_payment_plan", "negotiating", "no_budget", "unknown"] as const;
const EMPLOYMENT = ["employed", "unemployed", "student", "other", "unknown"] as const;

export type LeadTemperature = "hot" | "warm" | "nurture" | "realign" | "disqualified";
export type LeadNextAction =
  | "call"
  | "callback"
  | "founder_call"
  | "founder_review"
  | "nurture_email"
  | "closed";
export type LeadStatus = "new" | "qualified" | "nurture" | "disqualified" | "converted";

export type EmiAnalysis = {
  callOutcome: EmiCallOutcome | null;
  callbackTimeIso: string | null;
  leadTimezone: string | null;
  targetRole: string | null;
  niche: LeadNiche | null;
  yearsExperience: number | null;
  employmentStatus: (typeof EMPLOYMENT)[number];
  searchTimeline: (typeof TIMELINES)[number];
  salaryTargetUsd: number | null;
  workAuthorization: (typeof AUTHORIZATIONS)[number];
  decisionMakers: string | null;
  budgetStatus: (typeof BUDGETS)[number];
  fitRating: number | null;
  fitRatingReason: string | null;
  fitMissing: string | null;
  concerns: string | null;
  realignReason: string | null;
  disqualifyReason: string | null;
  founderCallBooked: boolean;
  founderCallTimeIso: string | null;
  permissionToFollowUp: boolean;
  referralName: string | null;
  referralContact: string | null;
};

type Raw = Record<string, unknown>;

function str(raw: Raw, key: string): string | null {
  const v = raw[key];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || ["n/a", "na", "none", "unknown", "null"].includes(t.toLowerCase())) return null;
  return t;
}

function num(raw: Raw, key: string): number | null {
  const v = raw[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, "").replace(/k$/i, "000"));
    return Number.isFinite(n) && v.trim() ? n : null;
  }
  return null;
}

function bool(raw: Raw, key: string): boolean {
  const v = raw[key];
  return v === true || (typeof v === "string" && ["true", "yes"].includes(v.trim().toLowerCase()));
}

function pick<T extends readonly string[]>(raw: Raw, key: string, allowed: T, fallback: T[number]): T[number] {
  const v = str(raw, key)?.toLowerCase();
  return v && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function pickOrNull<T extends readonly string[]>(raw: Raw, key: string, allowed: T): T[number] | null {
  const v = str(raw, key)?.toLowerCase();
  return v && (allowed as readonly string[]).includes(v) ? (v as T[number]) : null;
}

/** Tolerant parse: the LLM may return strings for numbers, "N/A", odd casing. */
export function parseEmiAnalysis(raw: Raw): EmiAnalysis {
  return {
    callOutcome: pickOrNull(raw, "call_outcome", EMI_CALL_OUTCOMES),
    callbackTimeIso: str(raw, "callback_time_iso"),
    leadTimezone: str(raw, "lead_timezone"),
    targetRole: str(raw, "target_role"),
    niche: pickOrNull(raw, "niche", LEAD_NICHES),
    yearsExperience: num(raw, "years_experience"),
    employmentStatus: pick(raw, "employment_status", EMPLOYMENT, "unknown"),
    searchTimeline: pick(raw, "search_timeline", TIMELINES, "unknown"),
    salaryTargetUsd: num(raw, "salary_target_usd"),
    workAuthorization: pick(raw, "work_authorization", AUTHORIZATIONS, "unknown"),
    decisionMakers: str(raw, "decision_makers"),
    budgetStatus: pick(raw, "budget_status", BUDGETS, "unknown"),
    fitRating: num(raw, "fit_rating_1_10"),
    fitRatingReason: str(raw, "fit_rating_reason"),
    fitMissing: str(raw, "fit_missing"),
    concerns: str(raw, "concerns"),
    realignReason: str(raw, "realign_reason"),
    disqualifyReason: str(raw, "disqualify_reason"),
    founderCallBooked: bool(raw, "founder_call_booked"),
    founderCallTimeIso: str(raw, "founder_call_time_iso"),
    permissionToFollowUp: bool(raw, "permission_to_follow_up"),
    referralName: str(raw, "referral_name"),
    referralContact: str(raw, "referral_contact"),
  };
}

const CORE_NICHES: LeadNiche[] = [
  "cybersecurity_grc",
  "it_infrastructure",
  "database",
  "project_management",
  "construction_safety",
];

/** 0–100 fit score. Six factors; unknowns score mid so missing data neither sinks nor lifts a lead. */
export function scoreLead(a: EmiAnalysis): number {
  const auth = {
    us_citizen_or_pr: 20,
    opt_or_temporary: 10,
    unknown: 10,
    visa_sponsorship_needed: 5,
    not_authorized: 0,
  }[a.workAuthorization];

  const y = a.yearsExperience;
  const experience = y == null ? 8 : y >= 5 ? 20 : y >= 3 ? 15 : y >= 1 ? 8 : 3;

  const niche = a.niche == null ? 7 : CORE_NICHES.includes(a.niche) ? 15 : 7;

  const s = a.salaryTargetUsd;
  const salary = s == null ? 7 : s >= 100_000 ? 15 : s >= 70_000 ? 12 : s >= 50_000 ? 7 : 3;

  const timeline = { now: 15, within_3_months: 12, "3_6_months": 6, later: 2, unknown: 6 }[
    a.searchTimeline
  ];

  const budget = { ok: 15, needs_payment_plan: 11, negotiating: 9, unknown: 7, no_budget: 2 }[
    a.budgetStatus
  ];

  return Math.max(0, Math.min(100, auth + experience + niche + salary + timeline + budget));
}

export const HOT_SCORE = 75;
export const WARM_SCORE = 50;
/** Unanswered-call retry delays after attempt 1, 2; attempt 3 failing moves the lead to email. */
export const NO_ANSWER_RETRY_DELAYS_MIN = [120, 24 * 60];
export const MAX_CALL_ATTEMPTS = NO_ANSWER_RETRY_DELAYS_MIN.length + 1;
const WARM_FOLLOW_UP_DAYS = 3;

export type LeadDecision = {
  /** undefined = leave the lead's current value unchanged. */
  temperature?: LeadTemperature;
  status?: LeadStatus;
  niche?: LeadNiche;
  fitScore?: number;
  nextAction: LeadNextAction;
  nextActionAt: Date | null;
  /** When set, Emi should place another call at this time. */
  scheduleCallAt: Date | null;
  disqualifyReason?: string | null;
  /** Lead asked not to be called again — add to the all-voice opt-out list. */
  optOut: boolean;
  timezone?: string;
  /** Answers to merge into lead.qualification (only non-empty values). */
  qualificationPatch: Record<string, unknown>;
};

const STATUS_FOR: Record<LeadTemperature, LeadStatus> = {
  hot: "qualified",
  warm: "qualified",
  nurture: "nurture",
  realign: "nurture",
  disqualified: "disqualified",
};

function parseFutureDate(iso: string | null, now: Date): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && d.getTime() > now.getTime() ? d : null;
}

function answersPatch(a: EmiAnalysis): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    target_role: a.targetRole,
    years_experience: a.yearsExperience,
    employment_status: a.employmentStatus === "unknown" ? null : a.employmentStatus,
    search_timeline: a.searchTimeline === "unknown" ? null : a.searchTimeline,
    salary_target_usd: a.salaryTargetUsd,
    work_authorization: a.workAuthorization === "unknown" ? null : a.workAuthorization,
    decision_makers: a.decisionMakers,
    budget_status: a.budgetStatus === "unknown" ? null : a.budgetStatus,
    fit_rating_1_10: a.fitRating,
    fit_rating_reason: a.fitRatingReason,
    fit_missing: a.fitMissing,
    concerns: a.concerns,
    realign_reason: a.realignReason,
    referral_name: a.referralName,
    referral_contact: a.referralContact,
    permission_to_follow_up: a.permissionToFollowUp || null,
    founder_call_time_iso: a.founderCallTimeIso,
  };
  for (const key of Object.keys(patch)) if (patch[key] == null) delete patch[key];
  return patch;
}

export function decideLeadOutcome(input: {
  /** Parsed analysis, or null when the call never connected / produced no analysis. */
  analysis: EmiAnalysis | null;
  /** The call reached a person (not no-answer / voicemail / failed dial). */
  connected: boolean;
  /** Calls placed to this lead so far, including the one that just ended. */
  attempts: number;
  timezone: string | null;
  /** Lead temperature before this call, to stop warm leads being re-called forever. */
  previousTemperature?: LeadTemperature | null;
  now: Date;
}): LeadDecision {
  const { analysis: a, now } = input;
  const zone = a?.leadTimezone && a.leadTimezone.includes("/") ? a.leadTimezone : input.timezone;
  const base = {
    optOut: false,
    qualificationPatch: a ? answersPatch(a) : {},
    ...(zone && zone !== input.timezone ? { timezone: zone } : {}),
  };

  const outcome: EmiCallOutcome | null = !input.connected
    ? "no_conversation"
    : (a?.callOutcome ?? null);

  if (outcome === "no_conversation" || outcome === null) {
    if (input.connected && outcome === null) {
      // Connected but the analysis gave no outcome — let a human look.
      return { ...base, nextAction: "founder_review", nextActionAt: now, scheduleCallAt: null };
    }
    const delay = NO_ANSWER_RETRY_DELAYS_MIN[input.attempts - 1];
    if (delay != null) {
      const at = nextCallingTime(new Date(now.getTime() + delay * 60_000), zone);
      return { ...base, nextAction: "call", nextActionAt: at, scheduleCallAt: at };
    }
    return {
      ...base,
      temperature: "nurture",
      status: "nurture",
      nextAction: "nurture_email",
      nextActionAt: now,
      scheduleCallAt: null,
    };
  }

  // Past this point the call connected and `a` is non-null.
  const analysis = a as EmiAnalysis;

  if (outcome === "callback_requested") {
    const requested =
      parseFutureDate(analysis.callbackTimeIso, now) ?? new Date(now.getTime() + 24 * 3_600_000);
    const at = nextCallingTime(requested, zone);
    return { ...base, nextAction: "callback", nextActionAt: at, scheduleCallAt: at };
  }

  if (outcome === "do_not_call") {
    return {
      ...base,
      temperature: "disqualified",
      status: "disqualified",
      disqualifyReason: "Asked not to be called again",
      nextAction: "closed",
      nextActionAt: null,
      scheduleCallAt: null,
      optOut: true,
    };
  }

  if (outcome === "wrong_person") {
    return {
      ...base,
      temperature: "disqualified",
      status: "disqualified",
      disqualifyReason: "Wrong person / wrong number",
      nextAction: "closed",
      nextActionAt: null,
      scheduleCallAt: null,
    };
  }

  if (outcome === "not_interested") {
    return analysis.permissionToFollowUp
      ? {
          ...base,
          temperature: "nurture",
          status: "nurture",
          nextAction: "nurture_email",
          nextActionAt: now,
          scheduleCallAt: null,
        }
      : {
          ...base,
          temperature: "disqualified",
          status: "disqualified",
          disqualifyReason: analysis.disqualifyReason ?? "Not interested",
          nextAction: "closed",
          nextActionAt: null,
          scheduleCallAt: null,
        };
  }

  // qualified_conversation
  const fitScore = scoreLead(analysis);
  const niche = analysis.niche ?? "other";
  const scored = { ...base, fitScore, niche };

  if (analysis.workAuthorization === "not_authorized") {
    return {
      ...scored,
      temperature: "disqualified",
      status: "disqualified",
      disqualifyReason: "Not authorized to work in the US",
      nextAction: "closed",
      nextActionAt: null,
      scheduleCallAt: null,
    };
  }

  if (analysis.founderCallBooked) {
    return {
      ...scored,
      temperature: "hot",
      status: "qualified",
      nextAction: "founder_call",
      nextActionAt: parseFutureDate(analysis.founderCallTimeIso, now) ?? now,
      scheduleCallAt: null,
    };
  }

  if (analysis.realignReason) {
    return {
      ...scored,
      temperature: "realign",
      status: STATUS_FOR.realign,
      nextAction: "founder_review",
      nextActionAt: now,
      scheduleCallAt: null,
    };
  }

  const ready =
    ["now", "within_3_months"].includes(analysis.searchTimeline) &&
    ["ok", "needs_payment_plan"].includes(analysis.budgetStatus);

  if (fitScore >= HOT_SCORE && ready) {
    // Phase 1: Emi cannot book yet, so a hot lead lands on the founder to book.
    return {
      ...scored,
      temperature: "hot",
      status: "qualified",
      nextAction: "founder_call",
      nextActionAt: now,
      scheduleCallAt: null,
    };
  }

  if (fitScore >= WARM_SCORE && input.previousTemperature === "warm") {
    // Second warm call in a row: Emi has done her part, a human decides.
    return {
      ...scored,
      temperature: "warm",
      status: "qualified",
      nextAction: "founder_review",
      nextActionAt: now,
      scheduleCallAt: null,
    };
  }

  if (fitScore >= WARM_SCORE) {
    const at = nextCallingTime(new Date(now.getTime() + WARM_FOLLOW_UP_DAYS * 86_400_000), zone);
    return {
      ...scored,
      temperature: "warm",
      status: "qualified",
      nextAction: "callback",
      nextActionAt: at,
      scheduleCallAt: at,
    };
  }

  return {
    ...scored,
    temperature: "nurture",
    status: "nurture",
    nextAction: "nurture_email",
    nextActionAt: now,
    scheduleCallAt: null,
  };
}
