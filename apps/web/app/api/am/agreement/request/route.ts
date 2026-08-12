import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { sendNotification } from "@/lib/notify";

/**
 * POST /api/am/agreement/request
 * Body: { job_seeker_id: string }
 *
 * Pushes the Client Collaboration Agreement to a seeker: marks it as requested
 * so the portal turns the read-only preview into a signable document. Until an
 * AM/admin calls this, clients only see a glimpse during onboarding.
 */
export async function POST(request: Request) {
  let body: { job_seeker_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("campaign_tier")
    .eq("id", jobSeekerId)
    .maybeSingle();

  if (!seeker?.campaign_tier) {
    return NextResponse.json(
      { error: "Select a campaign tier (Essentials or Premium) before sending the agreement." },
      { status: 400 }
    );
  }

  const requestedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({
      collaboration_agreement_requested_at: requestedAt,
      collaboration_agreement_requested_by: access.amId,
    })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Agreement request failed:", error);
    return NextResponse.json({ error: "Failed to send the agreement." }, { status: 500 });
  }

  // Notify the client (in-app + email) that the agreement is ready to sign.
  await sendNotification({
    userId: jobSeekerId,
    userType: "job_seeker",
    category: "agreement",
    subject: "Your service agreement is ready to sign",
    body: "Your account manager has shared the JobGenius service agreement. Please review and sign it in your portal.",
    linkUrl: "/portal/agreement",
    channel: "both",
  }).catch((e) => console.error("Agreement notification failed (non-fatal):", e));

  return NextResponse.json({ ok: true, requested_at: requestedAt });
}
