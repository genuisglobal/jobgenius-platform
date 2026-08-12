import { loadHostAnalytics } from "@/lib/ops-host-analytics";
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
  const hours = Number(url.searchParams.get("hours") ?? "168");
  const limit = Number(url.searchParams.get("limit") ?? "12");

  try {
    const rows = await loadHostAnalytics(hours, limit);
    return Response.json({
      success: true,
      hours: Math.max(hours, 1),
      limit: Math.max(limit, 1),
      data: rows,
    });
  } catch {
    return Response.json(
      { success: false, error: "Failed to load host analytics." },
      { status: 500 }
    );
  }
}
