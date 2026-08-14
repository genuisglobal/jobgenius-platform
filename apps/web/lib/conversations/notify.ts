import { conversationMessageNotificationEmail } from "@/lib/email-templates/conversation-message-notification";
import { amMessageNotificationEmail } from "@/lib/email-templates/am-message-notification";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import type { ConversationTaskAttachment } from "./tasks";

export async function notifySeekerConversationActivity(params: {
  seekerId: string;
  seekerEmail: string | null;
  seekerName: string | null;
  senderName: string;
  subjectLine: string;
  messagePreview: string;
  conversationId: string;
  task: ConversationTaskAttachment | null;
}) {
  if (!params.seekerEmail) {
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const normalizedBaseUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const baseUrl = normalizedBaseUrl || "http://localhost:3000";
  const conversationUrl = `${baseUrl}/portal/conversations/${params.conversationId}`;

  const template = conversationMessageNotificationEmail({
    seekerName: params.seekerName ?? "there",
    senderName: params.senderName,
    subjectLine: params.subjectLine,
    messagePreview: params.messagePreview,
    isTask: Boolean(params.task),
    dueDate: params.task?.due_date ?? null,
    conversationUrl,
  });

  await sendAndLogEmail({
    to: params.seekerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template_key: "conversation_message_notification",
    job_seeker_id: params.seekerId,
    meta: {
      conversation_id: params.conversationId,
      is_task: Boolean(params.task),
      due_date: params.task?.due_date ?? null,
    },
  }).catch((err) => console.error("[notify] email notification failed:", err));
}

// Notify the AM (via email) when a job seeker replies or updates a task.
export async function notifyAMConversationActivity(params: {
  amId: string;
  amEmail: string | null;
  amName: string | null;
  seekerId: string;
  seekerName: string | null;
  subjectLine: string;
  messagePreview: string;
  conversationId: string;
  isTaskUpdate?: boolean;
  taskTitle?: string | null;
}) {
  if (!params.amEmail) {
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const normalizedBaseUrl = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const baseUrl = normalizedBaseUrl || "http://localhost:3000";
  // AM sees conversations through the seeker detail page
  const conversationUrl = `${baseUrl}/dashboard/seekers/${params.seekerId}?tab=messages&conversation=${params.conversationId}`;

  const template = amMessageNotificationEmail({
    amName: params.amName ?? "there",
    seekerName: params.seekerName ?? "Your job seeker",
    subjectLine: params.subjectLine,
    messagePreview: params.messagePreview,
    isTaskUpdate: Boolean(params.isTaskUpdate),
    taskTitle: params.taskTitle ?? null,
    conversationUrl,
  });

  await sendAndLogEmail({
    to: params.amEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    template_key: "am_message_notification",
    job_seeker_id: params.seekerId,
    meta: {
      conversation_id: params.conversationId,
      is_task_update: Boolean(params.isTaskUpdate),
      am_id: params.amId,
    },
  }).catch((err) => console.error("[notify] push notification failed:", err));
}
