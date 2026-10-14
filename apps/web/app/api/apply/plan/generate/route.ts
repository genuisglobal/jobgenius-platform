import { requireAMAccessToSeeker } from "@/lib/am-access";
import { buildApplyAutomationHints } from "@/lib/apply-learning";
import { resolveJobTargetUrl } from "@/lib/job-url";
import { supabaseServer } from "@/lib/supabase/server";

const PLAN_VERSION = 4;

type GeneratePayload = {
  run_id?: string;
};

function buildPlan(args: {
  runId: string;
  jobSeekerId: string;
  ats: string | null;
  targetUrl: string | null;
  automation: {
    max_auto_advance_steps: number;
    max_no_progress_rounds: number;
    button_hints: string[];
    apply_entry_hints: string[];
    rule_id: string | null;
    requires_apply_entry: boolean;
    prefer_popup_handoff: boolean;
    blockers: { error_code: string; count: number }[];
    generated_at: string;
    url_host: string | null;
  };
}) {
  return {
    version: PLAN_VERSION,
    metadata: {
      ats: args.ats,
      targetUrl: args.targetUrl,
      runId: args.runId,
      jobSeekerId: args.jobSeekerId,
      automation: args.automation,
      createdAt: new Date().toISOString(),
    },
    steps: [
      { name: "OPEN_URL" },
      { name: "DETECT_ATS" },
      { name: "TRY_APPLY_ENTRY" },
      { name: "EXTRACT_FIELDS" },
      { name: "FILL_KNOWN" },
      { name: "CHECK_REQUIRED" },
      { name: "TRY_SUBMIT" },
      {
        name: "AUTO_ADVANCE",
        max_iterations: args.automation.max_auto_advance_steps,
        max_no_progress_rounds: args.automation.max_no_progress_rounds,
      },
      { name: "CONFIRM" },
    ],
  };
}

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: GeneratePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, job_post_id, ats_type, claim_token")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  if (requiresClaimToken(request.headers)) {
    const claimToken = request.headers.get("x-claim-token") ?? "";
    if (!claimToken) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== claimToken) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const { data: existing } = await supabaseServer
    .from("apply_plans")
    .select("plan, version, created_at")
    .eq("run_id", run.id)
    .maybeSingle();

  if (existing && Number(existing.version ?? 1) >= PLAN_VERSION) {
    return Response.json({ success: true, plan: existing.plan, version: existing.version });
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("url")
    .eq("id", run.job_post_id)
    .maybeSingle();

  const resolvedTargetUrl = resolveJobTargetUrl(jobPost?.url ?? "");
  const targetUrl = resolvedTargetUrl || jobPost?.url || null;

  const automation = await buildApplyAutomationHints({
    atsType: run.ats_type,
    jobUrl: targetUrl,
  });

  const plan = buildPlan({
    runId: run.id,
    jobSeekerId: run.job_seeker_id,
    ats: run.ats_type,
    targetUrl,
    automation,
  });

  const { error: insertError } = await supabaseServer
    .from("apply_plans")
    .upsert(
      {
        run_id: run.id,
        plan,
        version: plan.version,
      },
      { onConflict: "run_id" }
    );

  if (insertError) {
    return Response.json(
      { success: false, error: "Failed to store plan." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, plan, version: plan.version });
}
