// Wall-clock time in a named IANA zone → UTC instant, with no date library.
// Used where an AM in one zone (e.g. WAT) types a time stated in another
// (e.g. "2pm Eastern" from an employer's invite).

function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * "2026-10-20" + "14:00" in "America/New_York" → Date (18:00Z in EDT).
 * Returns null for malformed input. DST-safe: the offset is re-read at the
 * resolved instant.
 */
export function zonedWallTimeToDate(date: string, time: string, zone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  try {
    let instant = guess - zoneOffsetMs(guess, zone);
    instant = guess - zoneOffsetMs(instant, zone);
    return new Date(instant);
  } catch {
    return null;
  }
}

/** ISO string with explicit offset for a wall time in `zone`, e.g. 2026-10-20T14:00:00-04:00. */
export function zonedWallTimeToIso(date: string, time: string, zone: string): string | null {
  const instant = zonedWallTimeToDate(date, time, zone);
  if (!instant) return null;
  const offsetMin = Math.round(zoneOffsetMs(instant.getTime(), zone) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
