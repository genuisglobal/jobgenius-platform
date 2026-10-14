import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const installmentId = formData.get("installmentId") as string | null;
  const offerId = formData.get("offerId") as string | null;
  const paymentRequestId = formData.get("paymentRequestId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, GIF, and PDF files are allowed." },
      { status: 400 }
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 10MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${auth.user.id}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("payment-screenshots")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Failed to upload screenshot." }, { status: 500 });
  }

  // Get signed URL (bucket is private)
  const { data: signedUrlData } = await supabaseAdmin.storage
    .from("payment-screenshots")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

  const fileUrl = signedUrlData?.signedUrl ?? storagePath;

  const { data: screenshot, error: dbError } = await supabaseAdmin
    .from("payment_screenshots")
    .insert({
      job_seeker_id: auth.user.id,
      payment_request_id: paymentRequestId ?? null,
      installment_id: installmentId ?? null,
      offer_id: offerId ?? null,
      file_url: fileUrl,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (dbError || !screenshot) {
    return NextResponse.json({ error: "Failed to save screenshot record." }, { status: 500 });
  }

  // Update payment request status if provided
  if (paymentRequestId) {
    const { error: reqUpdateError } = await supabaseAdmin
      .from("payment_requests")
      .update({ status: "screenshot_uploaded" })
      .eq("id", paymentRequestId);

    if (reqUpdateError) {
      console.error("[portal:billing] failed to update payment_requests status:", reqUpdateError);
    }
  }

  return NextResponse.json({ ok: true, screenshot }, { status: 201 });
}
