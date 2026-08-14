import { supabaseServer } from "@/lib/supabase/server";
import { resolveFacts } from "@/lib/consultant/fact-ledger";
import { logActivity } from "@/lib/feedback-loop";
import type {
  DecisionVerdict,
  DecisionSubjectType,
  DecisionRiskCategory,
  ReasonCode,
} from "@/lib/consultant/decision-codes";

export type DecisionContext = {
  jobSeekerId: string;
  subjectType: DecisionSubjectType;
  subjectRef: string;
  /** Fact keys this action must have confirmed before it may proceed. */
  requiredFactKeys?: string[];
  isOffer?: boolean;
  scam?: boolean;
  scamRedFlags?: string[];
  dealBreakers?: string[];
};

export type Decision = {
  jobSeekerId: string;
  subjectType: DecisionSubjectType;
  subjectRef: string;
  verdict: DecisionVerdict;
  reasonCodes: ReasonCode[];
  recommendedAction: string;
  requiredFacts: string[];
  riskCategory: DecisionRiskCategory;
};

/**
 * The Act → Ask → Escalate rule. Deterministic + fail-closed:
 * offer/legal/scam escalate; unconfirmed sensitive fields ask; deal-breakers pause; else act.
 */
export async function decide(ctx: DecisionContext): Promise<Decision> {
  const base = {
    jobSeekerId: ctx.jobSeekerId,
    subjectType: ctx.subjectType,
    subjectRef: ctx.subjectRef,
  };

  if (ctx.subjectType === "offer" || ctx.isOffer) {
    return {
      ...base,
      verdict: "escalate",
      reasonCodes: ["OFFER_TERMS"],
      recommendedAction:
        "Review offer terms with the client. Do not negotiate or accept autonomously.",
      requiredFacts: [],
      riskCategory: "contractual",
    };
  }

  if (ctx.scam) {
    const flags = (ctx.scamRedFlags ?? []).join(", ");
    return {
      ...base,
      verdict: "escalate",
      reasonCodes: ["SCAM_RED_FLAG"],
      recommendedAction: `Treat as suspicious${flags ? ` (${flags})` : ""}. Verify the company and source before any client action — do not pay, share bank/ID details, or proceed.`,
      requiredFacts: [],
      riskCategory: "scam",
    };
  }

  const reqKeys = ctx.requiredFactKeys ?? [];
  const unconfirmed: string[] = [];
  const legalKeys: string[] = [];

  if (reqKeys.length > 0) {
    const resolved = await resolveFacts(ctx.jobSeekerId, reqKeys);
    for (const key of reqKeys) {
      const r = resolved[key];
      if (!r) continue;
      if (r.status === "escalate") legalKeys.push(key);
      else if (r.status !== "confirmed") unconfirmed.push(key);
    }
  }

  if (legalKeys.length > 0) {
    return {
      ...base,
      verdict: "escalate",
      reasonCodes: ["LEGAL_OR_CONTRACTUAL"],
      recommendedAction: `Sensitive/legal field(s) cannot be auto-answered: ${legalKeys.join(", ")}.`,
      requiredFacts: legalKeys,
      riskCategory: "legal",
    };
  }

  if (unconfirmed.length > 0) {
    return {
      ...base,
      verdict: "ask",
      reasonCodes: ["UNCONFIRMED_SENSITIVE_FIELD"],
      recommendedAction: `Confirm with the client before proceeding: ${unconfirmed.join(", ")}.`,
      requiredFacts: unconfirmed,
      riskCategory: "sensitive",
    };
  }

  if (ctx.dealBreakers && ctx.dealBreakers.length > 0) {
    return {
      ...base,
      verdict: "pause",
      reasonCodes: ["DEAL_BREAKER"],
      recommendedAction: `Possible deal-breaker(s): ${ctx.dealBreakers.join(", ")}. Review fit before applying.`,
      requiredFacts: [],
      riskCategory: "none",
    };
  }

  return {
    ...base,
    verdict: "act",
    reasonCodes: ["ALL_CLEAR"],
    recommendedAction: "Cleared to proceed.",
    requiredFacts: [],
    riskCategory: "none",
  };
}

/** Idempotent: one open decision per (subject_type, subject_ref). */
export async function recordDecision(d: Decision): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const row = {
    job_seeker_id: d.jobSeekerId,
    subject_type: d.subjectType,
    subject_ref: d.subjectRef,
    verdict: d.verdict,
    reason_codes: d.reasonCodes,
    recommended_action: d.recommendedAction,
    required_facts: d.requiredFacts,
    risk_category: d.riskCategory,
    decided_by: "system" as const,
    updated_at: nowIso,
  };

  const { data: existing } = await supabaseServer
    .from("consultant_decisions")
    .select("id")
    .eq("subject_type", d.subjectType)
    .eq("subject_ref", d.subjectRef)
    .eq("status", "open")
    .maybeSingle();

  if (existing?.id) {
    await supabaseServer.from("consultant_decisions").update(row).eq("id", existing.id);
    return existing.id as string;
  }

  const { data } = await supabaseServer
    .from("consultant_decisions")
    .insert(row)
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}

/** Surface the decision to humans via the seeker activity timeline. */
export async function routeDecision(d: Decision, decisionId: string | null): Promise<void> {
  const titles: Record<DecisionVerdict, string> = {
    escalate: "Escalation required",
    ask: "Client input needed",
    pause: "Action paused for review",
    act: "Auto-approved",
  };
  try {
    await logActivity(d.jobSeekerId, {
      eventType: `decision_${d.verdict}`,
      title: titles[d.verdict],
      description: d.recommendedAction,
      meta: {
        subject_type: d.subjectType,
        subject_ref: d.subjectRef,
        reason_codes: d.reasonCodes,
        required_facts: d.requiredFacts,
        risk_category: d.riskCategory,
      },
      refType: "consultant_decision",
      refId: decisionId ?? undefined,
    });
  } catch (err) {
    console.error("[decision-engine] routing failed:", err);
  }
}

export async function resolveDecision(
  id: string,
  opts: { resolvedBy?: string | null; resolution?: string | null }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("consultant_decisions")
    .update({
      status: "resolved",
      resolution: opts.resolution ?? null,
      resolved_by: opts.resolvedBy ?? null,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", id);
}

/** When a fact is confirmed, auto-resolve any open 'ask' decisions waiting on it. */
export async function closeOpenDecisionsForFact(
  jobSeekerId: string,
  factKey: string
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await supabaseServer
    .from("consultant_decisions")
    .update({
      status: "resolved",
      resolution: "fact_confirmed",
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "open")
    .contains("required_facts", [factKey])
    .select("id");
  return data?.length ?? 0;
}
