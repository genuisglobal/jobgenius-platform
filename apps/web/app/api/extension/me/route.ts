import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/extension/me
 * Get current session info (verify token is still valid)
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No token provided." },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find valid session with AM details
    const { data: session, error } = await supabaseAdmin
      .from("extension_sessions")
      .select(`
        id,
        active_job_seeker_id,
        expires_at,
        account_managers (
          id,
          email,
          name,
          am_code,
          role,
          status
        )
      `)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    const am = session.account_managers as unknown as {
      id: string;
      email: string;
      name: string | null;
      am_code: string;
      role: string;
      status: string;
    };

    // Check if still approved
    if (am.status !== "approved") {
      return NextResponse.json(
        { error: "Account is no longer approved." },
        { status: 403 }
      );
    }

    // Update last active
    await supabaseAdmin
      .from("extension_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", session.id);

    // Get active job seeker details if set
    let activeSeeker = null;
    if (session.active_job_seeker_id) {
      const { data: seeker } = await supabaseAdmin
        .from("job_seekers")
        .select("id, full_name, email, location, seniority")
        .eq("id", session.active_job_seeker_id)
        .single();
      activeSeeker = seeker;
    }

    return NextResponse.json({
      account_manager: {
        id: am.id,
        email: am.email,
        name: am.name,
        am_code: am.am_code,
      },
      active_job_seeker: activeSeeker,
      expires_at: session.expires_at,
      // Minimum supported extension version; the popup shows an update banner
      // when the installed version is older. Set EXTENSION_MIN_VERSION to roll.
      min_extension_version: process.env.EXTENSION_MIN_VERSION ?? null,
    });
  } catch (error) {
    console.error("Extension me error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
