// ============================================================
// Placement fee (commission) computation — Client Collaboration Agreement §6/§7.
//
//   fee  = 5% of (base salary + guaranteed cash compensation)
//   due  = 2 months after the employment START date
//   ext  = 3 months after the employment START date (approved extension)
//
// When the start date is unknown, the offer-acceptance date is used as the
// anchor. Extracted as a pure function so the money math is unit-tested.
// ============================================================

export const PLACEMENT_FEE_RATE = 0.05;

export interface PlacementFee {
  commissionAmount: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  /** ISO date (YYYY-MM-DD). */
  extendedDueDate: string;
}

export function computePlacementFee(input: {
  baseSalary: number;
  guaranteedCompensation?: number | null;
  /** Employment start date (preferred anchor). */
  startDate?: string | null;
  /** Offer-acceptance date (fallback anchor). */
  offerAcceptedAt: string;
}): PlacementFee {
  const guaranteed = Number(input.guaranteedCompensation) || 0;
  const commissionAmount = (Number(input.baseSalary) + guaranteed) * PLACEMENT_FEE_RATE;

  const anchor = new Date(input.startDate ?? input.offerAcceptedAt);
  const dueDate = new Date(anchor);
  dueDate.setMonth(dueDate.getMonth() + 2);
  const extendedDueDate = new Date(anchor);
  extendedDueDate.setMonth(extendedDueDate.getMonth() + 3);

  return {
    commissionAmount,
    dueDate: dueDate.toISOString().split("T")[0],
    extendedDueDate: extendedDueDate.toISOString().split("T")[0],
  };
}
