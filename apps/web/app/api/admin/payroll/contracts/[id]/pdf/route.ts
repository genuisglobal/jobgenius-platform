import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/admin/payroll/contracts/[id]/pdf
 * Returns the stored contract HTML inline for viewing / browser print-to-PDF.
 * The contract body is rich HTML (lib/employment-contract-template.ts), so we
 * serve it directly rather than down-converting to the basic text PDF engine.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("employment_contracts")
    .select("contract_html, title")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || !data.contract_html) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  return new NextResponse(data.contract_html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
