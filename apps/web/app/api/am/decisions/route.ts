import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

/**
 * AM Decisions inbox: open Act/Ask/Escalate items for the seekers this AM manages.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabaseAdmin
    .from("consultant_decisions")
    .select(
      "id, job_seeker_id, subject_type, subject_ref, verdict, reason_codes, recommended_action, required_facts, risk_category, created_at, job_seekers(full_name)"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isAdminRole(user.role)) {
    const { data: assignments } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", user.id);
    const ids = (assignments ?? []).map((a) => a.job_seeker_id as string);
    if (ids.length === 0) {
      return NextResponse.json({ decisions: [] });
    }
    query = query.in("job_seeker_id", ids);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const decisions = (data ?? []).map((d) => {
    const seeker = Array.isArray(d.job_seekers) ? d.job_seekers[0] : d.job_seekers;
    return {
      id: d.id,
      job_seeker_id: d.job_seeker_id,
      seeker_name: (seeker as { full_name?: string } | null)?.full_name ?? "Unknown",
      subject_type: d.subject_type,
      subject_ref: d.subject_ref,
      verdict: d.verdict,
      reason_codes: d.reason_codes,
      recommended_action: d.recommended_action,
      required_facts: d.required_facts,
      risk_category: d.risk_category,
      created_at: d.created_at,
    };
  });

  return NextResponse.json({ decisions });
}
