import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import {
  generateCollaborationAgreementHTML,
  AGREEMENT_VERSION,
  DEFAULT_COMMISSION_RATE,
} from "@/lib/collaboration-agreement";
import AgreementClient from "./AgreementClient";

export default async function AgreementPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, email, collaboration_agreement_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  const clientName = seeker?.full_name || seeker?.email || user.email;
  const clientEmail = seeker?.email || user.email;

  const { data: signed } = await supabaseAdmin
    .from("client_agreements")
    .select("agreement_html, signature_name, agreed_at")
    .eq("job_seeker_id", user.id)
    .eq("agreement_version", AGREEMENT_VERSION)
    .maybeSingle();

  const html =
    signed?.agreement_html ??
    generateCollaborationAgreementHTML({
      clientName,
      clientEmail,
      commissionRatePercent: DEFAULT_COMMISSION_RATE * 100,
    });

  return (
    <AgreementClient
      html={html}
      signed={Boolean(signed)}
      signedAt={signed?.agreed_at ?? null}
      signatureName={signed?.signature_name ?? null}
      requested={Boolean(seeker?.collaboration_agreement_requested_at)}
      clientName={clientName}
    />
  );
}
