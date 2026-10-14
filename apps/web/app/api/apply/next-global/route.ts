import { getAccountManagerFromRequest, isRunnerAccountManager } from "@/lib/am-access";
import { claimNextRun } from "@/lib/apply/claim-task";

/**
 * GET /api/apply/next-global
 * Legacy claim endpoint kept for runner backwards compatibility.
 * The modern path is POST /api/apply/tasks/claim; both share lib/apply/claim-task.ts.
 */
export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const isRunner = await isRunnerAccountManager(amResult.accountManager.id);

  const result = await claimNextRun({
    request,
    accountManagerId: amResult.accountManager.id,
    accountManagerEmail: amResult.accountManager.email,
    isRunner,
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
