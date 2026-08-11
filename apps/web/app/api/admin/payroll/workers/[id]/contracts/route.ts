import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { EMPLOYMENT_CONTRACT_TYPES, PAY_FREQUENCIES } from "@/lib/payroll";
import { generateEmploymentContractHTML } from "@/lib/employment-contract-template";

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
    .select("*")
    .eq("worker_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load contracts." }, { status: 500 });
  }

  return NextResponse.json({ contracts: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: worker, error: workerError } = await supabaseAdmin
    .from("payroll_workers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (workerError || !worker) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  const contractType = EMPLOYMENT_CONTRACT_TYPES.includes(body.contract_type)
    ? body.contract_type
    : "offer_letter";
  const baseSalary =
    body.base_salary !== undefined && body.base_salary !== null
      ? Number(body.base_salary) || 0
      : Number(worker.base_salary) || 0;
  const payFrequency = PAY_FREQUENCIES.includes(body.pay_frequency)
    ? body.pay_frequency
    : worker.pay_frequency;
  const effectiveDate = body.effective_date || new Date().toISOString();
  const commissionTerms =
    typeof body.commission_terms === "string" && body.commission_terms.trim()
      ? body.commission_terms.trim()
      : null;
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `${worker.full_name} — ${
          contractType === "offer_letter" ? "Offer Letter" : "Employment Agreement"
        }`;

  const contractHtml = generateEmploymentContractHTML({
    employeeName: worker.full_name,
    employeeEmail: worker.email,
    jobTitle: worker.job_title,
    department: worker.department,
    contractType,
    baseSalary,
    payFrequency,
    currency: worker.currency,
    commissionTerms,
    effectiveDate,
    endDate: body.end_date || worker.end_date || null,
  });

  const { data, error } = await supabaseAdmin
    .from("employment_contracts")
    .insert({
      worker_id: id,
      contract_type: contractType,
      title,
      contract_html: contractHtml,
      base_salary: baseSalary,
      commission_terms: commissionTerms,
      effective_date: body.effective_date || null,
      end_date: body.end_date || null,
      status: "draft",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create contract." }, { status: 500 });
  }

  return NextResponse.json({ contract: data }, { status: 201 });
}
