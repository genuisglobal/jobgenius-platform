import { runDriftDetector } from "@/lib/drift-detector";

/**
 * GET /api/cron/detect-drift
 * Runs the three drift detectors and opens incidents as warranted.
 * Idempotent across overlapping kinds — one OPEN incident per (ats, host, kind).
 *
 * Auth: x-vercel-cron OR Authorization: Bearer CRON_SECRET.
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
  const result = await runDriftDetector();
  return Response.json({ ok: true, ...result });
}
