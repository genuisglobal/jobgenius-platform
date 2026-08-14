import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import AdminReferralsClient from "./AdminReferralsClient";

export const metadata = { title: "Referrals | Admin | JobGenius" };

export default async function AdminReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = normalizeAMRole(user.role);
  if (role !== "admin" && role !== "superadmin") redirect("/dashboard/admin");

  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_id, referred_id, status, reward_amount, reward_paid_at, reward_notes, signed_up_at, placed_at, created_at")
    .order("created_at", { ascending: false });

  // Collect all seeker IDs for name lookup
  const allIds = new Set<string>();
  for (const r of referrals ?? []) {
    if (r.referrer_id) allIds.add(r.referrer_id);
    if (r.referred_id) allIds.add(r.referred_id);
  }

  let nameMap: Record<string, string> = {};
  if (allIds.size > 0) {
    const { data: seekers } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", Array.from(allIds));
    for (const s of seekers ?? []) {
      nameMap[s.id] = (s.full_name as string | null) ?? "Unknown";
    }
  }

  const rows = (referrals ?? []).map((r) => ({
    id: r.id as string,
    referrer_id: r.referrer_id as string,
    referrer_name: nameMap[r.referrer_id] ?? "Unknown",
    referred_id: r.referred_id as string | null,
    referred_name: r.referred_id ? (nameMap[r.referred_id] ?? "Unknown") : null,
    status: r.status as "signed_up" | "placed" | "rewarded",
    reward_amount: r.reward_amount as number | null,
    reward_paid_at: r.reward_paid_at as string | null,
    reward_notes: r.reward_notes as string | null,
    signed_up_at: r.signed_up_at as string,
    placed_at: r.placed_at as string | null,
    created_at: r.created_at as string,
  }));

  const stats = {
    total: rows.length,
    signed_up: rows.filter((r) => r.status === "signed_up").length,
    placed: rows.filter((r) => r.status === "placed").length,
    rewarded: rows.filter((r) => r.status === "rewarded").length,
    total_paid: rows.filter((r) => r.status === "rewarded").reduce((sum, r) => sum + (r.reward_amount ?? 0), 0),
    pending_payout: rows.filter((r) => r.status === "placed").reduce((sum, r) => sum + (r.reward_amount ?? 0), 0),
  };

  return <AdminReferralsClient stats={stats} referrals={rows} />;
}
