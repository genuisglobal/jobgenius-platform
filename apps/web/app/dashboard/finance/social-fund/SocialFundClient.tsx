"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SOCIAL_EVENT_STATUSES,
  SOCIAL_FUND_EXPENSE_STATUSES,
  labelizePeopleValue,
} from "@/lib/people";
import { formatCurrency } from "@/lib/payroll";

interface EmployeeOption {
  id: string;
  worker: {
    full_name: string;
    email: string | null;
  } | null;
  role_title: string | null;
}

interface SocialFundContribution {
  id: string;
  amount: number;
  contribution_date: string;
  employee: EmployeeOption | null;
  accepted_offer: {
    offer_title: string;
    company_name: string;
  } | null;
}

interface SocialFundExpense {
  id: string;
  expense_title: string;
  amount: number;
  purpose: string | null;
  requested_by_employee_id: string | null;
  social_lead_employee_id: string | null;
  status: string;
  receipt_url: string | null;
  payment_date: string | null;
  notes: string | null;
  requested_by_employee: EmployeeOption | null;
  social_lead_employee: EmployeeOption | null;
}

interface SocialEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  status: string;
  coordinated_by_employee_id: string | null;
  notes: string | null;
  coordinator: EmployeeOption | null;
}

interface SocialFundSummary {
  contributions: SocialFundContribution[];
  expenses: SocialFundExpense[];
  events: SocialEvent[];
  totals: {
    contributed: number;
    spent: number;
    approvedReserved: number;
    balance: number;
  };
}

const EMPTY_EXPENSE_FORM = {
  id: "",
  expense_title: "",
  amount: "",
  purpose: "",
  requested_by_employee_id: "",
  social_lead_employee_id: "",
  status: "proposed",
  receipt_url: "",
  payment_date: "",
  notes: "",
};

const EMPTY_EVENT_FORM = {
  id: "",
  title: "",
  description: "",
  event_date: "",
  status: "planned",
  coordinated_by_employee_id: "",
  notes: "",
};

function getEmployeeLabel(employee: EmployeeOption): string {
  return employee.worker?.full_name || employee.role_title || employee.id;
}

export default function SocialFundClient({
  employees,
  initialSummary,
}: {
  employees: EmployeeOption[];
  initialSummary: SocialFundSummary;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [eventForm, setEventForm] = useState(EMPTY_EVENT_FORM);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const visibleExpenses = useMemo(
    () =>
      summary.expenses.filter((expense) =>
        ["proposed", "approved", "paid"].includes(expense.status)
      ),
    [summary.expenses]
  );

  function startEditExpense(expense: SocialFundExpense) {
    setExpenseForm({
      id: expense.id,
      expense_title: expense.expense_title,
      amount: String(expense.amount || ""),
      purpose: expense.purpose || "",
      requested_by_employee_id: expense.requested_by_employee_id || "",
      social_lead_employee_id: expense.social_lead_employee_id || "",
      status: expense.status,
      receipt_url: expense.receipt_url || "",
      payment_date: expense.payment_date || "",
      notes: expense.notes || "",
    });
    setMessage(null);
  }

  function startEditEvent(event: SocialEvent) {
    setEventForm({
      id: event.id,
      title: event.title,
      description: event.description || "",
      event_date: event.event_date || "",
      status: event.status,
      coordinated_by_employee_id: event.coordinated_by_employee_id || "",
      notes: event.notes || "",
    });
    setMessage(null);
  }

  function resetExpenseForm() {
    setExpenseForm(EMPTY_EXPENSE_FORM);
  }

  function resetEventForm() {
    setEventForm(EMPTY_EVENT_FORM);
  }

  async function handleSaveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingExpense(true);
    setMessage(null);

    try {
      const response = await fetch("/api/finance/social-fund/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...expenseForm,
          id: expenseForm.id || undefined,
          amount: Number(expenseForm.amount) || 0,
          requested_by_employee_id: expenseForm.requested_by_employee_id || null,
          social_lead_employee_id: expenseForm.social_lead_employee_id || null,
          payment_date: expenseForm.payment_date || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save expense.");
      }

      setMessage({ type: "success", text: "Social fund expense saved." });
      resetExpenseForm();
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save expense.",
      });
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleSaveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEvent(true);
    setMessage(null);

    try {
      const response = await fetch("/api/finance/social-fund/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...eventForm,
          id: eventForm.id || undefined,
          coordinated_by_employee_id: eventForm.coordinated_by_employee_id || null,
          event_date: eventForm.event_date || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save social event.");
      }

      setMessage({ type: "success", text: "Social event saved." });
      resetEventForm();
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save social event.",
      });
    } finally {
      setSavingEvent(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Fund</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track contributions from successful offers, approve spending, and coordinate staff events.
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
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total contributed
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {formatCurrency(summary.totals.contributed, "XAF")}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Paid out
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatCurrency(summary.totals.spent, "XAF")}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Reserved approvals
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-2">
            {formatCurrency(summary.totals.approvedReserved, "XAF")}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Available balance
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {formatCurrency(summary.totals.balance, "XAF")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveExpense}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {expenseForm.id ? "Edit expense" : "Record expense"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Social Leads can coordinate, but approval and accounting stay controlled.
              </p>
            </div>
            {expenseForm.id && (
              <button
                type="button"
                onClick={resetExpenseForm}
                className="text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Expense title</span>
              <input
                value={expenseForm.expense_title}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, expense_title: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Amount</span>
              <input
                type="number"
                min="0"
                step="100"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Purpose</span>
            <textarea
              rows={3}
              value={expenseForm.purpose}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, purpose: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Requested by</span>
              <select
                value={expenseForm.requested_by_employee_id}
                onChange={(event) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    requested_by_employee_id: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Optional</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {getEmployeeLabel(employee)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Social Lead</span>
              <select
                value={expenseForm.social_lead_employee_id}
                onChange={(event) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    social_lead_employee_id: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Optional</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {getEmployeeLabel(employee)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <select
                value={expenseForm.status}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {SOCIAL_FUND_EXPENSE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labelizePeopleValue(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Payment date</span>
              <input
                type="date"
                value={expenseForm.payment_date}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, payment_date: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Receipt URL</span>
              <input
                value={expenseForm.receipt_url}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, receipt_url: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              rows={3}
              value={expenseForm.notes}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={savingExpense}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {savingExpense ? "Saving..." : expenseForm.id ? "Update expense" : "Save expense"}
          </button>
        </form>

        <form
          onSubmit={handleSaveEvent}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                {eventForm.id ? "Edit social event" : "Plan social event"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Track upcoming approved activities and who is coordinating them.
              </p>
            </div>
            {eventForm.id && (
              <button
                type="button"
                onClick={resetEventForm}
                className="text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                Clear
              </button>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Event title</span>
            <input
              value={eventForm.title}
              onChange={(event) =>
                setEventForm((prev) => ({ ...prev, title: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <textarea
              rows={3}
              value={eventForm.description}
              onChange={(event) =>
                setEventForm((prev) => ({ ...prev, description: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Event date</span>
              <input
                type="date"
                value={eventForm.event_date}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, event_date: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <select
                value={eventForm.status}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {SOCIAL_EVENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {labelizePeopleValue(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Coordinator</span>
              <select
                value={eventForm.coordinated_by_employee_id}
                onChange={(event) =>
                  setEventForm((prev) => ({
                    ...prev,
                    coordinated_by_employee_id: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Optional</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {getEmployeeLabel(employee)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Notes</span>
            <textarea
              rows={3}
              value={eventForm.notes}
              onChange={(event) =>
                setEventForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={savingEvent}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-60"
          >
            {savingEvent ? "Saving..." : eventForm.id ? "Update event" : "Save event"}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent contributions</h2>
            <p className="text-xs text-gray-500 mt-1">
              Each verified accepted offer adds 20,000 FCFA to the fund.
            </p>
          </div>
          {summary.contributions.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No social fund contributions yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summary.contributions.slice(0, 8).map((contribution) => (
                <div key={contribution.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {contribution.accepted_offer?.offer_title || "Accepted offer"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {contribution.accepted_offer?.company_name || "Unknown company"} /{" "}
                        {contribution.employee?.worker?.full_name || "Unknown employee"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-700">
                        {formatCurrency(contribution.amount, "XAF")}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {contribution.contribution_date}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Expenses and events</h2>
            <p className="text-xs text-gray-500 mt-1">
              Public-facing summaries stay visible to staff while accounting control stays restricted.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {visibleExpenses.slice(0, 6).map((expense) => (
              <div key={expense.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{expense.expense_title}</p>
                  <p className="text-sm text-gray-500">
                    {expense.requested_by_employee?.worker?.full_name || "Unknown requester"}
                    {expense.social_lead_employee?.worker?.full_name
                      ? ` / Social Lead ${expense.social_lead_employee.worker.full_name}`
                      : ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {expense.purpose || "No purpose supplied"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(expense.amount, "XAF")}
                  </span>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      expense.status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : expense.status === "approved"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {labelizePeopleValue(expense.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditExpense(expense)}
                    className="text-sm font-medium text-violet-600 hover:text-violet-700"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {summary.events.slice(0, 6).map((event) => (
              <div key={event.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-500">
                    {event.coordinator?.worker?.full_name || "Coordinator pending"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {event.event_date || "Date pending"} / {event.description || "No description"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {labelizePeopleValue(event.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEditEvent(event)}
                    className="text-sm font-medium text-violet-600 hover:text-violet-700"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {visibleExpenses.length === 0 && summary.events.length === 0 && (
              <div className="px-5 py-10 text-sm text-gray-400 text-center">
                No expenses or social events recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
