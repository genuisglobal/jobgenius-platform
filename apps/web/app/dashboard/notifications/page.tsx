import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import NotificationsClient, { type NotificationRow } from "./NotificationsClient";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am") redirect("/portal");

  const { data } = await supabaseAdmin
    .from("notifications")
    .select(
      "id, category, subject, body, link_url, channel, status, sent_at, read_at, created_at"
    )
    .eq("user_id", user.id)
    .eq("user_type", "am")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as NotificationRow[];
  const unreadCount = rows.filter((r) => r.status !== "read").length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread of the last 100.`
              : "You're caught up."}
          </p>
        </div>
      </div>
      <NotificationsClient initialRows={rows} />
    </div>
  );
}
