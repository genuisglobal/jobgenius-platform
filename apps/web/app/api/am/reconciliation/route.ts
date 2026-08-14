import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import {
  buildReconciliation,
  loadReconciliation,
} from "@/lib/activity-reconciliation";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 92;

function isoDate(value: string | null): string | null {
  return value && ISO_DATE.test(value.trim()) ? value.trim() : null;
}

function spanDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * GET /api/am/reconciliation?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * How much of each AM's typed Activity Sheet the platform can corroborate
 * from its own records. Admin-only, and deliberately so: a low coverage
 * number is a question, not a finding, and it should be read by someone
 * who can ask the question rather than circulated as a verdict.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isAdminRole(auth.user.role)) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const defaults = getRangeBounds(normalizeSheetDate(watDate()), "month");

  let start = isoDate(searchParams.get("start")) ?? defaults.start;
  let end = isoDate(searchParams.get("end")) ?? defaults.end;
  if (start > end) [start, end] = [end, start];
  if (spanDays(start, end) > MAX_SPAN_DAYS) {
    start = shift(end, -(MAX_SPAN_DAYS - 1));
  }

  try {
    const { typedDays, recordedDays } = await loadReconciliation(start, end);
    const { managers, totals } = buildReconciliation(typedDays, recordedDays);

    return NextResponse.json({
      start,
      end,
      days: spanDays(start, end),
      managers,
      totals,
    });
  } catch (error) {
    console.error("[reconciliation:get]", error);
    return NextResponse.json(
      { error: "Failed to load reconciliation data." },
      { status: 500 }
    );
  }
}
