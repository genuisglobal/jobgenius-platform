import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { watDate, type AttendanceDay } from "@/lib/attendance";

// GET /api/am/attendance/day?date=YYYY-MM-DD
// The whole team's attendance for one WAT day. Every AM sees every AM —
// the same open model as the Activity Sheet.
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("date");
  const workDate = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : watDate();

  const { data: days, error: daysError } = await supabaseAdmin
    .from("attendance_days")
    .select(
      "id, account_manager_id, work_date, signed_in_at, signed_out_at, adjusted_by, adjusted_at, adjustment_note"
    )
    .eq("work_date", workDate)
    .order("signed_in_at", { ascending: true });

  if (daysError) {
    console.error("[attendance:day] shift lookup failed", daysError);
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 });
  }

  const dayIds = (days ?? []).map((d) => d.id as string);
  const amIds = Array.from(
    new Set([
      ...(days ?? []).map((d) => d.account_manager_id as string),
      // Whoever corrected a sign-out may not have worked that day themselves.
      ...(days ?? [])
        .map((d) => d.adjusted_by as string | null)
        .filter((id): id is string => Boolean(id)),
      auth.user.id,
    ])
  );

  const [{ data: breaks }, { data: managers, error: managersError }] = await Promise.all([
    dayIds.length > 0
      ? supabaseAdmin
          .from("attendance_breaks")
          .select("id, attendance_day_id, started_at, ended_at")
          .in("attendance_day_id", dayIds)
          .order("started_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    // `name`, not full_name — that spelling is job_seekers only.
    supabaseAdmin.from("account_managers").select("id, name, email").in("id", amIds),
  ]);

  // A failed name lookup would render the whole board as "Unknown".
  if (managersError) {
    console.error("[attendance:day] AM name lookup failed", managersError);
  }

  const nameById = new Map(
    (managers ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "Unknown AM"];
    })
  );

  const breaksByDay = new Map<string, AttendanceDay["breaks"]>();
  for (const entry of breaks ?? []) {
    const key = entry.attendance_day_id as string;
    const list = breaksByDay.get(key) ?? [];
    list.push({
      id: entry.id as string,
      started_at: entry.started_at as string,
      ended_at: (entry.ended_at as string | null) ?? null,
    });
    breaksByDay.set(key, list);
  }

  const rows = (days ?? []).map((day) => ({
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    am_name: nameById.get(day.account_manager_id as string) ?? "Unknown AM",
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    adjusted_by: (day.adjusted_by as string | null) ?? null,
    adjusted_at: (day.adjusted_at as string | null) ?? null,
    adjustment_note: (day.adjustment_note as string | null) ?? null,
    // The corrector's name, so the board explains itself without a lookup.
    adjusted_by_name: day.adjusted_by
      ? nameById.get(day.adjusted_by as string) ?? null
      : null,
    breaks: breaksByDay.get(day.id as string) ?? [],
  }));

  return NextResponse.json({
    work_date: workDate,
    server_time: new Date().toISOString(),
    my_account_manager_id: auth.user.id,
    can_adjust: isPeopleManagerRole(auth.user.role),
    rows,
  });
}
