// ============================================================
// Per-seeker application velocity policy (migration 104).
//
// Enforced at claim time — the single choke point every channel
// (extension via GET /api/apply/next, cloud runner via
// POST /api/apply/tasks/claim and legacy GET /api/apply/next-global)
// passes through. Three rules, evaluated in order:
//
//   1. QUIET_HOURS       — no run starts during the seeker's local
//                          night (default 22:00–07:00). Skipped when
//                          no timezone is known: guessing a timezone
//                          risks blocking a whole working day.
//   2. DAILY_CAP_REACHED — max runs *started* per seeker-local day
//                          (job_seekers.daily_apply_cap, default 15;
//                          0 = automation paused for the seeker).
//                          Counts every claim, not just successes —
//                          failed attempts still hit the ATS/board.
//   3. PACING_COOLDOWN   — jittered minimum gap since the seeker's
//                          last run start, by pacing profile. Jitter
//                          is re-rolled per check, so the effective
//                          gap varies naturally instead of ticking at
//                          a robotic fixed interval.
// ============================================================

export type PacingProfile = "conservative" | "normal" | "aggressive";

export type VelocityBlockReason =
  | "QUIET_HOURS"
  | "DAILY_CAP_REACHED"
  | "PACING_COOLDOWN";

export type VelocityVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: VelocityBlockReason;
      /** Best-effort hint for when the caller should retry. */
      retryAfterMs?: number;
    };

export type SeekerVelocityInput = {
  dailyCap: number;
  pacingProfile: PacingProfile;
  /** IANA timezone, or null when unknown (disables quiet hours, UTC day). */
  timezone: string | null;
  /** Run starts (locked_at) within the last 24h, any status. */
  recentRunStarts: Date[];
  now?: Date;
  /** Injectable RNG for deterministic tests. */
  random?: () => number;
};

/** Jittered min-gap ranges per pacing profile, in minutes. */
const PACING_GAP_MINUTES: Record<PacingProfile, { min: number; max: number }> = {
  conservative: { min: 8, max: 15 },
  normal: { min: 3, max: 10 },
  aggressive: { min: 2, max: 5 },
};

export const DEFAULT_DAILY_APPLY_CAP = 15;
export const DEFAULT_PACING_PROFILE: PacingProfile = "normal";

function readQuietHours(): { start: number; end: number } | null {
  // "22-7" → 22:00–07:00 local. "off" disables.
  const raw = (process.env.APPLY_QUIET_HOURS ?? "22-7").trim().toLowerCase();
  if (!raw || raw === "off" || raw === "0") return null;
  const match = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) return { start: 22, end: 7 };
  const start = Math.min(23, Math.max(0, Number(match[1])));
  const end = Math.min(23, Math.max(0, Number(match[2])));
  if (start === end) return null; // degenerate window = disabled
  return { start, end };
}

export function normalizePacingProfile(value: unknown): PacingProfile {
  return value === "conservative" || value === "aggressive"
    ? value
    : DEFAULT_PACING_PROFILE;
}

/** Local hour-of-day (0–23) in `timezone`, or null if the tz is invalid. */
export function getLocalHour(now: Date, timezone: string): number | null {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const parsed = Number(hour);
    // Intl can yield "24" for midnight in some ICU versions.
    if (!Number.isFinite(parsed)) return null;
    return parsed % 24;
  } catch {
    return null; // invalid IANA name
  }
}

/**
 * UTC instant of the most recent local midnight in `timezone` (or UTC when
 * null/invalid). Used as the daily-cap day boundary. Local midnight is always
 * within the past 24h, so callers only need 24h of run history.
 */
export function getLocalDayStartUtc(now: Date, timezone: string | null): Date {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? NaN);
      const h = get("hour") % 24;
      const m = get("minute");
      const s = get("second");
      if ([h, m, s].every(Number.isFinite)) {
        const sinceMidnightMs = ((h * 60 + m) * 60 + s) * 1000;
        return new Date(now.getTime() - sinceMidnightMs);
      }
    } catch {
      /* invalid tz — fall through to UTC */
    }
  }
  const utcMidnight = new Date(now);
  utcMidnight.setUTCHours(0, 0, 0, 0);
  return utcMidnight;
}

function isWithinQuietHours(
  localHour: number,
  window: { start: number; end: number }
): boolean {
  // Window may wrap midnight (22–7) or not (1–5).
  return window.start < window.end
    ? localHour >= window.start && localHour < window.end
    : localHour >= window.start || localHour < window.end;
}

/**
 * Pure policy evaluation — no I/O, deterministic given `now`/`random`.
 */
export function evaluateSeekerVelocity(
  input: SeekerVelocityInput
): VelocityVerdict {
  const now = input.now ?? new Date();
  const random = input.random ?? Math.random;

  // 1. Quiet hours (only when we actually know the seeker's timezone).
  const quietWindow = readQuietHours();
  if (quietWindow && input.timezone) {
    const localHour = getLocalHour(now, input.timezone);
    if (localHour !== null && isWithinQuietHours(localHour, quietWindow)) {
      // Rough retry hint: hours until the window ends.
      const hoursUntilEnd = (quietWindow.end - localHour + 24) % 24 || 1;
      return {
        allowed: false,
        reason: "QUIET_HOURS",
        retryAfterMs: hoursUntilEnd * 60 * 60 * 1000,
      };
    }
  }

  // 2. Daily cap, counted from the seeker's local midnight.
  const dayStart = getLocalDayStartUtc(now, input.timezone);
  const startedToday = input.recentRunStarts.filter(
    (d) => d.getTime() >= dayStart.getTime() && d.getTime() <= now.getTime()
  ).length;
  const cap = Number.isFinite(input.dailyCap)
    ? Math.max(0, input.dailyCap)
    : DEFAULT_DAILY_APPLY_CAP;
  if (startedToday >= cap) {
    const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return {
      allowed: false,
      reason: "DAILY_CAP_REACHED",
      retryAfterMs: Math.max(60_000, nextDayStart.getTime() - now.getTime()),
    };
  }

  // 3. Jittered pacing gap since the last run start.
  const lastStartMs = input.recentRunStarts.reduce(
    (max, d) => Math.max(max, d.getTime()),
    0
  );
  if (lastStartMs > 0) {
    const range = PACING_GAP_MINUTES[normalizePacingProfile(input.pacingProfile)];
    const gapMs =
      (range.min + random() * (range.max - range.min)) * 60 * 1000;
    const elapsed = now.getTime() - lastStartMs;
    if (elapsed < gapMs) {
      return {
        allowed: false,
        reason: "PACING_COOLDOWN",
        retryAfterMs: Math.ceil(gapMs - elapsed),
      };
    }
  }

  return { allowed: true };
}

// ============================================================
// DB loading + batch evaluation used by the claim paths.
// ============================================================

export type SeekerVelocityRecord = {
  jobSeekerId: string;
  verdict: VelocityVerdict;
};

/**
 * Evaluate the velocity policy for a set of seekers in two queries
 * (job_seekers + 24h of run starts) regardless of batch size. Returns a map
 * so claim loops can skip blocked seekers cheaply. Fails open per-seeker on
 * load errors: a broken policy read should degrade to old behavior, not halt
 * all applying.
 */
export async function evaluateVelocityForSeekers(
  jobSeekerIds: string[],
  now: Date = new Date()
): Promise<Map<string, VelocityVerdict>> {
  const verdicts = new Map<string, VelocityVerdict>();
  const ids = Array.from(new Set(jobSeekerIds)).filter(Boolean);
  if (ids.length === 0) return verdicts;

  // Lazy import keeps the pure policy functions above usable without Supabase
  // env (unit tests, scripts); lib/supabase/server throws at import time when
  // NEXT_PUBLIC_SUPABASE_URL is absent.
  const { supabaseServer } = await import("@/lib/supabase/server");

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: seekers, error: seekersError }, { data: runs }, { data: tzRows }] =
    await Promise.all([
      supabaseServer
        .from("job_seekers")
        .select("id, daily_apply_cap, apply_pacing_profile, timezone")
        .in("id", ids),
      supabaseServer
        .from("application_runs")
        .select("job_seeker_id, locked_at")
        .in("job_seeker_id", ids)
        .gte("locked_at", since),
      supabaseServer
        .from("job_seeker_availability")
        .select("job_seeker_id, timezone")
        .in("job_seeker_id", ids)
        .eq("is_active", true),
    ]);

  if (seekersError) {
    // Fail open: no verdicts recorded → callers treat missing as allowed.
    return verdicts;
  }

  const startsBySeeker = new Map<string, Date[]>();
  for (const row of runs ?? []) {
    if (!row.locked_at) continue;
    const list = startsBySeeker.get(row.job_seeker_id) ?? [];
    list.push(new Date(row.locked_at));
    startsBySeeker.set(row.job_seeker_id, list);
  }

  // Interview-availability timezone as fallback when the profile has none.
  const availabilityTz = new Map<string, string>();
  for (const row of tzRows ?? []) {
    if (row.timezone && !availabilityTz.has(row.job_seeker_id)) {
      availabilityTz.set(row.job_seeker_id, row.timezone);
    }
  }

  for (const seeker of seekers ?? []) {
    const timezone =
      (seeker.timezone as string | null) ??
      availabilityTz.get(seeker.id) ??
      null;
    verdicts.set(
      seeker.id,
      evaluateSeekerVelocity({
        dailyCap:
          typeof seeker.daily_apply_cap === "number"
            ? seeker.daily_apply_cap
            : DEFAULT_DAILY_APPLY_CAP,
        pacingProfile: normalizePacingProfile(seeker.apply_pacing_profile),
        timezone,
        recentRunStarts: startsBySeeker.get(seeker.id) ?? [],
        now,
      })
    );
  }

  return verdicts;
}

/** Single-seeker convenience wrapper for GET /api/apply/next. */
export async function checkSeekerVelocity(
  jobSeekerId: string,
  now: Date = new Date()
): Promise<VelocityVerdict> {
  const verdicts = await evaluateVelocityForSeekers([jobSeekerId], now);
  return verdicts.get(jobSeekerId) ?? { allowed: true };
}
