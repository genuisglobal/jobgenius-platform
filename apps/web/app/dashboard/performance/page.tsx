import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import PerformanceClient from "./PerformanceClient";

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role || (!isAdminRole(user.role) && user.role !== "am")) {
    redirect("/dashboard");
  }

  const amId = user.id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Step 1: Get assigned seeker IDs
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id, assigned_at")
    .eq("account_manager_id", amId);

  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id);
  const totalSeekers = seekerIds.length;

  // Step 2: Parallel queries
  const [
    { count: placedSeekers },
    { count: interviewsThisMonth },
    { count: interviewsAllTime },
    { count: applicationsThisMonth },
    { count: applicationsAllTime },
    { data: recentInterviews },
  ] = await Promise.all([
    seekerIds.length > 0
      ? supabaseAdmin.from("job_seekers").select("id", { count: "exact", head: true }).not("placed_at", "is", null).in("id", seekerIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).eq("account_manager_id", amId).gte("scheduled_at", monthStart),
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).eq("account_manager_id", amId),
    seekerIds.length > 0
      ? supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", monthStart).in("job_seeker_id", seekerIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    seekerIds.length > 0
      ? supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).in("job_seeker_id", seekerIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    supabaseAdmin.from("interviews").select("job_seeker_id, scheduled_at").eq("account_manager_id", amId).order("scheduled_at", { ascending: true }).limit(200),
  ]);

  // Compute avg days to first interview
  let avgDaysToFirstInterview: number | null = null;
  if (recentInterviews && recentInterviews.length > 0 && assignments && assignments.length > 0) {
    const firstBySeeker = new Map<string, string>();
    for (const iv of recentInterviews) {
      if (!firstBySeeker.has(iv.job_seeker_id)) {
        firstBySeeker.set(iv.job_seeker_id, iv.scheduled_at);
      }
    }
    const assignMap = new Map<string, string>();
    for (const a of assignments) {
      if (a.assigned_at) assignMap.set(a.job_seeker_id, a.assigned_at);
    }
    const diffs: number[] = [];
    for (const [sid, firstIv] of Array.from(firstBySeeker.entries())) {
      const assignedAt = assignMap.get(sid);
      if (assignedAt) {
        const diff = (new Date(firstIv).getTime() - new Date(assignedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (diff >= 0) diffs.push(diff);
      }
    }
    if (diffs.length > 0) {
      avgDaysToFirstInterview = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
  }

  const placed = placedSeekers ?? 0;

  // Get AM display name
  const { data: amData } = await supabaseAdmin
    .from("account_managers")
    // `name`, not full_name — selecting the latter failed the query and
    // silently fell back to the email address below.
    .select("name")
    .eq("id", amId)
    .single();

  return (
    <PerformanceClient
      stats={{
        total_seekers: totalSeekers,
        placed_seekers: placed,
        placement_rate: totalSeekers > 0 ? Math.round((placed / totalSeekers) * 100) : 0,
        interviews_this_month: interviewsThisMonth ?? 0,
        interviews_all_time: interviewsAllTime ?? 0,
        applications_this_month: applicationsThisMonth ?? 0,
        applications_all_time: applicationsAllTime ?? 0,
        avg_days_to_first_interview: avgDaysToFirstInterview,
      }}
      amName={amData?.name ?? user.email ?? ""}
    />
  );
}
