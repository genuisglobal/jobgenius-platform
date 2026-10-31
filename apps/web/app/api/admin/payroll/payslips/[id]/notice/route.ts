import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { loadPayslipNotices, queuePayslipNotice } from "@/lib/payslip-notices";
import { categoryForPayslipNotice, payslipNoticeState, type PayslipNoticeKind } from "@/lib/payslip-notice-status";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const kind = body?.kind as PayslipNoticeKind | undefined;
  if (kind !== "issued" && kind !== "paid") return NextResponse.json({ error: "Select an issued or paid notice." }, { status: 400 });

  const { data: payslip, error } = await supabaseAdmin.from("payslips").select("id, status").eq("id", id).maybeSingle();
  if (error || !payslip) return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  if (payslip.status === "draft" || (kind === "paid" && payslip.status !== "paid")) {
    return NextResponse.json({ error: "That payslip notice is not available yet." }, { status: 400 });
  }

  const category = categoryForPayslipNotice(kind);
  const latest = (await loadPayslipNotices(id)).find((row) => row.category === category) ?? null;
  const state = payslipNoticeState(latest);
  if (state === "queued" || state === "sent") {
    return NextResponse.json({ error: state === "queued" ? "This notice is already queued." : "This email was already sent." }, { status: 409 });
  }
  const queued = await queuePayslipNotice(id, kind);
  if (!queued) return NextResponse.json({ error: "Could not queue the notice. Check the worker's linked staff login." }, { status: 500 });
  return NextResponse.json({ queued: true });
}
