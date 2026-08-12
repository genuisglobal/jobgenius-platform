import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { markStaleExpiredFacts } from "@/lib/consultant/fact-ledger";

async function run(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const marked = await markStaleExpiredFacts();
  return Response.json({ success: true, marked_stale: marked });
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
