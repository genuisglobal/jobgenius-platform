import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import BillingAdminClient from "./BillingAdminClient";

// This page reads cookies via getCurrentUser, so it must never be statically
// rendered or cached.
export const dynamic = "force-dynamic";

/**
 * Run a Supabase query and never throw. A PostgREST error becomes an empty
 * result + a server log; a rejected fetch (network / cold-start / timeout on
 * the serverless runtime) is caught instead of taking the whole page down with
 * an uncaught 500. The `label` makes the failing query identifiable in logs.
 */
async function safeRows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[billing] query "${label}" returned an error`, error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error(
      `[billing] query "${label}" threw`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

export default async function AdminBillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const [
    paymentRequests,
    screenshots,
    contracts,
    offers,
    escalations,
    flexRequests,
  ] = await Promise.all([
    safeRows(
      "payment_requests",
      supabaseAdmin
        .from("payment_requests")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeRows(
      "payment_screenshots",
      supabaseAdmin
        .from("payment_screenshots")
        .select("*, job_seekers(id, full_name, email)")
        .order("uploaded_at", { ascending: false })
        .limit(200)
    ),
    safeRows(
      "job_seeker_contracts",
      supabaseAdmin
        .from("job_seeker_contracts")
        .select(
          "*, job_seekers!job_seeker_contracts_job_seeker_id_fkey(id, full_name, email, plan_type)"
        )
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeRows(
      "job_offers",
      supabaseAdmin
        .from("job_offers")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeRows(
      "termination_escalations",
      supabaseAdmin
        .from("termination_escalations")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeRows(
      "registration_flex_requests",
      supabaseAdmin
        .from("registration_flex_requests")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200)
    ),
  ]);

  return (
    <BillingAdminClient
      paymentRequests={paymentRequests}
      screenshots={screenshots}
      contracts={contracts}
      offers={offers}
      escalations={escalations}
      flexRequests={flexRequests}
    />
  );
}
