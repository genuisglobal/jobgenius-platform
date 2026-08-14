import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  openBreak,
  validateAdjustedSignOut,
  type AttendanceDay,
} from "@/lib/attendance";

const DAY_COLUMNS =
  "id, account_manager_id, work_date, signed_in_at, signed_out_at, adjusted_by, adjusted_at, adjustment_note, long_shift_alerted_at";

async function loadDayById(id: string): Promise<AttendanceDay | null> {
  const { data: day } = await supabaseAdmin
    .from("attendance_days")
    .select(DAY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!day) return null;

  const { data: breaks } = await supabaseAdmin
    .from("attendance_breaks")
    .select("id, started_at, ended_at")
    .eq("attendance_day_id", day.id as string)
    .order("started_at", { ascending: true });

  return {
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    adjusted_by: (day.adjusted_by as string | null) ?? null,
    adjusted_at: (day.adjusted_at as string | null) ?? null,
    adjustment_note: (day.adjustment_note as string | null) ?? null,
    long_shift_alerted_at: (day.long_shift_alerted_at as string | null) ?? null,
    breaks: (breaks ?? []).map((entry) => ({
      id: entry.id as string,
      started_at: entry.started_at as string,
      ended_at: (entry.ended_at as string | null) ?? null,
    })),
  };
}

/**
 * PATCH /api/am/attendance/day/[id]  { signed_out_at, note? }
 *
 * Closes a shift somebody never signed out of, at the time they actually
 * left. People managers only — this is the one write in the attendance
 * system that sets a time the clock did not observe, so it is restricted,
 * validated, and recorded with who did it and why.
 *
 * Deliberately not automatic. A cron closing shifts at a fixed hour would
 * invent an end time for every power cut, and be wrong every time; only a
 * person knows when someone actually went home.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can correct a sign-out time." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const day = await loadDayById(params.id);
  if (!day) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }

  if (day.signed_out_at) {
    return NextResponse.json(
      { error: "That shift is already signed out." },
      { status: 409 }
    );
  }

  const now = new Date();
  const check = validateAdjustedSignOut(day, body.signed_out_at, now);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const note =
    typeof body.note === "string" && body.note.trim() !== ""
      ? body.note.trim()
      : null;

  // Close a break they never ended at the same instant, exactly as a
  // normal sign-out does — otherwise the break runs to `now` forever and
  // eats the hours the correction just established.
  const running = openBreak(day);
  if (running) {
    const { error } = await supabaseAdmin
      .from("attendance_breaks")
      .update({ ended_at: check.iso })
      .eq("id", running.id);
    if (error) {
      console.error("[attendance:adjust] break close failed", error);
      return NextResponse.json(
        { error: "Failed to close the open break." },
        { status: 500 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("attendance_days")
    .update({
      signed_out_at: check.iso,
      adjusted_by: auth.user.id,
      adjusted_at: now.toISOString(),
      adjustment_note: note,
    })
    .eq("id", day.id)
    // Someone else may have corrected it between the load and the write.
    .is("signed_out_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[attendance:adjust]", error);
    return NextResponse.json(
      { error: "Failed to correct the sign-out time." },
      { status: 500 }
    );
  }

  return NextResponse.json({ day: await loadDayById(day.id) });
}
