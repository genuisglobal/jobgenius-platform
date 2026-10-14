import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeVoiceCallType } from "@/lib/voice/types";

type CreatePlaybookPayload = {
  call_type?: string;
  name?: string;
  system_prompt?: string;
  assistant_goal?: string | null;
  guardrails?: string | null;
  pathway_id?: string | null;
  retell_agent_id?: string | null;
  escalation_rules?: Record<string, unknown>;
  max_retry_attempts?: number;
  retry_backoff_minutes?: number;
  is_active?: boolean;
};

type UpdatePlaybookPayload = {
  id?: string;
  name?: string;
  system_prompt?: string;
  assistant_goal?: string | null;
  guardrails?: string | null;
  pathway_id?: string | null;
  retell_agent_id?: string | null;
  escalation_rules?: Record<string, unknown>;
  max_retry_attempts?: number;
  retry_backoff_minutes?: number;
  is_active?: boolean;
};

function toOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toOptionalInt(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("voice_playbooks")
    .select("*")
    .order("call_type", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load voice playbooks." }, { status: 500 });
  }

  return NextResponse.json({ playbooks: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: CreatePlaybookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const callType = normalizeVoiceCallType(payload.call_type);
  if (!callType) {
    return NextResponse.json({ error: "Valid call_type is required." }, { status: 400 });
  }

  const name = toOptionalText(payload.name) ?? "Custom";
  const systemPrompt = toOptionalText(payload.system_prompt);
  if (!systemPrompt) {
    return NextResponse.json({ error: "system_prompt is required." }, { status: 400 });
  }

  const maxRetryAttempts = toOptionalInt(payload.max_retry_attempts);
  const retryBackoffMinutes = toOptionalInt(payload.retry_backoff_minutes);

  if (maxRetryAttempts !== null && (maxRetryAttempts < 0 || maxRetryAttempts > 10)) {
    return NextResponse.json(
      { error: "max_retry_attempts must be between 0 and 10." },
      { status: 400 }
    );
  }

  if (retryBackoffMinutes !== null && (retryBackoffMinutes < 1 || retryBackoffMinutes > 1440)) {
    return NextResponse.json(
      { error: "retry_backoff_minutes must be between 1 and 1440." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("voice_playbooks")
    .insert({
      call_type: callType,
      name,
      system_prompt: systemPrompt,
      assistant_goal: toOptionalText(payload.assistant_goal),
      guardrails: toOptionalText(payload.guardrails),
      pathway_id: toOptionalText(payload.pathway_id),
      retell_agent_id: toOptionalText(payload.retell_agent_id),
      escalation_rules:
        payload.escalation_rules && typeof payload.escalation_rules === "object"
          ? payload.escalation_rules
          : {},
      max_retry_attempts: maxRetryAttempts ?? 3,
      retry_backoff_minutes: retryBackoffMinutes ?? 120,
      is_active: payload.is_active ?? true,
      created_by_am_id: auth.user.id,
      updated_by_am_id: auth.user.id,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create voice playbook." }, { status: 500 });
  }

  return NextResponse.json({ playbook: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: UpdatePlaybookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = toOptionalText(payload.id);
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_by_am_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updates.name = toOptionalText(payload.name) ?? "Custom";
  if (payload.system_prompt !== undefined) {
    const prompt = toOptionalText(payload.system_prompt);
    if (!prompt) {
      return NextResponse.json({ error: "system_prompt cannot be empty." }, { status: 400 });
    }
    updates.system_prompt = prompt;
  }
  if (payload.assistant_goal !== undefined) updates.assistant_goal = toOptionalText(payload.assistant_goal);
  if (payload.guardrails !== undefined) updates.guardrails = toOptionalText(payload.guardrails);
  if (payload.pathway_id !== undefined) updates.pathway_id = toOptionalText(payload.pathway_id);
  if (payload.retell_agent_id !== undefined)
    updates.retell_agent_id = toOptionalText(payload.retell_agent_id);
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);
  if (payload.escalation_rules !== undefined) {
    if (!payload.escalation_rules || typeof payload.escalation_rules !== "object") {
      return NextResponse.json({ error: "escalation_rules must be an object." }, { status: 400 });
    }
    updates.escalation_rules = payload.escalation_rules;
  }
  if (payload.max_retry_attempts !== undefined) {
    const value = toOptionalInt(payload.max_retry_attempts);
    if (value === null || value < 0 || value > 10) {
      return NextResponse.json(
        { error: "max_retry_attempts must be between 0 and 10." },
        { status: 400 }
      );
    }
    updates.max_retry_attempts = value;
  }
  if (payload.retry_backoff_minutes !== undefined) {
    const value = toOptionalInt(payload.retry_backoff_minutes);
    if (value === null || value < 1 || value > 1440) {
      return NextResponse.json(
        { error: "retry_backoff_minutes must be between 1 and 1440." },
        { status: 400 }
      );
    }
    updates.retry_backoff_minutes = value;
  }

  const { data, error } = await supabaseAdmin
    .from("voice_playbooks")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update voice playbook." }, { status: 500 });
  }

  return NextResponse.json({ playbook: data });
}
