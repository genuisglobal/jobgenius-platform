import { getRangeBounds, shiftSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { composeDailyDeliveryEmail, summarizeDelivery } from "@/lib/am-weekly-delivery";
import { loadAmDeliveryData } from "@/lib/am-delivery-server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendNotification, NOTIFICATION_CATEGORIES } from "@/lib/notify";

export async function sendDailyAmProgress(today: string = watDate()): Promise<{ date: string; sent: number; skipped: number }> {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return { date: today, sent: 0, skipped: 0 };
  const start = getRangeBounds(today, "week").start;
  const yesterday = shiftSheetDate(today, -1);
  const previousStart = shiftSheetDate(start, -7);
  const previousFriday = shiftSheetDate(start, -3);
  const [delivery, { data: staff, error: staffError }, { data: prior, error: priorError }] = await Promise.all([
    loadAmDeliveryData(start, yesterday, previousStart, previousFriday),
    supabaseServer.from("account_managers").select("id, name, email").eq("role", "am").eq("status", "approved"),
    supabaseServer.from("notifications").select("user_id").eq("category", NOTIFICATION_CATEGORIES.am_daily_progress).eq("payload->>work_date", today),
  ]);
  if (staffError || priorError) throw new Error("Could not load AM daily email recipients.");
  const alreadySent = new Set((prior ?? []).map((row) => row.user_id as string));
  let sent = 0;
  let skipped = 0;
  for (const manager of staff ?? []) {
    const id = manager.id as string;
    if (alreadySent.has(id)) { skipped += 1; continue; }
    const current = summarizeDelivery(id, start, delivery.assignments, delivery.current);
    const previous = summarizeDelivery(id, previousStart, delivery.assignments, delivery.previous);
    const name = (manager.name as string | null)?.trim() || (manager.email as string).split("@")[0];
    const message = composeDailyDeliveryEmail(name, today, current, previous);
    const result = await sendNotification({
      userId: id, userType: "am", category: NOTIFICATION_CATEGORIES.am_daily_progress,
      ...message, linkUrl: "/dashboard/today", channel: "both",
      payload: { work_date: today, week_start: start, applications: current.applications, previous_applications: previous.applications },
    });
    if (result.id) sent += 1;
    else skipped += 1;
  }
  return { date: today, sent, skipped };
}
