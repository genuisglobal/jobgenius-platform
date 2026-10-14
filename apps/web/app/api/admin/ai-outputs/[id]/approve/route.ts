import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { approveAiOutput } from "@/lib/ai-outputs";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { notes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // notes are optional
  }
  const notes = typeof body.notes === "string" ? body.notes : undefined;

  const result = await approveAiOutput(params.id, {
    reviewerId: auth.user.id,
    notes,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Output not found or already decided." },
      { status: 404 }
    );
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update", // closest existing action; specific 'ai_output.approve' to be added
    targetType: "ai_output",
    targetId: params.id,
    details: { decision: "approved", notes },
  });

  return NextResponse.json({ ok: true, status: result.status });
}
