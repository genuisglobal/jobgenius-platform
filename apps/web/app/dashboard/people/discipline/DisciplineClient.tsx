"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISCIPLINARY_RECORD_SEVERITIES,
  DISCIPLINARY_RECORD_STATUSES,
  labelizePeopleValue,
} from "@/lib/people";

interface EmployeeRow {
  id: string;
  role_title: string | null;
  worker: {
    full_name: string;
    email: string | null;
    job_title: string | null;
  } | null;
}

interface RecordRow {
  id: string;
  employee_id: string;
  severity: string;
  category: string | null;
  title: string;
  description: string | null;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
  employee: EmployeeRow | null;
  creator: {
    name: string | null;
    email: string;
  } | null;
}

const EMPTY_FORM = {
  id: "",
  employee_id: "",
  severity: "coaching",
  category: "",
  title: "",
  description: "",
  status: "active",
  opened_at: "",
  resolved_at: "",
  notes: "",
};

function getEmployeeLabel(employee: EmployeeRow): string {
  return (
    employee.worker?.full_name ||
    employee.role_title ||
    employee.worker?.job_title ||
    employee.id
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

export default function DisciplineClient({
  initialEmployees,
  initialRecords,
}: {
  initialEmployees: EmployeeRow[];
  initialRecords: RecordRow[];
}) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setRecords(initialRecords);
  }, [initialRecords]);

  const activeRecords = useMemo(
    () => records.filter((record) => record.status === "active"),
    [records]
  );
  const seriousRecords = useMemo(
    () => activeRecords.filter((record) => record.severity === "serious"),
    [activeRecords]
  );
  const recentRecords = useMemo(() => records.slice(0, 12), [records]);

  function startEdit(record: RecordRow) {
    setForm({
      id: record.id,
      employee_id: record.employee_id,
      severity: record.severity,
      category: record.category || "",
      title: record.title,
      description: record.description || "",
      status: record.status,
      opened_at: record.opened_at ? record.opened_at.slice(0, 10) : "",
      resolved_at: record.resolved_at ? record.resolved_at.slice(0, 10) : "",
      notes: record.notes || "",
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/people/disciplinary-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: form.id || undefined,
          category: form.category || null,
          description: form.description || null,
          opened_at: form.opened_at || null,
          resolved_at: form.resolved_at || null,
          notes: form.notes || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save disciplinary record.");
      }
      setMessage({ type: "success", text: "Disciplinary record saved." });
      resetForm();
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save disciplinary record.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Disciplinary Records</h1>
          <p className="text-sm text-gray-500 mt-1">
            Internal conduct records for coaching, warnings, serious issues, and resolution status.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active records</p>
          <p className="text-2xl font-bold text-red-700 mt-2">{activeRecords.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Serious active</p>
          <p className="text-2xl font-bold text-red-900 mt-2">{seriousRecords.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resolved</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {records.filter((record) => record.status === "resolved").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dismissed</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {records.filter((record) => record.status === "dismissed").length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={saveRecord} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {form.id ? "Edit conduct record" : "Create conduct record"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Use coaching for early issues, warning for formal concerns, and serious for integrity or major conduct cases.
              </p>
            </div>
            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                Clear
              </button>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Employee</span>
            <select
              value={form.employee_id}
              onChange={(event) => setForm((prev) => ({ ...prev, employee_id: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select employee</option>
              {initialEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {getEmployeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Severity</span>
              <select
                value={form.severity}
                onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {DISCIPLINARY_RECORD_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {labelizePeopleValue(severity)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {DISCIPLINARY_RECORD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labelizePeopleValue(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Category</span>
              <input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Integrity, discipline, attendance"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Opened date</span>
              <input
                type="date"
                value={form.opened_at}
                onChange={(event) => setForm((prev) => ({ ...prev, opened_at: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Resolved date</span>
              <input
                type="date"
                value={form.resolved_at}
                onChange={(event) => setForm((prev) => ({ ...prev, resolved_at: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Notes</span>
              <input
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : form.id ? "Update record" : "Save record"}
          </button>
        </form>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent conduct records</h2>
            <p className="text-xs text-gray-500 mt-1">
              Sensitive internal history for management review, probation decisions, and leadership screening.
            </p>
          </div>
          {recentRecords.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No disciplinary records recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentRecords.map((record) => (
                <div key={record.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{record.title}</p>
                      <p className="text-sm text-gray-500">
                        {getEmployeeLabel(record.employee || { id: record.employee_id, role_title: null, worker: null })}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {record.category || "General conduct"} / Opened {formatDate(record.opened_at)}
                        {record.resolved_at ? ` / Resolved ${formatDate(record.resolved_at)}` : ""}
                      </p>
                      {record.description && (
                        <p className="text-sm text-gray-600 mt-2">{record.description}</p>
                      )}
                      {record.notes && (
                        <p className="text-xs text-gray-500 mt-1">Notes: {record.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          record.severity === "serious"
                            ? "bg-red-100 text-red-700"
                            : record.severity === "warning"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {labelizePeopleValue(record.severity)}
                      </span>
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {labelizePeopleValue(record.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        className="text-sm font-medium text-violet-600 hover:text-violet-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
