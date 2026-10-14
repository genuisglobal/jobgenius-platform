import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/me/payslips/[id]/acknowledge
 * Worker (AM) confirms receipt of an issued/paid payslip. Records
 * timestamp + IP, mirroring the contract e-sign pattern.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("id, worker_id, status, acknowledged_at")
    .eq("id", id)
    .maybeSingle();
  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }
  if (payslip.status === "draft") {
    return NextResponse.json(
      { error: "Payslip has not been issued yet." },
      { status: 400 }
    );
  }
  if (payslip.acknowledged_at) {
    return NextResponse.json(
      { error: "Payslip is already acknowledged." },
      { status: 400 }
    );
  }

  const { data: worker } = await supabaseAdmin
    .from("payroll_workers")
    .select("account_manager_id")
    .eq("id", payslip.worker_id)
    .maybeSingle();

  if (!worker || worker.account_manager_id !== auth.user.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const { data, error } = await supabaseAdmin
    .from("payslips")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_ip: ip,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to acknowledge." }, { status: 500 });
  }

  return NextResponse.json({ payslip: data });
}
