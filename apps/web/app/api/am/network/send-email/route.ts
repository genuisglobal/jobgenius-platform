import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { networkOutreachEmail } from "@/lib/email-templates/network-outreach";

// POST: Send an outreach email and log activity
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { match_id: string; subject: string; body: string; to_email: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.match_id || !body.subject || !body.body || !body.to_email) {
    return NextResponse.json(
      { error: "match_id, subject, body, and to_email are required." },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: match } = await supabaseAdmin
    .from("network_contact_matches")
    .select("id, network_contact_id, job_post_id, job_seeker_id, network_contacts (account_manager_id)")
    .eq("id", body.match_id)
    .single();

  if (
    !match ||
    (match.network_contacts as unknown as { account_manager_id: string })
      ?.account_manager_id !== auth.user.id
  ) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  // Wrap body in HTML template
  const email = networkOutreachEmail({
    subject: body.subject,
    body: body.body,
  });

  // Send email
  const result = await sendAndLogEmail({
    to: body.to_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    template_key: "network_outreach",
    job_seeker_id: match.job_seeker_id,
    job_post_id: match.job_post_id,
    meta: { network_contact_id: match.network_contact_id, match_id: match.id },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.detail || "Failed to send email." },
      { status: 500 }
    );
  }

  // Update match status to 'contacted'
  const { error: matchUpdateError } = await supabaseAdmin
    .from("network_contact_matches")
    .update({ status: "contacted" })
    .eq("id", body.match_id);

  if (matchUpdateError) {
    console.error("[am:network] failed to update match status:", matchUpdateError);
  }

  // Update last_contacted_at on the contact
  const { error: contactUpdateError } = await supabaseAdmin
    .from("network_contacts")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", match.network_contact_id);

  if (contactUpdateError) {
    console.error("[am:network] failed to update contact last_contacted_at:", contactUpdateError);
  }

  // Log activity
  const { error: activityError } = await supabaseAdmin.from("network_contact_activity").insert({
    network_contact_id: match.network_contact_id,
    activity_type: "email_sent",
    details: {
      match_id: match.id,
      to_email: body.to_email,
      subject: body.subject,
      email_log_id: result.email_log_id,
    },
  });

  if (activityError) {
    console.error("[am:network] failed to log activity:", activityError);
  }

  return NextResponse.json({ success: true, email_log_id: result.email_log_id });
}
