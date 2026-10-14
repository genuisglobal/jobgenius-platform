import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { applyProposedRule } from "@/lib/host-rule-proposals";
import { logAdminAction } from "@/lib/audit";

/**
 * POST /api/admin/failure-diagnoses/[id]/apply
 *
 * Turns the diagnosis's proposed_rule into a host_automation_rules row
 * (status='pending_review'; admins still flip it to 'active' on the
 * Host Rules page). Idempotent on hosts overlap — links to an existing
 * pending row rather than duplicating.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: diagnosis } = await supabaseAdmin
    .from("failure_diagnoses")
    .select(
      "id, run_id, status, proposed_rule, applied_rule_id"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!diagnosis) {
    return NextResponse.json({ error: "Diagnosis not found." }, { status: 404 });
  }
  if (!diagnosis.proposed_rule || typeof diagnosis.proposed_rule !== "object") {
    return NextResponse.json(
      { error: "Diagnosis has no proposed_rule to apply." },
      { status: 400 }
    );
  }
  if (diagnosis.status === "applied" && diagnosis.applied_rule_id) {
    return NextResponse.json({
      ok: true,
      hostRuleId: diagnosis.applied_rule_id,
      created: false,
      message: "Already applied.",
    });
  }

  // Use the run's last_seen_url host as a fallback if the proposed rule
  // doesn't carry hosts.
  let fallbackHost: string | null = null;
  const { data: run } = await supabaseAdmin
    .from("application_runs")
    .select("last_seen_url")
    .eq("id", diagnosis.run_id)
    .maybeSingle();
  if (run?.last_seen_url) {
    try {
      fallbackHost = new URL(run.last_seen_url).hostname.toLowerCase();
    } catch {
      fallbackHost = null;
    }
  }

  const result = await applyProposedRule({
    proposed: diagnosis.proposed_rule as Record<string, unknown>,
    fallbackHost,
    source: `diagnosis:${diagnosis.id.slice(0, 8)}`,
    reviewerId: auth.user.id,
    autoApprove: false,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  await supabaseAdmin
    .from("failure_diagnoses")
    .update({
      status: "applied",
      reviewer_id: auth.user.id,
      decided_at: new Date().toISOString(),
      applied_rule_id: result.hostRuleId,
    })
    .eq("id", diagnosis.id);

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "failure_diagnosis",
    targetId: diagnosis.id,
    details: {
      action: "apply_proposed_rule",
      host_rule_id: result.hostRuleId,
      created: result.created,
    },
  });

  return NextResponse.json({
    ok: true,
    hostRuleId: result.hostRuleId,
    created: result.created,
  });
}
