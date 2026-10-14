import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================
// Preset rate limits for ops/background routes.
//
// These routes are token-gated (requireOpsAuth) but uncapped. A misbehaving
// runner loop or a leaked OPS_API_KEY could hammer them. Generous per-identifier
// limits give backpressure without breaking legitimate traffic.
//
// Identifier preference: x-runner-id (so each runner has its own bucket),
// else falls through to the caller's IP (handled by enforceRateLimit).
// ============================================================

function resolveIdentifier(request: Request, explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const runnerId = request.headers.get("x-runner-id");
  if (runnerId && runnerId.trim()) return runnerId.trim();
  return "anonymous";
}

export type EnforceResult =
  | { allowed: true; remaining: number }
  | { allowed: false; response: Response };

function deny(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: "Rate limit exceeded.", retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfter)),
      },
    }
  );
}

/**
 * Ops endpoints (/api/ops/*) — heartbeats, metrics, sweeps, alerts.
 * 600 requests / 60s per identifier (10 rps sustained).
 */
export async function enforceOpsRateLimit(
  request: Request,
  identifier?: string | null
): Promise<EnforceResult> {
  const result = await enforceRateLimit({
    request,
    scope: "ops",
    identifier: resolveIdentifier(request, identifier),
    limit: 600,
    windowSeconds: 60,
  });
  if (result.allowed) {
    return { allowed: true, remaining: result.remaining };
  }
  return { allowed: false, response: deny(result.retryAfterSeconds) };
}

/**
 * Background processor (/api/background/run). Heavy work per call;
 * 60 requests / 60s per identifier (1 rps sustained).
 */
export async function enforceBackgroundRateLimit(
  request: Request,
  identifier?: string | null
): Promise<EnforceResult> {
  const result = await enforceRateLimit({
    request,
    scope: "background",
    identifier: resolveIdentifier(request, identifier),
    limit: 60,
    windowSeconds: 60,
  });
  if (result.allowed) {
    return { allowed: true, remaining: result.remaining };
  }
  return { allowed: false, response: deny(result.retryAfterSeconds) };
}
