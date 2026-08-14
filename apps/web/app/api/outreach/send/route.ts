import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { getOutreachAdapter } from "@/lib/email/adapter";
import { logActivity } from "@/lib/feedback-loop";
import { assertOutreachConsent, getRecruiterOptOut } from "@/lib/outreach-consent";
import {
  buildAdaptiveFollowUpCopy,
  buildOutreachPlan,
  inferPreferredTone,
  inferRecruiterType,
} from "@/lib/outreach-intelligence";
import {
  buildHtmlBodyWithTracking,
  buildTrackingOpenUrl,
  ensureTrackingToken,
} from "@/lib/outreach-email";
import { requireOpsAuth } from "@/lib/ops-auth";
import { canTransitionOutreachState } from "@/lib/outreach-state";
import { supabaseServer } from "@/lib/supabase/server";

type SendPayload = {
  recruiter_thread_id?: string;
  recruiter_id?: string;
  job_seeker_id?: string;
  subject?: string;
  body?: string;
  message_id?: string;
};

type MessageRow = {
  id: string;
  recruiter_thread_id: string;
  subject: string | null;
  body: string | null;
  status: string;
  to_email: string;
  from_email: string;
  open_tracking_token: string | null;
  step_number: number | null;
  sequence_id: string | null;
};

type ThreadRow = {
  id: string;
  recruiter_id: string;
  job_seeker_id: string;
  thread_status: string;
};

async function resolveThread(payload: SendPayload) {
  if (payload.message_id) {
    const { data: message, error } = await supabaseServer
      .from("outreach_messages")
      .select(
        "id, recruiter_thread_id, subject, body, status, to_email, from_email, open_tracking_token, step_number, sequence_id"
      )
      .eq("id", payload.message_id)
      .single();

    if (error || !message) {
      return { error: "Message not found." } as const;
    }

    return { message: message as MessageRow } as const;
  }

  if (payload.recruiter_thread_id) {
    return { threadId: payload.recruiter_thread_id } as const;
  }

  if (payload.recruiter_id && payload.job_seeker_id) {
    const { data: existingThread } = await supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("recruiter_id", payload.recruiter_id)
      .eq("job_seeker_id", payload.job_seeker_id)
      .maybeSingle();

    if (existingThread?.id) {
      return { threadId: existingThread.id } as const;
    }

    const nowIso = new Date().toISOString();
    const { data: createdThread, error: createError } = await supabaseServer
      .from("recruiter_threads")
      .insert({
        recruiter_id: payload.recruiter_id,
        job_seeker_id: payload.job_seeker_id,
        thread_status: "ACTIVE",
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (createError || !createdThread) {
      return { error: "Failed to create recruiter thread." } as const;
    }

    return { threadId: createdThread.id } as const;
  }

  return { error: "Missing recruiter_thread_id or recruiter_id + job_seeker_id." } as const;
}

async function resolveCompanyHiringSignal(companyName?: string | null) {
  if (!companyName) {
    return { openRoleCount: 0, recentRoleTitle: null as string | null };
  }

  const { data: roles } = await supabaseServer
    .from("job_posts")
    .select("title")
    .eq("company", companyName)
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    openRoleCount: roles?.length ?? 0,
    recentRoleTitle: roles?.[0]?.title ?? null,
  };
}

async function upsertPlan({
  thread,
  recruiter,
  message,
  nowIso,
  companySignal,
  preferredTone,
  riskScore,
}: {
  thread: ThreadRow;
  recruiter: {
    id: string;
    title: string | null;
    source: string | null;
  };
  message: {
    sequence_id?: string | null;
  };
  nowIso: string;
  companySignal: string;
  preferredTone: string;
  riskScore: number;
}) {
  await supabaseServer.from("outreach_plans").upsert(
    {
      recruiter_thread_id: thread.id,
      recruiter_id: thread.recruiter_id,
      job_seeker_id: thread.job_seeker_id,
      sequence_id: message.sequence_id ?? null,
      recruiter_type: inferRecruiterType(recruiter.title),
      preferred_tone: preferredTone,
      company_signal: companySignal,
      personalization: {
        recruiter_source: recruiter.source ?? "manual",
      },
      ghosting_risk_score: riskScore,
      next_action: "WAIT_FOR_REPLY",
      plan_version: "v1",
      generated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "recruiter_thread_id" }
  );
}

export async function POST(request: Request) {
  let payload: SendPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const auth = requireOpsAuth(request.headers, request.url);
  let amResult: Awaited<ReturnType<typeof getAccountManagerFromRequest>> | null = null;
  if (!auth.ok) {
    amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
  }

  const resolved = await resolveThread(payload);
  if ("error" in resolved) {
    return Response.json({ success: false, error: resolved.error }, { status: 400 });
  }

  let threadId = "threadId" in resolved ? resolved.threadId : null;
  let message = "message" in resolved ? resolved.message : null;

  if (message?.recruiter_thread_id) {
    threadId = message.recruiter_thread_id;
  }

  if (!threadId) {
    return Response.json({ success: false, error: "Thread not found." }, { status: 404 });
  }

  const { data: threadData, error: threadError } = await supabaseServer
    .from("recruiter_threads")
    .select("id, recruiter_id, job_seeker_id, thread_status")
    .eq("id", threadId)
    .single();

  if (threadError || !threadData) {
    return Response.json({ success: false, error: "Thread not found." }, { status: 404 });
  }

  const thread = threadData as ThreadRow;

  if (thread.thread_status === "CLOSED") {
    return Response.json(
      { success: false, error: "Thread is closed. Reopen stage before sending." },
      { status: 409 }
    );
  }

  if (amResult && !("error" in amResult)) {
    const hasAccess = await hasJobSeekerAccess(amResult.accountManager.id, thread.job_seeker_id);
    if (!hasAccess) {
      return Response.json({ success: false, error: "Not authorized." }, { status: 403 });
    }
  }

  const consentCheck = await assertOutreachConsent(thread.job_seeker_id);
  if (!consentCheck.ok) {
    return Response.json({ success: false, error: consentCheck.error }, { status: 412 });
  }

  const { data: recruiter } = await supabaseServer
    .from("recruiters")
    .select("id, name, email, status, title, company, source")
    .eq("id", thread.recruiter_id)
    .single();

  if (!recruiter?.email) {
    return Response.json({ success: false, error: "Recruiter email missing." }, { status: 400 });
  }

  const optOutStatus = await getRecruiterOptOut(thread.recruiter_id);
  if (optOutStatus.optedOut) {
    return Response.json(
      {
        success: false,
        error: "Recruiter is opted out from outreach automation.",
      },
      { status: 409 }
    );
  }

  // Resolve outreach adapter — uses seeker's Gmail if connected, else Resend
  const { adapter: outreachAdapter, fromEmail, provider: outreachProvider } =
    await getOutreachAdapter(thread.job_seeker_id);

  const nowIso = new Date().toISOString();
  let subject = (message?.subject ?? payload.subject ?? "").trim();
  let body = (message?.body ?? payload.body ?? "").trim();

  if (!subject || !body) {
    const fallbackTone = inferPreferredTone({
      recruiterType: inferRecruiterType(recruiter.title),
      wasOpened: false,
      stepNumber: message?.step_number ?? 1,
    });
    const fallback = buildAdaptiveFollowUpCopy({
      recruiterName: recruiter.name ?? recruiter.email,
      companyName: recruiter.company,
      jobSeekerName: "our candidate",
      previousSubject: subject || null,
      stepNumber: message?.step_number ?? 1,
      tone: fallbackTone,
      companySignal: recruiter.company
        ? `${recruiter.company} remains an active hiring target for our jobseeker.`
        : "We can share a concise candidate fit summary if useful.",
    });
    subject = subject || fallback.subject;
    body = body || fallback.body;
  }

  if (!subject || !body) {
    return Response.json({ success: false, error: "Missing subject or body." }, { status: 400 });
  }

  if (message && !canTransitionOutreachState(message.status, "SENT")) {
    return Response.json(
      {
        success: false,
        error: `Message cannot transition from ${message.status} to SENT.`,
      },
      { status: 409 }
    );
  }

  const trackingToken = ensureTrackingToken(message?.open_tracking_token);
  const trackingUrl = buildTrackingOpenUrl({ token: trackingToken, requestUrl: request.url });
  const htmlBody = buildHtmlBodyWithTracking(body, trackingUrl);

  let messageId = message?.id ?? null;

  if (!messageId) {
    const { data: created, error: createError } = await supabaseServer
      .from("outreach_messages")
      .insert({
        recruiter_thread_id: thread.id,
        sequence_id: null,
        step_number: 1,
        direction: "OUTBOUND",
        from_email: fromEmail,
        to_email: recruiter.email,
        subject,
        body,
        provider: outreachProvider,
        status: "QUEUED",
        scheduled_for: nowIso,
        open_tracking_token: trackingToken,
        updated_at: nowIso,
      })
      .select(
        "id, recruiter_thread_id, subject, body, status, to_email, from_email, open_tracking_token, step_number, sequence_id"
      )
      .single();

    if (createError || !created) {
      return Response.json({ success: false, error: "Failed to create outreach message." }, { status: 500 });
    }

    messageId = created.id;
    message = created as MessageRow;
  } else {
    const currentStatus = message?.status ?? "DRAFTED";
    const nextStatus = canTransitionOutreachState(currentStatus, "QUEUED") ? "QUEUED" : currentStatus;
    await supabaseServer
      .from("outreach_messages")
      .update({
        subject,
        body,
        status: nextStatus,
        open_tracking_token: trackingToken,
        scheduled_for: nowIso,
        updated_at: nowIso,
      })
      .eq("id", messageId);
  }

  if (!messageId) {
    return Response.json(
      { success: false, error: "Failed to resolve outreach message id." },
      { status: 500 }
    );
  }

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("email")
    .eq("id", thread.job_seeker_id)
    .maybeSingle();

  const result = await outreachAdapter.sendEmail({
    from: fromEmail,
    to: [recruiter.email],
    subject,
    text: body,
    html: htmlBody,
    replyTo: seeker?.email ?? undefined,
    metadata: {
      recruiter_thread_id: thread.id,
      outreach_message_id: messageId,
      open_tracking_token: trackingToken,
    },
  });

  if (!result.ok) {
    const failStatus = message && canTransitionOutreachState(message.status, "FAILED") ? "FAILED" : "FAILED";
    await supabaseServer
      .from("outreach_messages")
      .update({
        status: failStatus,
        meta: {
          error: result.detail ?? "Send failed.",
        },
        updated_at: nowIso,
      })
      .eq("id", messageId);

    return Response.json({ success: false, error: result.detail ?? "Send failed." }, { status: 500 });
  }

  await supabaseServer
    .from("outreach_messages")
    .update({
      status: "SENT",
      provider_message_id: result.provider_message_id ?? null,
      open_tracking_token: trackingToken,
      sent_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", messageId);

  // Log to activity feed (non-blocking)
  if (thread.job_seeker_id) {
    logActivity(thread.job_seeker_id, {
      eventType: "outreach_sent",
      title: "Outreach email sent",
      description: `To ${recruiter.name ?? recruiter.email} at ${recruiter.company ?? "unknown company"}`,
      meta: { message_id: messageId, recruiter_id: recruiter.id, thread_id: thread.id },
      refType: "outreach_messages",
      refId: messageId,
    }).catch((err) => console.error("[outreach:send] activity log failed:", err));
  }

  const noReplyHours = Number(process.env.OUTREACH_NO_REPLY_HOURS ?? 72);
  const nextFollowUpAt = new Date(Date.now() + noReplyHours * 60 * 60 * 1000).toISOString();

  const hiringSignal = await resolveCompanyHiringSignal(recruiter.company);
  const plan = buildOutreachPlan({
    recruiterTitle: recruiter.title,
    wasOpened: false,
    hasReply: false,
    hasBounce: false,
    stepNumber: message?.step_number ?? 1,
    hoursSinceLastOutbound: 0,
    followUpCount: Math.max((message?.step_number ?? 1) - 1, 0),
    companyName: recruiter.company,
    openRoleCount: hiringSignal.openRoleCount,
    recentRoleTitle: hiringSignal.recentRoleTitle,
  });

  await supabaseServer
    .from("recruiter_threads")
    .update({
      thread_status: "WAITING_REPLY",
      last_message_direction: "OUTBOUND",
      next_follow_up_at: nextFollowUpAt,
      ghosting_risk_score: plan.ghostingRiskScore,
      updated_at: nowIso,
    })
    .eq("id", thread.id);

  await supabaseServer
    .from("recruiters")
    .update({
      status: "CONTACTED",
      last_contacted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", thread.recruiter_id);

  await upsertPlan({
    thread,
    recruiter: {
      id: recruiter.id,
      title: recruiter.title,
      source: recruiter.source,
    },
    message: {
      sequence_id: message?.sequence_id ?? null,
    },
    nowIso,
    companySignal: plan.companySignal,
    preferredTone: plan.preferredTone,
    riskScore: plan.ghostingRiskScore,
  });

  const { data: updated } = await supabaseServer
    .from("outreach_messages")
    .select("*")
    .eq("id", messageId)
    .single();

  return Response.json({ success: true, message: updated ?? null });
}
