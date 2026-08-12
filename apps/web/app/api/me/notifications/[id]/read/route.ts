import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { markRead } from "@/lib/notify";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userType: "am" | "job_seeker" =
    auth.user.userType === "job_seeker" ? "job_seeker" : "am";

  const ok = await markRead(params.id, auth.user.id, userType);
  if (!ok) {
    return NextResponse.json(
      { error: "Notification not found or already read." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
