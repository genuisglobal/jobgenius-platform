import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { computeWorkStyleDistribution } from "@/lib/market/work-style-distribution";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: jobs } = await supabaseAdmin
    .from("job_posts")
    .select("location, description_text")
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(2000);

  const distribution = computeWorkStyleDistribution(jobs ?? []);

  return Response.json({ stats: distribution });
}
