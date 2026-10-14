import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30");
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Parallel queries for analytics
  const [
    totalRunsRes,
    successRunsRes,
    failedRunsRes,
    byAtsRes,
    byStatusRes,
    recentFailuresRes,
    funnelRes,
    dailyRes,
  ] = await Promise.all([
    // Total runs in period
    supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),

    // Successful (APPLIED)
    supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("status", "APPLIED"),

    // Failed
    supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("status", "FAILED"),

    // By ATS type
    supabaseAdmin
      .from("application_runs")
      .select("ats_type, status")
      .gte("created_at", since),

    // By status
    supabaseAdmin
      .from("application_runs")
      .select("status")
      .gte("created_at", since),

    // Recent failures with details
    supabaseAdmin
      .from("application_runs")
      .select("id, ats_type, last_error, last_error_code, current_step, created_at, job_posts(title, company)")
      .gte("created_at", since)
      .eq("status", "FAILED")
      .order("created_at", { ascending: false })
      .limit(20),

    // Conversion funnel: queued → applied → interview → placed
    Promise.all([
      supabaseAdmin
        .from("application_queue")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("application_runs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("status", "APPLIED"),
      supabaseAdmin
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("outcome", "hired"),
    ]),

    // Daily application counts (last 14 days)
    supabaseAdmin
      .from("application_runs")
      .select("created_at, status")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString()),
  ]);

  // Process by ATS type
  const atsByType: Record<string, { total: number; applied: number; failed: number }> = {};
  for (const r of byAtsRes.data ?? []) {
    const ats = r.ats_type ?? "UNKNOWN";
    if (!atsByType[ats]) atsByType[ats] = { total: 0, applied: 0, failed: 0 };
    atsByType[ats].total++;
    if (r.status === "APPLIED") atsByType[ats].applied++;
    if (r.status === "FAILED") atsByType[ats].failed++;
  }

  // Process status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const r of byStatusRes.data ?? []) {
    statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
  }

  // Process failure reasons
  const failureReasons: Record<string, number> = {};
  for (const r of recentFailuresRes.data ?? []) {
    const code = r.last_error_code ?? "unknown";
    failureReasons[code] = (failureReasons[code] || 0) + 1;
  }

  // Process daily counts
  const dailyCounts: Record<string, { total: number; applied: number; failed: number }> = {};
  for (const r of dailyRes.data ?? []) {
    const day = r.created_at.slice(0, 10);
    if (!dailyCounts[day]) dailyCounts[day] = { total: 0, applied: 0, failed: 0 };
    dailyCounts[day].total++;
    if (r.status === "APPLIED") dailyCounts[day].applied++;
    if (r.status === "FAILED") dailyCounts[day].failed++;
  }

  const [queuedRes, appliedRes, interviewedRes, placedRes] = funnelRes;

  return NextResponse.json({
    period_days: days,
    summary: {
      total_runs: totalRunsRes.count ?? 0,
      successful: successRunsRes.count ?? 0,
      failed: failedRunsRes.count ?? 0,
      success_rate: (totalRunsRes.count ?? 0) > 0
        ? Math.round(100 * (successRunsRes.count ?? 0) / (totalRunsRes.count ?? 1))
        : 0,
    },
    funnel: {
      queued: queuedRes.count ?? 0,
      applied: appliedRes.count ?? 0,
      interviewed: interviewedRes.count ?? 0,
      placed: placedRes.count ?? 0,
    },
    by_ats: atsByType,
    status_breakdown: statusBreakdown,
    failure_reasons: failureReasons,
    recent_failures: (recentFailuresRes.data ?? []).map((r) => ({
      id: r.id,
      ats_type: r.ats_type,
      error: r.last_error,
      error_code: r.last_error_code,
      step: r.current_step,
      job: r.job_posts,
      created_at: r.created_at,
    })),
    daily: Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts })),
  });
}
