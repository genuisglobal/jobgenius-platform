"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCEPTED_OFFER_VERIFICATION_STATUSES,
  BONUS_PAYMENT_STATUSES,
  BONUS_RECORD_STATUSES,
  labelizePeopleValue,
} from "@/lib/people";
import { formatCurrency } from "@/lib/payroll";

interface EmployeeOption {
  id: string;
  worker: {
    full_name: string;
    email: string | null;
  } | null;
  account_manager: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  role_title: string | null;
}

interface JobSeekerOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface AcceptedOfferRecord {
  id: string;
  employee_id: string | null;
  job_seeker_id: string | null;
  offer_title: string;
  company_name: string;
  offer_accepted_date: string | null;
  background_check_completed_date: string | null;
  client_start_date: string | null;
  start_month: string | null;
  assigned_account_manager_id: string | null;
  application_submitted_by_account_manager_id: string | null;
  interview_managed_by_account_manager_id: string | null;
  verification_status: string;
  evidence_notes: string | null;
  employee: EmployeeOption | null;
  job_seeker: JobSeekerOption | null;
}

interface BonusRecord {
  id: string;
  employee_id: string;
  accepted_offer_record_id: string;
  bonus_eligibility_status: string;
  bonus_amount: number;
  payment_month: string | null;
  payment_status: string;
  approval_status: string;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  employee: EmployeeOption | null;
  accepted_offer: AcceptedOfferRecord | null;
}

type BonusDraft = {
  approval_status: string;
  payment_status: string;
  payment_month: string;
  notes: string;
};

const EMPTY_FORM = {
  id: "",
  employee_id: "",
  job_seeker_id: "",
  offer_title: "",
  company_name: "",
  offer_accepted_date: "",
  background_check_completed_date: "",
  client_start_date: "",
  start_month: "",
  verification_status: "pending_verification",
  evidence_notes: "",
};

function monthInputFromDate(value: string | null): string {
  return value ? value.slice(0, 7) : "";
}

function getEmployeeLabel(employee: EmployeeOption): string {
  return (
    employee.worker?.full_name ||
    employee.role_title ||
    employee.account_manager?.name ||
    employee.id
  );
}

export default function BonusesClient({
  employees,
  seekers,
  initialOffers,
  initialBonuses,
}: {
  employees: EmployeeOption[];
  seekers: JobSeekerOption[];
  initialOffers: AcceptedOfferRecord[];
  initialBonuses: BonusRecord[];
}) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [bonuses, setBonuses] = useState(initialBonuses);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingOffer, setSavingOffer] = useState(false);
  const [savingBonusId, setSavingBonusId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [bonusDrafts, setBonusDrafts] = useState<Record<string, BonusDraft>>({});

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  useEffect(() => {
    setBonuses(initialBonuses);
  }, [initialBonuses]);

  useEffect(() => {
    const drafts: Record<string, BonusDraft> = {};
    for (const bonus of initialBonuses) {
      drafts[bonus.id] = {
        approval_status: bonus.approval_status,
        payment_status: bonus.payment_status,
        payment_month: monthInputFromDate(bonus.payment_month),
        notes: bonus.notes || "",
      };
    }
    setBonusDrafts(drafts);
  }, [initialBonuses]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === form.employee_id) ?? null,
    [employees, form.employee_id]
  );

  const pendingBonuses = useMemo(
    () =>
      bonuses.filter(
        (bonus) =>
          bonus.approval_status === "pending_verification" ||
          bonus.approval_status === "eligible" ||
          (bonus.payment_status !== "paid" && bonus.payment_status !== "cancelled")
      ),
    [bonuses]
  );

  function startEditOffer(offer: AcceptedOfferRecord) {
    setForm({
      id: offer.id,
      employee_id: offer.employee_id || "",
      job_seeker_id: offer.job_seeker_id || "",
      offer_title: offer.offer_title,
      company_name: offer.company_name,
      offer_accepted_date: offer.offer_accepted_date || "",
      background_check_completed_date: offer.background_check_completed_date || "",
      client_start_date: offer.client_start_date || "",
      start_month: monthInputFromDate(offer.start_month),
      verification_status: offer.verification_status,
      evidence_notes: offer.evidence_notes || "",
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleSaveOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingOffer(true);
    setMessage(null);

    try {
      const response = await fetch("/api/finance/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: form.id || undefined,
          start_month: form.start_month ? `${form.start_month}-01` : null,
          job_seeker_id: form.job_seeker_id || null,
          assigned_account_manager_id: selectedEmployee?.account_manager?.id || null,
          application_submitted_by_account_manager_id:
            selectedEmployee?.account_manager?.id || null,
          interview_managed_by_account_manager_id:
            selectedEmployee?.account_manager?.id || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save accepted offer.");
      }

      setMessage({
        type: "success",
        text: payload.ready_for_bonus
          ? "Accepted offer saved and moved into the bonus workflow."
          : "Accepted offer saved.",
      });
      resetForm();
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save accepted offer.",
      });
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleSaveBonus(bonusId: string) {
    const draft = bonusDrafts[bonusId];
    if (!draft) return;

    setSavingBonusId(bonusId);
    setMessage(null);
    try {
      const response = await fetch("/api/finance/bonuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bonusId,
          approval_status: draft.approval_status,
          payment_status: draft.payment_status,
          payment_month: draft.payment_month ? `${draft.payment_month}-01` : null,
          notes: draft.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update bonus record.");
      }

      setMessage({ type: "success", text: "Bonus record updated." });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Failed to update bonus record.",
      });
    } finally {
      setSavingBonusId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonus Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Verify accepted offers, create bonus records automatically, and manage payouts.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          New accepted offer
        </button>
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

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <form
          onSubmit={handleSaveOffer}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <div>
            <h2 className="font-semibold text-gray-900">
              {form.id ? "Edit accepted offer" : "Record accepted offer"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Verified offers create the 30,000 FCFA bonus record and 20,000 FCFA social fund contribution.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Employee</span>
            <select
              value={form.employee_id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, employee_id: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {getEmployeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Jobseeker</span>
            <select
              value={form.job_seeker_id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, job_seeker_id: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Optional</option>
              {seekers.map((seeker) => (
                <option key={seeker.id} value={seeker.id}>
                  {seeker.full_name || seeker.email || seeker.id}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Offer title</span>
              <input
                value={form.offer_title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, offer_title: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Company</span>
              <input
                value={form.company_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, company_name: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Offer accepted</span>
              <input
                type="date"
                value={form.offer_accepted_date}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, offer_accepted_date: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Background check done</span>
              <input
                type="date"
                value={form.background_check_completed_date}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    background_check_completed_date: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Client start date</span>
              <input
                type="date"
                value={form.client_start_date}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, client_start_date: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Start month</span>
              <input
                type="month"
                value={form.start_month}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, start_month: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Verification status</span>
            <select
              value={form.verification_status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, verification_status: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {ACCEPTED_OFFER_VERIFICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelizePeopleValue(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Evidence / notes</span>
            <textarea
              value={form.evidence_notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, evidence_notes: event.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Verification notes, offer evidence, ownership clarification."
            />
          </label>

          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600">
            Bonus owner defaults to the employee&apos;s linked account manager. Use the employee profile link if you need to change the assigned AM first.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingOffer}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
            >
              {savingOffer ? "Saving..." : form.id ? "Update offer" : "Save offer"}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Accepted offers</h2>
              <p className="text-xs text-gray-500 mt-1">
                Verified + background check + start month/date moves the record into the bonus queue.
              </p>
            </div>
            {offers.length === 0 ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">
                No accepted offers recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {offers.map((offer) => (
                  <div key={offer.id} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {offer.offer_title} / {offer.company_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {offer.employee?.worker?.full_name || "Unknown employee"}
                        {offer.job_seeker?.full_name
                          ? ` / ${offer.job_seeker.full_name}`
                          : ""}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Accepted {offer.offer_accepted_date || "pending"} / Start{" "}
                        {offer.start_month || offer.client_start_date || "pending"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          offer.verification_status === "verified"
                            ? "bg-emerald-100 text-emerald-700"
                            : offer.verification_status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {labelizePeopleValue(offer.verification_status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditOffer(offer)}
                        className="text-sm font-medium text-violet-600 hover:text-violet-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Bonus approval queue</h2>
              <p className="text-xs text-gray-500 mt-1">
                Approve, dispute, or mark payouts for the derived 30,000 FCFA employee bonus.
              </p>
            </div>
            {pendingBonuses.length === 0 ? (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">
                No bonus records are pending right now.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingBonuses.map((bonus) => {
                  const draft = bonusDrafts[bonus.id] || {
                    approval_status: bonus.approval_status,
                    payment_status: bonus.payment_status,
                    payment_month: monthInputFromDate(bonus.payment_month),
                    notes: bonus.notes || "",
                  };

                  return (
                    <div key={bonus.id} className="px-5 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {bonus.employee?.worker?.full_name || "Unknown employee"}
                          </p>
                          <p className="text-sm text-gray-500">
                            {bonus.accepted_offer?.offer_title || "Accepted offer"} /{" "}
                            {bonus.accepted_offer?.company_name || "Unknown company"}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatCurrency(bonus.bonus_amount, "XAF")} / Pay month{" "}
                            {bonus.payment_month || "pending"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {labelizePeopleValue(bonus.approval_status)}
                          </span>
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                            {labelizePeopleValue(bonus.payment_status)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <label className="block">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Approval
                          </span>
                          <select
                            value={draft.approval_status}
                            onChange={(event) =>
                              setBonusDrafts((prev) => ({
                                ...prev,
                                [bonus.id]: {
                                  ...draft,
                                  approval_status: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            {BONUS_RECORD_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {labelizePeopleValue(status)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Payment
                          </span>
                          <select
                            value={draft.payment_status}
                            onChange={(event) =>
                              setBonusDrafts((prev) => ({
                                ...prev,
                                [bonus.id]: {
                                  ...draft,
                                  payment_status: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            {BONUS_PAYMENT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {labelizePeopleValue(status)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Payment month
                          </span>
                          <input
                            type="month"
                            value={draft.payment_month}
                            onChange={(event) =>
                              setBonusDrafts((prev) => ({
                                ...prev,
                                [bonus.id]: {
                                  ...draft,
                                  payment_month: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </label>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => handleSaveBonus(bonus.id)}
                            disabled={savingBonusId === bonus.id}
                            className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-60"
                          >
                            {savingBonusId === bonus.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>

                      <label className="block">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Notes
                        </span>
                        <textarea
                          value={draft.notes}
                          onChange={(event) =>
                            setBonusDrafts((prev) => ({
                              ...prev,
                              [bonus.id]: {
                                ...draft,
                                notes: event.target.value,
                              },
                            }))
                          }
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Approval notes, dispute details, or payment confirmation."
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
