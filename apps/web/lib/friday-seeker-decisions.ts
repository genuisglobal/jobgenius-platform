import { getRangeBounds } from "@/lib/activity-sheet";

export type FridayDecisionStatus = "open" | "done";
export type FridayDecision = {
  id: string;
  week_start: string;
  job_seeker_id: string;
  decision: string;
  next_action: string;
  owner_account_manager_id: string;
  due_date: string;
  status: FridayDecisionStatus;
  completed_at: string | null;
};

const isDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function parseFridayDecision(value: unknown): { value: {
  weekStart: string; jobSeekerId: string; decision: string; nextAction: string;
  ownerId: string; dueDate: string; status: FridayDecisionStatus;
}; error?: never } | { value?: never; error: string } {
  if (!value || typeof value !== "object") return { error: "Decision details are required." };
  const row = value as Record<string, unknown>;
  const decision = typeof row.decision === "string" ? row.decision.trim() : "";
  const nextAction = typeof row.nextAction === "string" ? row.nextAction.trim() : "";
  if (!isDate(row.weekStart) || getRangeBounds(row.weekStart, "week").start !== row.weekStart) return { error: "Select a valid review week." };
  if (typeof row.jobSeekerId !== "string" || !/^[0-9a-f-]{36}$/i.test(row.jobSeekerId)) return { error: "Select a valid seeker." };
  if (!decision || decision.length > 2000) return { error: "The discussion decision must be 1 to 2000 characters." };
  if (!nextAction || nextAction.length > 500) return { error: "The next action must be 1 to 500 characters." };
  if (typeof row.ownerId !== "string" || !/^[0-9a-f-]{36}$/i.test(row.ownerId)) return { error: "Select an action owner." };
  if (!isDate(row.dueDate) || row.dueDate < row.weekStart) return { error: "Choose a due date on or after the review week starts." };
  if (row.status !== "open" && row.status !== "done") return { error: "Select a valid action status." };
  return { value: { weekStart: row.weekStart, jobSeekerId: row.jobSeekerId, decision, nextAction, ownerId: row.ownerId, dueDate: row.dueDate, status: row.status } };
}
