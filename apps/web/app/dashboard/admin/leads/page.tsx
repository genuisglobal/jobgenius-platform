import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

type LeadStatus = "new" | "qualified" | "nurture" | "disqualified" | "converted";

type LeadRow = {
  id: string;
  source: string;
  status: LeadStatus;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  target_roles: string[] | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  next_call_due_at: string | null;
  last_call_at: string | null;
  owner_account_manager_id: string | null;
  created_at: string;
};

type AccountManagerRow = {
  id: string;
  name: string | null;
  email: string;
};

type VoiceCallRow = {
  lead_submission_id: string | null;
  status: string;
  created_at: string;
  call_started_at: string | null;
  call_ended_at: string | null;
};

type LeadResumeMetadata = {
  file_name?: unknown;
  mime_type?: unknown;
  storage_path?: unknown;
  signed_url?: unknown;
};

function badgeClasses(status: string) {
  switch (status) {
    case "new":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "qualified":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "nurture":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "disqualified":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "converted":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "queued":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "in_progress":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "failed":
    case "no_answer":
    case "voicemail":
    case "cancelled":
      return "bg-gray-100 text-gray-700 border-gray-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

function getOfferCode(metadata: Record<string, unknown> | null) {
  const code = metadata?.offer_code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function getSubmittedVia(metadata: Record<string, unknown> | null) {
  const value = metadata?.source ?? metadata?.submitted_via;
  return typeof value === "string" && value.trim() ? value.trim() : "website";
}

function getResumeMetadata(metadata: Record<string, unknown> | null) {
  const resume = metadata?.resume;
  if (!resume || typeof resume !== "object" || Array.isArray(resume)) {
    return null;
  }

  const data = resume as LeadResumeMetadata;
  const fileName =
    typeof data.file_name === "string" && data.file_name.trim() ? data.file_name.trim() : null;
  const mimeType =
    typeof data.mime_type === "string" && data.mime_type.trim() ? data.mime_type.trim() : null;
  const hasFile =
    (typeof data.storage_path === "string" && data.storage_path.trim().length > 0) ||
    (typeof data.signed_url === "string" && data.signed_url.trim().length > 0);

  if (!hasFile) {
    return null;
  }

  return {
    fileName,
    mimeType,
  };
}

function isSignupIntake(metadata: Record<string, unknown> | null) {
  const intakeVariant = metadata?.intake_variant;
  const source = metadata?.source;
  return (
    intakeVariant === "jobseeker_light_signup" ||
    source === "signup_form" ||
    source === "signup"
  );
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: { status?: string; source?: string };
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const statusFilter = String(searchParams?.status ?? "all").toLowerCase();
  const sourceFilter = String(searchParams?.source ?? "all").toLowerCase();

  let leadsQuery = supabaseAdmin
    .from("lead_intake_submissions")
    .select(
      "id, source, status, full_name, email, phone, location, target_roles, notes, metadata, next_call_due_at, last_call_at, owner_account_manager_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter !== "all") {
    leadsQuery = leadsQuery.eq("status", statusFilter);
  }

  if (sourceFilter !== "all" && sourceFilter !== "signup_intake") {
    leadsQuery = leadsQuery.eq("source", sourceFilter);
  }

  const [leadsRes, allLeadCountsRes, queuedCallsRes] = await Promise.all([
    leadsQuery,
    supabaseAdmin
      .from("lead_intake_submissions")
      .select("id, status, source, metadata", { count: "exact" }),
    supabaseAdmin
      .from("voice_calls")
      .select("lead_submission_id, status, created_at, call_started_at, call_ended_at")
      .not("lead_submission_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  const leads = (leadsRes.data ?? []) as unknown as LeadRow[];
  const allLeadRows = (allLeadCountsRes.data ?? []) as Array<{
    id: string;
    status: LeadStatus;
    source: string;
    metadata: Record<string, unknown> | null;
  }>;
  const voiceCalls = (queuedCallsRes.data ?? []) as VoiceCallRow[];
  const ownerIds = Array.from(
    new Set(
      leads
        .map((lead) => lead.owner_account_manager_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const ownerMap = new Map<string, AccountManagerRow>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabaseAdmin
      .from("account_managers")
      .select("id, name, email")
      .in("id", ownerIds);

    for (const owner of (owners ?? []) as AccountManagerRow[]) {
      ownerMap.set(owner.id, owner);
    }
  }

  const latestVoiceByLead = new Map<string, VoiceCallRow>();
  for (const call of voiceCalls) {
    if (!call.lead_submission_id || latestVoiceByLead.has(call.lead_submission_id)) continue;
    latestVoiceByLead.set(call.lead_submission_id, call);
  }

  const counts = {
    total: allLeadRows.length,
    new: allLeadRows.filter((lead) => lead.status === "new").length,
    qualified: allLeadRows.filter((lead) => lead.status === "qualified").length,
    nurture: allLeadRows.filter((lead) => lead.status === "nurture").length,
    converted: allLeadRows.filter((lead) => lead.status === "converted").length,
    marketingForm: allLeadRows.filter((lead) => lead.source === "marketing_form").length,
    signupIntake: allLeadRows.filter((lead) => isSignupIntake(lead.metadata)).length,
    excelImport: allLeadRows.filter((lead) => lead.source === "excel_import").length,
    manual: allLeadRows.filter((lead) => lead.source === "manual").length,
  };

  const statusTabs: Array<{ label: string; value: string; count: number }> = [
    { label: "All", value: "all", count: counts.total },
    { label: "New", value: "new", count: counts.new },
    { label: "Qualified", value: "qualified", count: counts.qualified },
    { label: "Nurture", value: "nurture", count: counts.nurture },
    { label: "Converted", value: "converted", count: counts.converted },
  ];

  const sourceTabs: Array<{ label: string; value: string; count: number }> = [
    { label: "All Sources", value: "all", count: counts.total },
    { label: "Signup Intake", value: "signup_intake", count: counts.signupIntake },
    { label: "Marketing Form", value: "marketing_form", count: counts.marketingForm },
    { label: "Excel Import", value: "excel_import", count: counts.excelImport },
    { label: "Manual", value: "manual", count: counts.manual },
  ];

  const filteredLeads =
    sourceFilter === "signup_intake"
      ? leads.filter((lead) => isSignupIntake(lead.metadata))
      : leads;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Queue</h1>
          <p className="text-sm text-gray-600 mt-1">
            Website and imported leads that have entered the qualification flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/admin/voice"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Open Voice Automation
          </Link>
          <Link
            href="/dashboard/admin"
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back To Admin
          </Link>
        </div>
      </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Total Leads</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{counts.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">New</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{counts.new}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Qualified</div>
          <div className="mt-1 text-3xl font-bold text-emerald-600">{counts.qualified}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Nurture</div>
          <div className="mt-1 text-3xl font-bold text-amber-600">{counts.nurture}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Converted</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{counts.converted}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Marketing Form</div>
          <div className="mt-1 text-3xl font-bold text-fuchsia-600">{counts.marketingForm}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-medium text-gray-500">Signup Intake</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{counts.signupIntake}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <p className="text-xs text-gray-600 mt-1">
            Narrow the queue by lead stage and intake source.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const active = statusFilter === tab.value;
            const href = `/dashboard/admin/leads?status=${tab.value}&source=${sourceFilter}`;
            return (
              <Link
                key={`status-${tab.value}`}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {sourceTabs.map((tab) => {
            const active = sourceFilter === tab.value;
            const href = `/dashboard/admin/leads?status=${statusFilter}&source=${tab.value}`;
            return (
              <Link
                key={`source-${tab.value}`}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Leads</h2>
          <p className="text-xs text-gray-600 mt-1">
            Showing the latest {filteredLeads.length} lead submissions for the selected filter.
          </p>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-500">No leads match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Lead</th>
                  <th className="px-5 py-3">Lead Status</th>
                  <th className="px-5 py-3">Voice Call</th>
                  <th className="px-5 py-3">Offer Code</th>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredLeads.map((lead) => {
                  const voice = latestVoiceByLead.get(lead.id);
                  const offerCode = getOfferCode(lead.metadata);
                  const submittedVia = getSubmittedVia(lead.metadata);
                  const resume = getResumeMetadata(lead.metadata);
                  const owner = lead.owner_account_manager_id
                    ? ownerMap.get(lead.owner_account_manager_id) ?? null
                    : null;

                  return (
                    <tr key={lead.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900">
                            {lead.full_name || "Unnamed lead"}
                          </p>
                          <div className="space-y-1 text-sm text-gray-600">
                            {lead.email && <p>{lead.email}</p>}
                            {lead.phone && <p>{lead.phone}</p>}
                            {lead.location && <p>{lead.location}</p>}
                          </div>
                          {lead.target_roles && lead.target_roles.length > 0 && (
                            <p className="text-xs text-gray-500">
                              Target roles: {lead.target_roles.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            Source: {formatStatus(lead.source)} | Submitted via {formatStatus(submittedVia)}
                          </p>
                          {resume ? (
                            <div className="pt-1">
                              <p className="text-xs text-gray-500">
                                Resume: {resume.fileName || "uploaded file"}
                                {resume.mimeType ? ` (${resume.mimeType})` : ""}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <a
                                  href={`/api/admin/leads/${lead.id}/resume`}
                                  className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                                >
                                  Download resume
                                </a>
                                <Link
                                  href={`/dashboard/admin/outcomes?lead=${lead.id}`}
                                  className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                                >
                                  Open consultation desk
                                </Link>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-1 flex flex-wrap gap-2">
                              <p className="text-xs text-gray-400">No resume uploaded</p>
                              <Link
                                href={`/dashboard/admin/outcomes?lead=${lead.id}`}
                                className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                              >
                                Open consultation desk
                              </Link>
                            </div>
                          )}
                          {lead.notes && (
                            <p className="text-xs text-gray-500 line-clamp-2">{lead.notes}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(
                              lead.status
                            )}`}
                          >
                            {formatStatus(lead.status)}
                          </span>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>Next call due: {formatDateTime(lead.next_call_due_at)}</p>
                            <p>Last call: {formatDateTime(lead.last_call_at)}</p>
                            <p className="font-mono text-[11px] text-gray-400">{lead.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {voice ? (
                          <div className="space-y-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(
                                voice.status
                              )}`}
                            >
                              {formatStatus(voice.status)}
                            </span>
                            <div className="text-xs text-gray-500 space-y-1">
                              <p>Created: {formatDateTime(voice.created_at)}</p>
                              {voice.call_started_at && (
                                <p>Started: {formatDateTime(voice.call_started_at)}</p>
                              )}
                              {voice.call_ended_at && (
                                <p>Ended: {formatDateTime(voice.call_ended_at)}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No voice call yet</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {offerCode ? (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            {offerCode}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {owner ? (
                          <div className="text-sm text-gray-700">
                            <p className="font-medium text-gray-900">
                              {owner.name || "Unnamed owner"}
                            </p>
                            <p className="text-xs text-gray-500">{owner.email}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-700">{formatDateTime(lead.created_at)}</p>
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
  );
}
