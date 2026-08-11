"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPLOYEE_EMPLOYMENT_STATUSES,
  LEADERSHIP_PIPELINE_STATUSES,
  labelizePeopleValue,
  type CareerLadderLevel,
} from "@/lib/people";

export interface PeopleEmployeeWorkerOption {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
  start_date: string | null;
  account_manager_id: string | null;
}

export interface AccountManagerOption {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

export interface EmployeeListRow {
  id: string;
  worker_id: string;
  account_manager_id: string | null;
  supervisor_employee_id: string | null;
  employee_code: string | null;
  role_title: string | null;
  start_date: string | null;
  probation_start_date: string | null;
  probation_end_date: string | null;
  employment_status: string;
  onboarding_status: string;
  leadership_status: string;
  active: boolean;
  worker: {
    id: string;
    full_name: string;
    email: string | null;
    job_title: string | null;
    department: string | null;
    status: string;
    currency: string;
  } | null;
  account_manager: {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
  } | null;
  supervisor: {
    id: string;
    full_name: string;
  } | null;
  current_level: CareerLadderLevel | null;
}

type EmployeeDraft = {
  role_title: string;
  employment_status: string;
  leadership_status: string;
  current_career_level_id: string;
  supervisor_employee_id: string;
};

const EMPTY_FORM = {
  worker_id: "",
  account_manager_id: "",
  role_title: "",
  start_date: "",
  probation_start_date: "",
  probation_end_date: "",
  employment_status: "tentative",
  current_career_level_id: "",
  leadership_status: "not_eligible",
};

export default function EmployeesClient({
  initialEmployees,
  availableWorkers,
  accountManagers,
  careerLevels,
}: {
  initialEmployees: EmployeeListRow[];
  availableWorkers: PeopleEmployeeWorkerOption[];
  accountManagers: AccountManagerOption[];
  careerLevels: CareerLadderLevel[];
}) {
  const router = useRouter();
  const [employees] = useState(initialEmployees);
  const [drafts, setDrafts] = useState<Record<string, EmployeeDraft>>(() =>
    Object.fromEntries(
      initialEmployees.map((employee) => [
        employee.id,
        {
          role_title: employee.role_title || "",
          employment_status: employee.employment_status,
          leadership_status: employee.leadership_status,
          current_career_level_id: employee.current_level?.id || "",
          supervisor_employee_id: employee.supervisor?.id || "",
        },
      ])
    )
  );
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const supervisorOptions = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: employee.worker?.full_name || employee.role_title || employee.id,
      })),
    [employees]
  );

  function updateDraft(id: string, key: keyof EmployeeDraft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }));
  }

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.worker_id) {
      setMessage({ type: "error", text: "Select a payroll worker first." });
      return;
    }

    setSavingCreate(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          account_manager_id: createForm.account_manager_id || null,
          current_career_level_id: createForm.current_career_level_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create employee." });
        return;
      }
      setMessage({ type: "success", text: "Employee profile created." });
      setCreateForm({ ...EMPTY_FORM });
      setShowCreate(false);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSavingCreate(false);
    }
  }

  async function saveEmployee(id: string) {
    setSavingId(id);
    setMessage(null);
    try {
      const draft = drafts[id];
      const res = await fetch(`/api/admin/people/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          current_career_level_id: draft.current_career_level_id || null,
          supervisor_employee_id: draft.supervisor_employee_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update employee." });
        return;
      }
      setMessage({ type: "success", text: "Employee updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link payroll workers to employee profiles, career levels, and internal staff logins.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((value) => !value)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          {showCreate ? "Cancel" : "Create employee"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={createEmployee}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Payroll worker *</span>
              <select
                value={createForm.worker_id}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, worker_id: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select a worker</option>
                {availableWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                    {worker.job_title ? ` - ${worker.job_title}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Linked staff login</span>
              <select
                value={createForm.account_manager_id}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, account_manager_id: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {accountManagers.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name || account.email || account.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Role title</span>
              <input
                type="text"
                value={createForm.role_title}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, role_title: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Career Service Consultant"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Employment status</span>
              <select
                value={createForm.employment_status}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    employment_status: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {EMPLOYEE_EMPLOYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labelizePeopleValue(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Start date</span>
              <input
                type="date"
                value={createForm.start_date}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, start_date: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Probation start</span>
              <input
                type="date"
                value={createForm.probation_start_date}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    probation_start_date: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Probation end</span>
              <input
                type="date"
                value={createForm.probation_end_date}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    probation_end_date: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Career level</span>
              <select
                value={createForm.current_career_level_id}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    current_career_level_id: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not set</option>
                {careerLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              Available workers come from Payroll and can be linked to an internal staff
              login if the employee will use the JobGenuis dashboard.
            </p>
            <button
              type="submit"
              disabled={savingCreate}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-50"
            >
              {savingCreate ? "Creating..." : "Create employee"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Current employee profiles</h2>
            <p className="text-xs text-gray-500 mt-1">
              {employees.length} employee profile{employees.length === 1 ? "" : "s"} linked
              to payroll records.
            </p>
          </div>
          <span className="text-xs text-gray-400">
            Unlinked payroll workers: {availableWorkers.length}
          </span>
        </div>

        {employees.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No employee profiles yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {employees.map((employee) => {
              const draft = drafts[employee.id];
              return (
                <div key={employee.id} className="px-5 py-5 space-y-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {employee.worker?.full_name || "Unnamed employee"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {employee.worker?.email || "No email"} ·{" "}
                        {employee.employee_code || "Code pending"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {employee.worker?.department || "No department"} ·{" "}
                        {employee.account_manager?.name ||
                          employee.account_manager?.email ||
                          "No dashboard login linked"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                        {labelizePeopleValue(employee.onboarding_status)}
                      </span>
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                        {employee.current_level?.title || "Career level pending"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Role title</span>
                      <input
                        type="text"
                        value={draft.role_title}
                        onChange={(e) =>
                          updateDraft(employee.id, "role_title", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Employment</span>
                      <select
                        value={draft.employment_status}
                        onChange={(e) =>
                          updateDraft(employee.id, "employment_status", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {EMPLOYEE_EMPLOYMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelizePeopleValue(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Leadership</span>
                      <select
                        value={draft.leadership_status}
                        onChange={(e) =>
                          updateDraft(employee.id, "leadership_status", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {LEADERSHIP_PIPELINE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelizePeopleValue(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Career level</span>
                      <select
                        value={draft.current_career_level_id}
                        onChange={(e) =>
                          updateDraft(employee.id, "current_career_level_id", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Not set</option>
                        {careerLevels.map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Supervisor</span>
                      <select
                        value={draft.supervisor_employee_id}
                        onChange={(e) =>
                          updateDraft(employee.id, "supervisor_employee_id", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Not assigned</option>
                        {supervisorOptions
                          .filter((option) => option.id !== employee.id)
                          .map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-gray-400">
                      Start {employee.start_date || "not set"} · Probation{" "}
                      {employee.probation_start_date || "not set"} to{" "}
                      {employee.probation_end_date || "not set"}
                    </p>
                    <button
                      onClick={() => saveEmployee(employee.id)}
                      disabled={savingId === employee.id}
                      className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-50"
                    >
                      {savingId === employee.id ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
