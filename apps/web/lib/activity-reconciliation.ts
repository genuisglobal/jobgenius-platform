// ============================================================
// Activity Sheet reconciliation.
//
// The sheet is typed in by hand, and the productivity report divides
// those hand-typed numbers by hours and ranks people on the result.
// Nothing has ever compared them to what the platform itself recorded.
//
// ─── What this is, and what it is not ────────────────────────────────────
//
// This is NOT a lie detector, and the numbers must never be presented as
// one. The sheet exists precisely BECAUSE real work happens off-platform:
// an AM applies through a company portal the runner cannot drive, calls a
// recruiter, chases a referral. None of that leaves a row in our tables.
// A gap between typed and recorded is therefore normal and expected.
//
// What it can do is show how much of a claim the platform can corroborate.
// Typing 60 applications a day, every day, while the platform records two,
// is not proof of anything — but it is worth a conversation, and right now
// nobody would ever see it.
//
// So the output is framed as coverage ("we can corroborate 40% of this")
// rather than accuracy, flags only sustained implausibility rather than
// any gap at all, and stays admin-only.
//
// ─── What is compared ────────────────────────────────────────────────────
//
//   Applications  typed easy + company     vs  application_runs COMPLETED
//   Interviews    typed phone + video      vs  interviews rows of that type
//   Follow-ups    typed follow_ups         vs  follow_up_drafts HANDLED
//
// AI interviews are deliberately excluded from the interview comparison:
// the sheet has a column for them and the interviews table has no such
// type, so counting them would manufacture a permanent false gap.
//
// Outreach messages are excluded too. They attach to a recruiter thread
// rather than to a seeker, and `recruiter_threads` carries no job_post_id,
// so any per-seeker attribution would be guesswork.
// ============================================================

import {
  interviewTotal,
  type ActivityCounts,
} from "./activity-sheet";

/** Sheet metrics the interview comparison can actually corroborate. */
export const CORROBORATED_INTERVIEW_METRICS = [
  "phone_interviews",
  "video_interviews",
] as const;

/**
 * A claim is only flagged once it is both sizeable and largely
 * uncorroborated. Small numbers are noise — two typed against zero
 * recorded means nothing, and flagging it would train everyone to
 * ignore the report.
 */
export const MIN_TYPED_TO_FLAG = 20;
export const LOW_COVERAGE = 0.25;

export type ReconciledMetric = {
  typed: number;
  recorded: number;
  /** typed − recorded. Positive means the platform saw less than claimed. */
  gap: number;
  /** recorded ÷ typed. Null when nothing was typed — not zero. */
  coverage: number | null;
};

export type ReconciliationFlag = {
  metric: "applications" | "interviews" | "follow_ups";
  message: string;
};

export type ReconciliationDay = {
  work_date: string;
  applications: ReconciledMetric;
  interviews: ReconciledMetric;
  follow_ups: ReconciledMetric;
};

export type AmReconciliation = {
  account_manager_id: string;
  am_name: string;
  applications: ReconciledMetric;
  interviews: ReconciledMetric;
  follow_ups: ReconciledMetric;
  days: ReconciliationDay[];
  flags: ReconciliationFlag[];
};

export type ReconciliationTotals = {
  applications: ReconciledMetric;
  interviews: ReconciledMetric;
  follow_ups: ReconciledMetric;
  managers: number;
  flagged: number;
};

/** Counts the platform recorded for one AM on one day. */
export type RecordedCounts = {
  applications: number;
  interviews: number;
  follow_ups: number;
};

export function emptyRecorded(): RecordedCounts {
  return { applications: 0, interviews: 0, follow_ups: 0 };
}

// ─── Comparison ──────────────────────────────────────────────────────────

export function compare(typed: number, recorded: number): ReconciledMetric {
  return {
    typed,
    recorded,
    gap: typed - recorded,
    coverage: typed > 0 ? recorded / typed : null,
  };
}

/** Applications as the sheet counts them: easy plus company. */
export function typedApplications(counts: Partial<ActivityCounts>): number {
  return (counts.easy_applications ?? 0) + (counts.company_applications ?? 0);
}

/**
 * Interviews the platform could plausibly have a row for — phone and
 * video only. See the header on why AI screeners are left out.
 */
export function typedCorroboratedInterviews(
  counts: Partial<ActivityCounts>
): number {
  return CORROBORATED_INTERVIEW_METRICS.reduce(
    (sum, metric) => sum + (counts[metric] ?? 0),
    0
  );
}

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

/**
 * Flags for one AM. Deliberately conservative: sizeable claim, low
 * corroboration, and worded as an observation rather than an accusation.
 */
export function buildFlags(
  applications: ReconciledMetric,
  interviews: ReconciledMetric,
  followUps: ReconciledMetric
): ReconciliationFlag[] {
  const flags: ReconciliationFlag[] = [];

  const check = (
    metric: ReconciliationFlag["metric"],
    value: ReconciledMetric,
    label: string
  ) => {
    if (
      value.typed >= MIN_TYPED_TO_FLAG &&
      value.coverage !== null &&
      value.coverage < LOW_COVERAGE
    ) {
      flags.push({
        metric,
        message: `${value.typed} ${label} logged, ${value.recorded} recorded on the platform (${pct(
          value.coverage
        )}).`,
      });
    }
  };

  check("applications", applications, "applications");
  check("interviews", interviews, "phone/video interviews");
  check("follow_ups", followUps, "follow-ups");

  return flags;
}

// ─── Aggregation ─────────────────────────────────────────────────────────

export type TypedDay = {
  account_manager_id: string;
  am_name: string;
  work_date: string;
  counts: ActivityCounts;
};

export type RecordedDay = {
  account_manager_id: string;
  work_date: string;
  recorded: RecordedCounts;
};

function sumMetric(days: ReconciledMetric[]): ReconciledMetric {
  const typed = days.reduce((sum, d) => sum + d.typed, 0);
  const recorded = days.reduce((sum, d) => sum + d.recorded, 0);
  return compare(typed, recorded);
}

/**
 * Join typed days to recorded days. Both sides are keyed on
 * (account_manager_id, work_date); a date present on one side and not the
 * other simply compares against zero, which is the honest reading — the
 * platform recorded nothing that day, or nothing was typed for it.
 */
export function buildReconciliation(
  typedDays: TypedDay[],
  recordedDays: RecordedDay[]
): { managers: AmReconciliation[]; totals: ReconciliationTotals } {
  type Bucket = {
    am_name: string;
    typed: Map<string, ActivityCounts>;
    recorded: Map<string, RecordedCounts>;
  };

  const buckets = new Map<string, Bucket>();

  function bucket(id: string, name: string): Bucket {
    let found = buckets.get(id);
    if (!found) {
      found = { am_name: name, typed: new Map(), recorded: new Map() };
      buckets.set(id, found);
    }
    if (!found.am_name && name) found.am_name = name;
    return found;
  }

  for (const day of typedDays) {
    bucket(day.account_manager_id, day.am_name).typed.set(
      day.work_date,
      day.counts
    );
  }
  for (const day of recordedDays) {
    bucket(day.account_manager_id, "").recorded.set(day.work_date, day.recorded);
  }

  const managers: AmReconciliation[] = [];

  for (const [account_manager_id, entry] of Array.from(buckets.entries())) {
    const dates = Array.from(
      new Set([
        ...Array.from(entry.typed.keys()),
        ...Array.from(entry.recorded.keys()),
      ])
    ).sort();

    const days: ReconciliationDay[] = dates.map((work_date) => {
      const typed = entry.typed.get(work_date);
      const recorded = entry.recorded.get(work_date) ?? emptyRecorded();
      return {
        work_date,
        applications: compare(
          typed ? typedApplications(typed) : 0,
          recorded.applications
        ),
        interviews: compare(
          typed ? typedCorroboratedInterviews(typed) : 0,
          recorded.interviews
        ),
        follow_ups: compare(typed?.follow_ups ?? 0, recorded.follow_ups),
      };
    });

    const applications = sumMetric(days.map((d) => d.applications));
    const interviews = sumMetric(days.map((d) => d.interviews));
    const follow_ups = sumMetric(days.map((d) => d.follow_ups));

    managers.push({
      account_manager_id,
      am_name: entry.am_name || "Unknown AM",
      applications,
      interviews,
      follow_ups,
      days,
      flags: buildFlags(applications, interviews, follow_ups),
    });
  }

  // Least-corroborated first — that is what an admin opened this for.
  // Managers with nothing typed sort last; there is nothing to assess.
  managers.sort((a, b) => {
    if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
    const ca = a.applications.coverage;
    const cb = b.applications.coverage;
    if (ca === null && cb === null) return a.am_name.localeCompare(b.am_name);
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca - cb || a.am_name.localeCompare(b.am_name);
  });

  return {
    managers,
    totals: {
      applications: sumMetric(managers.map((m) => m.applications)),
      interviews: sumMetric(managers.map((m) => m.interviews)),
      follow_ups: sumMetric(managers.map((m) => m.follow_ups)),
      managers: managers.length,
      flagged: managers.filter((m) => m.flags.length > 0).length,
    },
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────

export function formatCoverage(value: number | null): string {
  return pct(value);
}

/** "+18" when more was typed than recorded, "−4" the other way, "0" level. */
export function formatGap(gap: number): string {
  if (gap === 0) return "0";
  return gap > 0 ? `+${gap}` : `−${Math.abs(gap)}`;
}

// ─── Loading ─────────────────────────────────────────────────────────────

/**
 * Pull both sides for a date range. Everything the platform recorded is
 * attributed to an AM the same way the sheet does it: applications and
 * interviews through the seeker who was worked on, follow-ups through the
 * AM who handled the draft.
 */
export async function loadReconciliation(
  start: string,
  end: string
): Promise<{ typedDays: TypedDay[]; recordedDays: RecordedDay[] }> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");
  const { ACTIVITY_METRICS, coerceCounts } = await import("./activity-sheet");

  // Inclusive of the whole end day, in WAT (UTC+1, no DST).
  const startInstant = `${start}T00:00:00+01:00`;
  const endInstant = `${end}T23:59:59.999+01:00`;

  const entryColumns = [
    "entry_date",
    "job_seeker_id",
    "account_manager_id",
    ...ACTIVITY_METRICS,
  ].join(", ");

  const [{ data: entries }, { data: runs }, { data: interviews }, { data: drafts }] =
    await Promise.all([
      db
        .from("activity_sheet_entries")
        .select(entryColumns)
        .gte("entry_date", start)
        .lte("entry_date", end),
      // COMPLETED is the terminal success state for an application run.
      db
        .from("application_runs")
        .select("job_seeker_id, updated_at")
        .eq("status", "COMPLETED")
        .gte("updated_at", startInstant)
        .lte("updated_at", endInstant),
      db
        .from("interviews")
        .select("account_manager_id, interview_type, scheduled_at, created_at")
        .in("interview_type", ["phone", "video"])
        .gte("created_at", startInstant)
        .lte("created_at", endInstant),
      db
        .from("follow_up_drafts")
        .select("handled_by, handled_at")
        .eq("status", "HANDLED")
        .gte("handled_at", startInstant)
        .lte("handled_at", endInstant),
    ]);

  const records = (entries ?? []) as unknown as Array<
    { entry_date: string; job_seeker_id: string; account_manager_id: string } & Record<
      string,
      unknown
    >
  >;

  const amIds = Array.from(new Set(records.map((r) => r.account_manager_id)));
  const { data: managers } = amIds.length
    ? await db.from("account_managers").select("id, name, email").in("id", amIds)
    : { data: [] };

  const nameById = new Map(
    (managers ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "Unknown AM"];
    })
  );

  // One typed row per (AM, day) — the sheet's unit is the client-row, this
  // report's unit is the day, exactly as the productivity report does it.
  const typedByKey = new Map<string, TypedDay>();
  // Which AM owned which seeker on which day, so recorded rows that carry
  // only a seeker can be attributed the way the sheet attributed them.
  const ownerBySeekerDay = new Map<string, string>();

  for (const record of records) {
    const key = `${record.account_manager_id}|${record.entry_date}`;
    const counts = coerceCounts(record);
    const existing = typedByKey.get(key);
    if (existing) {
      for (const metric of ACTIVITY_METRICS) {
        existing.counts[metric] += counts[metric];
      }
    } else {
      typedByKey.set(key, {
        account_manager_id: record.account_manager_id,
        am_name: nameById.get(record.account_manager_id) ?? "Unknown AM",
        work_date: record.entry_date,
        counts,
      });
    }
    ownerBySeekerDay.set(
      `${record.job_seeker_id}|${record.entry_date}`,
      record.account_manager_id
    );
  }

  const recordedByKey = new Map<string, RecordedDay>();

  function recorded(amId: string, workDate: string): RecordedCounts {
    const key = `${amId}|${workDate}`;
    let entry = recordedByKey.get(key);
    if (!entry) {
      entry = {
        account_manager_id: amId,
        work_date: workDate,
        recorded: emptyRecorded(),
      };
      recordedByKey.set(key, entry);
    }
    return entry.recorded;
  }

  /** WAT calendar day of an instant. */
  function watDay(instant: string | null): string | null {
    if (!instant) return null;
    const parsed = new Date(instant);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
  }

  for (const run of runs ?? []) {
    const date = watDay(run.updated_at as string);
    if (!date) continue;
    // Attributed to whoever logged that seeker that day. A run for a
    // seeker nobody logged has no owner to credit, and is skipped rather
    // than guessed at — it would otherwise land on an arbitrary AM.
    const owner = ownerBySeekerDay.get(`${run.job_seeker_id as string}|${date}`);
    if (!owner) continue;
    recorded(owner, date).applications += 1;
  }

  for (const interview of interviews ?? []) {
    const date = watDay(interview.created_at as string);
    if (!date) continue;
    recorded(interview.account_manager_id as string, date).interviews += 1;
  }

  for (const draft of drafts ?? []) {
    const date = watDay(draft.handled_at as string);
    if (!date || !draft.handled_by) continue;
    recorded(draft.handled_by as string, date).follow_ups += 1;
  }

  return {
    typedDays: Array.from(typedByKey.values()),
    recordedDays: Array.from(recordedByKey.values()),
  };
}
