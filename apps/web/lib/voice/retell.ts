import { createHmac, timingSafeEqual } from "crypto";
import type { VoiceCallStatus } from "@/lib/voice/types";

type JsonRecord = Record<string, unknown>;

export type RetellOutboundCallInput = {
  toNumber: string;
  fromNumber?: string | null;
  /** Retell agent id for this call type (override_agent_id). */
  agentId?: string | null;
  /** Dynamic variables injected into the agent prompt. */
  dynamicVariables?: Record<string, string | null | undefined>;
  metadata?: JsonRecord;
};

export type RetellOutboundCallResult = {
  providerCallId: string | null;
  status: string | null;
  raw: JsonRecord;
};

export type NormalizedRetellWebhookEvent = {
  providerCallId: string | null;
  /** Stable per-event id derived as `${callId}:${eventType}` for idempotency. */
  providerEventId: string | null;
  eventType: string;
  status: VoiceCallStatus | null;
  direction: "inbound" | "outbound" | null;
  fromNumber: string | null;
  toNumber: string | null;
  transcript: string | null;
  summary: string | null;
  disposition: string | null;
  recordingUrl: string | null;
  /** Retell disconnection_reason, e.g. user_hangup, dial_no_answer, voicemail_reached. */
  disconnectionReason: string | null;
  /** Post Call Extraction results (call_analysis.custom_analysis_data); only on call_analyzed. */
  customAnalysis: JsonRecord;
  /** True once the analysis is present (call_analyzed event). */
  analyzed: boolean;
  metadata: JsonRecord;
  payload: JsonRecord;
};

function toRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(record: JsonRecord, keys: string[]): string | null {
  let current: unknown = record;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return readString(current);
}

function normalizeRetellUrl() {
  const baseUrl = process.env.RETELL_BASE_URL?.trim() || "https://api.retellai.com";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

const NO_ANSWER_REASONS = ["dial_no_answer", "dial_busy", "user_declined"];
const FAILED_REASON_PREFIXES = [
  "dial_failed",
  "invalid_destination",
  "telephony_",
  "sip_routing_error",
  "marked_as_spam",
  "concurrency_limit_reached",
  "no_valid_payment",
  "error_",
];

/** Outcome implied by Retell's disconnection_reason / in_voicemail, if any. */
function statusFromDisconnection(
  reason: string | null,
  inVoicemail: boolean
): VoiceCallStatus | null {
  const r = (reason ?? "").toLowerCase();
  if (inVoicemail || r === "voicemail_reached") return "voicemail";
  if (NO_ANSWER_REASONS.includes(r)) return "no_answer";
  if (FAILED_REASON_PREFIXES.some((prefix) => r.startsWith(prefix))) return "failed";
  return null;
}

/**
 * Map a Retell webhook event + call_status into our internal VoiceCallStatus.
 */
function inferStatus(
  eventType: string,
  callStatus: string | null,
  disconnectionReason: string | null = null,
  inVoicemail = false
): VoiceCallStatus | null {
  const event = eventType.toLowerCase();
  const status = (callStatus ?? "").toLowerCase();

  const fromDisconnection = statusFromDisconnection(disconnectionReason, inVoicemail);
  if (fromDisconnection) return fromDisconnection;

  // Disconnection reasons / dispositions surfaced on call_analyzed/call_ended.
  if (status.includes("voicemail") || status.includes("machine")) return "voicemail";
  if (status.includes("no_answer") || status.includes("no-answer") || status.includes("not_answered")) {
    return "no_answer";
  }
  if (status.includes("dial_failed") || status.includes("error") || status.includes("failed")) {
    return "failed";
  }

  if (event.includes("call_started")) return "in_progress";
  if (event.includes("call_ended")) return "ended";
  if (event.includes("call_analyzed")) return "completed";

  // Fallback to registered/ongoing/ended call_status values from Retell.
  if (status === "registered") return "initiated";
  if (status === "ongoing" || status === "in_progress") return "in_progress";
  if (status === "ended") return "ended";

  return null;
}

function parseDirection(call: JsonRecord): "inbound" | "outbound" | null {
  const direction = (
    readString(call.direction) ||
    readString((call as JsonRecord).call_direction) ||
    ""
  ).toLowerCase();
  if (direction === "inbound" || direction === "outbound") {
    return direction;
  }
  return null;
}

function parseSignatureCandidates(rawHeaderValue: string): string[] {
  const values = new Set<string>();
  const chunks = rawHeaderValue
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    values.add(chunk);
    if (chunk.startsWith("sha256=")) values.add(chunk.slice("sha256=".length));
    if (chunk.startsWith("v1=")) values.add(chunk.slice("v1=".length));
    if (chunk.includes("=")) {
      const [, rhs] = chunk.split("=", 2);
      if (rhs) values.add(rhs.trim());
    }
  }

  return Array.from(values).filter(Boolean);
}

function safeCompare(valueA: string, valueB: string): boolean {
  const a = Buffer.from(valueA);
  const b = Buffer.from(valueB);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verify the Retell webhook signature. FAIL CLOSED: if no signing secret is
 * configured, or no signature header is present, verification fails.
 *
 * Retell's current format is `x-retell-signature: v={unix_ms},d={hex}` where
 * hex = HMAC-SHA256(key = webhook API key, message = raw body + timestamp),
 * and the timestamp must be within 5 minutes. The older body-only digest is
 * still accepted for headers without a timestamp.
 */
export function verifyRetellWebhookSignature(
  rawBody: string,
  headers: Headers,
  now: number = Date.now()
): boolean {
  const secret =
    process.env.RETELL_WEBHOOK_SECRET?.trim() || process.env.RETELL_API_KEY?.trim();
  if (!secret) {
    // Fail closed: never accept unverifiable webhooks.
    return false;
  }

  const provided =
    headers.get("x-retell-signature") ||
    headers.get("retell-signature") ||
    headers.get("x-webhook-signature") ||
    "";
  if (!provided) {
    return false;
  }

  const timestamped = /^v=(\d+),d=([0-9a-f]+)$/i.exec(provided.trim());
  if (timestamped) {
    const [, timestamp, digest] = timestamped;
    if (Math.abs(now - Number(timestamp)) > SIGNATURE_TOLERANCE_MS) return false;
    const expected = createHmac("sha256", secret).update(rawBody + timestamp).digest("hex");
    return safeCompare(digest.toLowerCase(), expected);
  }

  const digestHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const digestBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  const candidates = parseSignatureCandidates(provided);

  return candidates.some(
    (candidate) =>
      safeCompare(candidate, digestHex) ||
      safeCompare(candidate, `sha256=${digestHex}`) ||
      safeCompare(candidate, digestBase64)
  );
}

export async function createRetellPhoneCall(
  input: RetellOutboundCallInput
): Promise<RetellOutboundCallResult> {
  const apiKey = process.env.RETELL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RETELL_API_KEY is not configured.");
  }

  const toNumber = input.toNumber.trim();
  if (!toNumber) {
    throw new Error("toNumber is required.");
  }

  const fromNumber =
    (input.fromNumber ?? process.env.RETELL_DEFAULT_FROM_NUMBER ?? "").trim();
  if (!fromNumber) {
    throw new Error(
      "A from number is required. Set RETELL_DEFAULT_FROM_NUMBER or pass fromNumber."
    );
  }

  // Retell rejects null values inside dynamic variables; coerce to strings.
  const dynamicVariables: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.dynamicVariables ?? {})) {
    if (value === null || value === undefined) continue;
    dynamicVariables[key] = String(value);
  }

  const body: JsonRecord = {
    from_number: fromNumber,
    to_number: toNumber,
    retell_llm_dynamic_variables: dynamicVariables,
    metadata: input.metadata ?? {},
  };

  if (input.agentId && input.agentId.trim()) {
    body.override_agent_id = input.agentId.trim();
  }

  const response = await fetch(`${normalizeRetellUrl()}/v2/create-phone-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  let raw: JsonRecord = {};
  try {
    raw = toRecord(await response.json());
  } catch {
    raw = {};
  }

  if (!response.ok) {
    const message =
      readString(raw.error_message) ||
      readString(raw.message) ||
      readString(raw.error) ||
      `Retell call create failed with status ${response.status}`;
    throw new Error(message);
  }

  return {
    providerCallId: readString(raw.call_id) || readString(raw.call_id_v2),
    status: readString(raw.call_status),
    raw,
  };
}

export function normalizeRetellWebhookPayload(
  payload: JsonRecord
): NormalizedRetellWebhookEvent {
  const eventType =
    readString(payload.event) || readString(payload.type) || "call.unknown";

  // Retell nests the call object under `call`.
  const call = toRecord(payload.call ?? payload.data ?? payload);

  const providerCallId =
    readString(call.call_id) ||
    readString(call.call_id_v2) ||
    readString(payload.call_id) ||
    null;

  const callStatus =
    readString(call.call_status) ||
    readString(payload.call_status) ||
    null;

  // Derive a stable per-event id so retried webhook deliveries are idempotent.
  const providerEventId = providerCallId ? `${providerCallId}:${eventType}` : null;

  const analysis = toRecord(call.call_analysis);

  const transcript =
    readString(call.transcript) ||
    readNestedString(call, ["transcript_object", "transcript"]) ||
    null;

  const summary =
    readString(analysis.call_summary) ||
    readString(analysis.summary) ||
    null;

  const disposition =
    readString(analysis.user_sentiment) ||
    readString(analysis.call_successful) ||
    readString(call.disconnection_reason) ||
    null;

  const recordingUrl = readString(call.recording_url);
  const disconnectionReason = readString(call.disconnection_reason);
  const inVoicemail = analysis.in_voicemail === true;
  const customAnalysis = toRecord(analysis.custom_analysis_data);

  return {
    providerCallId,
    providerEventId,
    eventType,
    status: inferStatus(eventType, callStatus, disconnectionReason, inVoicemail),
    direction: parseDirection(call),
    fromNumber: readString(call.from_number),
    toNumber: readString(call.to_number),
    transcript,
    summary,
    disposition,
    recordingUrl,
    disconnectionReason,
    customAnalysis,
    analyzed: Object.keys(analysis).length > 0,
    metadata: toRecord(call.metadata),
    payload,
  };
}
