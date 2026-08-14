import { NextResponse } from "next/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import {
  isUpsellOptedOut,
  normalizePhone,
  resolveAssignedAccountManagerId,
} from "@/lib/voice/service";
import { normalizeVoiceCallType, type VoiceCallType } from "@/lib/voice/types";

type DispatchTargetInput = {
  job_seeker_id?: string;
  lead_submission_id?: string;
  phone_number?: string;
  full_name?: string;
  account_manager_id?: string;
  call_type?: string;
};

type DispatchPayload = {
  call_type?: string;
  limit?: number;
  window_hours?: number;
  targets?: DispatchTargetInput[];
};

type DispatchTarget = {
  jobSeekerId: string | null;
  leadSubmissionId: string | null;
  phoneNumber: string;
  fullName: string | null;
  accountManagerId: string | null;
  callType: VoiceCallType;
};

type VoicePlaybookRow = {
  id: string;
  assistant_goal: string | null;
  system_prompt: string;
  max_retry_attempts: number | null;
};

function toPositiveInt(value: unknown, fallback: number, max = 200) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

async function loadActivePlaybook(callType: VoiceCallType): Promise<VoicePlaybookRow | null> {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id, assistant_goal, system_prompt, max_retry_attempts")
    .eq("call_type", callType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data as unknown as VoicePlaybookRow;
}

async function autoTargetsForLeadQualification(limit: number): Promise<DispatchTarget[]> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await supabaseServer
    .from("lead_intake_submissions")
    .select("id, full_name, phone, owner_account_manager_id")
    .in("status", ["new", "nurture"])
    .eq("consent_voice", true)
    .not("phone", "is", null)
    .or(`next_call_due_at.is.null,next_call_due_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (rows ?? [])
    .map((row) => ({
      jobSeekerId: null,
      leadSubmissionId: (row.id as string | undefined) ?? null,
      phoneNumber: normalizePhone((row.phone as string | undefined) ?? ""),
      fullName: (row.full_name as string | undefined) ?? null,
      accountManagerId: (row.owner_account_manager_id as string | undefined) ?? null,
      callType: "lead_qualification" as const,
    }))
    .filter((row) => Boolean(row.phoneNumber));
}

async function autoTargetsForOnboarding(limit: number): Promise<DispatchTarget[]> {
  const { data: seekers } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, phone")
    .is("onboarding_completed_at", null)
    .not("phone", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const targets: DispatchTarget[] = [];
  for (const row of seekers ?? []) {
    const jobSeekerId = (row.id as string | undefined) ?? null;
    const phone = normalizePhone((row.phone as string | undefined) ?? "");
    if (!jobSeekerId || !phone) continue;
    const accountManagerId = await resolveAssignedAccountManagerId(jobSeekerId);
    targets.push({
      jobSeekerId,
      leadSubmissionId: null,
      phoneNumber: phone,
      fullName: (row.full_name as string | undefined) ?? null,
      accountManagerId,
      callType: "onboarding",
    });
  }

  return targets;
}

async function autoTargetsForInterviewWarmup(
  limit: number,
  windowHours: number
): Promise<DispatchTarget[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowEndIso = new Date(
    now.getTime() + windowHours * 60 * 60 * 1000
  ).toISOString();

  const { data: interviews } = await supabaseServer
    .from("interviews")
    .select(
      "id, job_seeker_id, account_manager_id, scheduled_at, job_seekers(full_name, phone)"
    )
    .eq("status", "confirmed")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", nowIso)
    .lte("scheduled_at", windowEndIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit * 2);

  const targets: DispatchTarget[] = [];
  const seenJobSeekerIds = new Set<string>();

  for (const row of interviews ?? []) {
    const jobSeekerId =
      typeof row.job_seeker_id === "string" ? row.job_seeker_id : null;
    if (!jobSeekerId || seenJobSeekerIds.has(jobSeekerId)) {
      continue;
    }

    let fullName: string | null = null;
    let phone = "";
    const seekerValue = (
      row as unknown as {
        job_seekers?: unknown;
      }
    ).job_seekers;
    const seekerRow = Array.isArray(seekerValue)
      ? seekerValue[0]
      : seekerValue;

    if (seekerRow && typeof seekerRow === "object") {
      const seekerRecord = seekerRow as {
        full_name?: unknown;
        phone?: unknown;
      };
      fullName =
        typeof seekerRecord.full_name === "string"
          ? seekerRecord.full_name
          : null;
      phone = normalizePhone(
        typeof seekerRecord.phone === "string" ? seekerRecord.phone : ""
      );
    }

    if (!phone) {
      const { data: seeker } = await supabaseServer
        .from("job_seekers")
        .select("full_name, phone")
        .eq("id", jobSeekerId)
        .limit(1)
        .maybeSingle();
      if (seeker) {
        fullName = fullName ?? ((seeker.full_name as string | undefined) ?? null);
        phone = normalizePhone((seeker.phone as string | undefined) ?? "");
      }
    }

    if (!phone) {
      continue;
    }

    seenJobSeekerIds.add(jobSeekerId);
    targets.push({
      jobSeekerId,
      leadSubmissionId: null,
      phoneNumber: phone,
      fullName,
      accountManagerId:
        typeof row.account_manager_id === "string" ? row.account_manager_id : null,
      callType: "interview_warmup",
    });

    if (targets.length >= limit) {
      break;
    }
  }

  return targets;
}

async function resolveManualTargets(
  callType: VoiceCallType,
  targets: DispatchTargetInput[]
): Promise<DispatchTarget[]> {
  const resolved: DispatchTarget[] = [];

  for (const target of targets) {
    const targetCallType = normalizeVoiceCallType(target.call_type) ?? callType;
    const phone = normalizePhone(target.phone_number ?? "");
    const leadSubmissionId =
      typeof target.lead_submission_id === "string" && target.lead_submission_id
        ? target.lead_submission_id
        : null;
    const jobSeekerId =
      typeof target.job_seeker_id === "string" && target.job_seeker_id
        ? target.job_seeker_id
        : null;

    let accountManagerId =
      typeof target.account_manager_id === "string" && target.account_manager_id
        ? target.account_manager_id
        : null;
    let fullName =
      typeof target.full_name === "string" && target.full_name.trim()
        ? target.full_name.trim()
        : null;
    let finalPhone = phone;

    if (jobSeekerId) {
      const { data: seeker } = await supabaseServer
        .from("job_seekers")
        .select("full_name, phone")
        .eq("id", jobSeekerId)
        .limit(1)
        .maybeSingle();
      if (seeker) {
        fullName = fullName ?? ((seeker.full_name as string | undefined) ?? null);
        finalPhone = finalPhone || normalizePhone((seeker.phone as string | undefined) ?? "");
      }
      if (!accountManagerId) {
        accountManagerId = await resolveAssignedAccountManagerId(jobSeekerId);
      }
    }

    if (leadSubmissionId) {
      const { data: lead } = await supabaseServer
        .from("lead_intake_submissions")
        .select("full_name, phone, owner_account_manager_id")
        .eq("id", leadSubmissionId)
        .limit(1)
        .maybeSingle();
      if (lead) {
        fullName = fullName ?? ((lead.full_name as string | undefined) ?? null);
        finalPhone = finalPhone || normalizePhone((lead.phone as string | undefined) ?? "");
        accountManagerId =
          accountManagerId ?? ((lead.owner_account_manager_id as string | undefined) ?? null);
      }
    }

    if (!finalPhone) continue;

    resolved.push({
      jobSeekerId,
      leadSubmissionId,
      phoneNumber: finalPhone,
      fullName,
      accountManagerId,
      callType: targetCallType,
    });
  }

  return resolved;
}

async function resolveTargets(payload: DispatchPayload): Promise<DispatchTarget[]> {
  const normalizedCallType = normalizeVoiceCallType(payload.call_type) ?? "lead_qualification";
  const limit = toPositiveInt(payload.limit, 25, 200);
  const windowHours = toPositiveInt(payload.window_hours, 24, 168);

  if (Array.isArray(payload.targets) && payload.targets.length > 0) {
    return resolveManualTargets(normalizedCallType, payload.targets);
  }

  if (normalizedCallType === "lead_qualification") {
    return autoTargetsForLeadQualification(limit);
  }
  if (normalizedCallType === "onboarding") {
    return autoTargetsForOnboarding(limit);
  }
  if (normalizedCallType === "interview_warmup") {
    return autoTargetsForInterviewWarmup(limit, windowHours);
  }

  return [];
}

async function dispatch(payload: DispatchPayload) {
  const targets = await resolveTargets(payload);
  if (targets.length === 0) {
    return NextResponse.json({ success: true, queued: 0, skipped: 0, details: [] });
  }

  let queued = 0;
  let skipped = 0;
  const details: Array<{ phone: string; call_type: VoiceCallType; voice_call_id?: string; skip_reason?: string }> = [];

  for (const target of targets) {
    if (target.callType === "upsell_retention" && (await isUpsellOptedOut(target.phoneNumber))) {
      skipped += 1;
      details.push({
        phone: target.phoneNumber,
        call_type: target.callType,
        skip_reason: "Upsell opt-out is active for this phone number.",
      });
      continue;
    }

    const playbook = await loadActivePlaybook(target.callType);
    if (!playbook) {
      skipped += 1;
      details.push({
        phone: target.phoneNumber,
        call_type: target.callType,
        skip_reason: "No active voice playbook configured for this call type.",
      });
      continue;
    }

    const task =
      String(playbook.assistant_goal ?? "").trim() ||
      String(playbook.system_prompt ?? "").trim();
    if (!task) {
      skipped += 1;
      details.push({
        phone: target.phoneNumber,
        call_type: target.callType,
        skip_reason: "Playbook has no task/prompt.",
      });
      continue;
    }

    const { data: voiceCall, error } = await supabaseServer
      .from("voice_calls")
      .insert({
        provider: "retell",
        direction: "outbound",
        call_type: target.callType,
        status: "queued",
        job_seeker_id: target.jobSeekerId,
        lead_submission_id: target.leadSubmissionId,
        account_manager_id: target.accountManagerId,
        playbook_id: playbook.id,
        from_number: process.env.RETELL_DEFAULT_FROM_NUMBER ?? null,
        to_number: target.phoneNumber,
        contact_name: target.fullName,
        task,
        max_retries: playbook.max_retry_attempts ?? 3,
        request_payload: {
          dispatch_source: Array.isArray(payload.targets) ? "manual" : "auto",
        },
        response_payload: {},
      })
      .select("id")
      .single();

    if (error || !voiceCall?.id) {
      skipped += 1;
      details.push({
        phone: target.phoneNumber,
        call_type: target.callType,
        skip_reason: "Failed to create voice call record.",
      });
      continue;
    }

    await enqueueBackgroundJob(
      "VOICE_DISPATCH",
      {
        voice_call_id: voiceCall.id as string,
        job_seeker_id: target.jobSeekerId ?? undefined,
        lead_submission_id: target.leadSubmissionId ?? undefined,
        call_type: target.callType,
      },
      { maxAttempts: 1 }
    );

    queued += 1;
    details.push({
      phone: target.phoneNumber,
      call_type: target.callType,
      voice_call_id: voiceCall.id as string,
    });
  }

  return NextResponse.json({
    success: true,
    queued,
    skipped,
    details,
  });
}

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  let payload: DispatchPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  return dispatch(payload);
}

export async function GET(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const payload: DispatchPayload = {
    call_type: url.searchParams.get("call_type") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? "25"),
    window_hours: Number(url.searchParams.get("window_hours") ?? "24"),
  };

  return dispatch(payload);
}
