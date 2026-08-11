import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import {
  formatTaskStatusLabel,
  getTaskAttachmentFromAttachments,
  isTaskStatus,
  setTaskStatusInAttachments,
} from "@/lib/conversations/tasks";
import { notifyAMConversationActivity } from "@/lib/conversations/notify";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Get messages
  const { data: messages, error } = await supabaseAdmin
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: "Failed to fetch messages." }, { status: 500 });
  }

  // Mark AM messages as read
  const { error: markReadError } = await supabaseAdmin
    .from("conversation_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", params.id)
    .eq("sender_type", "account_manager")
    .is("read_at", null);

  if (markReadError) {
    console.error("[portal:conversations] failed to mark messages read:", markReadError);
  }

  return Response.json({ messages: messages ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership and get full conversation details for AM notification
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id, conversation_type, job_seeker_id, subject, account_manager_id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  let body: { content: string; is_answer?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return Response.json({ error: "Message content is required." }, { status: 400 });
  }

  const trimmedContent = body.content.trim();

  // Insert message
  const { data: message, error } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      conversation_id: params.id,
      sender_type: "job_seeker",
      sender_id: auth.user.id,
      content: trimmedContent,
      is_answer: body.is_answer ?? false,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to send message." }, { status: 500 });
  }

  // Update conversation updated_at
  const { error: convUpdateError } = await supabaseAdmin
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (convUpdateError) {
    console.error("[portal:conversations] failed to update conversation timestamp:", convUpdateError);
  }

  // Run side-effects in parallel (fire-and-forget)
  const sideEffects: Promise<unknown>[] = [];

  // If this is an answer to an application question, save to profile
  if (body.is_answer && conversation.conversation_type === "application_question") {
    sideEffects.push(
      Promise.resolve(
        supabaseAdmin
          .from("conversation_messages")
          .select("content")
          .eq("conversation_id", params.id)
          .eq("sender_type", "account_manager")
          .order("created_at", { ascending: true })
          .limit(1)
          .single()
      ).then(({ data: firstQuestion }) => {
          if (firstQuestion) {
            return supabaseAdmin.from("application_question_answers").insert({
              job_seeker_id: auth.user.id,
              question: firstQuestion.content,
              answer: trimmedContent,
              conversation_id: params.id,
              message_id: message.id,
            });
          }
        })
    );
  }

  // Notify AM if this conversation has an assigned account manager
  if (conversation.account_manager_id) {
    sideEffects.push(
      Promise.all([
        supabaseAdmin
          .from("account_managers")
          .select("id, email, full_name")
          .eq("id", conversation.account_manager_id)
          .single(),
        supabaseAdmin
          .from("job_seekers")
          .select("full_name")
          .eq("id", auth.user.id)
          .single(),
      ]).then(([{ data: am }, { data: seeker }]) => {
        if (am) {
          return notifyAMConversationActivity({
            amId: am.id,
            amEmail: am.email ?? null,
            amName: am.full_name ?? null,
            seekerId: auth.user.id,
            seekerName: seeker?.full_name ?? null,
            subjectLine: conversation.subject,
            messagePreview: trimmedContent.slice(0, 500),
            conversationId: params.id,
            isTaskUpdate: false,
          });
        }
      })
    );
  }

  await Promise.allSettled(sideEffects);

  return Response.json({ message }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify ownership and get AM details for task-update notification
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id, subject, account_manager_id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  let body: { message_id?: string; task_status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.message_id || !isTaskStatus(body.task_status)) {
    return Response.json(
      { error: "message_id and valid task_status are required." },
      { status: 400 }
    );
  }

  const { data: taskMessage, error: taskMessageError } = await supabaseAdmin
    .from("conversation_messages")
    .select("id, sender_type, attachments")
    .eq("id", body.message_id)
    .eq("conversation_id", params.id)
    .single();

  if (taskMessageError || !taskMessage) {
    return Response.json({ error: "Task message not found." }, { status: 404 });
  }

  if (taskMessage.sender_type !== "account_manager") {
    return Response.json(
      { error: "Only account manager task messages can be updated." },
      { status: 400 }
    );
  }

  const taskAttachment = getTaskAttachmentFromAttachments(taskMessage.attachments);
  if (!taskAttachment) {
    return Response.json(
      { error: "This message does not contain a task." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const updatedAttachments = setTaskStatusInAttachments(
    taskMessage.attachments,
    body.task_status,
    nowIso
  );

  const { data: updatedMessage, error: updateError } = await supabaseAdmin
    .from("conversation_messages")
    .update({
      attachments: updatedAttachments,
      read_at: nowIso,
    })
    .eq("id", body.message_id)
    .select("*")
    .single();

  if (updateError || !updatedMessage) {
    return Response.json(
      { error: "Failed to update task status." },
      { status: 500 }
    );
  }

  let statusMessage: Record<string, unknown> | null = null;
  if (taskAttachment.status !== body.task_status) {
    const statusLabel = formatTaskStatusLabel(body.task_status).toLowerCase();
    const { data: insertedStatusMessage } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        conversation_id: params.id,
        sender_type: "job_seeker",
        sender_id: auth.user.id,
        content: `Task update: "${taskAttachment.title}" marked ${statusLabel}.`,
        is_answer: false,
      })
      .select("*")
      .single();

    statusMessage = insertedStatusMessage ?? null;
  }

  const { error: patchConvError } = await supabaseAdmin
    .from("conversations")
    .update({ updated_at: nowIso })
    .eq("id", params.id);

  if (patchConvError) {
    console.error("[portal:conversations] failed to update conversation timestamp:", patchConvError);
  }

  // Notify AM about task status change (fire-and-forget)
  if (
    conversation.account_manager_id &&
    taskAttachment.status !== body.task_status
  ) {
    Promise.all([
      supabaseAdmin
        .from("account_managers")
        .select("id, email, full_name")
        .eq("id", conversation.account_manager_id)
        .single(),
      supabaseAdmin
        .from("job_seekers")
        .select("full_name")
        .eq("id", auth.user.id)
        .single(),
    ])
      .then(([{ data: am }, { data: seeker }]) => {
        if (am) {
          const statusLabel = formatTaskStatusLabel(body.task_status as Parameters<typeof formatTaskStatusLabel>[0]).toLowerCase();
          return notifyAMConversationActivity({
            amId: am.id,
            amEmail: am.email ?? null,
            amName: am.full_name ?? null,
            seekerId: auth.user.id,
            seekerName: seeker?.full_name ?? null,
            subjectLine: conversation.subject,
            messagePreview: `"${taskAttachment.title}" has been marked ${statusLabel}.`,
            conversationId: params.id,
            isTaskUpdate: true,
            taskTitle: taskAttachment.title,
          });
        }
      })
      .catch((err) => console.error("[conversations:messages] notification failed:", err));
  }

  return Response.json({
    message: updatedMessage,
    status_message: statusMessage,
  });
}
