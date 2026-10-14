"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPLOYEE_EMPLOYMENT_STATUSES,
  REQUIRED_ONBOARDING_ACK_KEYS,
  calculateOnboardingCompletion,
  labelizePeopleValue,
  type EmployeeOnboardingForm,
  type PolicyDocument,
} from "@/lib/people";

interface EmployeeSummary {
  id: string;
  role_title: string | null;
  employment_status: string;
  onboarding_status: string;
  phone_number: string | null;
  whatsapp_number: string | null;
  address_location: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  start_date: string | null;
  supervisor: {
    id: string;
    full_name: string;
  } | null;
  worker: {
    full_name: string;
    email: string | null;
    job_title: string | null;
  } | null;
}

const ACK_LABELS: Record<(typeof REQUIRED_ONBOARDING_ACK_KEYS)[number], string> = {
  acknowledge_role_expectations:
    "I understand the execution, discipline, reporting, and client-protection expectations of this role.",
  acknowledge_tentative_offer:
    "I understand that JobGenuis starts with a tentative offer and performance-based probation.",
  acknowledge_probation_policy:
    "I understand the probation review process, early confirmation path, and 6-month review framework.",
  acknowledge_bonus_policy:
    "I understand the successful accepted-offer bonus rules and ethical eligibility requirements.",
  acknowledge_social_fund_policy:
    "I understand how social fund contributions are earned, tracked, approved, and spent.",
  acknowledge_social_lead_policy:
    "I understand the Social Lead eligibility, election term, and removal rules.",
  acknowledge_leadership_growth:
    "I understand that leadership at JobGenuis is earned through values, execution, accountability, and measurable results.",
};

export default function EmployeeOnboardingClient({
  employee,
  initialForm,
  policies,
  initialAcknowledgedPolicyIds,
  supervisors,
}: {
  employee: EmployeeSummary;
  initialForm: EmployeeOnboardingForm | null;
  policies: PolicyDocument[];
  initialAcknowledgedPolicyIds: string[];
  supervisors: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: initialForm?.full_name || employee.worker?.full_name || "",
    email: initialForm?.email || employee.worker?.email || "",
    phone_number: initialForm?.phone_number || employee.phone_number || "",
    whatsapp_number: initialForm?.whatsapp_number || employee.whatsapp_number || "",
    address_location:
      initialForm?.address_location || employee.address_location || "",
    emergency_contact_name:
      initialForm?.emergency_contact_name || employee.emergency_contact_name || "",
    emergency_contact_phone:
      initialForm?.emergency_contact_phone || employee.emergency_contact_phone || "",
    role_title:
      initialForm?.role_title ||
      employee.role_title ||
      employee.worker?.job_title ||
      "",
    start_date: initialForm?.start_date || employee.start_date || "",
    supervisor_employee_id:
      initialForm?.supervisor_employee_id || employee.supervisor?.id || "",
    employment_status: initialForm?.employment_status || employee.employment_status,
    signature_name: initialForm?.signature_name || employee.worker?.full_name || "",
    acknowledge_role_expectations:
      initialForm?.acknowledge_role_expectations || false,
    acknowledge_tentative_offer:
      initialForm?.acknowledge_tentative_offer || false,
    acknowledge_probation_policy:
      initialForm?.acknowledge_probation_policy || false,
    acknowledge_bonus_policy:
      initialForm?.acknowledge_bonus_policy || false,
    acknowledge_social_fund_policy:
      initialForm?.acknowledge_social_fund_policy || false,
    acknowledge_social_lead_policy:
      initialForm?.acknowledge_social_lead_policy || false,
    acknowledge_leadership_growth:
      initialForm?.acknowledge_leadership_growth || false,
  });
  const [acknowledgedPolicyIds, setAcknowledgedPolicyIds] = useState<string[]>(
    initialAcknowledgedPolicyIds
  );
  const [savingMode, setSavingMode] = useState<"save" | "submit" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const onboardingCompletion = useMemo(
    () =>
      calculateOnboardingCompletion(
        form,
        acknowledgedPolicyIds.length,
        policies.length
      ),
    [acknowledgedPolicyIds.length, form, policies.length]
  );

  function togglePolicy(policyId: string) {
    setAcknowledgedPolicyIds((prev) =>
      prev.includes(policyId)
        ? prev.filter((value) => value !== policyId)
        : [...prev, policyId]
    );
  }

  async function save(mode: "save" | "submit") {
    setSavingMode(mode);
    setMessage(null);
    try {
      const res = await fetch("/api/me/employee/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          acknowledged_policy_ids: acknowledgedPolicyIds,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save onboarding." });
        return;
      }
      setMessage({
        type: "success",
        text:
          mode === "submit"
            ? "Onboarding submitted for review."
            : "Onboarding draft saved.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSavingMode(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Onboarding</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete your internal JobGenuis onboarding and acknowledge the company
            policies that govern your work.
          </p>
        </div>
        <div className="min-w-[220px] bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Completion
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{onboardingCompletion}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {labelizePeopleValue(employee.onboarding_status)}
          </p>
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900">Personal information</h2>
          <p className="text-sm text-gray-500 mt-1">
            The basics your manager needs to confirm your internal profile and contact details.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Full name</span>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Phone number</span>
            <input
              type="text"
              value={form.phone_number}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone_number: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">WhatsApp number</span>
            <input
              type="text"
              value={form.whatsapp_number}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, whatsapp_number: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Address / location</span>
            <input
              type="text"
              value={form.address_location}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, address_location: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Emergency contact name</span>
            <input
              type="text"
              value={form.emergency_contact_name}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  emergency_contact_name: e.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Emergency contact phone</span>
            <input
              type="text"
              value={form.emergency_contact_phone}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  emergency_contact_phone: e.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Role</span>
            <input
              type="text"
              value={form.role_title}
              onChange={(e) => setForm((prev) => ({ ...prev, role_title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Start date</span>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Supervisor / manager</span>
            <select
              value={form.supervisor_employee_id}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  supervisor_employee_id: e.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Not assigned yet</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Employment status</span>
            <select
              value={form.employment_status}
              onChange={(e) =>
                setForm((prev) => ({
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
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900">Internal acknowledgements</h2>
          <p className="text-sm text-gray-500 mt-1">
            These acknowledgements reflect JobGenuis role expectations, probation, bonus,
            social fund, and leadership philosophy.
          </p>
        </div>

        <div className="space-y-3">
          {REQUIRED_ONBOARDING_ACK_KEYS.map((key) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-4"
            >
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [key]: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700">{ACK_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900">Policy documents</h2>
          <p className="text-sm text-gray-500 mt-1">
            These are editable internal policy texts stored in the system and can be updated
            by management after HR or legal review.
          </p>
        </div>

        <div className="space-y-4">
          {policies.map((policy) => (
            <label
              key={policy.id}
              className="block rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acknowledgedPolicyIds.includes(policy.id)}
                  onChange={() => togglePolicy(policy.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <div>
                  <p className="font-medium text-gray-900">{policy.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {policy.policy_key.replace(/_/g, " ")} · {policy.version_label}
                  </p>
                </div>
              </div>
              <div className="px-4 py-4 text-sm text-gray-700 whitespace-pre-wrap">
                {policy.body}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Signature name</span>
            <input
              type="text"
              value={form.signature_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, signature_name: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Type your full name"
            />
            <p className="text-xs text-gray-400 mt-2">
              Your typed name is recorded as your acknowledgement signature when you submit.
            </p>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={() => save("save")}
              disabled={savingMode !== null}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {savingMode === "save" ? "Saving..." : "Save draft"}
            </button>
            <button
              onClick={() => save("submit")}
              disabled={savingMode !== null}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {savingMode === "submit" ? "Submitting..." : "Submit onboarding"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
