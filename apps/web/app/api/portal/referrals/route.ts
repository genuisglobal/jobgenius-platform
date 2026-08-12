import { NextRequest, NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

// GET /api/portal/referrals
// Returns the seeker's referral code, stats, and referral list (referred person shown as initial only)
export async function GET(req: NextRequest) {
  const auth = await requireJobSeeker(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  // Fetch the seeker's referral code
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("referral_code")
    .eq("id", seekerId)
    .single();

  // Fetch all referrals where this seeker is the referrer
  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select(`
      id,
      referred_id,
      status,
      reward_amount,
      reward_paid_at,
      signed_up_at,
      placed_at
    `)
    .eq("referrer_id", seekerId)
    .order("signed_up_at", { ascending: false });

  // Fetch referred seeker names for initials
  const referredIds = (referrals ?? [])
    .map((r) => r.referred_id)
    .filter(Boolean) as string[];

  let nameMap: Record<string, string> = {};
  if (referredIds.length > 0) {
    const { data: referred } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", referredIds);
    for (const s of referred ?? []) {
      const initial = (s.full_name as string | null)?.trim().charAt(0).toUpperCase() ?? "?";
      nameMap[s.id] = initial;
    }
  }

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    referred_initial: r.referred_id ? (nameMap[r.referred_id] ?? "?") : "?",
    status: r.status,
    reward_amount: r.reward_amount,
    reward_paid_at: r.reward_paid_at,
    signed_up_at: r.signed_up_at,
    placed_at: r.placed_at,
  }));

  // Compute stats
  const total_referred = rows.length;
  const signed_up = rows.filter((r) => r.status === "signed_up").length;
  const placed = rows.filter((r) => r.status === "placed").length;
  const rewarded = rows.filter((r) => r.status === "rewarded").length;
  const total_rewards_earned = rows
    .filter((r) => r.status === "rewarded" && r.reward_amount != null)
    .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0);
  const pending_rewards = rows
    .filter((r) => r.status === "placed" && r.reward_amount != null)
    .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0);

  return NextResponse.json({
    referral_code: seeker?.referral_code ?? null,
    stats: {
      total_referred,
      signed_up,
      placed,
      rewarded,
      total_rewards_earned,
      pending_rewards,
    },
    referrals: rows,
  });
}
