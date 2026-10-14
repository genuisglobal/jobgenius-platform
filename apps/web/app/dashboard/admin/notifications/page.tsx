import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole, normalizeAMRole } from "@/lib/auth/roles";
import {
  INTERNAL_OPERATIONS_NOTIFICATION_CATEGORIES,
  getNotificationCategoryLabel,
} from "@/lib/notify";

interface PageProps {
  searchParams: {
    category?: string;
    status?: string;
    channel?: string;
    user_type?: string;
    limit?: string;
  };
}

interface NotificationReportRow {
  id: string;
  user_id: string;
  user_type: "am" | "job_seeker";
  category: string;
  subject: string | null;
  body: string | null;
  link_url: string | null;
  channel: "in_app" | "email" | "both";
  status: "pending" | "sent" | "failed" | "read";
  sent_at: string | null;
  read_at: string | null;
  error: string | null;
  created_at: string;
}

function parseLimit(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.max(value, 25), 300);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function applyFilters<T>(query: T, filters: PageProps["searchParams"]) {
  let next = query as any;
  next = next.in("category", [...INTERNAL_OPERATIONS_NOTIFICATION_CATEGORIES]);
  if (filters.category) next = next.eq("category", filters.category);
  if (filters.status) next = next.eq("status", filters.status);
  if (filters.channel) next = next.eq("channel", filters.channel);
  if (filters.user_type) next = next.eq("user_type", filters.user_type);
  return next as T;
}

function roleLabel(role: string | null | undefined): string {
  const normalized = normalizeAMRole(role);
  switch (normalized) {
    case "superadmin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "ops_manager":
      return "Operations Manager";
    case "accountant":
      return "Accountant";
    case "am":
      return "Account Manager";
    default:
      return normalized || "Unknown role";
  }
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const limit = parseLimit(searchParams.limit);
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalRes,
    pendingRes,
    failedRes,
    sentRes,
    lastDayRes,
    rowsRes,
  ] = await Promise.all([
    applyFilters(
      supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }),
      searchParams
    ),
    applyFilters(
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      searchParams
    ),
    applyFilters(
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      searchParams
    ),
    applyFilters(
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent"),
      searchParams
    ),
    applyFilters(
      supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgoIso),
      searchParams
    ),
    applyFilters(
      supabaseAdmin
        .from("notifications")
        .select(
          "id, user_id, user_type, category, subject, body, link_url, channel, status, sent_at, read_at, error, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit),
      searchParams
    ),
  ]);

  const recentRows = (rowsRes.data ?? []) as NotificationReportRow[];

  const amIds = Array.from(
    new Set(
      recentRows
        .filter((row) => row.user_type === "am")
        .map((row) => row.user_id)
    )
  );
  const seekerIds = Array.from(
    new Set(
      recentRows
        .filter((row) => row.user_type === "job_seeker")
        .map((row) => row.user_id)
    )
  );

  const [amRes, seekerRes, categoryBreakdown] = await Promise.all([
    amIds.length > 0
      ? supabaseAdmin
          .from("account_managers")
          .select("id, name, email, role")
          .in("id", amIds)
      : Promise.resolve({ data: [], error: null }),
    seekerIds.length > 0
      ? supabaseAdmin
          .from("job_seekers")
          .select("id, full_name, email")
          .in("id", seekerIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      [...INTERNAL_OPERATIONS_NOTIFICATION_CATEGORIES].map(async (category) => {
        const [countRes, failedCountRes, lastRes] = await Promise.all([
          applyFilters(
            supabaseAdmin
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("category", category),
            { ...searchParams, category }
          ),
          applyFilters(
            supabaseAdmin
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("category", category)
              .eq("status", "failed"),
            { ...searchParams, category }
          ),
          applyFilters(
            supabaseAdmin
              .from("notifications")
              .select("created_at")
              .eq("category", category)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            { ...searchParams, category }
          ),
        ]);

        return {
          category,
          total: countRes.count ?? 0,
          failed: failedCountRes.count ?? 0,
          latestCreatedAt: lastRes.data?.created_at ?? null,
        };
      })
    ),
  ]);

  const amMap = new Map(
    (amRes.data ?? []).map((row) => [
      row.id,
      {
        label: row.name || row.email,
        email: row.email,
        role: roleLabel(row.role),
      },
    ])
  );
  const seekerMap = new Map(
    (seekerRes.data ?? []).map((row) => [
      row.id,
      {
        label: row.full_name || row.email || row.id,
        email: row.email,
        role: "Job Seeker",
      },
    ])
  );

  const filteredBreakdown = categoryBreakdown
    .filter((row) => row.total > 0 || searchParams.category === row.category)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Internal Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Audit view for People Ops and finance reminders queued through the shared notifications table.
          </p>
        </div>
      </div>

      <form className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Category</span>
          <select
            name="category"
            defaultValue={searchParams.category ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All internal categories</option>
            {[...INTERNAL_OPERATIONS_NOTIFICATION_CATEGORIES].map((category) => (
              <option key={category} value={category}>
                {getNotificationCategoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Status</span>
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Channel</span>
          <select
            name="channel"
            defaultValue={searchParams.channel ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All channels</option>
            <option value="in_app">In-app</option>
            <option value="email">Email</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Recipient type</span>
          <select
            name="user_type"
            defaultValue={searchParams.user_type ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All recipients</option>
            <option value="am">Internal staff</option>
            <option value="job_seeker">Job seekers</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
          >
            Filter
          </button>
          <a
            href="/dashboard/admin/notifications"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Reset
          </a>
        </div>
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total", value: totalRes.count ?? 0, tone: "text-gray-900" },
          { label: "Pending", value: pendingRes.count ?? 0, tone: "text-amber-700" },
          { label: "Sent", value: sentRes.count ?? 0, tone: "text-emerald-700" },
          { label: "Failed", value: failedRes.count ?? 0, tone: "text-red-700" },
          { label: "Last 24h", value: lastDayRes.count ?? 0, tone: "text-violet-700" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {item.label}
            </p>
            <p className={`text-3xl font-bold mt-2 ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Category breakdown</h2>
            <p className="text-xs text-gray-500 mt-1">
              Recent HR and finance alert volume by category.
            </p>
          </div>
          {filteredBreakdown.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No internal notifications match these filters.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredBreakdown.map((item) => (
                <div key={item.category} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {getNotificationCategoryLabel(item.category)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        {item.category}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-gray-900">{item.total}</p>
                      {item.failed > 0 && (
                        <p className="text-xs text-red-600">{item.failed} failed</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Latest: {item.latestCreatedAt ? `${fmtDateTime(item.latestCreatedAt)} (${timeAgo(item.latestCreatedAt)})` : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Recent deliveries</h2>
              <p className="text-xs text-gray-500 mt-1">
                Showing the last {recentRows.length} matching notifications.
              </p>
            </div>
          </div>

          {recentRows.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No notification rows match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">When</th>
                    <th className="px-3 py-2 text-left font-semibold">Recipient</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Channel</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Subject</th>
                    <th className="px-3 py-2 text-left font-semibold">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentRows.map((row) => {
                    const recipient =
                      row.user_type === "am"
                        ? amMap.get(row.user_id)
                        : seekerMap.get(row.user_id);

                    return (
                      <tr key={row.id} className="hover:bg-gray-50 align-top">
                        <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <div className="font-medium">
                            {recipient?.label ?? row.user_id}
                          </div>
                          <div className="text-xs text-gray-500">
                            {recipient?.role ?? row.user_type}
                            {recipient?.email ? ` · ${recipient.email}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <div>{getNotificationCategoryLabel(row.category)}</div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {row.category}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-600 uppercase text-xs">
                          {row.channel}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              row.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : row.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : row.status === "read"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          <div className="font-medium">{row.subject || "—"}</div>
                          {row.body && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {row.body}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">
                          <div>Sent: {fmtDateTime(row.sent_at)}</div>
                          <div>Read: {fmtDateTime(row.read_at)}</div>
                          {row.error && (
                            <div className="mt-1 text-red-600">Error: {row.error}</div>
                          )}
                          {row.link_url && (
                            <a
                              href={row.link_url}
                              className="mt-1 inline-block text-violet-600 hover:text-violet-700"
                            >
                              Open target →
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
