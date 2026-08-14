import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import {
  buildTaskAttachment,
  hasOpenTask,
  isConversationType,
  isTaskPriority,
} from "@/lib/conversations/tasks";
import { notifySeekerConversationActivity } from "@/lib/conversations/notify";

interface RouteParams {
  params: { id: string };
}

type TaskInput = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string;
};

type CreateConversationPayload = {
  subject?: string;
  conversation_type?: string;
  job_post_id?: string | null;
  application_queue_id?: string | null;
  initial_message?: {
    content?: string;
    task?: TaskInput;
  };
  notify_seeker?: boolean;
};

type ConversationMessageRow = {
  id: string;
  content: string;
  sender_type: string;
  read_at: string | null;
  created_at: string;
  attachments?: unknown;
};

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabaseAdmin
    .from("conversations")
    .select(`
      id,
      subject,
      conversation_type,
      status,
      created_at,
      updated_at,
      account_manager_id,
      account_managers ( name, email ),
      job_posts ( title, company ),
      conversation_messages ( id, content, sender_type, read_at, created_at, attachments )
    `, { count: "exact" })
    .eq("job_seeker_id", seekerId)
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load conversations." },
      { status: 500 }
    );
  }

  const conversations = (data ?? []).map((conversation: Record<string, unknown>) => {
    const messages =
      (conversation.conversation_messages as ConversationMessageRow[]) ?? [];
    const unreadCount = messages.filter(
      (message) =>
        message.sender_type === "job_seeker" && message.read_at === null
    ).length;
    const openTaskCount = messages.filter(
      (message) =>
        message.sender_type === "account_manager" &&
        hasOpenTask(message.attachments)
    ).length;
    const sorted = [...messages].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastMessage = sorted[0] ?? null;
    const accountManagerRaw = conversation.account_managers as
      | { name?: string | null; email?: string | null }
      | Array<{ name?: string | null; email?: string | null }>
      | null;
    const accountManager = Array.isArray(accountManagerRaw)
      ? accountManagerRaw[0] ?? null
      : accountManagerRaw;
    const jobPostRaw = conversation.job_posts as
      | { title?: string | null; company?: string | null }
      | Array<{ title?: string | null; company?: string | null }>
      | null;
    const jobPost = Array.isArray(jobPostRaw) ? jobPostRaw[0] ?? null : jobPostRaw;

    return {
      id: conversation.id,
      subject: conversation.subject,
      conversation_type: conversation.conversation_type,
      status: conversation.status,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      account_manager_id: conversation.account_manager_id,
      account_manager: accountManager
        ? {
            name: accountManager.name ?? null,
            email: accountManager.email ?? null,
          }
        : null,
      job_post: jobPost
        ? {
            title: jobPost.title ?? null,
            company: jobPost.company ?? null,
          }
        : null,
      unread_count: unreadCount,
      open_task_count: openTaskCount,
      last_message: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content.slice(0, 140),
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at,
          }
        : null,
    };
  });

  return NextResponse.json({
    conversations,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let payload: CreateConversationPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawTask = payload.initial_message?.task;
  let taskAttachment = null;
  if (rawTask) {
    const title = typeof rawTask.title === "string" ? rawTask.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Task title is required when sending a task." },
        { status: 400 }
      );
    }

    if (rawTask.priority && !isTaskPriority(rawTask.priority)) {
      return NextResponse.json(
        { error: "Task priority must be low, medium, or high." },
        { status: 400 }
      );
    }
    const priority = isTaskPriority(rawTask.priority)
      ? rawTask.priority
      : undefined;

    let dueDate: string | null = null;
    if (typeof rawTask.due_date === "string" && rawTask.due_date.trim()) {
      const parsedDueDate = new Date(rawTask.due_date);
      if (Number.isNaN(parsedDueDate.getTime())) {
        return NextResponse.json(
          { error: "Task due date is invalid." },
          { status: 400 }
        );
      }
      dueDate = parsedDueDate.toISOString();
    }

    taskAttachment = buildTaskAttachment({
      title,
      description: rawTask.description ?? null,
      dueDate,
      priority,
      assignedById: auth.user.id,
      assignedByName: auth.user.name ?? "Account Manager",
    });
  }

  const requestedType = payload.conversation_type;
  if (requestedType !== undefined && !isConversationType(requestedType)) {
    return NextResponse.json(
      { error: "conversation_type must be general, application_question, or task." },
      { status: 400 }
    );
  }

  const conversationType =
    requestedType && isConversationType(requestedType)
      ? requestedType
      : taskAttachment
      ? "task"
      : "general";

  if (conversationType === "application_question" && taskAttachment) {
    return NextResponse.json(
      { error: "Application question threads cannot include task payloads." },
      { status: 400 }
    );
  }

  const subjectInput = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const subject = subjectInput || (taskAttachment ? `Task: ${taskAttachment.title}` : "New conversation");

  const contentInput =
    typeof payload.initial_message?.content === "string"
      ? payload.initial_message.content.trim()
      : "";
  const messageContent = contentInput || (taskAttachment ? `Task assigned: ${taskAttachment.title}` : "");
  if (!messageContent) {
    return NextResponse.json(
      { error: "Initial message content is required." },
      { status: 400 }
    );
  }

  const { data: seeker, error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .select("id, email, full_name")
    .eq("id", seekerId)
    .single();

  if (seekerError || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data: createdConversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .insert({
      job_seeker_id: seekerId,
      account_manager_id: auth.user.id,
      conversation_type: conversationType,
      subject,
      job_post_id: payload.job_post_id ?? null,
      application_queue_id: payload.application_queue_id ?? null,
      status: "open",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(`
      id,
      subject,
      conversation_type,
      status,
      created_at,
      updated_at,
      account_manager_id
    `)
    .single();

  if (conversationError || !createdConversation) {
    return NextResponse.json(
      { error: "Failed to create conversation." },
      { status: 500 }
    );
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      conversation_id: createdConversation.id,
      sender_type: "account_manager",
      sender_id: auth.user.id,
      content: messageContent,
      attachments: taskAttachment ? [taskAttachment] : [],
      is_answer: false,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    await supabaseAdmin.from("conversations").delete().eq("id", createdConversation.id);
    return NextResponse.json(
      { error: "Failed to create initial message." },
      { status: 500 }
    );
  }

  if (payload.notify_seeker !== false) {
    await notifySeekerConversationActivity({
      seekerId,
      seekerEmail: seeker.email ?? null,
      seekerName: seeker.full_name ?? null,
      senderName: auth.user.name ?? "Account Manager",
      subjectLine: subject,
      messagePreview: messageContent.slice(0, 500),
      conversationId: createdConversation.id,
      task: taskAttachment,
    });
  }

  return NextResponse.json(
    {
      conversation: createdConversation,
      message,
    },
    { status: 201 }
  );
}
