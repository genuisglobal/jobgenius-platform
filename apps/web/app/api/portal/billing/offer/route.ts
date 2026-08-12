import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { company, role, baseSalary, guaranteedCompensation, offerAcceptedAt, startDate, notes } = body as {
    company: string;
    role: string;
    baseSalary: number;
    guaranteedCompensation?: number;
    offerAcceptedAt: string;
    startDate?: string;
    notes?: string;
  };

  const guaranteed = Number.isFinite(Number(guaranteedCompensation)) ? Number(guaranteedCompensation) : 0;

  if (!company || !role || !baseSalary || !offerAcceptedAt) {
    return NextResponse.json(
      { error: "company, role, baseSalary, and offerAcceptedAt are required." },
      { status: 400 }
    );
  }

  if (baseSalary <= 0) {
    return NextResponse.json({ error: "Base salary must be greater than 0." }, { status: 400 });
  }

  const { data: offer, error } = await supabaseAdmin
    .from("job_offers")
    .insert({
      job_seeker_id: auth.user.id,
      company,
      role,
      base_salary: baseSalary,
      guaranteed_compensation: guaranteed,
      reported_by: "job_seeker",
      reported_by_user_id: auth.user.id,
      offer_accepted_at: offerAcceptedAt,
      start_date: startDate ?? null,
      status: "reported",
      seeker_confirmed_at: new Date().toISOString(),
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error || !offer) {
    return NextResponse.json({ error: "Failed to report job offer." }, { status: 500 });
  }

  // Notify assigned AM
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .single();

  if (assignment?.account_manager_id) {
    const { data: am } = await supabaseAdmin
      .from("account_managers")
      .select("email, full_name")
      .eq("id", assignment.account_manager_id)
      .single();

    if (am) {
      await sendAndLogEmail({
        to: am.email,
        subject: `Job Offer Reported: ${seeker?.full_name ?? "Client"} at ${company}`,
        html: `
          <p>Hello ${am.full_name},</p>
          <p><strong>${seeker?.full_name ?? "Your client"}</strong> has reported a job offer:</p>
          <ul>
            <li><strong>Company:</strong> ${company}</li>
            <li><strong>Role:</strong> ${role}</li>
            <li><strong>Base Salary:</strong> $${baseSalary.toLocaleString()}</li>
            <li><strong>Accepted On:</strong> ${new Date(offerAcceptedAt).toLocaleDateString()}</li>
          </ul>
          <p>Please confirm this offer in your dashboard to start the commission clock.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing">Confirm in Dashboard →</a></p>
        `,
        job_seeker_id: auth.user.id,
        template_key: "billing-offer-reported",
      });
    }
  }

  return NextResponse.json({ ok: true, offer }, { status: 201 });
}
