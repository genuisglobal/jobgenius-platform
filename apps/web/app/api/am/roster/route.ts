import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  MONDAY_TO_FRIDAY,
  coerceWorkDays,
  isExemptionReason,
  type Exemption,
  type WorkSchedule,
} from "@/lib/roster";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE.test(value.trim())
    ? value.trim()
    : null;
}

/**
 * GET /api/am/roster
 *
 * Everyone's expected working days and every exemption. Readable by any
 * AM — knowing who is on leave is how a team stops assigning work to
 * someone who is away.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data: managers }, { data: schedules }, { data: exemptions }] =
    await Promise.all([
      supabaseAdmin.from("account_managers").select("id, name, email, role"),
      supabaseAdmin.from("work_schedules").select("account_manager_id, work_days"),
      supabaseAdmin
        .from("attendance_exemptions")
        .select("id, account_manager_id, start_date, end_date, reason, note")
        .order("start_date", { ascending: false })
        .limit(500),
    ]);

  const scheduleByAm = new Map(
    (schedules ?? []).map((s) => [
      s.account_manager_id as string,
      (s.work_days as number[]) ?? [],
    ])
  );

  const people = (managers ?? []).map((m) => {
    const name = typeof m.name === "string" ? m.name.trim() : "";
    const email = typeof m.email === "string" ? m.email.trim() : "";
    const days = scheduleByAm.get(m.id as string);
    return {
      id: m.id as string,
      name: name || email || "Unknown AM",
      role: (m.role as string | null) ?? "am",
      work_days: days && days.length > 0 ? days : Array.from(MONDAY_TO_FRIDAY),
      // Distinguishes a deliberate Mon–Fri from the default, so the UI can
      // say which people have actually been rostered.
      is_default: !days || days.length === 0,
    };
  });

  return NextResponse.json({
    can_edit: isPeopleManagerRole(auth.user.role),
    managers: people,
    exemptions: (exemptions ?? []) as unknown as Exemption[],
  });
}

/**
 * PUT /api/am/roster  { account_manager_id, work_days: number[] }
 *
 * Sets someone's expected working days. People managers only — a roster
 * is what absence is measured against, so it cannot be self-served.
 */
export async function PUT(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can change a work schedule." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accountManagerId =
    typeof body.account_manager_id === "string" ? body.account_manager_id : null;
  if (!accountManagerId) {
    return NextResponse.json(
      { error: "account_manager_id is required." },
      { status: 400 }
    );
  }

  const workDays = coerceWorkDays(body.work_days);
  if (!workDays) {
    return NextResponse.json(
      { error: "Pick at least one working day." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("work_schedules").upsert(
    {
      account_manager_id: accountManagerId,
      work_days: workDays,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_manager_id" }
  );

  if (error) {
    console.error("[roster:put]", error);
    return NextResponse.json(
      { error: "Failed to save the work schedule." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    schedule: {
      account_manager_id: accountManagerId,
      work_days: workDays,
    } satisfies WorkSchedule,
  });
}

/**
 * POST /api/am/roster  { account_manager_id?, start_date, end_date, reason, note? }
 *
 * Records an exemption. A null account_manager_id makes it company-wide,
 * which is how public holidays are entered without touching every roster.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can record an exemption." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const start = isoDate(body.start_date);
  const end = isoDate(body.end_date) ?? start;
  if (!start || !end) {
    return NextResponse.json(
      { error: "start_date is required (YYYY-MM-DD)." },
      { status: 400 }
    );
  }
  if (end < start) {
    return NextResponse.json(
      { error: "The end date cannot be before the start date." },
      { status: 400 }
    );
  }
  if (!isExemptionReason(body.reason)) {
    return NextResponse.json(
      { error: "reason must be leave, holiday, sick, training or other." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("attendance_exemptions")
    .insert({
      account_manager_id:
        typeof body.account_manager_id === "string" ? body.account_manager_id : null,
      start_date: start,
      end_date: end,
      reason: body.reason,
      note:
        typeof body.note === "string" && body.note.trim() !== ""
          ? body.note.trim()
          : null,
      created_by: auth.user.id,
    })
    .select("id, account_manager_id, start_date, end_date, reason, note")
    .single();

  if (error) {
    console.error("[roster:post]", error);
    return NextResponse.json(
      { error: "Failed to record the exemption." },
      { status: 500 }
    );
  }

  return NextResponse.json({ exemption: data });
}

/** DELETE /api/am/roster?id=<uuid> — removes an exemption. */
export async function DELETE(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can remove an exemption." },
      { status: 403 }
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("attendance_exemptions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[roster:delete]", error);
    return NextResponse.json(
      { error: "Failed to remove the exemption." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
