import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";

// POST /api/am/bulk/task
// Assign a task to multiple seekers at once
export async function POST(req: NextRequest) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const amId = auth.user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { seeker_ids, subject, content, due_date } = body;

  if (!Array.isArray(seeker_ids) || seeker_ids.length === 0) {
    return NextResponse.json({ error: "seeker_ids must be a non-empty array" }, { status: 400 });
  }
  if (!subject?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "subject and content are required" }, { status: 400 });
  }
  if (seeker_ids.length > 50) {
    return NextResponse.json({ error: "Maximum 50 seekers per bulk task" }, { status: 400 });
  }

  // Verify access to all seekers
  const accessChecks = await Promise.all(
    seeker_ids.map((sid: string) => hasJobSeekerAccess(amId, sid))
  );
  const unauthorizedIdx = accessChecks.findIndex((ok) => !ok);
  if (unauthorizedIdx !== -1) {
    return NextResponse.json(
      { error: `No access to seeker ${seeker_ids[unauthorizedIdx]}` },
      { status: 403 }
    );
  }

  const results: { seeker_id: string; conversation_id: string | null; error?: string }[] = [];

  for (const seekerId of seeker_ids) {
    try {
      // Create a task conversation
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          job_seeker_id: seekerId,
          account_manager_id: amId,
          subject: subject.trim(),
          conversation_type: "task",
          status: "open",
        })
        .select("id")
        .single();

      if (convErr || !conv) {
        results.push({ seeker_id: seekerId, conversation_id: null, error: "Failed to create task" });
        continue;
      }

      // Insert task message
      const { error: msgError } = await supabaseAdmin.from("conversation_messages").insert({
        conversation_id: conv.id,
        sender_type: "account_manager",
        content: content.trim(),
        message_type: "task",
        task_status: "pending",
        task_due_date: due_date || null,
      });

      if (msgError) {
        console.error("[am:bulk-task] failed to insert task message:", msgError);
      }

      results.push({ seeker_id: seekerId, conversation_id: conv.id });
    } catch {
      results.push({ seeker_id: seekerId, conversation_id: null, error: "Unexpected error" });
    }
  }

  const successful = results.filter((r) => !r.error).length;
  return NextResponse.json({
    results,
    sent: successful,
    failed: results.length - successful,
  });
}
