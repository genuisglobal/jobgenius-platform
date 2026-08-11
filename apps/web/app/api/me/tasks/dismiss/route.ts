import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/me/tasks/dismiss
 * Records a snooze or resolve on an AM Task Inbox row.
 * Body: { task_key: string, action: 'snooze'|'resolve', snooze_hours?: number, notes?: string }
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    task_key?: unknown;
    action?: unknown;
    snooze_hours?: unknown;
    notes?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const taskKey = typeof body.task_key === "string" ? body.task_key.trim() : "";
  if (!taskKey) {
    return NextResponse.json({ error: "task_key is required." }, { status: 400 });
  }
  if (body.action !== "snooze" && body.action !== "resolve") {
    return NextResponse.json({ error: "action must be 'snooze' or 'resolve'." }, { status: 400 });
  }

  let snoozeUntil: string | null = null;
  if (body.action === "snooze") {
    const hours = Number(body.snooze_hours);
    const valid = Number.isFinite(hours) && hours > 0 ? hours : 24;
    snoozeUntil = new Date(Date.now() + valid * 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("am_task_dismissals")
    .upsert(
      {
        am_id: auth.user.id,
        task_key: taskKey,
        action: body.action,
        snooze_until: snoozeUntil,
        notes: typeof body.notes === "string" ? body.notes : null,
      },
      { onConflict: "am_id,task_key,action" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to dismiss task." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dismissal: data });
}
