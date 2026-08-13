// ============================================================
// Office attendance clock (migration 115).
//
// Sign in on arrival, toggle breaks, sign out on leaving. Everything
// here is pure — timezone conversion, the state machine, and duration
// maths. The API routes own the database.
//
// All instants are UTC (timestamptz). WAT is the *display* and
// day-boundary timezone: Africa/Lagos, UTC+1 year-round, no daylight
// saving. That last property is why a WAT date is a safe key — it never
// straddles two offsets, so a shift cannot land in an ambiguous hour.
// ============================================================

export const WAT_TIME_ZONE = "Africa/Lagos";
export const WAT_LABEL = "WAT";

export type AttendanceBreak = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

export type AttendanceDay = {
  id: string;
  account_manager_id: string;
  work_date: string;
  signed_in_at: string;
  signed_out_at: string | null;
  breaks: AttendanceBreak[];
};

export type AttendanceStatus = "off" | "working" | "on_break" | "done";

export const ATTENDANCE_ACTIONS = [
  "sign_in",
  "break_start",
  "break_end",
  "sign_out",
] as const;
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

export function isAttendanceAction(value: unknown): value is AttendanceAction {
  return (
    typeof value === "string" &&
    ATTENDANCE_ACTIONS.includes(value as AttendanceAction)
  );
}

// ─── WAT time ────────────────────────────────────────────────────────────

/**
 * The WAT calendar date (YYYY-MM-DD) an instant falls on.
 *
 * Uses en-CA because it formats as YYYY-MM-DD; building the string from
 * parts would reintroduce the local-timezone bug this exists to avoid.
 */
export function watDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Clock time in WAT, 24-hour, e.g. "08:02". */
export function watTime(instant: Date | string | null | undefined): string {
  if (!instant) return "—";
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: WAT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "Tuesday, 12 August 2026" in WAT. */
export function watDateLabel(workDate: string): string {
  // Noon UTC is inside the same WAT day whatever the offset, so this
  // cannot slip to the neighbouring date.
  const date = new Date(`${workDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return workDate;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: WAT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// ─── State machine ───────────────────────────────────────────────────────

export function openBreak(day: AttendanceDay | null): AttendanceBreak | null {
  if (!day) return null;
  return day.breaks.find((entry) => entry.ended_at === null) ?? null;
}

export function deriveStatus(day: AttendanceDay | null): AttendanceStatus {
  if (!day) return "off";
  if (day.signed_out_at) return "done";
  return openBreak(day) ? "on_break" : "working";
}

/**
 * Whether an action is legal from the current status. Signing out while a
 * break is still running is allowed on purpose — people leave without
 * remembering to end it, and refusing would strand the day open forever.
 * The route closes the break at the same instant.
 */
export function canPerform(
  action: AttendanceAction,
  status: AttendanceStatus
): boolean {
  switch (action) {
    case "sign_in":
      return status === "off";
    case "break_start":
      return status === "working";
    case "break_end":
      return status === "on_break";
    case "sign_out":
      return status === "working" || status === "on_break";
    default:
      return false;
  }
}

export function actionRejectionReason(
  action: AttendanceAction,
  status: AttendanceStatus
): string {
  if (action === "sign_in" && status === "done") {
    return "You have already signed out for today.";
  }
  if (action === "sign_in") return "You are already signed in.";
  if (status === "off") return "Sign in first.";
  if (status === "done") return "Your day is already closed.";
  if (action === "break_start") return "You are already on a break.";
  if (action === "break_end") return "You are not on a break.";
  return "That action is not available right now.";
}

// ─── Durations ───────────────────────────────────────────────────────────

function ms(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Total break time. An open break counts up to `now`, so the header ticks
 * while someone is away rather than jumping when they return.
 */
export function breakMs(day: AttendanceDay, now: Date = new Date()): number {
  let total = 0;
  for (const entry of day.breaks) {
    const start = ms(entry.started_at);
    if (start === null) continue;
    const end = ms(entry.ended_at) ?? now.getTime();
    if (end > start) total += end - start;
  }
  return total;
}

/** Time on the clock minus breaks. Never negative. */
export function workedMs(day: AttendanceDay, now: Date = new Date()): number {
  const start = ms(day.signed_in_at);
  if (start === null) return 0;
  const end = ms(day.signed_out_at) ?? now.getTime();
  const gross = end - start;
  if (gross <= 0) return 0;
  return Math.max(0, gross - breakMs(day, now));
}

/** "1h 12m", "45m", "0m" — compact enough for a header. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0m";
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Decimal hours for reporting, to 2dp. */
export function workedHours(day: AttendanceDay, now: Date = new Date()): number {
  return Math.round((workedMs(day, now) / 3600000) * 100) / 100;
}

/**
 * A shift left open past its own WAT day — someone forgot to sign out.
 * Worth flagging rather than reporting an eighteen-hour day as fact.
 */
export function isStale(day: AttendanceDay, now: Date = new Date()): boolean {
  return !day.signed_out_at && watDate(now) !== day.work_date;
}

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  off: "Not signed in",
  working: "Working",
  on_break: "On break",
  done: "Signed out",
};
