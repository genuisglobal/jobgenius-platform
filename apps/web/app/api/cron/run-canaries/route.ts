import {
  getDefaultProbes,
  persistCanaryResult,
  runCanaryProbe,
} from "@/lib/canary";

/**
 * GET /api/cron/run-canaries
 *
 * Vercel-cron entry that runs every configured ATS probe in parallel
 * and persists each result. Used by the drift detector (PR-T) to open
 * incidents on consecutive failures.
 *
 * Auth: x-vercel-cron header OR Authorization: Bearer CRON_SECRET.
 */

function isAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (process.env.NODE_ENV !== "production") {
    const host = new URL(request.url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const probes = getDefaultProbes();
  const results = await Promise.all(
    probes.map(async (probe) => {
      const result = await runCanaryProbe(probe);
      await persistCanaryResult(result);
      return {
        ats: result.atsType,
        outcome: result.outcome,
        duration_ms: result.durationMs,
        http_status: result.httpStatus,
      };
    })
  );

  return Response.json({
    ok: true,
    count: results.length,
    results,
  });
}
