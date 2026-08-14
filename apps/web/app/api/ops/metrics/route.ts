import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

export async function GET(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const hours = Number(url.searchParams.get("hours") ?? "24");
  const since = new Date(Date.now() - Math.max(hours, 1) * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseServer
    .from("v_ops_kpis_hourly")
    .select("*")
    .gte("hour", since)
    .order("hour", { ascending: false });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to load metrics." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, data });
}
