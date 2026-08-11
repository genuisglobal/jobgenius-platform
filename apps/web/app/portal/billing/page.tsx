import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { getIntakeStateByJobSeekerId } from "@/lib/intake";
import BillingClient from "./BillingClient";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "job_seeker") redirect("/dashboard");

  const seekerId = user.id;

  const [
    seekerRes,
    contractRes,
    regPaymentRes,
    installmentsRes,
    offersRes,
    requestsRes,
    flexRequestRes,
    intakeState,
  ] =
    await Promise.all([
      supabaseAdmin
        .from("job_seekers")
        .select("full_name")
        .eq("id", seekerId)
        .maybeSingle(),
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("registration_payments")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("payment_installments")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("installment_number", { ascending: true }),
      supabaseAdmin
        .from("job_offers")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("payment_requests")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("registration_flex_requests")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    getIntakeStateByJobSeekerId(seekerId),
  ]);

  const billingAllowed = Boolean(
    intakeState &&
      [
        "approved_payment_pending",
        "approved_preview",
        "preview_active",
        "preview_expired",
        "active_client",
      ].includes(intakeState.status)
  );

  if (!billingAllowed && !contractRes.data) {
    redirect("/portal");
  }

  return (
    <BillingClient
      contract={contractRes.data}
      registrationPayment={regPaymentRes.data}
      installments={installmentsRes.data ?? []}
      offers={offersRes.data ?? []}
      paymentRequests={requestsRes.data ?? []}
      flexRequest={flexRequestRes.data ?? null}
      intakeState={intakeState}
      seekerId={seekerId}
      seekerName={seekerRes.data?.full_name ?? null}
      userEmail={user.email}
    />
  );
}
