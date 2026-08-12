import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";

  // Get counts
  const { count: activeAmCount } = await supabaseAdmin
    .from("account_managers")
    .select("id", { count: "exact", head: true })
    .not("auth_id", "is", null);

  const { count: adminCount } = await supabaseAdmin
    .from("account_managers")
    .select("id", { count: "exact", head: true })
    .not("auth_id", "is", null)
    .in("role", ["admin", "superadmin"]);

  const { count: seekerCount } = await supabaseAdmin
    .from("job_seekers")
    .select("id", { count: "exact", head: true });

  const { count: activeSeekerCount } = await supabaseAdmin
    .from("job_seekers")
    .select("id", { count: "exact", head: true })
    .not("auth_id", "is", null);

  const { count: assignedCount } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id", { count: "exact", head: true });

  const { count: discoveryPolicyCount } = await supabaseAdmin
    .from("discovery_search_policies")
    .select("id", { count: "exact", head: true });

  const { count: activeGeneratedSearchCount } = await supabaseAdmin
    .from("job_discovery_searches")
    .select("id", { count: "exact", head: true })
    .not("policy_id", "is", null)
    .is("job_seeker_id", null)
    .eq("enabled", true);

  const { count: hiringRequestCount } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(closed,rejected)");

  const { count: leadQueueCount } = await supabaseAdmin
    .from("lead_intake_submissions")
    .select("id", { count: "exact", head: true })
    .in("status", ["new", "qualified", "nurture"]);

  // Get unassigned seekers count properly
  const { data: allSeekerIds } = await supabaseAdmin
    .from("job_seekers")
    .select("id");
  const { data: assignedSeekerIds } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id");

  const assignedSet = new Set((assignedSeekerIds || []).map((a) => a.job_seeker_id));
  const unassigned = (allSeekerIds || []).filter((s) => !assignedSet.has(s.id)).length;

  // Get recent AMs
  const { data: recentAMs } = await supabaseAdmin
    .from("account_managers")
    .select("id, name, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // Get recent job seekers
  const { data: recentSeekers } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
          <p className="text-gray-600">
            {isSuperAdmin ? "Super Admin" : "Admin"} Dashboard
          </p>
        </div>
        {isSuperAdmin && (
          <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">
            Super Admin
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <Link
          href="/dashboard/admin/accounts"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">User Accounts</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">
            {(activeAmCount ?? 0) + (activeSeekerCount ?? 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {activeAmCount ?? 0} AMs | {adminCount ?? 0} admins
          </div>
        </Link>

        <Link
          href="/dashboard/admin/job-seekers"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Job Seekers</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{seekerCount ?? 0}</div>
        </Link>

        <Link
          href="/dashboard/admin/assignments"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Assigned</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{assignedCount ?? 0}</div>
        </Link>

        <Link
          href="/dashboard/admin/assignments"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Unassigned</div>
          <div className="mt-1 text-3xl font-bold text-orange-600">{unassigned}</div>
        </Link>

        <Link
          href="/dashboard/admin/discovery"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Discovery Rules</div>
          <div className="mt-1 text-3xl font-bold text-indigo-600">{discoveryPolicyCount ?? 0}</div>
          <div className="text-xs text-gray-400 mt-1">{activeGeneratedSearchCount ?? 0} active searches</div>
        </Link>

        <Link
          href="/dashboard/admin/leads"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Lead Queue</div>
          <div className="mt-1 text-3xl font-bold text-fuchsia-600">{leadQueueCount ?? 0}</div>
          <div className="text-xs text-gray-400 mt-1">Website and imported leads</div>
        </Link>

        <Link
          href="/dashboard/admin/hiring-partners"
          className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
        >
          <div className="text-sm font-medium text-gray-500">Hiring Requests</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{hiringRequestCount ?? 0}</div>
          <div className="text-xs text-gray-400 mt-1">Recruiter and agency demand</div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/admin/leads"
            className="px-4 py-2 bg-fuchsia-600 text-white text-sm font-medium rounded-lg hover:bg-fuchsia-700 transition-colors"
          >
            Review Lead Queue
          </Link>
          <Link
            href="/dashboard/admin/hiring-partners"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Review Hiring Requests
          </Link>
          <Link
            href="/dashboard/admin/intake"
            className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Review Intake Queue
          </Link>
          <Link
            href="/dashboard/admin/capacity"
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Adjust AM Capacity
          </Link>
          <Link
            href="/dashboard/admin/accounts?action=create"
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Create Account Manager
          </Link>
          <Link
            href="/dashboard/admin/accounts"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Manage User Accounts
          </Link>
          <Link
            href="/dashboard/admin/assignments"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Manage Assignments
          </Link>
          <Link
            href="/dashboard/admin/job-seekers"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            View All Job Seekers
          </Link>
          <Link
            href="/dashboard/admin/discovery"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Manage Discovery Rules
          </Link>
          <Link
            href="/dashboard/admin/reports"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Report Prompt Settings
          </Link>
          <Link
            href="/dashboard/admin/voice"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Voice Automation
          </Link>
          <Link
            href="/dashboard/admin/job-agent"
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Job Agent
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Account Managers */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Account Managers</h2>
            <Link href="/dashboard/admin/accounts" className="text-sm text-violet-600 hover:text-violet-800">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {(!recentAMs || recentAMs.length === 0) ? (
              <p className="px-5 py-4 text-sm text-gray-500">No account managers</p>
            ) : (
              recentAMs.map((am) => (
                <div key={am.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{am.name || "Unnamed"}</p>
                    <p className="text-sm text-gray-500">{am.email}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      am.role === "superadmin"
                        ? "bg-purple-100 text-purple-800"
                        : am.role === "admin"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {am.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Job Seekers */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Job Seekers</h2>
            <Link href="/dashboard/admin/job-seekers" className="text-sm text-violet-600 hover:text-violet-800">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {(!recentSeekers || recentSeekers.length === 0) ? (
              <p className="px-5 py-4 text-sm text-gray-500">No job seekers</p>
            ) : (
              recentSeekers.map((seeker) => (
                <div key={seeker.id} className="px-5 py-3">
                  <p className="font-medium text-gray-900">{seeker.full_name || "Unnamed"}</p>
                  <p className="text-sm text-gray-500">{seeker.email}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
