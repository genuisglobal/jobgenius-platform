import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { watDate } from "@/lib/attendance";
import { parseDailyCheckin } from "@/lib/am-daily-checkin";
import { normalizeAMRole } from "@/lib/auth/roles";

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (normalizeAMRole(auth.user.role) !== "am") return NextResponse.json({ error: "Account manager access required." }, { status: 403 });
  const date = watDate();
  const { data, error } = await supabaseAdmin.from("am_daily_checkins")
    .select("sheet_status, focus_area, blocker_kind, distraction_level, next_step, updated_at")
    .eq("account_manager_id", auth.user.id).eq("work_date", date).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load today's check-in." }, { status: 500 });
  return NextResponse.json({ date, checkin: data });
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (normalizeAMRole(auth.user.role) !== "am") return NextResponse.json({ error: "Account manager access required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const checkin = parseDailyCheckin(body);
  if (!checkin) return NextResponse.json({ error: "Complete the required choices and keep the next step under 1,000 characters." }, { status: 400 });
  const date = watDate();
  const { data, error } = await supabaseAdmin.from("am_daily_checkins")
    .upsert({ account_manager_id: auth.user.id, work_date: date, ...checkin }, { onConflict: "account_manager_id,work_date" })
    .select("sheet_status, focus_area, blocker_kind, distraction_level, next_step, updated_at").single();
  if (error) return NextResponse.json({ error: "Could not save today's check-in." }, { status: 500 });
  return NextResponse.json({ date, checkin: data });
}
