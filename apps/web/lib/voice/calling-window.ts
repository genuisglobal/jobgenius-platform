// When Emi may place a call. TCPA telemarketing hours are 8am–9pm in the
// called party's local time. With an unknown zone we fall back to a window
// that is inside 8am–9pm for every continental US zone (11am–9pm Eastern =
// 8am–6pm Pacific).

export const CALL_WINDOW_START_HOUR = 8;
export const CALL_WINDOW_END_HOUR = 21; // exclusive

const FALLBACK_ZONE = "America/New_York";
const FALLBACK_START_HOUR = 11;
const FALLBACK_END_HOUR = 21;

const STEP_MS = 5 * 60 * 1000;
const SEARCH_HORIZON_MS = 3 * 24 * 60 * 60 * 1000;

export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function windowFor(zone: string | null | undefined) {
  return isValidTimeZone(zone)
    ? { zone, start: CALL_WINDOW_START_HOUR, end: CALL_WINDOW_END_HOUR }
    : { zone: FALLBACK_ZONE, start: FALLBACK_START_HOUR, end: FALLBACK_END_HOUR };
}

/** Local wall-clock hour (0–23) and minute in `zone`. */
export function localTime(at: Date, zone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function isWithinCallingWindow(at: Date, zone: string | null | undefined): boolean {
  const w = windowFor(zone);
  const { hour } = localTime(at, w.zone);
  return hour >= w.start && hour < w.end;
}

/**
 * `at` itself when it is inside the window, otherwise the first moment the
 * window opens after it (5-minute resolution, DST-safe by construction).
 */
export function nextCallingTime(at: Date, zone: string | null | undefined): Date {
  if (isWithinCallingWindow(at, zone)) return at;
  // Align to the next 5-minute boundary so the window opening is hit exactly.
  let t = Math.ceil(at.getTime() / STEP_MS) * STEP_MS;
  const limit = at.getTime() + SEARCH_HORIZON_MS;
  while (t <= limit) {
    if (isWithinCallingWindow(new Date(t), zone)) return new Date(t);
    t += STEP_MS;
  }
  return at; // unreachable for real zones; keeps the type total
}
