import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { syncExpiredPreviews } from "@/lib/intake";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  await syncExpiredPreviews();

  let query = supabaseAdmin
    .from("job_seeker_intake_states")
    .select(
      `
        *,
        job_seekers (id, full_name, email, location, seniority, onboarding_completed_at, profile_completion),
        assigned_account_manager:account_managers!job_seeker_intake_states_assigned_account_manager_id_fkey (id, name, email)
      `
    )
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load intake queue." },
      { status: 500 }
    );
  }

  return NextResponse.json({ intakeStates: data ?? [] });
}
