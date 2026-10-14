"use client";

import { useEffect, useMemo, useState } from "react";

interface Installment {
  amount: string;
  proposedDate: string;
}

interface FlexScheduleItem {
  installment_number: number;
  amount: number;
  proposed_date: string;
}

interface RegistrationFlexRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_installment_count: number | null;
  requested_window_days: number | null;
  requested_note: string;
  requested_schedule?: FlexScheduleItem[] | null;
  approved_max_installments: number | null;
  approved_window_days: number | null;
  admin_note: string | null;
  reviewed_at: string | null;
}

interface InstallmentPlanStepProps {
  registrationFee: number;
  onContinue: () => void;
  onBack: () => void;
  showBackButton?: boolean;
}

const DEFAULT_MAX_INSTALLMENTS = 3;
const DEFAULT_WINDOW_DAYS = 31;
const MAX_FLEX_INSTALLMENTS = 12;
const MAX_FLEX_WINDOW_DAYS = 365;

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function plusDays(base: Date, days: number) {
  const out = new Date(base);
  out.setDate(out.getDate() + days);
  return out;
}

function formatDateInput(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatCurrency(val: number) {
  return val.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function parseInputDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function buildInstallmentDraft(
  totalFee: number,
  count: number,
  paymentWindowDays: number,
  today: Date
): Installment[] {
  const safeCount = Math.max(1, count);
  const base = Math.floor(totalFee / safeCount);
  const remainder = totalFee - base * safeCount;
  const intervalDays =
    safeCount <= 1
      ? 0
      : Math.max(1, Math.floor(paymentWindowDays / (safeCount - 1)));

  return Array.from({ length: safeCount }, (_, i) => {
    const dueDate = plusDays(today, intervalDays * i);
    return {
      amount: i === safeCount - 1 ? String(base + remainder) : String(base),
      proposedDate: formatDateInput(dueDate),
    };
  });
}

export default function InstallmentPlanStep({
  registrationFee,
  onContinue,
  onBack,
  showBackButton = true,
}: InstallmentPlanStepProps) {
  const totalFee = registrationFee;
  const today = useMemo(() => startOfToday(), []);

  const [count, setCount] = useState<number>(1);
  const [installments, setInstallments] = useState<Installment[]>([
    { amount: String(totalFee), proposedDate: formatDateInput(today) },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flexLoading, setFlexLoading] = useState(true);
  const [flexFeatureAvailable, setFlexFeatureAvailable] = useState(true);
  const [flexRequest, setFlexRequest] = useState<RegistrationFlexRequest | null>(
    null
  );
  const [maxInstallments, setMaxInstallments] = useState(
    DEFAULT_MAX_INSTALLMENTS
  );
  const [paymentWindowDays, setPaymentWindowDays] = useState(DEFAULT_WINDOW_DAYS);

  const [flexRequestedCount, setFlexRequestedCount] = useState(4);
  const [flexRequestedWindowDays, setFlexRequestedWindowDays] = useState(60);
  const [flexRequestedInstallments, setFlexRequestedInstallments] = useState<
    Installment[]
  >(() => buildInstallmentDraft(totalFee, 4, 60, today));
  const [flexRequestNote, setFlexRequestNote] = useState("");
  const [flexRequestSaving, setFlexRequestSaving] = useState(false);
  const [flexRequestError, setFlexRequestError] = useState<string | null>(null);
  const [flexRequestSuccess, setFlexRequestSuccess] = useState<string | null>(
    null
  );
  const [showFlexRequestForm, setShowFlexRequestForm] = useState(false);

  const maxDate = useMemo(
    () => plusDays(today, paymentWindowDays),
    [today, paymentWindowDays]
  );
  const canSubmitFlexRequest =
    !flexLoading &&
    flexFeatureAvailable &&
    (flexRequest?.status === "rejected" || flexRequest == null);

  const installmentOptions = useMemo(
    () => Array.from({ length: maxInstallments }, (_, index) => index + 1),
    [maxInstallments]
  );

  useEffect(() => {
    let cancelled = false;

    const loadFlexRequest = async () => {
      setFlexLoading(true);
      try {
        const res = await fetch("/api/portal/billing/registration-flex", {
          method: "GET",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          if (data?.unavailable) {
            setFlexFeatureAvailable(false);
          }
          return;
        }

        if (data?.unavailable) {
          setFlexFeatureAvailable(false);
          setFlexRequest(null);
          return;
        }

        setFlexFeatureAvailable(true);
        const latest = (data?.request ?? null) as RegistrationFlexRequest | null;
        if (cancelled) return;

        setFlexRequest(latest);
        if (latest?.status === "approved") {
          setMaxInstallments(
            latest.approved_max_installments ?? DEFAULT_MAX_INSTALLMENTS
          );
          setPaymentWindowDays(
            latest.approved_window_days ?? DEFAULT_WINDOW_DAYS
          );
        } else {
          setMaxInstallments(DEFAULT_MAX_INSTALLMENTS);
          setPaymentWindowDays(DEFAULT_WINDOW_DAYS);
        }
      } catch {
        // No-op: onboarding should still work with default terms.
      } finally {
        if (!cancelled) {
          setFlexLoading(false);
        }
      }
    };

    loadFlexRequest();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (count > maxInstallments) {
      setCount(maxInstallments);
    }
  }, [count, maxInstallments]);

  useEffect(() => {
    setInstallments(buildInstallmentDraft(totalFee, count, paymentWindowDays, today));
  }, [count, paymentWindowDays, today, totalFee]);

  useEffect(() => {
    setFlexRequestedInstallments(
      buildInstallmentDraft(totalFee, flexRequestedCount, flexRequestedWindowDays, today)
    );
  }, [flexRequestedCount, flexRequestedWindowDays, today, totalFee]);

  const updateInstallment = (
    index: number,
    field: keyof Installment,
    value: string
  ) => {
    setInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );
  };

  const updateFlexRequestedInstallment = (
    index: number,
    field: keyof Installment,
    value: string
  ) => {
    setFlexRequestedInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );
  };

  const totalEntered = installments.reduce(
    (sum, inst) => sum + (parseFloat(inst.amount) || 0),
    0
  );
  const totalMatch = Math.abs(totalEntered - totalFee) < 0.01;

  const allDatesValid = installments.every((inst) => {
    if (!inst.proposedDate) return false;
    const d = parseInputDate(inst.proposedDate);
    if (!d) return false;
    return d >= today && d <= maxDate;
  });

  const canSubmit =
    totalMatch &&
    allDatesValid &&
    installments.every((inst) => inst.amount && parseFloat(inst.amount) > 0);

  const flexMaxDate = useMemo(
    () => plusDays(today, flexRequestedWindowDays),
    [today, flexRequestedWindowDays]
  );
  const flexTotalEntered = flexRequestedInstallments.reduce(
    (sum, inst) => sum + (parseFloat(inst.amount) || 0),
    0
  );
  const flexTotalMatch = Math.abs(flexTotalEntered - totalFee) < 0.01;
  const flexAllDatesValid = flexRequestedInstallments.every((inst) => {
    if (!inst.proposedDate) return false;
    const d = parseInputDate(inst.proposedDate);
    if (!d) return false;
    return d >= today && d <= flexMaxDate;
  });
  const flexAllAmountsValid = flexRequestedInstallments.every(
    (inst) => inst.amount && parseFloat(inst.amount) > 0
  );

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/billing/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          installments: installments.map((inst) => ({
            amount: parseFloat(inst.amount),
            proposedDate: inst.proposedDate,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save installment plan. Please try again.");
        return;
      }

      onContinue();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const submitFlexRequest = async () => {
    const note = flexRequestNote.trim();
    if (note.length < 15) {
      setFlexRequestError("Please include at least 15 characters for your reason.");
      return;
    }
    if (!flexAllAmountsValid) {
      setFlexRequestError(
        "Each requested installment must include a valid amount greater than 0."
      );
      return;
    }
    if (!flexAllDatesValid) {
      setFlexRequestError(
        `Requested payment dates must be within ${flexRequestedWindowDays} days from today.`
      );
      return;
    }
    if (!flexTotalMatch) {
      setFlexRequestError(
        `Requested installment amounts must add up to ${formatCurrency(totalFee)}.`
      );
      return;
    }

    setFlexRequestSaving(true);
    setFlexRequestError(null);
    setFlexRequestSuccess(null);
    try {
      const res = await fetch("/api/portal/billing/registration-flex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_installment_count: flexRequestedCount,
          requested_window_days: flexRequestedWindowDays,
          requested_note: note,
          requested_schedule: flexRequestedInstallments.map((inst) => ({
            amount: parseFloat(inst.amount),
            proposed_date: inst.proposedDate,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.unavailable) {
          setFlexFeatureAvailable(false);
          setShowFlexRequestForm(false);
        }
        setFlexRequestError(
          data.error || "Failed to submit flexible registration request."
        );
        return;
      }

      setFlexRequest(data.request ?? null);
      setFlexRequestSuccess(
        "Flexible registration request submitted. An admin will review it."
      );
      setFlexRequestNote("");
      setShowFlexRequestForm(false);
    } catch {
      setFlexRequestError("Network error while submitting request.");
    } finally {
      setFlexRequestSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payment Schedule</h2>
        <p className="text-gray-600 mt-1 text-sm">
          Your registration fee is <strong>{formatCurrency(totalFee)}</strong>.
          Choose how you want to pay. Your current limit is up to{" "}
          <strong>{maxInstallments}</strong> installments within{" "}
          <strong>{paymentWindowDays}</strong> days from today (
          {maxDate.toLocaleDateString("en-US")}).
        </p>
      </div>

      {flexLoading && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Loading flexible registration status...
        </div>
      )}

      {!flexLoading && flexRequest?.status === "pending" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Your flexible registration request is pending admin review. You can
          continue with standard terms now, or wait for approval.
        </div>
      )}

      {!flexLoading && flexRequest?.status === "approved" && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Flexible registration approved: up to{" "}
          <strong>{flexRequest.approved_max_installments ?? maxInstallments}</strong>{" "}
          installments within{" "}
          <strong>{flexRequest.approved_window_days ?? paymentWindowDays}</strong>{" "}
          days.
          {flexRequest.admin_note ? ` Admin note: ${flexRequest.admin_note}` : ""}
        </div>
      )}

      {!flexLoading && flexRequest?.status === "rejected" && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Your last flexible registration request was not approved.
          {flexRequest.admin_note ? ` Admin note: ${flexRequest.admin_note}` : ""}
        </div>
      )}

      {!flexLoading && !flexFeatureAvailable && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Registration exception requests are temporarily unavailable.
        </div>
      )}

      {canSubmitFlexRequest && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Need a registration payment exception?
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Flexible terms are for special cases and require admin approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowFlexRequestForm((prev) => !prev);
                setFlexRequestError(null);
                setFlexRequestSuccess(null);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-md bg-white hover:bg-gray-100"
            >
              {showFlexRequestForm
                ? "Hide Exception Form"
                : flexRequest?.status === "rejected"
                ? "Request Again"
                : "Request Exception"}
            </button>
          </div>

          {showFlexRequestForm && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Requested installments
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={MAX_FLEX_INSTALLMENTS}
                    value={flexRequestedCount}
                    onChange={(event) =>
                      setFlexRequestedCount(
                        Math.max(
                          1,
                          Math.min(MAX_FLEX_INSTALLMENTS, Number(event.target.value) || 1)
                        )
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Requested window (days)
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={MAX_FLEX_WINDOW_DAYS}
                    value={flexRequestedWindowDays}
                    onChange={(event) =>
                      setFlexRequestedWindowDays(
                        Math.max(
                          7,
                          Math.min(MAX_FLEX_WINDOW_DAYS, Number(event.target.value) || 7)
                        )
                      )
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  />
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-700">
                  Proposed payment dates and amounts
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Keep total at {formatCurrency(totalFee)} and set dates no later than{" "}
                  {formatDateInput(flexMaxDate)}.
                </p>
                <div className="mt-2 space-y-2">
                  {flexRequestedInstallments.map((inst, index) => {
                    const dateObj = inst.proposedDate
                      ? parseInputDate(inst.proposedDate)
                      : null;
                    const dateInvalid = dateObj
                      ? dateObj < today || dateObj > flexMaxDate
                      : true;

                    return (
                      <div
                        key={`flex-inst-${index}`}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                      >
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                            Installment {index + 1} amount
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={inst.amount}
                            onChange={(event) =>
                              updateFlexRequestedInstallment(
                                index,
                                "amount",
                                event.target.value
                              )
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                            Installment {index + 1} date
                          </label>
                          <input
                            type="date"
                            value={inst.proposedDate}
                            min={formatDateInput(today)}
                            max={formatDateInput(flexMaxDate)}
                            onChange={(event) =>
                              updateFlexRequestedInstallment(
                                index,
                                "proposedDate",
                                event.target.value
                              )
                            }
                            className={`w-full border rounded-lg px-3 py-2 text-sm ${
                              dateInvalid
                                ? "border-red-400 bg-red-50 text-gray-900"
                                : "border-gray-300 bg-white text-gray-900"
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className={`mt-2 rounded-lg border px-3 py-2 text-xs flex items-center justify-between ${
                    flexTotalMatch
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  <span>
                    Total proposed:{" "}
                    <strong>{formatCurrency(flexTotalEntered)}</strong>
                  </span>
                  {flexTotalMatch ? (
                    <span>Matches registration fee</span>
                  ) : (
                    <span>
                      Must equal {formatCurrency(totalFee)} (diff{" "}
                      {formatCurrency(Math.abs(flexTotalEntered - totalFee))})
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Why do you need this exception?
                </label>
                <textarea
                  rows={3}
                  value={flexRequestNote}
                  onChange={(event) => setFlexRequestNote(event.target.value)}
                  placeholder="Explain your situation so admins can review your request."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 resize-none"
                />
              </div>

              {flexRequestError && (
                <p className="mt-2 text-xs text-red-700">{flexRequestError}</p>
              )}
              {flexRequestSuccess && (
                <p className="mt-2 text-xs text-green-700">{flexRequestSuccess}</p>
              )}

              <button
                type="button"
                onClick={submitFlexRequest}
                disabled={flexRequestSaving}
                className="mt-3 px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {flexRequestSaving ? "Submitting..." : "Submit Exception Request"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Number of installments
        </label>
        <select
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="w-full border border-gray-400 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {installmentOptions.map((value) => (
            <option key={value} value={value}>
              {value} {value === 1 ? "Payment" : "Payments"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 mb-4">
        {installments.map((inst, index) => {
          const dateObj = inst.proposedDate
            ? parseInputDate(inst.proposedDate)
            : null;
          const dateInvalid = dateObj ? dateObj < today || dateObj > maxDate : true;

          return (
            <div
              key={index}
              className="bg-gray-50 rounded-lg p-4 border border-gray-200"
            >
              <p className="text-sm font-semibold text-gray-800 mb-3">
                Installment {index + 1}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={inst.amount}
                    onChange={(event) =>
                      updateInstallment(index, "amount", event.target.value)
                    }
                    className="w-full border border-gray-400 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Proposed Date
                  </label>
                  <input
                    type="date"
                    value={inst.proposedDate}
                    min={formatDateInput(today)}
                    max={formatDateInput(maxDate)}
                    onChange={(event) =>
                      updateInstallment(index, "proposedDate", event.target.value)
                    }
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                      dateInvalid
                        ? "border-red-400 bg-red-50 text-gray-900"
                        : "border-gray-400 bg-white text-gray-900"
                    }`}
                  />
                  {dateInvalid && (
                    <p className="text-xs text-red-500 mt-1">
                      Must be within {paymentWindowDays} days
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`rounded-lg p-3 mb-4 text-sm flex items-center justify-between ${
          totalMatch
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}
      >
        <span>
          Total: <strong>{formatCurrency(totalEntered)}</strong>
        </span>
        {!totalMatch && (
          <span className="text-xs">
            Must equal {formatCurrency(totalFee)} (diff:{" "}
            {formatCurrency(Math.abs(totalEntered - totalFee))})
          </span>
        )}
        {totalMatch && <span className="text-xs font-medium">OK: Amounts match</span>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {showBackButton && (
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-400 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canSubmit || saving}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Confirm Payment Plan"}
        </button>
      </div>
    </div>
  );
}
