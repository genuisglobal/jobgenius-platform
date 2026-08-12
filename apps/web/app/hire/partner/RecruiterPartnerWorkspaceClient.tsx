"use client";

import { useMemo, useState, useTransition } from "react";

type PartnerRequest = {
  id: string;
  role_title: string | null;
  job_url: string | null;
  location: string;
  client_company_name: string | null;
  hiring_urgency: string | null;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type WorkspaceProps = {
  recruiter: {
    name: string | null;
    email: string | null;
    company: string | null;
    partner_type: string | null;
  };
  initialRequests: PartnerRequest[];
};

type FormState = {
  roleTitle: string;
  jobUrl: string;
  location: string;
  clientCompanyName: string;
  hiringUrgency: string;
  details: string;
};

const INITIAL_FORM: FormState = {
  roleTitle: "",
  jobUrl: "",
  location: "",
  clientCompanyName: "",
  hiringUrgency: "standard",
  details: "",
};

function statusTone(status: string) {
  switch (status) {
    case "qualified":
      return "bg-violet-100 text-violet-800";
    case "awaiting_details":
      return "bg-amber-100 text-amber-800";
    case "candidate_shortlist_sent":
      return "bg-cyan-100 text-cyan-800";
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "closed":
      return "bg-gray-200 text-gray-700";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-orange-100 text-orange-800";
  }
}

function labelize(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function RecruiterPartnerWorkspaceClient({
  recruiter,
  initialRequests,
}: WorkspaceProps) {
  const [requests, setRequests] = useState<PartnerRequest[]>(initialRequests);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const counts = useMemo(() => {
    const open = requests.filter((request) => !["closed", "rejected"].includes(request.status));
    return {
      total: requests.length,
      open: open.length,
      active: requests.filter((request) => request.status === "active").length,
      awaitingDetails: requests.filter((request) => request.status === "awaiting_details").length,
    };
  }, [requests]);

  const isAgency = recruiter.partner_type === "agency";
  const displayName = recruiter.name || recruiter.company || "Partner";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/recruiter/partner/role-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
          roleRequest?: PartnerRequest;
        };

        if (!response.ok) {
          setError(data.error || "Could not create the role request.");
          return;
        }

        if (data.roleRequest) {
          setRequests((current) => [
            data.roleRequest as PartnerRequest,
            ...current.filter((request) => request.id !== data.roleRequest?.id),
          ]);
        }

        setMessage(
          data.duplicate
            ? "That role already exists in your recent workspace history, so we refreshed the existing request instead of creating a duplicate."
            : "Role request submitted and added to your workspace."
        );
        setForm(INITIAL_FORM);
      } catch {
        setError("Network error while creating the role request.");
      }
    });
  }

  function logout() {
    startLogoutTransition(async () => {
      await fetch("/api/recruiter/partner/logout", { method: "POST" }).catch(() => {});
      window.location.href = "/hire";
    });
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total Requests" value={counts.total} tone="text-violet-600" />
        <SummaryCard label="Open Requests" value={counts.open} tone="text-orange-600" />
        <SummaryCard label="Active" value={counts.active} tone="text-emerald-600" />
        <SummaryCard
          label="Awaiting Details"
          value={counts.awaitingDetails}
          tone="text-amber-600"
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">
                Workspace Overview
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
                {displayName}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
                This is your repeat-partner view. It is intentionally light: recent requests
                in one place and a faster path to send another live req.
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={isLoggingOut}
              className="inline-flex rounded-full border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>

          <div className="mt-6 grid gap-4 rounded-[28px] border border-violet-100 bg-violet-50/60 p-5 sm:grid-cols-3">
            <MetaBlock label="Company" value={recruiter.company || "-"} />
            <MetaBlock label="Partner Type" value={labelize(recruiter.partner_type)} />
            <MetaBlock label="Workspace Email" value={recruiter.email || "-"} />
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900">Recent requests</h3>
            <div className="mt-4 space-y-4">
              {requests.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-sm text-gray-500">
                  No requests yet in this workspace.
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-[24px] border border-gray-200 bg-gray-50 px-5 py-5"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">
                            {request.role_title || "Role title not provided"}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(request.status)}`}
                          >
                            {labelize(request.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                          <span>{request.location}</span>
                          {request.client_company_name ? (
                            <span>Client: {request.client_company_name}</span>
                          ) : null}
                          <span>Urgency: {labelize(request.hiring_urgency)}</span>
                          <span>Submitted: {formatDate(request.created_at)}</span>
                          <span>Updated: {formatDate(request.updated_at)}</span>
                        </div>
                        {request.details ? (
                          <p className="text-sm leading-6 text-gray-600">{request.details}</p>
                        ) : null}
                      </div>
                      {request.job_url ? (
                        <a
                          href={request.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-violet-600 hover:text-violet-800"
                        >
                          Open job link
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <form
          onSubmit={submitRequest}
          className="rounded-[32px] bg-[#1f1147] p-8 text-white shadow-[0_30px_90px_rgba(31,17,71,0.24)]"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
            Submit Another Role
          </p>
          <h3 className="mt-2 text-3xl font-extrabold tracking-tight">
            Repeat request, lighter flow
          </h3>
          <p className="mt-4 text-base leading-7 text-violet-100">
            This is for live demand you already want us to look at. If you submit the same req
            twice, we try to attach it to the existing one instead of creating noise.
          </p>

          <div className="mt-8 space-y-4">
            <Field
              label="Role title"
              value={form.roleTitle}
              onChange={(value) => updateField("roleTitle", value)}
              placeholder="Senior Product Manager"
            />
            <Field
              label="Job link"
              value={form.jobUrl}
              onChange={(value) => updateField("jobUrl", value)}
              placeholder="https://..."
            />
            <Field
              label="Location"
              value={form.location}
              onChange={(value) => updateField("location", value)}
              placeholder="Remote, New York, London"
              required
            />

            {isAgency ? (
              <Field
                label="Client company"
                value={form.clientCompanyName}
                onChange={(value) => updateField("clientCompanyName", value)}
                placeholder="Optional"
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-white">
                Hiring urgency
              </label>
              <select
                value={form.hiringUrgency}
                onChange={(event) => updateField("hiringUrgency", event.target.value)}
                className="w-full rounded-2xl border border-violet-700 bg-violet-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-200/20"
              >
                <option value="standard">Standard</option>
                <option value="urgent">Urgent</option>
                <option value="immediate">Immediate</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white">
                Anything we should know?
              </label>
              <textarea
                rows={4}
                value={form.details}
                onChange={(event) => updateField("details", event.target.value)}
                placeholder="Scope, timing, must-have background, or any recruiter-side context."
                className="w-full rounded-2xl border border-violet-700 bg-violet-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-200/20"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Submitting..." : "Submit role request"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-white">
        {label} {required ? <span className="text-orange-300">*</span> : null}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-violet-700 bg-violet-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-200/20"
      />
    </div>
  );
}
