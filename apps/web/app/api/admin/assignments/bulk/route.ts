import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

/**
 * POST /api/admin/assignments/bulk
 * Bulk assign multiple job seekers to an account manager
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { job_seeker_ids, account_manager_id } = body;

    if (!job_seeker_ids || !Array.isArray(job_seeker_ids) || job_seeker_ids.length === 0) {
      return NextResponse.json(
        { error: "job_seeker_ids array is required." },
        { status: 400 }
      );
    }

    if (job_seeker_ids.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 assignments per request." },
        { status: 400 }
      );
    }

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(job_seeker_ids.filter((id: unknown) => typeof id === "string" && id.length > 0)));
    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "No valid job_seeker_ids provided." },
        { status: 400 }
      );
    }

    if (!account_manager_id || typeof account_manager_id !== "string") {
      return NextResponse.json(
        { error: "account_manager_id is required." },
        { status: 400 }
      );
    }

    // Verify account manager exists
    const { data: am } = await supabaseAdmin
      .from("account_managers")
      .select("id")
      .eq("id", account_manager_id)
      .single();

    if (!am) {
      return NextResponse.json(
        { error: "Account manager not found." },
        { status: 404 }
      );
    }

    // Delete existing assignments for these job seekers
    const { error: deleteError } = await supabaseAdmin
      .from("job_seeker_assignments")
      .delete()
      .in("job_seeker_id", uniqueIds);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to remove existing assignments." },
        { status: 500 }
      );
    }

    // Create new assignments
    const assignments = uniqueIds.map((job_seeker_id: string) => ({
      job_seeker_id,
      account_manager_id,
    }));

    const { data, error } = await supabaseAdmin
      .from("job_seeker_assignments")
      .insert(assignments)
      .select();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      action: "assignment.bulk",
      targetType: "job_seeker",
      details: { account_manager_id, seeker_count: uniqueIds.length },
    }).catch((e) => console.error("Audit log failed", e));

    return NextResponse.json({
      count: data?.length || 0,
      assignments: data,
    });
  } catch (error) {
    console.error("Error bulk assigning:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
