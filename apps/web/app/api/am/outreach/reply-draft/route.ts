import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET: Fetch outreach messages with AI draft replies
 * POST: Send or dismiss a draft reply
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const seekerId = searchParams.get("job_seeker_id");
  const status = searchParams.get("status") ?? "generated";

  // NOTE: previously joined non-existent tables (outreach_threads /
  // outreach_recruiters) — the real tables are recruiter_threads / recruiters
  // (migration 019). This route also has zero UI callers today.
  let query = supabaseAdmin
    .from("outreach_messages")
    .select(`
      id, subject, body, direction, reply_classification, ai_draft_reply, ai_draft_status, created_at,
      recruiter_threads (
        id, job_seeker_id,
        recruiters (id, name, company, email)
      )
    `)
    .eq("direction", "inbound")
    .eq("ai_draft_status", status)
    .order("created_at", { ascending: false })
    .limit(50);

  if (seekerId) {
    query = query.eq("recruiter_threads.job_seeker_id", seekerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message_id, action, edited_reply } = body;

  if (!message_id || !action) {
    return NextResponse.json({ error: "message_id and action required" }, { status: 400 });
  }

  if (action === "dismiss") {
    const { error: dismissError } = await supabaseAdmin
      .from("outreach_messages")
      .update({ ai_draft_status: "dismissed" })
      .eq("id", message_id);

    if (dismissError) {
      console.error("[outreach:reply-draft] failed to dismiss draft:", dismissError);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "send") {
    // KNOWN GAP: outreach_messages.from_email/to_email are NOT NULL and are
    // not resolved here (would need the seeker's outreach from-address and
    // the recruiter's email). This route has zero UI callers today — do not
    // wire it up without resolving those first; a wrong from/to address on
    // a real send is worse than the route staying dead.
    const { data: msg } = await supabaseAdmin
      .from("outreach_messages")
      .select("id, ai_draft_reply")
      .eq("id", message_id)
      .single();

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const replyText = edited_reply ?? msg.ai_draft_reply;
    if (!replyText) {
      return NextResponse.json({ error: "No draft to send" }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          "Sending is not implemented yet: from_email/to_email resolution is required before this action can insert a real outbound message.",
      },
      { status: 501 }
    );
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
