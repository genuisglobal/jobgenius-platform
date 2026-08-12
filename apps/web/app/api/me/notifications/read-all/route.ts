import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markAllRead } from "@/lib/notify";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userType: "am" | "job_seeker" =
    auth.user.userType === "job_seeker" ? "job_seeker" : "am";

  const count = await markAllRead(auth.user.id, userType);
  return NextResponse.json({ ok: true, count });
}
