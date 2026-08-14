import { NextResponse } from "next/server";
import {
  getOrCreateAtsAccount,
  markAtsAccountFailed,
} from "@/lib/apply/ats-accounts";
import {
  getAccountManagerFromRequest,
  hasJobSeekerAccess,
  isRunnerAccountManager,
} from "@/lib/am-access";

// POST /api/apply/ats-account
//   { job_seeker_id, host, ats_type? }            → get-or-create credentials
//   { job_seeker_id, host, mark_failed: true }    → runner reports bad login
//
// Returns the PLAINTEXT password to the caller (the runner needs it to sign
// in), so auth is strict: a valid runner service account, or an AM with
// access to the seeker. The ops key alternative mirrors other runner routes.
export async function POST(request: Request) {
  let payload: {
    job_seeker_id?: string;
    host?: string;
    ats_type?: string;
    mark_failed?: boolean;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = payload.job_seeker_id ?? "";
  const host = payload.host ?? "";
  if (!jobSeekerId || !host) {
    return NextResponse.json(
      { error: "job_seeker_id and host are required." },
      { status: 400 }
    );
  }

  // Auth: ops key (cloud runner alternative) or AM bearer with seeker access.
  const opsKey = request.headers.get("x-ops-key") ?? "";
  const opsAuthorized = Boolean(
    process.env.OPS_API_KEY && opsKey === process.env.OPS_API_KEY
  );

  if (!opsAuthorized) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isRunner = await isRunnerAccountManager(amResult.accountManager.id);
    if (!isRunner) {
      const canAccess = await hasJobSeekerAccess(
        amResult.accountManager.id,
        jobSeekerId
      );
      if (!canAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  if (payload.mark_failed) {
    const ok = await markAtsAccountFailed(jobSeekerId, host);
    return NextResponse.json({ success: ok });
  }

  const result = await getOrCreateAtsAccount(
    jobSeekerId,
    host,
    payload.ats_type ?? "WORKDAY"
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    account: {
      email: result.account.account_email,
      password: result.account.password,
      status: result.account.status,
      host: result.account.host,
      created: result.account.created,
    },
  });
}
