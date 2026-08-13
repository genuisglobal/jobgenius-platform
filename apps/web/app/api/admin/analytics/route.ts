import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";

// GET /api/admin/analytics
// Returns platform-wide funnel and AM leaderboard (admin+ only)
export async function GET(req: NextRequest) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const role = normalizeAMRole(auth.user.role);
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { count: totalSeekers },
    { count: assignedSeekers },
    { count: appliedSeekers },
    { count: interviewedSeekers },
    { count: placedSeekers },
    { count: totalApplications },
    { count: interviewsThisMonth },
    { count: interviewsPrevMonth },
    { count: applicationsThisMonth },
    { count: applicationsPrevMonth },
    { data: amStats },
  ] = await Promise.all([
    // Total active seekers
    supabaseAdmin.from("job_seekers").select("id", { count: "exact", head: true }).eq("status", "active"),
    // Assigned (has at least one assignment)
    supabaseAdmin.from("job_seeker_assignments").select("job_seeker_id", { count: "exact", head: true }),
    // Applied (has at least one application)
    supabaseAdmin.from("applications").select("job_seeker_id", { count: "exact", head: true }),
    // Interviewed
    supabaseAdmin.from("interviews").select("job_seeker_id", { count: "exact", head: true }),
    // Placed
    supabaseAdmin.from("job_seekers").select("id", { count: "exact", head: true }).not("placed_at", "is", null),
    // Total applications
    supabaseAdmin.from("applications").select("id", { count: "exact", head: true }),
    // Interviews this month
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", monthStart),
    // Interviews prev month
    supabaseAdmin.from("interviews").select("id", { count: "exact", head: true }).gte("scheduled_at", prevMonthStart).lt("scheduled_at", monthStart),
    // Applications this month
    supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", monthStart),
    // Applications prev month
    supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", prevMonthStart).lt("applied_at", monthStart),
    // AM leaderboard
    supabaseAdmin
      .from("account_managers")
      // `name`, not `full_name` — and account_managers has no photo column
      // at all (profile_photo_url belongs to job_seekers).
      .select("id, name")
      .eq("status", "active")
      .limit(20),
  ]);

  // For each AM, get their stats
  let leaderboard: {
    id: string;
    full_name: string | null;
    photo: string | null;
    total_seekers: number;
    placed: number;
    interviews: number;
    placement_rate: number;
  }[] = [];

  if (amStats && amStats.length > 0) {
    const amIds = amStats.map((a) => a.id);

    const [{ data: assignCounts }, { data: placedCounts }, { data: ivCounts }] = await Promise.all([
      supabaseAdmin
        .from("job_seeker_assignments")
        .select("account_manager_id")
        .in("account_manager_id", amIds),
      supabaseAdmin
        .from("job_seekers")
        .select("id, job_seeker_assignments!inner(account_manager_id)")
        .not("placed_at", "is", null)
        .in("job_seeker_assignments.account_manager_id", amIds),
      supabaseAdmin
        .from("interviews")
        .select("account_manager_id")
        .in("account_manager_id", amIds),
    ]);

    const assignMap = new Map<string, number>();
    for (const r of (assignCounts ?? [])) {
      assignMap.set(r.account_manager_id, (assignMap.get(r.account_manager_id) ?? 0) + 1);
    }

    const placedMap = new Map<string, number>();
    for (const r of (placedCounts ?? [])) {
      const jsa = r.job_seeker_assignments as unknown as { account_manager_id: string }[] | null;
      for (const a of (jsa ?? [])) {
        placedMap.set(a.account_manager_id, (placedMap.get(a.account_manager_id) ?? 0) + 1);
      }
    }

    const ivMap = new Map<string, number>();
    for (const r of (ivCounts ?? [])) {
      ivMap.set(r.account_manager_id, (ivMap.get(r.account_manager_id) ?? 0) + 1);
    }

    leaderboard = amStats.map((am) => {
      const total = assignMap.get(am.id) ?? 0;
      const placed = placedMap.get(am.id) ?? 0;
      return {
        id: am.id,
        // Response field stays `full_name` — it is the shape clients consume.
        full_name: am.name,
        photo: null,
        total_seekers: total,
        placed,
        interviews: ivMap.get(am.id) ?? 0,
        placement_rate: total > 0 ? Math.round((placed / total) * 100) : 0,
      };
    });

    // Sort by placement rate desc, then by total seekers desc
    leaderboard.sort((a, b) =>
      b.placement_rate !== a.placement_rate
        ? b.placement_rate - a.placement_rate
        : b.total_seekers - a.total_seekers
    );
  }

  return NextResponse.json({
    funnel: {
      total_seekers: totalSeekers ?? 0,
      assigned: assignedSeekers ?? 0,
      applied: appliedSeekers ?? 0,
      interviewed: interviewedSeekers ?? 0,
      placed: placedSeekers ?? 0,
    },
    metrics: {
      total_applications: totalApplications ?? 0,
      interviews_this_month: interviewsThisMonth ?? 0,
      interviews_prev_month: interviewsPrevMonth ?? 0,
      applications_this_month: applicationsThisMonth ?? 0,
      applications_prev_month: applicationsPrevMonth ?? 0,
    },
    leaderboard,
  });
}
