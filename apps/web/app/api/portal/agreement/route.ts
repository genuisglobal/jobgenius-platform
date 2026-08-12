import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import {
  generateCollaborationAgreementHTML,
  AGREEMENT_VERSION,
  DEFAULT_COMMISSION_RATE,
} from "@/lib/collaboration-agreement";

/**
 * GET  /api/portal/agreement   → current agreement HTML + this seeker's
 *                                 acceptance status for the active version.
 * POST /api/portal/agreement   → record an e-signed acceptance.
 *                                 Body: { signature_name: string, accepted: true }
 */

async function loadSeeker(id: string) {
  const { data } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, email, campaign_tier")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seeker = await loadSeeker(auth.user.id);
  const clientName = seeker?.full_name || seeker?.email || auth.user.email;
  const clientEmail = seeker?.email || auth.user.email;

  const { data: signed } = await supabaseAdmin
    .from("client_agreements")
    .select("id, agreement_version, signature_name, agreed_at, agreement_html")
    .eq("job_seeker_id", auth.user.id)
    .eq("agreement_version", AGREEMENT_VERSION)
    .maybeSingle();

  const html =
    signed?.agreement_html ??
    generateCollaborationAgreementHTML({
      clientName,
      clientEmail,
      commissionRatePercent: DEFAULT_COMMISSION_RATE * 100,
      campaignTier: seeker?.campaign_tier ?? null,
    });

  return NextResponse.json({
    version: AGREEMENT_VERSION,
    commission_rate: DEFAULT_COMMISSION_RATE,
    signed: Boolean(signed),
    signed_at: signed?.agreed_at ?? null,
    signature_name: signed?.signature_name ?? null,
    client_name: clientName,
    client_email: clientEmail,
    html,
  });
}

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { signature_name?: unknown; accepted?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const signatureName = typeof body.signature_name === "string" ? body.signature_name.trim() : "";
  if (body.accepted !== true) {
    return NextResponse.json(
      { error: "You must accept the agreement to continue." },
      { status: 400 }
    );
  }
  if (signatureName.length < 2) {
    return NextResponse.json(
      { error: "Please type your full name as your signature." },
      { status: 400 }
    );
  }

  const { data: gate } = await supabaseAdmin
    .from("job_seekers")
    .select(
      "full_name, email, collaboration_agreement_requested_at, collaboration_agreement_signed_at, campaign_tier, setup_fee_usd"
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  // The agreement is only signable once an admin/AM has pushed it (or if the
  // client is re-signing a version they previously accepted).
  if (!gate?.collaboration_agreement_requested_at && !gate?.collaboration_agreement_signed_at) {
    return NextResponse.json(
      { error: "Your account manager hasn't shared the agreement for signature yet." },
      { status: 403 }
    );
  }

  const clientName = gate?.full_name || gate?.email || auth.user.email;
  const clientEmail = gate?.email || auth.user.email;

  const agreedAt = new Date().toISOString();
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const userAgent = request.headers.get("user-agent") ?? null;

  const html = generateCollaborationAgreementHTML({
    clientName,
    clientEmail,
    effectiveDate: agreedAt,
    commissionRatePercent: DEFAULT_COMMISSION_RATE * 100,
    signatureName,
    agreedDate: agreedAt,
    campaignTier: gate?.campaign_tier ?? null,
  });

  const { data: agreement, error } = await supabaseAdmin
    .from("client_agreements")
    .upsert(
      {
        job_seeker_id: auth.user.id,
        agreement_version: AGREEMENT_VERSION,
        agreement_html: html,
        signature_name: signatureName,
        client_email: clientEmail,
        commission_rate: DEFAULT_COMMISSION_RATE,
        campaign_tier: gate?.campaign_tier ?? null,
        setup_fee_usd: gate?.setup_fee_usd ?? null,
        effective_date: agreedAt.split("T")[0],
        agreed_at: agreedAt,
        agreed_ip: ip,
        user_agent: userAgent,
      },
      { onConflict: "job_seeker_id,agreement_version" }
    )
    .select("id, agreed_at")
    .single();

  if (error || !agreement) {
    console.error("Agreement acceptance failed:", error);
    return NextResponse.json({ error: "Failed to record your acceptance." }, { status: 500 });
  }

  await supabaseAdmin
    .from("job_seekers")
    .update({ collaboration_agreement_signed_at: agreedAt })
    .eq("id", auth.user.id);

  return NextResponse.json({
    ok: true,
    agreement_id: agreement.id,
    signed_at: agreement.agreed_at,
  });
}
