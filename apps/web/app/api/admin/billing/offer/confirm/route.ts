import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { computePlacementFee } from "@/lib/billing/commission";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { offerId } = body as { offerId: string };

  if (!offerId) {
    return NextResponse.json({ error: "offerId is required." }, { status: 400 });
  }

  const { data: offer } = await supabaseAdmin
    .from("job_offers")
    .select("*")
    .eq("id", offerId)
    .single();

  if (!offer) {
    return NextResponse.json({ error: "Job offer not found." }, { status: 404 });
  }

  if (offer.status === "accepted") {
    return NextResponse.json({ error: "Offer already accepted." }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Determine which confirmation we're adding
  const isAmReport = offer.reported_by === "am";
  const updateFields: Record<string, unknown> = {};

  if (isAmReport) {
    // AM reported, so seeker needs to confirm — but this is admin confirming on behalf
    updateFields.seeker_confirmed_at = offer.seeker_confirmed_at ?? now;
    updateFields.am_confirmed_at = now;
  } else {
    // Seeker reported, AM/admin confirms
    updateFields.am_confirmed_at = now;
  }

  // Check if both parties confirmed → set to accepted and calculate commission
  const seekerConfirmed = offer.seeker_confirmed_at || updateFields.seeker_confirmed_at;
  const amConfirmed = offer.am_confirmed_at || updateFields.am_confirmed_at;

  if (seekerConfirmed && amConfirmed) {
    const fee = computePlacementFee({
      baseSalary: Number(offer.base_salary),
      guaranteedCompensation: offer.guaranteed_compensation,
      startDate: offer.start_date,
      offerAcceptedAt: offer.offer_accepted_at,
    });

    Object.assign(updateFields, {
      status: "accepted",
      commission_amount: fee.commissionAmount,
      commission_due_date: fee.dueDate,
      commission_extended_due_date: fee.extendedDueDate,
      commission_status: "pending",
    });
  } else {
    updateFields.status = "confirmed";
  }

  const { data: updated, error } = await supabaseAdmin
    .from("job_offers")
    .update(updateFields)
    .eq("id", offerId)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Failed to confirm offer." }, { status: 500 });
  }

  // Notify seeker if offer is now accepted (commission clock started)
  if (updated.status === "accepted") {
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("email, full_name")
      .eq("id", updated.job_seeker_id)
      .single();

    if (seeker?.email) {
      const commission = updated.commission_amount;
      const dueDate = updated.commission_due_date;

      await sendAndLogEmail({
        to: seeker.email,
        subject: "Congratulations! Job Offer Confirmed — Commission Due",
        html: `
          <p>Hello ${seeker.full_name ?? ""},</p>
          <p>Congratulations on your new role at <strong>${updated.company}</strong>!</p>
          <p>Your job offer has been confirmed by both parties. The commission clock has started.</p>
          <ul>
            <li><strong>Commission Amount:</strong> $${Number(commission).toLocaleString(undefined, { minimumFractionDigits: 2 })}</li>
            <li><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</li>
          </ul>
          <p>Please arrange payment through your portal before the due date to avoid late fees or legal action.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing">Pay Commission →</a></p>
        `,
        job_seeker_id: updated.job_seeker_id,
        template_key: "billing-offer-accepted",
      });
    }
  }

  return NextResponse.json({ ok: true, offer: updated });
}
