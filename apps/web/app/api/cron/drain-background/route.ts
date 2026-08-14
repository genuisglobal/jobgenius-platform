import { supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/cron/drain-background
 *
 * Vercel-cron entry point that drains the background_jobs queue by invoking
 * /api/background/run in a bounded loop. Without this, background_jobs accrues
 * forever — Phase 0 audit flagged this gap.
 *
 * Auth: Vercel sets x-vercel-cron:1 on its cron pings. Other callers must
 * present Authorization: Bearer <CRON_SECRET>. Localhost is allowed in dev.
 */

const MAX_BATCHES = 5;          // up to 5 invocations per tick
const BATCH_LIMIT = 5;          // jobs per invocation
const PER_INVOKE_TIMEOUT_MS = 25_000;

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

function resolveBaseUrl(request: Request): string {
  const explicit = process.env.WEB_BASE_URL || process.env.VERCEL_URL;
  if (explicit) {
    return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function callBackgroundRun(baseUrl: string, opsKey: string): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_INVOKE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/background/run?limit=${BATCH_LIMIT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ops-key": opsKey,
        "x-runner-id": "cron-drain",
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const opsKey = process.env.OPS_API_KEY;
  if (!opsKey) {
    return Response.json(
      { error: "OPS_API_KEY not configured; cron poller cannot reach /api/background/run." },
      { status: 500 }
    );
  }

  // Quick check: is there anything to drain? Skip the loop on idle ticks.
  const { count } = await supabaseAdmin
    .from("background_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "QUEUED")
    .lte("run_at", new Date().toISOString());

  if (!count) {
    return Response.json({ ok: true, drained: 0, idle: true });
  }

  const baseUrl = resolveBaseUrl(request);
  const startedAt = Date.now();
  let totalProcessed = 0;
  const batches: Array<{ status: number; processed?: number }> = [];

  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const result = await callBackgroundRun(baseUrl, opsKey);
    const processed =
      result.body && typeof result.body === "object" && "processed" in result.body
        ? Number((result.body as { processed?: unknown }).processed) || 0
        : 0;

    batches.push({ status: result.status, processed });
    totalProcessed += processed;

    if (!result.ok || processed === 0) break;

    // Guard against runaway loops on slow ticks.
    if (Date.now() - startedAt > 50_000) break;
  }

  return Response.json({
    ok: true,
    drained: totalProcessed,
    batches: batches.length,
    elapsed_ms: Date.now() - startedAt,
    initial_queued: count,
  });
}
