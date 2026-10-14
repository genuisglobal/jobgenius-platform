import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

type OtpPayload = {
  job_seeker_id?: string;
  channel?: "EMAIL" | "SMS";
  code?: string;
};

export async function POST(request: Request) {
  const otpRateLimit = await enforceRateLimit({
    request,
    scope: "otp_submit",
    identifier: "global",
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 60,
  });

  if (!otpRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many OTP submissions. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, otpRateLimit.retryAfterSeconds)) },
      }
    );
  }

  let payload: OtpPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id || !payload?.channel || !payload?.code) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_seeker_id, channel, code.",
      },
      { status: 400 }
    );
  }

  if (!["EMAIL", "SMS"].includes(payload.channel)) {
    return Response.json(
      { success: false, error: "Invalid channel." },
      { status: 400 }
    );
  }

  // Authorize: OPS key or AM assigned to this seeker.
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const allowed = await hasJobSeekerAccess(
      amResult.accountManager.id,
      payload.job_seeker_id
    );

    if (!allowed) {
      return Response.json(
        { success: false, error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }
  }

  const { error } = await supabaseServer.from("otp_inbox").insert({
    job_seeker_id: payload.job_seeker_id,
    channel: payload.channel,
    code: payload.code,
  });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to store OTP." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
