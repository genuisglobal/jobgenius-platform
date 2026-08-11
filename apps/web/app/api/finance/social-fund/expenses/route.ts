import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import {
  SOCIAL_FUND_EXPENSE_STATUSES,
  type SocialFundExpenseStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";

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

  const expenseId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const expenseTitle =
    typeof body.expense_title === "string" && body.expense_title.trim()
      ? body.expense_title.trim()
      : "";
  if (!expenseTitle) {
    return NextResponse.json({ error: "Expense title is required." }, { status: 400 });
  }

  const status: SocialFundExpenseStatus =
    typeof body.status === "string" &&
    SOCIAL_FUND_EXPENSE_STATUSES.includes(body.status as SocialFundExpenseStatus)
      ? (body.status as SocialFundExpenseStatus)
      : "proposed";

  const payload = {
    expense_title: expenseTitle,
    amount: Number(body.amount) || 0,
    purpose: typeof body.purpose === "string" ? body.purpose.trim() || null : null,
    requested_by_employee_id:
      typeof body.requested_by_employee_id === "string" &&
      body.requested_by_employee_id.trim()
        ? body.requested_by_employee_id.trim()
        : null,
    social_lead_employee_id:
      typeof body.social_lead_employee_id === "string" &&
      body.social_lead_employee_id.trim()
        ? body.social_lead_employee_id.trim()
        : null,
    approved_by: status === "approved" || status === "paid" ? auth.user.id : null,
    status,
    receipt_url:
      typeof body.receipt_url === "string" ? body.receipt_url.trim() || null : null,
    payment_date:
      typeof body.payment_date === "string" && body.payment_date.trim()
        ? body.payment_date.trim()
        : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const query = supabaseAdmin.from("social_fund_expenses");
  const result = expenseId
    ? await query.update(payload).eq("id", expenseId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save social fund expense." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_fund_expense_update",
    targetType: "social_fund_expense",
    targetId: result.data.id,
    details: {
      status,
      amount: payload.amount,
    },
  }).catch(() => {});

  return NextResponse.json({ expense: result.data });
}
