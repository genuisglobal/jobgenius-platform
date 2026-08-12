import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { loadAdjacentOperatorAnalytics } from "@/lib/analytics/adjacent-operator";
import { normalizeAMRole } from "@/lib/auth/roles";
import AnalyticsClient from "./AnalyticsClient";

type LeaderboardEntry = {
  id: string;
  full_name: string | null;
  photo: string | null;
  total_seekers: number;
  placed: number;
  interviews: number;
  placement_rate: number;
};

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = normalizeAMRole(user.role);
  if (role !== "admin" && role !== "superadmin") redirect("/dashboard/admin");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: totalSeekers },
    { count: assignedSeekers },
    { count: appliedSeekers },
    { count: interviewedSeekers },
    { count: placedSeekers },
    { count: interviewsThisMonth },
    { count: interviewsPrevMonth },
    { count: applicationsThisMonth },
    { count: applicationsPrevMonth },
    { data: amList },
    adjacentOperator,
  ] = await Promise.all([
    supabaseAdmin.from("job_seekers").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabaseAdmin.from("job_seeker_assignments").select("job_seeker_id", { count: "exact", head: true }),
    supabaseAdmin.from("applications").select("job_seeker_id", { count: "exact", head: true }),
    supabaseAdmin.from("interviews").select("job_seeker_id", { count: "exact", head: true }),
    supabaseAdmin.from("job_seekers").select("id", { count: "exact", head: true }).not("placed_at", "is", null),
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", monthStart),
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", prevMonthStart).lt("scheduled_at", monthStart),
    supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", monthStart),
    supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", prevMonthStart).lt("applied_at", monthStart),
    supabaseAdmin.from("account_managers").select("id, full_name, profile_photo_url").eq("status", "active").limit(20),
    loadAdjacentOperatorAnalytics(),
  ]);

  let leaderboard: LeaderboardEntry[] = [];

  if (amList && amList.length > 0) {
    const amIds = amList.map((a) => a.id);

    const [{ data: assignCounts }, { data: placedData }, { data: ivCounts }] = await Promise.all([
      supabaseAdmin.from("job_seeker_assignments").select("account_manager_id").in("account_manager_id", amIds),
      supabaseAdmin.from("job_seekers").select("id, job_seeker_assignments!inner(account_manager_id)").not("placed_at", "is", null),
      supabaseAdmin.from("interviews").select("account_manager_id").in("account_manager_id", amIds),
    ]);

    const assignMap = new Map<string, number>();
    for (const r of (assignCounts ?? [])) {
      assignMap.set(r.account_manager_id, (assignMap.get(r.account_manager_id) ?? 0) + 1);
    }

    const placedMap = new Map<string, number>();
    for (const r of (placedData ?? [])) {
      const jsa = r.job_seeker_assignments as unknown as { account_manager_id: string }[] | null;
      for (const a of (jsa ?? [])) {
        if (amIds.includes(a.account_manager_id)) {
          placedMap.set(a.account_manager_id, (placedMap.get(a.account_manager_id) ?? 0) + 1);
        }
      }
    }

    const ivMap = new Map<string, number>();
    for (const r of (ivCounts ?? [])) {
      ivMap.set(r.account_manager_id, (ivMap.get(r.account_manager_id) ?? 0) + 1);
    }

    leaderboard = amList.map((am) => {
      const total = assignMap.get(am.id) ?? 0;
      const placed = placedMap.get(am.id) ?? 0;
      return {
        id: am.id,
        full_name: am.full_name,
        photo: am.profile_photo_url ?? null,
        total_seekers: total,
        placed,
        interviews: ivMap.get(am.id) ?? 0,
        placement_rate: total > 0 ? Math.round((placed / total) * 100) : 0,
      };
    }).sort((a, b) =>
      b.placement_rate !== a.placement_rate
        ? b.placement_rate - a.placement_rate
        : b.total_seekers - a.total_seekers
    );
  }

  return (
    <AnalyticsClient
      funnel={{
        total_seekers: totalSeekers ?? 0,
        assigned: assignedSeekers ?? 0,
        applied: appliedSeekers ?? 0,
        interviewed: interviewedSeekers ?? 0,
        placed: placedSeekers ?? 0,
      }}
      metrics={{
        interviews_this_month: interviewsThisMonth ?? 0,
        interviews_prev_month: interviewsPrevMonth ?? 0,
        applications_this_month: applicationsThisMonth ?? 0,
        applications_prev_month: applicationsPrevMonth ?? 0,
      }}
      leaderboard={leaderboard}
      adjacentOperator={adjacentOperator}
    />
  );
}
