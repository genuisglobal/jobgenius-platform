import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { formatReportMessage, type WeeklyStats } from "@/lib/client-reports";

// POST /api/am/client-reports/send — deliver a DRAFT weekly report to the
// seeker's portal inbox (conversation + message, same shape as the seeker
// conversations endpoint) and mark it SENT. The conversation IS the archive.
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: { report_id?: string; am_note?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!payload.report_id) {
    return NextResponse.json({ error: "report_id is required." }, { status: 400 });
  }

  const { data: report } = await supabaseAdmin
    .from("client_reports")
    .select("id, job_seeker_id, week_start, stats, status")
    .eq("id", payload.report_id)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (report.status === "SENT") {
    return NextResponse.json({ error: "Report already sent." }, { status: 409 });
  }
  if (!(await hasJobSeekerAccess(auth.user.id, report.job_seeker_id as string))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name")
    .eq("id", report.job_seeker_id as string)
    .maybeSingle();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const amNote = (payload.am_note ?? "").trim().slice(0, 2000) || null;
  const content = formatReportMessage({
    seekerName: seeker.full_name ?? "there",
    stats: report.stats as WeeklyStats,
    amNote,
  });

  const weekLabel = new Date(`${report.week_start}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", timeZone: "UTC" }
  );
  const nowIso = new Date().toISOString();

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .insert({
      job_seeker_id: report.job_seeker_id,
      account_manager_id: auth.user.id,
      conversation_type: "general",
      subject: `Your weekly JobGenius report — week of ${weekLabel}`,
      status: "open",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    return NextResponse.json(
      { error: "Failed to create the report conversation." },
      { status: 500 }
    );
  }

  const { error: messageError } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      conversation_id: conversation.id,
      sender_type: "account_manager",
      sender_id: auth.user.id,
      content,
      attachments: [],
      is_answer: false,
    });
  if (messageError) {
    await supabaseAdmin.from("conversations").delete().eq("id", conversation.id);
    return NextResponse.json(
      { error: "Failed to deliver the report message." },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("client_reports")
    .update({
      status: "SENT",
      am_note: amNote,
      sent_at: nowIso,
      sent_by: auth.user.id,
      conversation_id: conversation.id,
    })
    .eq("id", report.id);

  return NextResponse.json({
    success: true,
    conversation_id: conversation.id,
  });
}
