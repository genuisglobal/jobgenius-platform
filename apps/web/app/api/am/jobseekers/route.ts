import { requireAM } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const isAdmin = auth.user.role === "admin" || auth.user.role === "superadmin";

  const accountManager = {
    id: auth.user.id,
    name: auth.user.name ?? null,
    email: auth.user.email,
  };

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (isAdmin) {
    const { data: seekers, error, count } = await supabaseServer
      .from("job_seekers")
      .select("id, full_name, email, location, seniority, target_titles, work_type", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return Response.json(
        { success: false, error: "Failed to load job seekers." },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      account_manager: accountManager,
      job_seekers: seekers ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  }

  const { data: assignments, error: assignmentsError, count } = await supabaseServer
    .from("job_seeker_assignments")
    .select(
      "job_seeker_id, job_seekers (id, full_name, email, location, seniority, target_titles, work_type)",
      { count: "exact" }
    )
    .eq("account_manager_id", accountManager.id)
    .range(from, to);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seekers." },
      { status: 500 }
    );
  }

  const seekers = (assignments ?? [])
    .map((assignment) => assignment.job_seekers)
    .filter(Boolean);

  return Response.json({
    success: true,
    account_manager: accountManager,
    job_seekers: seekers,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}
