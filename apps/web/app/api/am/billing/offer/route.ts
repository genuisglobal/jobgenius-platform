import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { jobSeekerId, company, role, baseSalary, guaranteedCompensation, offerAcceptedAt, startDate, notes } = body as {
    jobSeekerId: string;
    company: string;
    role: string;
    baseSalary: number;
    guaranteedCompensation?: number;
    offerAcceptedAt: string;
    startDate?: string;
    notes?: string;
  };

  const guaranteed = Number.isFinite(Number(guaranteedCompensation)) ? Number(guaranteedCompensation) : 0;

  if (!jobSeekerId || !company || !role || !baseSalary || !offerAcceptedAt) {
    return NextResponse.json(
      { error: "jobSeekerId, company, role, baseSalary, and offerAcceptedAt are required." },
      { status: 400 }
    );
  }

  const { data: offer, error } = await supabaseAdmin
    .from("job_offers")
    .insert({
      job_seeker_id: jobSeekerId,
      company,
      role,
      base_salary: baseSalary,
      guaranteed_compensation: guaranteed,
      reported_by: "am",
      reported_by_user_id: auth.user.id,
      offer_accepted_at: offerAcceptedAt,
      start_date: startDate ?? null,
      status: "reported",
      am_confirmed_at: new Date().toISOString(),
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error || !offer) {
    return NextResponse.json({ error: "Failed to report job offer." }, { status: 500 });
  }

  // Notify seeker
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("email, full_name")
    .eq("id", jobSeekerId)
    .single();

  if (seeker?.email) {
    await sendAndLogEmail({
      to: seeker.email,
      subject: `Job Offer Reported — Please Confirm`,
      html: `
        <p>Hello ${seeker.full_name ?? ""},</p>
        <p>Your Account Manager has reported a job offer on your behalf. Please confirm this offer in your portal:</p>
        <ul>
          <li><strong>Company:</strong> ${company}</li>
          <li><strong>Role:</strong> ${role}</li>
          <li><strong>Base Salary:</strong> $${baseSalary.toLocaleString()}</li>
          ${guaranteed > 0 ? `<li><strong>Guaranteed Compensation:</strong> $${guaranteed.toLocaleString()}</li>` : ""}
          <li><strong>Accepted On:</strong> ${new Date(offerAcceptedAt).toLocaleDateString()}</li>
        </ul>
        <p>Once both parties confirm, the placement fee becomes due within two months of your employment start date.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing">Confirm in Portal →</a></p>
      `,
      job_seeker_id: jobSeekerId,
      template_key: "billing-offer-reported",
    });
  }

  return NextResponse.json({ ok: true, offer }, { status: 201 });
}
