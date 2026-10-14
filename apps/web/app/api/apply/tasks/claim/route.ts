import { getAccountManagerFromRequest, isRunnerAccountManager } from "@/lib/am-access";
import { claimNextRun } from "@/lib/apply/claim-task";

/**
 * POST /api/apply/tasks/claim
 * Modern claim endpoint used by apps/runner/worker.js (see worker.js:218-230
 * and normalizeClaimedRun at worker.js:150-173 for the expected payload shape).
 *
 * Body: { runner_id?: string }
 * Auth: Bearer RUNNER_AUTH_TOKEN (resolved via getAccountManagerFromRequest).
 *
 * Returns the same payload shape as the legacy GET /api/apply/next-global so
 * the runner's normalizer handles both paths identically.
 */
export async function POST(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  let runnerId: string | null = null;
  try {
    const body = (await request.json()) as { runner_id?: unknown };
    if (typeof body?.runner_id === "string") {
      runnerId = body.runner_id.trim() || null;
    }
  } catch {
    // Body is optional; runner_id is informational only.
  }

  const isRunner = await isRunnerAccountManager(amResult.accountManager.id);

  const result = await claimNextRun({
    request,
    accountManagerId: amResult.accountManager.id,
    accountManagerEmail: amResult.accountManager.email,
    isRunner,
    runnerId,
  });

  switch (result.kind) {
    case "idle":
      return Response.json({ success: true, status: "IDLE" });
    case "blocked":
      return Response.json({
        success: false,
        blocked: true,
        reason: result.reason,
        ...(result.limit !== undefined ? { limit: result.limit } : {}),
      });
    case "error":
      return Response.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    case "claimed":
      return Response.json(result.payload);
  }
}
