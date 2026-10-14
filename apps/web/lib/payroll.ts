// ============================================================
// Staff Payroll — shared types + math (migration 075)
// Pure module (no server imports) so it is safe to import from
// both server and client components. Storage/DB helpers that need
// the service-role client live in lib/payroll-storage.ts.
// Records-only: no payment rail, no statutory tax engine.
// ============================================================

export const PAYROLL_BUCKET = "payroll-documents";

export type EmploymentType = "full_time" | "part_time" | "contractor";
export type WorkerStatus = "active" | "on_leave" | "terminated";
export type PayFrequency = "monthly" | "biweekly" | "weekly";
export type PayComponentKind = "earning" | "deduction";
export type PayComponentCategory =
  | "base_salary"
  | "commission"
  | "bonus"
  | "allowance"
  | "tax"
  | "benefit"
  | "other";
export type PayComponentAmountType =
  | "fixed"
  | "percent_of_base"
  | "percent_of_gross";
export type EmploymentContractType =
  | "offer_letter"
  | "employment_agreement"
  | "amendment";
export type EmploymentContractStatus =
  | "draft"
  | "sent"
  | "signed"
  | "active"
  | "terminated";

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  "full_time",
  "part_time",
  "contractor",
];
export const WORKER_STATUSES: WorkerStatus[] = [
  "active",
  "on_leave",
  "terminated",
];
export const PAY_FREQUENCIES: PayFrequency[] = ["monthly", "biweekly", "weekly"];
export const PAY_COMPONENT_KINDS: PayComponentKind[] = ["earning", "deduction"];
export const PAY_COMPONENT_CATEGORIES: PayComponentCategory[] = [
  "base_salary",
  "commission",
  "bonus",
  "allowance",
  "tax",
  "benefit",
  "other",
];
export const PAY_COMPONENT_AMOUNT_TYPES: PayComponentAmountType[] = [
  "fixed",
  "percent_of_base",
  "percent_of_gross",
];
export const EMPLOYMENT_CONTRACT_TYPES: EmploymentContractType[] = [
  "offer_letter",
  "employment_agreement",
  "amendment",
];

export interface PayrollWorker {
  id: string;
  account_manager_id: string | null;
  full_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  employment_type: EmploymentType;
  status: WorkerStatus;
  start_date: string | null;
  end_date: string | null;
  base_salary: number;
  pay_frequency: PayFrequency;
  currency: string;
  placement_commission_rate: number;
  payout_details: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerPayComponent {
  id: string;
  worker_id: string;
  kind: PayComponentKind;
  category: PayComponentCategory;
  label: string;
  amount_type: PayComponentAmountType;
  value: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmploymentContract {
  id: string;
  worker_id: string;
  contract_type: EmploymentContractType;
  title: string;
  contract_html: string | null;
  base_salary: number | null;
  commission_terms: string | null;
  effective_date: string | null;
  end_date: string | null;
  status: EmploymentContractStatus;
  signed_at: string | null;
  signed_ip: string | null;
  pdf_storage_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PayPeriodStatus = "draft" | "finalized" | "paid";
export type PayslipStatus = "draft" | "issued" | "paid";

export interface PayPeriod {
  id: string;
  label: string;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  status: PayPeriodStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payslip {
  id: string;
  pay_period_id: string;
  worker_id: string;
  contract_id: string | null;
  gross_earnings: number;
  total_deductions: number;
  net_pay: number;
  currency: string;
  status: PayslipStatus;
  issued_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  proof_storage_path: string | null;
  pdf_storage_path: string | null;
  acknowledged_at: string | null;
  acknowledged_ip: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayslipLineItem {
  kind: PayComponentKind;
  category: PayComponentCategory;
  label: string;
  amount: number;
}

export interface PayslipLineItemRow extends PayslipLineItem {
  id: string;
  payslip_id: string;
  created_at: string;
}

export interface PayslipTotals {
  gross: number;
  deductions: number;
  net: number;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Resolve a component's monetary amount.
 * - fixed:            value is a currency amount
 * - percent_of_base:  value is a percent of `base` (e.g. 12.5 => 12.5%)
 * - percent_of_gross: value is a percent of `gross`
 */
export function resolveComponentAmount(
  component: Pick<WorkerPayComponent, "amount_type" | "value">,
  base: number,
  gross: number
): number {
  const value = Number(component.value) || 0;
  switch (component.amount_type) {
    case "percent_of_base":
      return roundCurrency((base * value) / 100);
    case "percent_of_gross":
      return roundCurrency((gross * value) / 100);
    case "fixed":
    default:
      return roundCurrency(value);
  }
}

/**
 * gross = Σ earnings, deductions = Σ deductions, net = gross − deductions.
 */
export function computePayslipTotals(
  lineItems: Pick<PayslipLineItem, "kind" | "amount">[]
): PayslipTotals {
  let gross = 0;
  let deductions = 0;
  for (const item of lineItems) {
    const amount = Number(item.amount) || 0;
    if (item.kind === "earning") gross += amount;
    else deductions += amount;
  }
  gross = roundCurrency(gross);
  deductions = roundCurrency(deductions);
  return { gross, deductions, net: roundCurrency(gross - deductions) };
}

/**
 * Seed draft payslip line items from a worker's base salary + active
 * recurring components. Two-pass so percent_of_gross deductions resolve
 * against the finalized gross. (Phase 2 payslip generation uses this.)
 */
export function buildPayslipLineItemsFromComponents(
  worker: Pick<PayrollWorker, "base_salary">,
  components: WorkerPayComponent[]
): PayslipLineItem[] {
  const base = roundCurrency(Number(worker.base_salary) || 0);
  const active = components.filter((c) => c.active);
  const earnings = active.filter((c) => c.kind === "earning");
  const deductions = active.filter((c) => c.kind === "deduction");

  const baseLine: PayslipLineItem = {
    kind: "earning",
    category: "base_salary",
    label: "Base salary",
    amount: base,
  };

  // Pass 1: earnings (percent resolves against base; gross not yet known).
  const earningLines: PayslipLineItem[] = earnings.map((c) => ({
    kind: "earning",
    category: c.category,
    label: c.label,
    amount: resolveComponentAmount(c, base, base),
  }));

  const gross = roundCurrency(
    base + earningLines.reduce((sum, l) => sum + l.amount, 0)
  );

  // Pass 2: deductions (percent_of_gross resolves against finalized gross).
  const deductionLines: PayslipLineItem[] = deductions.map((c) => ({
    kind: "deduction",
    category: c.category,
    label: c.label,
    amount: resolveComponentAmount(c, base, gross),
  }));

  return [baseLine, ...earningLines, ...deductionLines];
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return (Number(amount) || 0).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}
