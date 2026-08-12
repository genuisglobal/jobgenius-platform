"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OutcomeFunnelCounts = {
  leads: number;
  consultationsBooked: number;
  consultationsCompleted: number;
  paymentsConfirmed: number;
  clientsActivated: number;
  applicationsSubmitted: number;
  interviewOutcomes: number;
  offersVerified: number;
  placementsConfirmed: number;
};

type OutcomeChannelActivityRow = {
  channel: string;
  totalEvents: number;
  leads: number;
  consultations: number;
  payments: number;
  applications: number;
  offers: number;
  placements: number;
};

type OutcomeAmPerformanceRow = {
  accountManagerId: string;
  name: string;
  email: string;
  role: string | null;
  leads: number;
  consultationsCompleted: number;
  clientsActivated: number;
  applicationsSubmitted: number;
  interviewOutcomes: number;
  offersVerified: number;
  placementsConfirmed: number;
};

type OutcomeConsultationRecord = {
  id: string;
  leadSubmissionId: string | null;
  jobSeekerId: string | null;
  ownerAccountManagerId: string | null;
  scheduledFor: string | null;
  status: "booked" | "completed" | "no_show" | "cancelled";
  decision: "qualified" | "nurture" | "disqualified" | "defer" | null;
  meetingLink: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    fullName: string | null;
    email: string | null;
    status: string | null;
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type OutcomeLeadOption = {
  id: string;
  label: string;
  status: string;
  ownerAccountManagerId: string | null;
  linkedJobSeekerId: string | null;
  nextCallDueAt: string | null;
  createdAt: string;
};

type OutcomeAccountManagerOption = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type AdminOutcomeDashboardData = {
  allTime: OutcomeFunnelCounts;
  last30Days: OutcomeFunnelCounts;
  channelActivity: OutcomeChannelActivityRow[];
  amPerformance: OutcomeAmPerformanceRow[];
  consultations: OutcomeConsultationRecord[];
  leadOptions: OutcomeLeadOption[];
  accountManagers: OutcomeAccountManagerOption[];
  selectedLeadId: string | null;
};

type ConsultationFormState = {
  id: string;
  lead_submission_id: string;
  owner_account_manager_id: string;
  scheduled_for: string;
  status: "booked" | "completed" | "no_show" | "cancelled";
  decision: "qualified" | "nurture" | "disqualified" | "defer" | "";
  meeting_link: string;
  notes: string;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function labelize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function buildInitialForm(
  selectedLeadId: string | null,
  leadOptions: OutcomeLeadOption[]
): ConsultationFormState {
  const selectedLead = leadOptions.find((lead) => lead.id === selectedLeadId) ?? null;

  return {
    id: "",
    lead_submission_id: selectedLead?.id ?? "",
    owner_account_manager_id: selectedLead?.ownerAccountManagerId ?? "",
    scheduled_for: "",
    status: "booked",
    decision: "",
    meeting_link: "",
    notes: "",
  };
}

function funnelCardData(counts: OutcomeFunnelCounts) {
  return [
    { label: "Leads", value: counts.leads },
    { label: "Booked", value: counts.consultationsBooked },
    { label: "Completed", value: counts.consultationsCompleted },
    { label: "Payments", value: counts.paymentsConfirmed },
    { label: "Activated", value: counts.clientsActivated },
    { label: "Applications", value: counts.applicationsSubmitted },
    { label: "Interviews", value: counts.interviewOutcomes },
    { label: "Verified offers", value: counts.offersVerified },
    { label: "Placements", value: counts.placementsConfirmed },
  ];
}

function statusBadgeClasses(status: ConsultationFormState["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    case "booked":
      return "bg-violet-100 text-violet-800";
    case "no_show":
      return "bg-amber-100 text-amber-800";
    case "cancelled":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function decisionBadgeClasses(
  decision: ConsultationFormState["decision"] | OutcomeConsultationRecord["decision"]
): string {
  switch (decision) {
    case "qualified":
      return "bg-emerald-50 text-emerald-700";
    case "nurture":
      return "bg-amber-50 text-amber-700";
    case "disqualified":
      return "bg-rose-50 text-rose-700";
    case "defer":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function OutcomesClient({
  data,
}: {
  data: AdminOutcomeDashboardData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ConsultationFormState>(() =>
    buildInitialForm(data.selectedLeadId, data.leadOptions)
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedLead =
    data.leadOptions.find((lead) => lead.id === form.lead_submission_id) ??
    data.leadOptions.find((lead) => lead.id === data.selectedLeadId) ??
    null;

  const visibleConsultations = useMemo(() => {
    if (!data.selectedLeadId) return data.consultations;
    return data.consultations.filter(
      (consultation) => consultation.leadSubmissionId === data.selectedLeadId
    );
  }, [data.consultations, data.selectedLeadId]);

  function resetForm() {
    setForm(buildInitialForm(data.selectedLeadId, data.leadOptions));
    setMessage(null);
  }

  function startEditing(consultation: OutcomeConsultationRecord) {
    setForm({
      id: consultation.id,
      lead_submission_id: consultation.leadSubmissionId ?? "",
      owner_account_manager_id: consultation.ownerAccountManagerId ?? "",
      scheduled_for: toDateTimeLocalInput(consultation.scheduledFor),
      status: consultation.status,
      decision: consultation.decision ?? "",
      meeting_link: consultation.meetingLink ?? "",
      notes: consultation.notes ?? "",
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/am/consultations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: form.id || undefined,
          lead_submission_id: form.lead_submission_id || undefined,
          owner_account_manager_id: form.owner_account_manager_id || null,
          scheduled_for: form.scheduled_for
            ? new Date(form.scheduled_for).toISOString()
            : null,
          status: form.status,
          decision: form.status === "completed" ? form.decision || null : null,
          meeting_link: form.meeting_link || null,
          notes: form.notes || null,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save consultation.");
      }

      setMessage({
        type: "success",
        text: form.id
          ? "Consultation updated and outcome events refreshed."
          : "Consultation saved and ledger events recorded.",
      });
      setForm(buildInitialForm(data.selectedLeadId, data.leadOptions));
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save consultation.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outcome Analytics</h1>
          <p className="text-sm text-gray-600 mt-1">
            Consultation operations plus the first funnel readout from the immutable
            outcome ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/admin/leads"
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open Lead Queue
          </Link>
          <Link
            href="/dashboard/admin"
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back To Admin
          </Link>
        </div>
      </div>

      {selectedLead ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Selected lead
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{selectedLead.label}</p>
              <p className="text-sm text-gray-600 mt-1">
                Status: {labelize(selectedLead.status)}
                {selectedLead.nextCallDueAt
                  ? ` • Next call due ${formatDateTime(selectedLead.nextCallDueAt)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard/admin/outcomes")}
              className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
            >
              Clear lead focus
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All recorded outcomes</h2>
              <p className="text-xs text-gray-500 mt-1">
                Counts from the ledger across captured leads, consultations, payments, delivery,
                and placements.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {funnelCardData(data.allTime).map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Last 30 days</h2>
              <p className="text-xs text-gray-500 mt-1">
                Recent outcome velocity for consultations, activations, applications, and offers.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {funnelCardData(data.last30Days).map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Consultation desk</h2>
              <p className="text-xs text-gray-500 mt-1">
                Book, complete, or reclassify consultations while writing immutable outcome
                events behind the scenes.
              </p>
            </div>
            {form.id ? (
              <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                Editing existing consultation
              </span>
            ) : null}
          </div>

          {message ? (
            <div
              className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Lead</span>
                <select
                  value={form.lead_submission_id}
                  onChange={(event) =>
                    setForm((current) => {
                      const nextLead =
                        data.leadOptions.find((lead) => lead.id === event.target.value) ?? null;
                      return {
                        ...current,
                        lead_submission_id: event.target.value,
                        owner_account_manager_id:
                          current.id || current.owner_account_manager_id
                            ? current.owner_account_manager_id
                            : nextLead?.ownerAccountManagerId ?? "",
                      };
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select a lead</option>
                  {data.leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Owner</span>
                <select
                  value={form.owner_account_manager_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      owner_account_manager_id: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Keep current owner</option>
                  {data.accountManagers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name} ({manager.email})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  Scheduled for
                </span>
                <input
                  type="datetime-local"
                  value={form.scheduled_for}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduled_for: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as ConsultationFormState["status"],
                      decision:
                        event.target.value === "completed" ? current.decision : "",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="booked">Booked</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No show</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            {form.status === "completed" ? (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Decision</span>
                <select
                  value={form.decision}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      decision: event.target.value as ConsultationFormState["decision"],
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">No final classification yet</option>
                  <option value="qualified">Qualified</option>
                  <option value="nurture">Nurture</option>
                  <option value="disqualified">Disqualified</option>
                  <option value="defer">Defer</option>
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Meeting link</span>
              <input
                type="url"
                value={form.meeting_link}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    meeting_link: event.target.value,
                  }))
                }
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Consultation summary, concerns, or qualification rationale."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy || !form.lead_submission_id}
                className="inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? "Saving..."
                  : form.id
                  ? "Update consultation"
                  : "Save consultation"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Reset form
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent consultations</h2>
            <p className="text-xs text-gray-500 mt-1">
              {data.selectedLeadId
                ? "Showing consultation history for the selected lead."
                : "Latest consultation activity across active leads."}
            </p>
          </div>

          {visibleConsultations.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No consultations are recorded for this view yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleConsultations.map((consultation) => (
                <div key={consultation.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {consultation.lead?.fullName ||
                          consultation.lead?.email ||
                          consultation.leadSubmissionId ||
                          "Unknown lead"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Owner:{" "}
                        {consultation.owner?.name ||
                          consultation.owner?.email ||
                          "Unassigned"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses(
                          consultation.status
                        )}`}
                      >
                        {labelize(consultation.status)}
                      </span>
                      {consultation.decision ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${decisionBadgeClasses(
                            consultation.decision
                          )}`}
                        >
                          {labelize(consultation.decision)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
                    <p>Scheduled: {formatDateTime(consultation.scheduledFor)}</p>
                    <p>Updated: {formatDateTime(consultation.updatedAt)}</p>
                  </div>

                  {consultation.notes ? (
                    <p className="text-sm text-gray-600 whitespace-pre-line">{consultation.notes}</p>
                  ) : (
                    <p className="text-sm text-gray-400">No notes captured.</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => startEditing(consultation)}
                      className="text-sm font-medium text-violet-600 hover:text-violet-700"
                    >
                      Edit consultation
                    </button>
                    {consultation.jobSeekerId ? (
                      <Link
                        href={`/dashboard/seekers/${consultation.jobSeekerId}`}
                        className="text-sm font-medium text-gray-600 hover:text-gray-800"
                      >
                        Open seeker
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Channel activity</h2>
            <p className="text-xs text-gray-500 mt-1">
              Where ledger events are currently entering the system.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Channel</th>
                  <th className="px-3 py-2 text-left font-semibold">Total</th>
                  <th className="px-3 py-2 text-left font-semibold">Consults</th>
                  <th className="px-3 py-2 text-left font-semibold">Apps</th>
                  <th className="px-3 py-2 text-left font-semibold">Offers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.channelActivity.map((row) => (
                  <tr key={row.channel} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-900">{labelize(row.channel)}</td>
                    <td className="px-3 py-3 text-gray-700">{row.totalEvents}</td>
                    <td className="px-3 py-3 text-gray-700">{row.consultations}</td>
                    <td className="px-3 py-3 text-gray-700">{row.applications}</td>
                    <td className="px-3 py-3 text-gray-700">{row.offers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">AM outcome performance</h2>
            <p className="text-xs text-gray-500 mt-1">
              Early leaderboard from immutable owner snapshots on the ledger.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Owner</th>
                  <th className="px-3 py-2 text-left font-semibold">Leads</th>
                  <th className="px-3 py-2 text-left font-semibold">Completed</th>
                  <th className="px-3 py-2 text-left font-semibold">Activated</th>
                  <th className="px-3 py-2 text-left font-semibold">Apps</th>
                  <th className="px-3 py-2 text-left font-semibold">Offers</th>
                  <th className="px-3 py-2 text-left font-semibold">Placements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.amPerformance.map((row) => (
                  <tr key={row.accountManagerId} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.name}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{row.leads}</td>
                    <td className="px-3 py-3 text-gray-700">{row.consultationsCompleted}</td>
                    <td className="px-3 py-3 text-gray-700">{row.clientsActivated}</td>
                    <td className="px-3 py-3 text-gray-700">{row.applicationsSubmitted}</td>
                    <td className="px-3 py-3 text-gray-700">{row.offersVerified}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900">
                      {row.placementsConfirmed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
