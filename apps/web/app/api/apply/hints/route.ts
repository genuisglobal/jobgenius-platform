import { NextResponse } from "next/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { buildApplyAutomationHints } from "@/lib/apply-learning";

/**
 * GET /api/apply/hints?ats=GREENHOUSE&url=https://boards.greenhouse.io/...
 *
 * Serves per-(ATS, host) automation hints derived from apply_error_signatures
 * and host_automation_rules. The runner fetches this at run-start so hint
 * changes propagate without redeploying the runner.
 *
 * Auth: bearer runner token (same as the rest of /api/apply/*).
 */
export async function GET(request: Request) {
  const auth = await getAccountManagerFromRequest(request.headers);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const atsType = url.searchParams.get("ats");
  const jobUrl = url.searchParams.get("url") ?? url.searchParams.get("job_url");

  if (!atsType && !jobUrl) {
    return NextResponse.json(
      { error: "Either ats or url is required." },
      { status: 400 }
    );
  }

  const hints = await buildApplyAutomationHints({
    atsType,
    jobUrl,
  });

  return NextResponse.json({ hints });
}
