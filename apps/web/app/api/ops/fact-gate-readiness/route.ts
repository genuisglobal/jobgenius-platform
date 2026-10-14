import { supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { getMissingRequiredFacts } from "@/lib/consultant/fact-ledger";

const OPS_API_KEY = process.env.OPS_API_KEY;

// Must match AUTO_APPLY_REQUIRED_FACTS in app/api/background/run/route.ts.
const REQUIRED_FACTS = ["work_authorization", "requires_sponsorship"];

/**
 * GET /api/ops/fact-gate-readiness
 *
 * Reports how many seekers active in the apply pipeline have ALL the facts the
 * fact-gate requires confirmed. Run this before enabling FACT_GATE_ENFORCED:
 * with the flag on, an auto-apply is blocked whenever a required fact is
 * unconfirmed, so this tells you what share of clients would be blocked today.
 *
 * Auth: OPS_API_KEY via x-ops-key.
 */
export async function GET(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Seekers currently in the apply pipeline are the ones the gate affects.
  const { data: queueRows, error } = await supabaseAdmin
    .from("application_queue")
    .select("job_seeker_id")
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seekerIds = Array.from(
    new Set((queueRows ?? []).map((r) => r.job_seeker_id).filter(Boolean))
  ) as string[];

  let ready = 0;
  let notReady = 0;
  const missingByFact: Record<string, number> = {};
  for (const f of REQUIRED_FACTS) missingByFact[f] = 0;

  for (const id of seekerIds) {
    const missing = await getMissingRequiredFacts(id, REQUIRED_FACTS);
    if (missing.length === 0) {
      ready += 1;
    } else {
      notReady += 1;
      for (const f of missing) missingByFact[f] = (missingByFact[f] ?? 0) + 1;
    }
  }

  const total = seekerIds.length;
  return NextResponse.json({
    required_facts: REQUIRED_FACTS,
    seekers_in_pipeline: total,
    fact_ready: ready,
    not_ready: notReady,
    ready_pct: total > 0 ? Math.round((100 * ready) / total) : 100,
    missing_by_fact: missingByFact,
    recommendation:
      total === 0
        ? "No seekers in the pipeline."
        : ready === total
          ? "All pipeline seekers are fact-ready — safe to enable FACT_GATE_ENFORCED."
          : `${notReady} of ${total} seekers are missing a required fact — confirm those before enforcing, or enforcement will block their auto-applies.`,
  });
}
