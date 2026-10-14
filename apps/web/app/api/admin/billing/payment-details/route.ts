import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

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
  const { paymentRequestId } = body as { paymentRequestId: string };

  if (!paymentRequestId) {
    return NextResponse.json({ error: "paymentRequestId is required." }, { status: 400 });
  }

  // Get the payment request
  const { data: payReq } = await supabaseAdmin
    .from("payment_requests")
    .select("*, job_seekers(full_name, email)")
    .eq("id", paymentRequestId)
    .single();

  if (!payReq) {
    return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
  }

  // Get pre-configured payment details for this method
  const { data: setting } = await supabaseAdmin
    .from("payment_method_settings")
    .select("*")
    .eq("method", payReq.method)
    .single();

  if (!setting || !setting.is_active) {
    return NextResponse.json(
      { error: `Payment method ${payReq.method} is not configured or inactive. Please update settings first.` },
      { status: 400 }
    );
  }

  // Update request status
  const { error: updateError } = await supabaseAdmin
    .from("payment_requests")
    .update({
      status: "details_sent",
      details_sent_at: new Date().toISOString(),
      details_sent_by: auth.user.id,
    })
    .eq("id", paymentRequestId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update payment request status." }, { status: 500 });
  }

  // Email the seeker with payment details
  const seeker = (payReq as { job_seekers: { full_name: string; email: string } | null }).job_seekers;
  if (seeker?.email) {
    await sendAndLogEmail({
      to: seeker.email,
      subject: `Payment Details — ${setting.display_name}`,
      html: `
        <p>Hello ${seeker.full_name ?? ""},</p>
        <p>Here are the payment details you requested via <strong>${setting.display_name}</strong>:</p>
        <pre style="background:#f3f4f6;padding:16px;border-radius:6px;font-family:monospace;white-space:pre-wrap;">${setting.details}</pre>
        <p>After making your payment, please upload a screenshot in your portal to confirm the transaction.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing">Upload Screenshot →</a></p>
        <p>If you have any questions, please contact your Account Manager.</p>
      `,
      job_seeker_id: payReq.job_seeker_id,
      template_key: "billing-details-sent",
    });
  }

  return NextResponse.json({ ok: true, detailsSent: true });
}
