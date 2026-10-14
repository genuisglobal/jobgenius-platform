import { NextResponse } from "next/server";
import { requireAuth, supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/me/notifications
 * Returns the current user's notifications (limited to 50, newest first).
 * Includes an `unread_count` for the bell badge.
 *
 * Query: ?status=unread to filter to unread only.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userType: "am" | "job_seeker" =
    auth.user.userType === "job_seeker" ? "job_seeker" : "am";

  const { searchParams } = new URL(request.url);
  const onlyUnread = searchParams.get("status") === "unread";

  let query = supabaseAdmin
    .from("notifications")
    .select(
      "id, category, subject, body, link_url, channel, status, sent_at, read_at, created_at, payload"
    )
    .eq("user_id", auth.user.id)
    .eq("user_type", userType)
    .order("created_at", { ascending: false })
    .limit(50);

  if (onlyUnread) {
    query = query.not("status", "eq", "read");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: unreadCount } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .eq("user_type", userType)
    .not("status", "eq", "read");

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: unreadCount ?? 0,
  });
}
