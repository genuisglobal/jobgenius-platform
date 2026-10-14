import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { isActiveClient } from "@/lib/intake";

/**
 * GET /api/extension/autofill-context
 *
 * Run-less profile bundle for the extension's Mode 3 "Autofill this page"
 * capability. Unlike /api/apply/next this does NOT claim a run or require a
 * job_post — it just returns the active seeker's profile, base resume URL, and
 * pre-configured screening answers so the runner can fill any live application
 * form (matched or unmatched).
 *
 * Auth: extension Bearer session. The active seeker must be assigned to the
 * session's account manager and be an active client (same gate as live apply).
 */
export async function GET(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired token." },
      { status: 401 }
    );
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "No active job seeker selected." },
      { status: 400 }
    );
  }

  // The AM operating the extension must be assigned to this seeker.
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json(
      { error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  // Same live-apply gate as spy-apply / queue-job / apply-start.
  if (!(await isActiveClient(jobSeekerId))) {
    return NextResponse.json(
      { error: "Live applications are only allowed for active clients." },
      { status: 409 }
    );
  }

  const [{ data: seeker }, { data: screening }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select(
        "resume_url, full_name, email, phone, location, linkedin_url, portfolio_url, address_line1, address_city, address_state, address_zip, address_country"
      )
      .eq("id", jobSeekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("job_seeker_screening_answers")
      .select("question_key, question_text, answer_value, answer_type")
      .eq("job_seeker_id", jobSeekerId),
  ]);

  if (!seeker) {
    return NextResponse.json(
      { error: "Job seeker profile not found." },
      { status: 404 }
    );
  }

  const screeningAnswers = (screening ?? []).map((row) => ({
    question_key: row.question_key,
    question_text: row.question_text,
    answer_value: row.answer_value,
    answer_type: row.answer_type,
  }));

  // Shape mirrors /api/apply/next so the runner's dom.fillAllFields consumes it
  // identically. Demographic / work-auth answers are NOT profile fields — they
  // come through screening answers + the server-side field classifier.
  return NextResponse.json({
    seeker_id: jobSeekerId,
    profile: {
      full_name: seeker.full_name ?? null,
      email: seeker.email ?? null,
      phone: seeker.phone ?? null,
      location: seeker.location ?? null,
      linkedin_url: seeker.linkedin_url ?? null,
      portfolio_url: seeker.portfolio_url ?? null,
      address_line1: seeker.address_line1 ?? null,
      address_city: seeker.address_city ?? null,
      address_state: seeker.address_state ?? null,
      address_zip: seeker.address_zip ?? null,
      address_country: seeker.address_country ?? null,
    },
    resume: {
      url: seeker.resume_url ?? null,
    },
    screening_answers: screeningAnswers,
    screening_count: screeningAnswers.length,
  });
}
