import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import crypto from "crypto";

/**
 * Verify extension token and return the account manager
 */
async function verifyExtensionToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Find valid session
  const { data: session, error } = await supabaseAdmin
    .from("extension_sessions")
    .select("id, account_manager_id, active_job_seeker_id, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !session) {
    return null;
  }

  // Update last active
  await supabaseAdmin
    .from("extension_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", session.id);

  return session;
}

/**
 * GET /api/extension/seekers
 * Get assigned job seekers for dropdown
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionToken(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    // Get assigned job seekers
    const { data: assignments, error } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select(`
        job_seeker_id,
        job_seekers (
          id,
          full_name,
          email,
          location,
          seniority,
          status
        )
      `)
      .eq("account_manager_id", session.account_manager_id);

    if (error) {
      console.error("Error fetching seekers:", error);
      return NextResponse.json(
        { error: "Failed to fetch job seekers." },
        { status: 500 }
      );
    }

    const seekers = (assignments || [])
      .map((a) => a.job_seekers as unknown as {
        id: string;
        full_name: string | null;
        email: string;
        location: string | null;
        seniority: string | null;
        status: string | null;
      })
      .filter(Boolean);

    return NextResponse.json({
      seekers,
      active_job_seeker_id: session.active_job_seeker_id,
    });
  } catch (error) {
    console.error("Extension seekers error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/extension/seekers
 * Set the active job seeker
 */
export async function POST(request: Request) {
  try {
    const session = await verifyExtensionToken(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { job_seeker_id } = body;

    if (!job_seeker_id) {
      return NextResponse.json(
        { error: "job_seeker_id is required." },
        { status: 400 }
      );
    }

    // Verify the job seeker is assigned to this AM
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Job seeker is not assigned to you." },
        { status: 403 }
      );
    }

    // Update active job seeker in session
    const { error } = await supabaseAdmin
      .from("extension_sessions")
      .update({ active_job_seeker_id: job_seeker_id })
      .eq("id", session.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update active seeker." },
        { status: 500 }
      );
    }

    // Get the seeker details
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, email, location, seniority")
      .eq("id", job_seeker_id)
      .single();

    return NextResponse.json({
      success: true,
      active_job_seeker: seeker,
    });
  } catch (error) {
    console.error("Extension set seeker error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
