import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// GET /api/am/inbox
// Returns all conversations for this AM's seekers, with latest message preview and unread count
export async function GET(req: NextRequest) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const amId = auth.user.id;
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation_id");

  if (conversationId) {
    // Return messages for a specific conversation
    const { data: messages, error } = await supabaseAdmin
      .from("conversation_messages")
      .select("id, content, sender_type, created_at, read_at, task_status, task_due_date, message_type")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
    }

    // Mark AM messages as read
    const { error: markReadError } = await supabaseAdmin
      .from("conversation_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "job_seeker")
      .is("read_at", null);

    if (markReadError) {
      console.error("[am:inbox] failed to mark messages read:", markReadError);
    }

    return NextResponse.json({ messages: messages ?? [] });
  }

  // Return all conversations for this AM with latest message + unread count
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: conversations, error: convErr, count: convCount } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      subject,
      conversation_type,
      status,
      updated_at,
      job_seeker_id,
      job_seekers!inner(id, full_name, profile_photo_url)
    `, { count: "exact" })
    .eq("account_manager_id", amId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (convErr) {
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const convIds = conversations.map((c) => c.id);

  // Get latest message per conversation + unread counts
  const [{ data: latestMsgs }, { data: unreadCounts }] = await Promise.all([
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id, content, sender_type, created_at, message_type")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("conversation_messages")
      .select("conversation_id")
      .in("conversation_id", convIds)
      .eq("sender_type", "job_seeker")
      .is("read_at", null),
  ]);

  // Build latest message map
  const latestMap = new Map<string, { content: string; sender_type: string; created_at: string; message_type: string }>();
  for (const msg of (latestMsgs ?? [])) {
    if (!latestMap.has(msg.conversation_id)) {
      latestMap.set(msg.conversation_id, {
        content: msg.content,
        sender_type: msg.sender_type,
        created_at: msg.created_at,
        message_type: msg.message_type,
      });
    }
  }

  // Build unread count map
  const unreadMap = new Map<string, number>();
  for (const msg of (unreadCounts ?? [])) {
    unreadMap.set(msg.conversation_id, (unreadMap.get(msg.conversation_id) ?? 0) + 1);
  }

  const result = conversations.map((conv) => {
    const seeker = conv.job_seekers as unknown as { id: string; full_name: string | null; profile_photo_url: string | null } | null;
    const latest = latestMap.get(conv.id);
    const unread = unreadMap.get(conv.id) ?? 0;

    return {
      id: conv.id,
      subject: conv.subject,
      conversation_type: conv.conversation_type,
      updated_at: conv.updated_at,
      seeker_id: conv.job_seeker_id,
      seeker_name: seeker?.full_name ?? "Unknown",
      seeker_photo: seeker?.profile_photo_url ?? null,
      unread_count: unread,
      latest_message: latest
        ? {
            content: latest.content.slice(0, 120),
            sender_type: latest.sender_type,
            created_at: latest.created_at,
            message_type: latest.message_type,
          }
        : null,
    };
  });

  return NextResponse.json({
    conversations: result,
    pagination: {
      page,
      pageSize,
      total: convCount ?? 0,
      totalPages: Math.ceil((convCount ?? 0) / pageSize),
    },
  });
}
