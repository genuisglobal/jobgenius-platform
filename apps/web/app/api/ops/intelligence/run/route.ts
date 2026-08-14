import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

type RunRow = {
  id: string;
  job_seeker_id: string | null;
  job_post_id: string | null;
  ats_type: string | null;
  status: string;
  created_at: string | null;
};

type ScoreRow = {
  job_seeker_id: string;
  job_post_id: string;
  score: number;
};

type TailorRow = {
  job_seeker_id: string;
  job_post_id: string;
};

type Band = {
  label: string;
  min: number;
  max: number;
};

const SCORE_BANDS: Band[] = [
  { label: "0-39", min: 0, max: 39 },
  { label: "40-54", min: 40, max: 54 },
  { label: "55-74", min: 55, max: 74 },
  { label: "75-100", min: 75, max: 100 },
];

const FINAL_STATUSES = new Set([
  "APPLIED",
  "COMPLETED",
  "FAILED",
  "NEEDS_ATTENTION",
  "CANCELLED",
]);

const SUCCESS_STATUSES = new Set(["APPLIED", "COMPLETED"]);

function resolveFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function toPairKey(jobSeekerId: string, jobPostId: string) {
  return `${jobSeekerId}:${jobPostId}`;
}

function getBand(score: number): Band {
  const band = SCORE_BANDS.find((entry) => score >= entry.min && score <= entry.max);
  return band ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

function addStat(map: Map<string, { total: number; success: number }>, key: string, success: boolean) {
  const current = map.get(key) ?? { total: 0, success: 0 };
  current.total += 1;
  if (success) {
    current.success += 1;
  }
  map.set(key, current);
}

export async function POST(request: Request) {
  return runIntelligence(request);
}

export async function GET(request: Request) {
  return runIntelligence(request);
}

async function runIntelligence(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const windowDays = Number(process.env.INTELLIGENCE_WINDOW_DAYS ?? 60);
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: runs, error: runsError } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, job_post_id, ats_type, status, created_at")
    .gte("created_at", sinceIso);

  if (runsError) {
    return Response.json({ success: false, error: "Failed to load application runs." }, { status: 500 });
  }

  const runRows = (runs ?? []) as RunRow[];
  const finalRuns = runRows.filter(
    (row) => row.job_seeker_id && row.job_post_id && FINAL_STATUSES.has(row.status)
  );

  if (finalRuns.length === 0) {
    return Response.json({
      success: true,
      window_days: windowDays,
      ats_success: [],
      match_score_bands: [],
      resume_performance: [],
      threshold_updates: [],
    });
  }

  const seekerIds = Array.from(
    new Set(finalRuns.map((row) => row.job_seeker_id).filter(Boolean))
  ) as string[];
  const postIds = Array.from(
    new Set(finalRuns.map((row) => row.job_post_id).filter(Boolean))
  ) as string[];

  const scoreMap = new Map<string, number>();
  if (seekerIds.length > 0 && postIds.length > 0) {
    const { data: scores } = await supabaseServer
      .from("job_match_scores")
      .select("job_seeker_id, job_post_id, score")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", postIds);

    for (const row of (scores ?? []) as ScoreRow[]) {
      scoreMap.set(toPairKey(row.job_seeker_id, row.job_post_id), row.score);
    }
  }

  const tailoredMap = new Set<string>();
  if (seekerIds.length > 0 && postIds.length > 0) {
    const { data: tailored } = await supabaseServer
      .from("tailored_resumes")
      .select("job_seeker_id, job_post_id")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", postIds);

    for (const row of (tailored ?? []) as TailorRow[]) {
      tailoredMap.add(toPairKey(row.job_seeker_id, row.job_post_id));
    }
  }

  const atsStats = new Map<string, { total: number; success: number }>();
  const bandStats = new Map<string, { total: number; success: number }>();
  const resumeStats = new Map<string, { total: number; success: number }>();
  const seekerBandStats = new Map<string, Map<string, { total: number; success: number }>>();
  const seekerTotals = new Map<string, { total: number; success: number }>();

  for (const run of finalRuns) {
    const seekerId = run.job_seeker_id as string;
    const postId = run.job_post_id as string;
    const success = SUCCESS_STATUSES.has(run.status);
    const atsKey = run.ats_type ?? "UNKNOWN";
    addStat(atsStats, atsKey, success);
    addStat(seekerTotals, seekerId, success);

    const pairKey = toPairKey(seekerId, postId);
    const score = scoreMap.get(pairKey);
    if (typeof score === "number") {
      const band = getBand(score);
      addStat(bandStats, band.label, success);
      const seekerBand = seekerBandStats.get(seekerId) ?? new Map();
      addStat(seekerBand, band.label, success);
      seekerBandStats.set(seekerId, seekerBand);
    }

    const resumeType = tailoredMap.has(pairKey) ? "TAILORED" : "BASE";
    addStat(resumeStats, resumeType, success);
  }

  const atsSuccess = Array.from(atsStats.entries()).map(([ats, stat]) => ({
    ats_type: ats,
    total: stat.total,
    success: stat.success,
    success_rate: stat.total > 0 ? Number((stat.success / stat.total).toFixed(3)) : null,
  }));

  const bandSuccess = SCORE_BANDS.map((band) => {
    const stat = bandStats.get(band.label) ?? { total: 0, success: 0 };
    return {
      band: band.label,
      min_score: band.min,
      max_score: band.max,
      total: stat.total,
      success: stat.success,
      success_rate: stat.total > 0 ? Number((stat.success / stat.total).toFixed(3)) : null,
    };
  });

  const resumePerformance = Array.from(resumeStats.entries()).map(([type, stat]) => ({
    resume_type: type,
    total: stat.total,
    success: stat.success,
    success_rate: stat.total > 0 ? Number((stat.success / stat.total).toFixed(3)) : null,
  }));

  const autoEnabled = resolveFlag("AUTO_THRESHOLD_ENABLED", false);
  const minRuns = Number(process.env.AUTO_THRESHOLD_MIN_RUNS ?? 12);
  const minBandRuns = Number(process.env.AUTO_THRESHOLD_MIN_BAND_RUNS ?? 4);
  const targetSuccess = Number(process.env.AUTO_THRESHOLD_TARGET_SUCCESS ?? 0.35);
  const maxStep = Number(process.env.AUTO_THRESHOLD_MAX_STEP ?? 10);
  const minThreshold = Number(process.env.AUTO_THRESHOLD_MIN ?? 50);
  const maxThreshold = Number(process.env.AUTO_THRESHOLD_MAX ?? 85);
  const cooldownDays = Number(process.env.AUTO_THRESHOLD_COOLDOWN_DAYS ?? 14);
  const cooldownSince = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();

  const thresholdUpdates: Array<Record<string, unknown>> = [];

  if (autoEnabled && seekerIds.length > 0) {
    const { data: seekers } = await supabaseServer
      .from("job_seekers")
      .select("id, match_threshold")
      .in("id", seekerIds);

    const { data: recentAdjustments } = await supabaseServer
      .from("match_threshold_adjustments")
      .select("job_seeker_id, created_at")
      .gte("created_at", cooldownSince)
      .in("job_seeker_id", seekerIds);

    const recentMap = new Set(
      (recentAdjustments ?? []).map((row) => row.job_seeker_id)
    );

    for (const seeker of seekers ?? []) {
      const seekerId = seeker.id as string;
      const totals = seekerTotals.get(seekerId);
      if (!totals || totals.total < minRuns) {
        continue;
      }
      if (recentMap.has(seekerId)) {
        continue;
      }

      const bandMap = seekerBandStats.get(seekerId);
      if (!bandMap) {
        continue;
      }

      const eligibleBands = SCORE_BANDS.map((band) => {
        const stat = bandMap.get(band.label);
        if (!stat || stat.total < minBandRuns) {
          return null;
        }
        const rate = stat.total > 0 ? stat.success / stat.total : 0;
        return { band, stat, rate };
      }).filter(Boolean) as Array<{ band: Band; stat: { total: number; success: number }; rate: number }>;

      if (eligibleBands.length === 0) {
        continue;
      }

      const bestBand = eligibleBands.reduce((best, current) => {
        if (current.rate > best.rate) return current;
        if (current.rate === best.rate && current.band.min > best.band.min) return current;
        return best;
      });

      if (bestBand.rate < targetSuccess) {
        continue;
      }

      const currentThreshold = typeof seeker.match_threshold === "number" ? seeker.match_threshold : 60;
      let suggested = Math.max(currentThreshold, bestBand.band.min);
      suggested = Math.min(Math.max(suggested, minThreshold), maxThreshold);

      if (suggested <= currentThreshold) {
        continue;
      }

      if (suggested - currentThreshold > maxStep) {
        suggested = currentThreshold + maxStep;
      }

      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabaseServer
        .from("job_seekers")
        .update({ match_threshold: suggested })
        .eq("id", seekerId);

      if (updateError) {
        continue;
      }

      const { error: insertError } = await supabaseServer
        .from("match_threshold_adjustments")
        .insert({
        job_seeker_id: seekerId,
        previous_threshold: currentThreshold,
        new_threshold: suggested,
        reason: "AUTO_ADJUST_MATCH_BAND",
        metrics: {
          best_band: bestBand.band.label,
          best_band_success_rate: bestBand.rate,
          band_total: bestBand.stat.total,
          window_days: windowDays,
        },
        created_at: nowIso,
      });

      if (insertError) {
        continue;
      }

      thresholdUpdates.push({
        job_seeker_id: seekerId,
        previous_threshold: currentThreshold,
        new_threshold: suggested,
        reason: "AUTO_ADJUST_MATCH_BAND",
      });
    }
  }

  return Response.json({
    success: true,
    window_days: windowDays,
    ats_success: atsSuccess,
    match_score_bands: bandSuccess,
    resume_performance: resumePerformance,
    threshold_updates: thresholdUpdates,
  });
}
