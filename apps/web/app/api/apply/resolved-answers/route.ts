import { NextResponse } from "next/server";
import {
  getAccountManagerFromRequest,
  hasJobSeekerAccess,
} from "@/lib/am-access";
import { loadFactDefinitions, resolveFacts } from "@/lib/consultant/fact-ledger";

/**
 * Gate-aware answer resolver for the autonomous-apply runner.
 * Returns only CONFIRMED facts as fillable answers; everything else is reported
 * as `blocked` with an Ask/Escalate action so the runner never guesses.
 *
 * Auth mirrors /api/apply/screening-answers:
 *   - cloud runner: `x-runner` header == OPS_API_KEY
 *   - account manager: bearer/cookie token + assignment/admin access
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobSeekerId = url.searchParams.get("jobSeekerId");
  if (!jobSeekerId) {
    return NextResponse.json({ error: "jobSeekerId is required" }, { status: 400 });
  }

  const runner = request.headers.get("x-runner") ?? "";
  if (runner) {
    if (runner !== process.env.OPS_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canAccess = await hasJobSeekerAccess(amResult.accountManager.id, jobSeekerId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const defs = await loadFactDefinitions();
  const fieldsParam = url.searchParams.get("fields");
  const keys = fieldsParam
    ? fieldsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.from(defs.keys());

  const resolved = await resolveFacts(jobSeekerId, keys);

  const answers: Array<{ fact_key: string; question_text: string; value: string; answer_type: string }> = [];
  const blocked: Array<{ fact_key: string; action: "ask" | "escalate"; reason: string }> = [];

  for (const key of keys) {
    const r = resolved[key];
    if (!r) continue;
    const def = defs.get(key);
    if (r.status === "confirmed") {
      answers.push({
        fact_key: key,
        question_text: def?.label ?? key,
        value: r.value,
        answer_type: def?.value_type ?? "text",
      });
    } else if (r.status === "escalate") {
      blocked.push({ fact_key: key, action: "escalate", reason: r.reason });
    } else {
      blocked.push({ fact_key: key, action: "ask", reason: r.reason });
    }
  }

  return NextResponse.json({ answers, blocked });
}
