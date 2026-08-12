import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import {
  BONUS_PAYMENT_STATUSES,
  BONUS_RECORD_STATUSES,
  type BonusPaymentStatus,
  type BonusRecordStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";

function canAccess(role: string | null | undefined): boolean {
  return isFinanceRole(role) || isPeopleManagerRole(role);
}

function unauthorized() {
  return NextResponse.json(
    { error: "Finance or people manager access required." },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccess(auth.user.role)) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bonusId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  if (!bonusId) {
    return NextResponse.json({ error: "Bonus record is required." }, { status: 400 });
  }

  const approvalStatus: BonusRecordStatus =
    typeof body.approval_status === "string" &&
    BONUS_RECORD_STATUSES.includes(body.approval_status as BonusRecordStatus)
      ? (body.approval_status as BonusRecordStatus)
      : "pending_verification";
  const paymentStatus: BonusPaymentStatus =
    typeof body.payment_status === "string" &&
    BONUS_PAYMENT_STATUSES.includes(body.payment_status as BonusPaymentStatus)
      ? (body.payment_status as BonusPaymentStatus)
      : "pending";

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("employee_bonus_records")
    .select("id, employee_id, approval_status, payment_status")
    .eq("id", bonusId)
    .maybeSingle();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Bonus record not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    approval_status: approvalStatus,
    bonus_eligibility_status:
      approvalStatus === "approved" ||
      approvalStatus === "rejected" ||
      approvalStatus === "disputed"
        ? approvalStatus
        : "eligible",
    payment_status: paymentStatus,
    payment_month:
      typeof body.payment_month === "string" && body.payment_month.trim()
        ? body.payment_month.trim()
        : null,
    approved_by:
      approvalStatus === "approved" || approvalStatus === "rejected" || approvalStatus === "disputed"
        ? auth.user.id
        : null,
    approved_at:
      approvalStatus === "approved" || approvalStatus === "rejected" || approvalStatus === "disputed"
        ? nowIso
        : null,
    paid_at: paymentStatus === "paid" ? nowIso : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const { data: bonus, error } = await supabaseAdmin
    .from("employee_bonus_records")
    .update(updatePayload)
    .eq("id", bonusId)
    .select("*")
    .single();

  if (error || !bonus) {
    return NextResponse.json(
      { error: error?.message || "Failed to update bonus record." },
      { status: 500 }
    );
  }

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("account_manager_id")
    .eq("id", existing.employee_id)
    .maybeSingle();

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.bonus_update",
    targetType: "employee_bonus_record",
    targetId: bonusId,
    details: {
      employee_id: existing.employee_id,
      approval_status: approvalStatus,
      payment_status: paymentStatus,
    },
  }).catch(() => {});

  if (employee?.account_manager_id) {
    sendNotification({
      userId: employee.account_manager_id,
      userType: "am",
      category: "employee_bonus_updated",
      subject: "Your JobGenuis bonus record was updated",
      body: `Management updated your bonus record to ${approvalStatus.replace(/_/g, " ")} with payment status ${paymentStatus.replace(
        /_/g,
        " "
      )}.`,
      linkUrl: "/dashboard/me/bonuses",
      channel: "in_app",
      payload: { employee_bonus_record_id: bonusId },
    }).catch(() => {});
  }

  return NextResponse.json({ bonus });
}
