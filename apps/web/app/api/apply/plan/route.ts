import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return Response.json(
      { success: false, error: "Missing runId." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, claim_token")
    .eq("id", runId)
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

  const { data: plan, error } = await supabaseServer
    .from("apply_plans")
    .select("plan, version, created_at")
    .eq("run_id", runId)
    .maybeSingle();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to load plan." },
      { status: 500 }
    );
  }

  if (!plan) {
    return Response.json(
      { success: false, error: "Plan not found." },
      { status: 404 }
    );
  }

  return Response.json({
    success: true,
    plan: plan.plan,
    version: plan.version,
    created_at: plan.created_at,
  });
}
