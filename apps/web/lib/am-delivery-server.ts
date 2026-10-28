import { ACTIVITY_METRICS } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { deliveryEntry, type DeliveryAssignment, type DeliveryEntry } from "@/lib/am-weekly-delivery";
import { supabaseServer } from "@/lib/supabase/server";

const COLUMNS = ["entry_date", "job_seeker_id", "account_manager_id", ...ACTIVITY_METRICS].join(", ");

async function entriesBetween(start: string, end: string): Promise<DeliveryEntry[]> {
  const result: DeliveryEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseServer.from("activity_sheet_entries").select(COLUMNS)
      .gte("entry_date", start).lte("entry_date", end)
      .order("entry_date").order("job_seeker_id").range(offset, offset + 999);
    if (error) throw new Error(`Could not load activity sheet: ${error.message}`);
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    result.push(...batch.map(deliveryEntry));
    if (batch.length < 1000) return result;
  }
}

export async function loadAmDeliveryData(currentStart: string, currentEnd: string, previousStart: string, previousEnd: string): Promise<{
  assignments: DeliveryAssignment[]; current: DeliveryEntry[]; previous: DeliveryEntry[];
}> {
  const [{ data: states, error: statesError }, { data: assigned, error: assignedError }, current, previous] = await Promise.all([
    supabaseServer.from("job_seeker_intake_states").select("job_seeker_id").eq("status", "active_client"),
    supabaseServer.from("job_seeker_assignments").select("job_seeker_id, account_manager_id, created_at"),
    currentStart <= currentEnd ? entriesBetween(currentStart, currentEnd) : Promise.resolve([]),
    entriesBetween(previousStart, previousEnd),
  ]);
  if (statesError || assignedError) throw new Error("Could not load active AM assignments.");
  const activeIds = new Set((states ?? []).map((row) => row.job_seeker_id as string));
  const activeAssignments = (assigned ?? []).filter((row) => activeIds.has(row.job_seeker_id as string));
  const ids = activeAssignments.map((row) => row.job_seeker_id as string);
  const { data: seekers, error: seekersError } = ids.length
    ? await supabaseServer.from("job_seekers").select("id, full_name, email").in("id", ids)
    : { data: [], error: null };
  if (seekersError) throw new Error("Could not load job seeker names.");
  const names = new Map((seekers ?? []).map((row) => [row.id as string, (row.full_name as string | null)?.trim() || row.email || "Job seeker"]));
  const assignments: DeliveryAssignment[] = activeAssignments.map((row) => ({
    account_manager_id: row.account_manager_id as string,
    job_seeker_id: row.job_seeker_id as string,
    name: names.get(row.job_seeker_id as string) || "Job seeker",
    assigned_date: watDate(new Date(row.created_at as string)),
  }));
  return { assignments, current, previous };
}
