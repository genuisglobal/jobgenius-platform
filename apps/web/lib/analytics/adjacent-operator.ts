import { supabaseAdmin } from "@/lib/auth";
import { buildAdjacentOpportunity } from "@/lib/matching/explanations";
import {
  ADJACENT_QUEUE_CATEGORY,
  isManualQueueCategory,
} from "@/lib/queue-categories";

type ScoreRow = {
  job_seeker_id: string;
  job_post_id: string;
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
  updated_at: string | null;
  job_posts:
    | {
        id: string;
        title: string;
        company: string | null;
        location: string | null;
        url: string | null;
        created_at: string | null;
      }
    | Array<{
        id: string;
        title: string;
        company: string | null;
        location: string | null;
        url: string | null;
        created_at: string | null;
      }>
    | null;
};

type SeekerRow = {
  id: string;
  full_name: string | null;
  match_threshold: number | null;
};

type AssignmentRow = {
  job_seeker_id: string;
  account_manager_id: string;
};

type AccountManagerRow = {
  id: string;
  full_name: string | null;
};

type QueueRow = {
  job_seeker_id: string;
  job_post_id: string;
  status: string;
  category: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RunRow = {
  job_seeker_id: string;
  job_post_id: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type LaneSummary = {
  surfaced: number;
  queued: number;
  applied: number;
  active: number;
  needs_attention: number;
  queue_rate: number;
  applied_rate: number;
  success_from_queue_rate: number;
};

type LaneAccumulator = {
  surfaced: number;
  queued: number;
  applied: number;
  active: number;
  needs_attention: number;
};

type AmAccumulator = {
  surfaced: number;
  queued: number;
  applied: number;
};

type QueueSummary = {
  category: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type RunSummary = {
  latest_status: string;
  latest_at: string | null;
  has_success: boolean;
  has_active: boolean;
  has_needs_attention: boolean;
};

export type AdjacentOperatorAnalytics = {
  window_days: number;
  primary: LaneSummary;
  adjacent: LaneSummary & {
    explicitly_tagged_queued: number;
    inferred_legacy_queued: number;
  };
  top_supporting_reasons: Array<{ label: string; count: number }>;
  am_performance: Array<{
    id: string;
    name: string;
    surfaced: number;
    queued: number;
    applied: number;
    queue_rate: number;
    applied_rate: number;
  }>;
  recent_adjacent_wins: Array<{
    job_post_id: string;
    job_seeker_id: string;
    title: string;
    company: string | null;
    seeker_name: string;
    account_manager_name: string;
    score: number;
    updated_at: string | null;
    queue_category: string | null;
    supporting_reasons: string[];
  }>;
};

const ACTIVE_RUN_STATUSES = new Set(["QUEUED", "READY", "RUNNING", "RETRYING"]);
const SUCCESS_RUN_STATUSES = new Set(["APPLIED", "COMPLETED"]);
const MAX_SCORE_ROWS = Number(process.env.ADJACENT_OPERATOR_MAX_ROWS ?? 5000);
const SCORE_PAGE_SIZE = 1000;

function resolveSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toPairKey(jobSeekerId: string, jobPostId: string) {
  return `${jobSeekerId}:${jobPostId}`;
}

function toEpoch(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(1));
}

function pushCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function putIfNewer<T extends { updated_at: string | null; created_at: string | null }>(
  map: Map<string, T>,
  key: string,
  row: T
) {
  const existing = map.get(key);
  const rowEpoch = Math.max(toEpoch(row.updated_at), toEpoch(row.created_at));
  const existingEpoch = existing
    ? Math.max(toEpoch(existing.updated_at), toEpoch(existing.created_at))
    : 0;
  if (!existing || rowEpoch >= existingEpoch) {
    map.set(key, row);
  }
}

function toSummary(accumulator: LaneAccumulator): LaneSummary {
  return {
    surfaced: accumulator.surfaced,
    queued: accumulator.queued,
    applied: accumulator.applied,
    active: accumulator.active,
    needs_attention: accumulator.needs_attention,
    queue_rate: rate(accumulator.queued, accumulator.surfaced),
    applied_rate: rate(accumulator.applied, accumulator.surfaced),
    success_from_queue_rate: rate(accumulator.applied, accumulator.queued),
  };
}

async function loadRecentScoreRows(sinceIso: string) {
  const rows: ScoreRow[] = [];
  let from = 0;

  while (rows.length < MAX_SCORE_ROWS) {
    const to = Math.min(from + SCORE_PAGE_SIZE - 1, MAX_SCORE_ROWS - 1);
    const { data, error } = await supabaseAdmin
      .from("job_match_scores")
      .select(`
        job_seeker_id,
        job_post_id,
        score,
        confidence,
        recommendation,
        reasons,
        updated_at,
        job_posts (
          id,
          title,
          company,
          location,
          url,
          created_at
        )
      `)
      .gte("updated_at", sinceIso)
      .gte("score", 40)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error("Failed to load adjacent operator score rows.");
    }

    const batch = (data ?? []) as ScoreRow[];
    rows.push(...batch);
    if (batch.length < SCORE_PAGE_SIZE || rows.length >= MAX_SCORE_ROWS) {
      break;
    }
    from += SCORE_PAGE_SIZE;
  }

  return rows;
}

export async function loadAdjacentOperatorAnalytics(): Promise<AdjacentOperatorAnalytics> {
  const windowDays = Number(process.env.ADJACENT_OPERATOR_WINDOW_DAYS ?? 30);
  const sinceIso = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const scoreRows = await loadRecentScoreRows(sinceIso);

  if (scoreRows.length === 0) {
    return {
      window_days: windowDays,
      primary: toSummary({
        surfaced: 0,
        queued: 0,
        applied: 0,
        active: 0,
        needs_attention: 0,
      }),
      adjacent: {
        ...toSummary({
          surfaced: 0,
          queued: 0,
          applied: 0,
          active: 0,
          needs_attention: 0,
        }),
        explicitly_tagged_queued: 0,
        inferred_legacy_queued: 0,
      },
      top_supporting_reasons: [],
      am_performance: [],
      recent_adjacent_wins: [],
    };
  }

  const seekerIds = Array.from(new Set(scoreRows.map((row) => row.job_seeker_id)));
  const jobPostIds = Array.from(new Set(scoreRows.map((row) => row.job_post_id)));

  const [
    { data: seekerRows, error: seekerError },
    { data: assignmentRows, error: assignmentError },
    { data: queueRows, error: queueError },
    { data: runRows, error: runError },
  ] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, match_threshold")
      .in("id", seekerIds),
    supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id, account_manager_id")
      .in("job_seeker_id", seekerIds),
    supabaseAdmin
      .from("application_queue")
      .select("job_seeker_id, job_post_id, status, category, created_at, updated_at")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobPostIds),
    supabaseAdmin
      .from("application_runs")
      .select("job_seeker_id, job_post_id, status, created_at, updated_at")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobPostIds),
  ]);

  if (seekerError || assignmentError || queueError || runError) {
    throw new Error("Failed to load adjacent operator support data.");
  }

  const accountManagerIds = Array.from(
    new Set(((assignmentRows ?? []) as AssignmentRow[]).map((row) => row.account_manager_id))
  );

  const { data: accountManagerRows, error: amError } = accountManagerIds.length
    ? await supabaseAdmin
        .from("account_managers")
        .select("id, full_name")
        .in("id", accountManagerIds)
    : { data: [], error: null };

  if (amError) {
    throw new Error("Failed to load account managers for adjacent analytics.");
  }

  const seekerMap = new Map(
    ((seekerRows ?? []) as SeekerRow[]).map((row) => [row.id, row])
  );

  const assignmentMap = new Map<string, string>();
  for (const row of (assignmentRows ?? []) as AssignmentRow[]) {
    if (!assignmentMap.has(row.job_seeker_id)) {
      assignmentMap.set(row.job_seeker_id, row.account_manager_id);
    }
  }

  const accountManagerMap = new Map(
    ((accountManagerRows ?? []) as AccountManagerRow[]).map((row) => [row.id, row.full_name ?? "Unknown"])
  );

  const queueByPair = new Map<string, QueueSummary>();
  for (const row of (queueRows ?? []) as QueueRow[]) {
    putIfNewer(queueByPair, toPairKey(row.job_seeker_id, row.job_post_id), row);
  }

  const runByPair = new Map<string, RunSummary>();
  for (const row of (runRows ?? []) as RunRow[]) {
    if (!row.job_post_id) {
      continue;
    }

    const key = toPairKey(row.job_seeker_id, row.job_post_id);
    const existing = runByPair.get(key);
    const rowEpoch = Math.max(toEpoch(row.updated_at), toEpoch(row.created_at));
    const existingEpoch = existing ? toEpoch(existing.latest_at) : 0;

    const nextSummary: RunSummary = {
      latest_status:
        !existing || rowEpoch >= existingEpoch
          ? row.status
          : existing.latest_status,
      latest_at:
        !existing || rowEpoch >= existingEpoch
          ? row.updated_at ?? row.created_at
          : existing.latest_at,
      has_success:
        (existing?.has_success ?? false) || SUCCESS_RUN_STATUSES.has(row.status),
      has_active:
        (existing?.has_active ?? false) || ACTIVE_RUN_STATUSES.has(row.status),
      has_needs_attention:
        (existing?.has_needs_attention ?? false) ||
        row.status === "NEEDS_ATTENTION",
    };

    runByPair.set(key, nextSummary);
  }

  const primaryAcc: LaneAccumulator = {
    surfaced: 0,
    queued: 0,
    applied: 0,
    active: 0,
    needs_attention: 0,
  };
  const adjacentAcc: LaneAccumulator = {
    surfaced: 0,
    queued: 0,
    applied: 0,
    active: 0,
    needs_attention: 0,
  };
  let explicitlyTaggedQueued = 0;
  let inferredLegacyQueued = 0;

  const supportingReasonCounts = new Map<string, number>();
  const amAcc = new Map<string, AmAccumulator>();
  const adjacentWins: AdjacentOperatorAnalytics["recent_adjacent_wins"] = [];

  for (const row of scoreRows) {
    const seeker = seekerMap.get(row.job_seeker_id);
    if (!seeker || typeof row.score !== "number") {
      continue;
    }

    const threshold = seeker.match_threshold ?? 60;
    const adjacent = buildAdjacentOpportunity(row.reasons, {
      score: row.score,
      confidence: row.confidence,
      recommendation: row.recommendation,
      threshold,
    });
    const isPrimary = row.score >= threshold;
    const lane = adjacent.eligible ? "adjacent" : isPrimary ? "primary" : null;

    if (!lane) {
      continue;
    }

    const pairKey = toPairKey(row.job_seeker_id, row.job_post_id);
    const queue = queueByPair.get(pairKey) ?? null;
    const run = runByPair.get(pairKey) ?? null;
    const hasQueued = Boolean(queue || run);
    const hasApplied =
      Boolean(run?.has_success) ||
      SUCCESS_RUN_STATUSES.has(queue?.status ?? "");
    const hasActive =
      !hasApplied &&
      (Boolean(run?.has_active) || ACTIVE_RUN_STATUSES.has(queue?.status ?? ""));
    const hasNeedsAttention =
      Boolean(run?.has_needs_attention) ||
      (queue?.status ?? "") === "NEEDS_ATTENTION";

    const laneAcc = lane === "adjacent" ? adjacentAcc : primaryAcc;
    laneAcc.surfaced += 1;
    if (hasQueued) {
      laneAcc.queued += 1;
    }
    if (hasApplied) {
      laneAcc.applied += 1;
    }
    if (hasActive) {
      laneAcc.active += 1;
    }
    if (hasNeedsAttention) {
      laneAcc.needs_attention += 1;
    }

    if (lane === "adjacent") {
      if (queue) {
        if (queue.category === ADJACENT_QUEUE_CATEGORY) {
          explicitlyTaggedQueued += 1;
        } else {
          inferredLegacyQueued += 1;
        }
      }

      for (const label of adjacent.supportingReasons) {
        pushCount(supportingReasonCounts, label);
      }

      if (hasApplied) {
        const jobPost = resolveSingle(row.job_posts);
        const amId = assignmentMap.get(row.job_seeker_id) ?? null;
        adjacentWins.push({
          job_post_id: row.job_post_id,
          job_seeker_id: row.job_seeker_id,
          title: jobPost?.title ?? "Untitled",
          company: jobPost?.company ?? null,
          seeker_name: seeker.full_name ?? "Unknown",
          account_manager_name: amId
            ? accountManagerMap.get(amId) ?? "Unknown"
            : "Unassigned",
          score: row.score,
          updated_at: run?.latest_at ?? queue?.updated_at ?? row.updated_at,
          queue_category: queue?.category ?? null,
          supporting_reasons: adjacent.supportingReasons,
        });
      }
    }

    const amId = assignmentMap.get(row.job_seeker_id) ?? null;
    if (amId) {
      const current = amAcc.get(amId) ?? { surfaced: 0, queued: 0, applied: 0 };
      if (lane === "adjacent") {
        current.surfaced += 1;
        if (hasQueued) {
          current.queued += 1;
        }
        if (hasApplied) {
          current.applied += 1;
        }
      }
      amAcc.set(amId, current);
    }
  }

  const topSupportingReasons = Array.from(supportingReasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const amPerformance = Array.from(amAcc.entries())
    .filter(([, acc]) => acc.surfaced > 0)
    .map(([id, acc]) => ({
      id,
      name: accountManagerMap.get(id) ?? "Unknown",
      surfaced: acc.surfaced,
      queued: acc.queued,
      applied: acc.applied,
      queue_rate: rate(acc.queued, acc.surfaced),
      applied_rate: rate(acc.applied, acc.surfaced),
    }))
    .sort((a, b) => {
      if (b.applied !== a.applied) {
        return b.applied - a.applied;
      }
      if (b.queue_rate !== a.queue_rate) {
        return b.queue_rate - a.queue_rate;
      }
      return b.surfaced - a.surfaced;
    })
    .slice(0, 8);

  const recentAdjacentWins = adjacentWins
    .sort((a, b) => toEpoch(b.updated_at) - toEpoch(a.updated_at))
    .slice(0, 8);

  return {
    window_days: windowDays,
    primary: toSummary(primaryAcc),
    adjacent: {
      ...toSummary(adjacentAcc),
      explicitly_tagged_queued: explicitlyTaggedQueued,
      inferred_legacy_queued: inferredLegacyQueued,
    },
    top_supporting_reasons: topSupportingReasons,
    am_performance: amPerformance,
    recent_adjacent_wins: recentAdjacentWins,
  };
}
