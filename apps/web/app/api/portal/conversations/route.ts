import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { hasOpenTask, isConversationType } from "@/lib/conversations/tasks";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // 'general' | 'application_question' | 'task'

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("conversations")
    .select(`
      *,
      account_managers ( name, email ),
      job_posts ( title, company ),
      conversation_messages ( id, content, sender_type, read_at, created_at, attachments )
    `, { count: "exact" })
    .eq("job_seeker_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (isConversationType(type)) {
    query = query.eq("conversation_type", type);
  }

  const { data, error, count } = await query;

  if (error) {
    return Response.json({ error: "Failed to fetch conversations." }, { status: 500 });
  }

  // Compute unread counts and last message per conversation
  const conversations = (data ?? []).map((conv: Record<string, unknown>) => {
    const messages = (conv.conversation_messages as Array<Record<string, unknown>>) ?? [];
    const unreadCount = messages.filter(
      (m) => m.sender_type === "account_manager" && m.read_at === null
    ).length;
    const openTaskCount = messages.filter(
      (m) => m.sender_type === "account_manager" && hasOpenTask(m.attachments)
    ).length;
    const lastMessage = messages.length > 0
      ? [...messages].sort(
          (a, b) =>
            new Date(b.created_at as string).getTime() -
            new Date(a.created_at as string).getTime()
        )[0]
      : null;

    // Remove full messages array from response
    const { conversation_messages: _, ...rest } = conv;
    return {
      ...rest,
      unread_count: unreadCount,
      open_task_count: openTaskCount,
      last_message: lastMessage
        ? {
            content: (lastMessage.content as string).slice(0, 120),
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at,
          }
        : null,
    };
  });

  return Response.json({
    conversations,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}
