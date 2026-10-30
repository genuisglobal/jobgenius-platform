import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { buildClientRosterAudit, type RosterFinding } from "@/lib/client-roster-audit";

export const dynamic = "force-dynamic";

const LABELS: Record<RosterFinding, { label: string; detail: string; color: string }> = {
  inactive_assigned: { label: "Inactive account assigned", detail: "Review whether this assignment should still exist.", color: "bg-red-50 text-red-800" },
  unassigned_client: { label: "Active client unassigned", detail: "Assign an owner before client delivery is expected.", color: "bg-red-50 text-red-800" },
  inactive_owner: { label: "Owner unavailable", detail: "Check the assigned AM account and reassign if needed.", color: "bg-red-50 text-red-800" },
  review_assignment: { label: "Assignment needs review", detail: "The seeker is assigned before active-client or reserved status. Check intake and assignment records.", color: "bg-amber-50 text-amber-900" },
  reserved: { label: "Reserved, payment pending", detail: "An owner is reserved; this seeker is not yet an active client.", color: "bg-blue-50 text-blue-800" },
  active_client: { label: "Active client", detail: "Intake and current assignment agree.", color: "bg-green-50 text-green-800" },
};

export default async function ClientRosterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const [{ data: seekers, error: seekerError }, { data: assignments, error: assignmentError }, { data: states, error: stateError }, { data: managers, error: managerError }] = await Promise.all([
    supabaseAdmin.from("job_seekers").select("id, full_name, email, status"),
    supabaseAdmin.from("job_seeker_assignments").select("job_seeker_id, account_manager_id, created_at"),
    supabaseAdmin.from("job_seeker_intake_states").select("job_seeker_id, status"),
    supabaseAdmin.from("account_managers").select("id, name, email, status"),
  ]);
  if (seekerError || assignmentError || stateError || managerError) throw new Error("Could not load client roster audit.");

  const rows = buildClientRosterAudit(
    (seekers ?? []).map((row) => ({ id: row.id as string, name: (row.full_name as string | null)?.trim() || row.email as string, email: row.email as string, accountStatus: row.status as string | null })),
    (assignments ?? []).map((row) => ({ jobSeekerId: row.job_seeker_id as string, accountManagerId: row.account_manager_id as string, assignedAt: row.created_at as string | null })),
    (states ?? []).map((row) => ({ jobSeekerId: row.job_seeker_id as string, status: row.status as string })),
    (managers ?? []).map((row) => ({ id: row.id as string, name: (row.name as string | null)?.trim() || row.email as string, status: row.status as string | null })),
  );
  const count = (finding: RosterFinding) => rows.filter((row) => row.finding === finding).length;
  const urgent = count("inactive_assigned") + count("unassigned_client") + count("inactive_owner");
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-900">Client roster audit</h1><p className="mt-1 text-sm text-gray-600">Review current assignments against intake and seeker account status before relying on client counts. This page does not change records.</p></div>
    <div className="grid gap-3 sm:grid-cols-4">
      {[["Needs immediate review", urgent], ["Review assignment", count("review_assignment")], ["Reserved, payment pending", count("reserved")], ["Active clients assigned", count("active_client")]].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p></div>)}
    </div>
    <div className="flex flex-wrap gap-2 text-sm"><Link href="/dashboard/admin/intake" className="rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50">Open Intake Queue</Link><Link href="/dashboard/admin/assignments" className="rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50">Manage assignments</Link><Link href="/dashboard/weekly-review" className="rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50">Friday seeker review</Link></div>
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white"><div className="border-b border-gray-200 p-4"><h2 className="font-semibold text-gray-900">Assigned seekers and active clients</h2><p className="mt-1 text-xs text-gray-500">Only current assignments and active clients are listed. An approved payment reservation is shown separately from an active client.</p></div>
      {rows.length === 0 ? <p className="p-6 text-sm text-gray-600">No current assignments or active clients found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-4 py-3">Seeker</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Intake</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Finding / next check</th></tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.seeker.id}><td className="px-4 py-3"><Link href={`/dashboard/seekers/${row.seeker.id}`} className="font-medium text-violet-700 hover:underline">{row.seeker.name}</Link><p className="text-xs text-gray-500">{row.seeker.email}</p></td><td className="px-4 py-3 text-gray-700">{row.manager?.name ?? "Unassigned"}</td><td className="px-4 py-3 text-gray-700">{(row.intakeStatus ?? "No intake state").replace(/_/g, " ")}</td><td className="px-4 py-3 text-gray-700">{row.seeker.accountStatus ?? "Unknown"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${LABELS[row.finding].color}`}>{LABELS[row.finding].label}</span><p className="mt-1 max-w-xs text-xs text-gray-600">{LABELS[row.finding].detail}</p></td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-xs text-gray-500">An assignment alone does not prove a seeker is a paying active client. Confirm intake and payment records before changing status or ownership.</p>
  </div>;
}
