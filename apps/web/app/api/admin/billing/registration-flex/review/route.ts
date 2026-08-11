import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

const MAX_INSTALLMENTS_LIMIT = 12;
const MAX_WINDOW_DAYS_LIMIT = 365;

type ReviewPayload = {
  requestId?: string;
  decision?: "approved" | "rejected";
  approvedMaxInstallments?: number;
  approvedWindowDays?: number;
  adminNote?: string;
};

function toOptionalInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ReviewPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestId =
    typeof body.requestId === "string" ? body.requestId.trim() : "";
  const decision = body.decision;
  const adminNote =
    typeof body.adminNote === "string" ? body.adminNote.trim() : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be approved or rejected." },
      { status: 400 }
    );
  }

  const { data: flexRequest, error: requestError } = await supabaseAdmin
    .from("registration_flex_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError || !flexRequest) {
    return NextResponse.json(
      { error: "Flexible request not found." },
      { status: 404 }
    );
  }

  if (flexRequest.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been reviewed." },
      { status: 409 }
    );
  }

  let approvedMaxInstallments: number | null = null;
  let approvedWindowDays: number | null = null;
  if (decision === "approved") {
    approvedMaxInstallments = toOptionalInt(body.approvedMaxInstallments);
    approvedWindowDays = toOptionalInt(body.approvedWindowDays);

    if (
      approvedMaxInstallments === null ||
      approvedMaxInstallments < 1 ||
      approvedMaxInstallments > MAX_INSTALLMENTS_LIMIT
    ) {
      return NextResponse.json(
        {
          error: `approvedMaxInstallments must be between 1 and ${MAX_INSTALLMENTS_LIMIT}.`,
        },
        { status: 400 }
      );
    }

    if (
      approvedWindowDays === null ||
      approvedWindowDays < 7 ||
      approvedWindowDays > MAX_WINDOW_DAYS_LIMIT
    ) {
      return NextResponse.json(
        {
          error: `approvedWindowDays must be between 7 and ${MAX_WINDOW_DAYS_LIMIT}.`,
        },
        { status: 400 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("registration_flex_requests")
    .update({
      status: decision,
      approved_max_installments:
        decision === "approved" ? approvedMaxInstallments : null,
      approved_window_days: decision === "approved" ? approvedWindowDays : null,
      admin_note: adminNote || null,
      reviewed_by: auth.user.id,
      reviewed_at: nowIso,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Failed to update flexible request." },
      { status: 500 }
    );
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email")
    .eq("id", flexRequest.job_seeker_id)
    .maybeSingle();

  if (seeker?.email) {
    const seekerName = seeker.full_name || "there";
    const decisionLabel = decision === "approved" ? "approved" : "rejected";
    const termsLine =
      decision === "approved"
        ? `<p>Approved terms: up to <strong>${approvedMaxInstallments}</strong> installments within <strong>${approvedWindowDays}</strong> days.</p>`
        : "";
    const noteLine = adminNote
      ? `<p>Admin note: ${adminNote}</p>`
      : "";

    await sendAndLogEmail({
      to: seeker.email,
      subject: "Update on your flexible registration request",
      html: `
        <p>Hello ${seekerName},</p>
        <p>Your flexible registration payment request has been <strong>${decisionLabel}</strong>.</p>
        ${termsLine}
        ${noteLine}
        <p>You can continue in onboarding or review billing in your portal.</p>
      `,
      job_seeker_id: seeker.id,
      template_key: "billing-registration-flex-reviewed",
      meta: {
        request_id: updated.id,
        decision,
        approved_max_installments: approvedMaxInstallments,
        approved_window_days: approvedWindowDays,
      },
    }).catch((err) => { console.error("[billing] send flex review email failed:", err); return null; });
  }

  return NextResponse.json({ ok: true, request: updated });
}
