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
  const { method, installmentId, offerId, note } = body as {
    method: string;
    installmentId?: string;
    offerId?: string;
    note?: string;
  };

  const validMethods = ["bank", "cashapp", "zelle", "paypal"];
  if (!validMethods.includes(method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  if (!installmentId && !offerId) {
    return NextResponse.json({ error: "Either installmentId or offerId is required." }, { status: 400 });
  }

  const { data: paymentRequest, error } = await supabaseAdmin
    .from("payment_requests")
    .insert({
      job_seeker_id: auth.user.id,
      installment_id: installmentId ?? null,
      offer_id: offerId ?? null,
      method,
      status: "pending",
      note: note ?? null,
    })
    .select()
    .single();

  if (error || !paymentRequest) {
    return NextResponse.json({ error: "Failed to create payment request." }, { status: 500 });
  }

  // Get seeker info for email
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .single();

  // Notify super admins
  const { data: admins } = await supabaseAdmin
    .from("account_managers")
    .select("email, full_name")
    .in("role", ["admin", "superadmin"]);

  if (admins && admins.length > 0) {
    const seekerName = seeker?.full_name || auth.user.email;
    const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);

    await Promise.all(
      admins.map((admin) =>
        sendAndLogEmail({
          to: admin.email,
          subject: `Payment Request: ${seekerName} — ${methodLabel}`,
          html: `
            <p>Hello ${admin.full_name},</p>
            <p><strong>${seekerName}</strong> has requested payment details via <strong>${methodLabel}</strong>.</p>
            <p>Please log in to the admin dashboard to send the payment details.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing">View in Dashboard →</a></p>
          `,
          job_seeker_id: auth.user.id,
          template_key: "billing-payment-requested",
        })
      )
    );
  }

  return NextResponse.json({ ok: true, paymentRequest }, { status: 201 });
}
