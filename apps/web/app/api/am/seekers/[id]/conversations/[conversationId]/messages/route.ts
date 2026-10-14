import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import {
  buildTaskAttachment,
  isTaskPriority,
} from "@/lib/conversations/tasks";
import { notifySeekerConversationActivity } from "@/lib/conversations/notify";

interface RouteParams {
  params: { id: string; conversationId: string };
}

type TaskInput = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string;
};

type CreateMessagePayload = {
  content?: string;
  task?: TaskInput;
  notify_seeker?: boolean;
};

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  const conversationId = params.conversationId;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .select("id, job_seeker_id, subject, conversation_type, status")
    .eq("id", conversationId)
    .eq("job_seeker_id", seekerId)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json(
      { error: "Failed to load conversation messages." },
      { status: 500 }
    );
  }

  const { error: markReadError } = await supabaseAdmin
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("sender_type", "job_seeker")
    .is("read_at", null);

  if (markReadError) {
    console.error("[am:conversations] failed to mark messages read:", markReadError);
  }

  return NextResponse.json({
    conversation,
    messages: messages ?? [],
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  const conversationId = params.conversationId;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .select("id, job_seeker_id, conversation_type, status, subject")
    .eq("id", conversationId)
    .eq("job_seeker_id", seekerId)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  if (conversation.status !== "open") {
    return NextResponse.json(
      { error: "Conversation is closed. Re-open it before sending messages." },
      { status: 400 }
    );
  }

  let payload: CreateMessagePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawTask = payload.task;
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

  if (conversation.conversation_type === "application_question" && taskAttachment) {
    return NextResponse.json(
      { error: "Application question threads cannot include task payloads." },
      { status: 400 }
    );
  }

  const contentInput = typeof payload.content === "string" ? payload.content.trim() : "";
  const messageContent = contentInput || (taskAttachment ? `Task assigned: ${taskAttachment.title}` : "");
  if (!messageContent) {
    return NextResponse.json(
      { error: "Message content is required." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: message, error: messageError } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: "account_manager",
      sender_id: auth.user.id,
      content: messageContent,
      attachments: taskAttachment ? [taskAttachment] : [],
      is_answer: false,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    return NextResponse.json(
      { error: "Failed to send message." },
      { status: 500 }
    );
  }

  const conversationUpdate: Record<string, unknown> = {
    updated_at: nowIso,
    account_manager_id: auth.user.id,
  };
  if (taskAttachment && conversation.conversation_type !== "application_question") {
    conversationUpdate.conversation_type = "task";
  }

  const { error: convUpdateError } = await supabaseAdmin
    .from("conversations")
    .update(conversationUpdate)
    .eq("id", conversationId);

  if (convUpdateError) {
    console.error("[am:conversations] failed to update conversation:", convUpdateError);
  }

  if (payload.notify_seeker !== false) {
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("id, email, full_name")
      .eq("id", seekerId)
      .single();

    if (seeker) {
      await notifySeekerConversationActivity({
        seekerId,
        seekerEmail: seeker.email ?? null,
        seekerName: seeker.full_name ?? null,
        senderName: auth.user.name ?? "Account Manager",
        subjectLine: conversation.subject,
        messagePreview: messageContent.slice(0, 500),
        conversationId,
        task: taskAttachment,
      });
    }
  }

  return NextResponse.json({ message }, { status: 201 });
}
