import { NextResponse } from "next/server";
import { watDate } from "@/lib/attendance";
import { normalizeAMRole } from "@/lib/auth/roles";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseAdmin } from "@/lib/auth";
import { sendNotification, NOTIFICATION_CATEGORIES } from "@/lib/notify";

/** One late-afternoon reminder for AMs who clocked in but have not checked in. */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;
  if (!process.env.OPS_API_KEY || request.headers.get("x-ops-key") !== process.env.OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const date = watDate();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return NextResponse.json({ date, reminded: 0 });

  const [{ data: shifts, error: shiftsError }, { data: checkins, error: checkinsError }, { data: staff, error: staffError }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabaseAdmin.from("attendance_days").select("account_manager_id").eq("work_date", date),
    supabaseAdmin.from("am_daily_checkins").select("account_manager_id").eq("work_date", date),
    supabaseAdmin.from("account_managers").select("id, role"),
    supabaseAdmin.from("notifications").select("user_id").eq("category", NOTIFICATION_CATEGORIES.am_daily_checkin_reminder).eq("payload->>work_date", date),
  ]);
  if (shiftsError || checkinsError || staffError || notificationsError) {
    return NextResponse.json({ error: "Could not load daily check-in reminder data." }, { status: 500 });
  }

  const checked = new Set((checkins ?? []).map((row) => row.account_manager_id as string));
  const sent = new Set((notifications ?? []).map((row) => row.user_id as string));
  const amIds = new Set((staff ?? []).filter((row) => normalizeAMRole(row.role as string | null) === "am").map((row) => row.id as string));
  let reminded = 0;
  for (const id of Array.from(new Set((shifts ?? []).map((row) => row.account_manager_id as string)))) {
    if (!amIds.has(id) || checked.has(id) || sent.has(id)) continue;
    const result = await sendNotification({
      userId: id, userType: "am", category: NOTIFICATION_CATEGORIES.am_daily_checkin_reminder,
      subject: "Complete today's AM check-in",
      body: "Please update your activity sheet and complete the short daily check-in on Today. Share any blocker or help you need; the phone and social media reflection is optional.",
      linkUrl: "/dashboard/today", channel: "both", payload: { work_date: date },
    });
    if (result.id) reminded += 1;
  }
  return NextResponse.json({ date, reminded });
}
