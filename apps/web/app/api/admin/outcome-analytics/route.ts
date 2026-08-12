import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import {
  summarizeOutcomes,
  type OutcomeRow,
  type KeyedSegment,
} from "@/lib/application-outcomes";

/**
 * GET /api/admin/outcome-analytics?days=90
 *
 * Application→interview conversion rates by segment (tailored vs not, AI-answer
 * usage, match-score band, ATS, AM) over the given window. Reads the
 * materialized application_outcomes rows (refreshed by the nightly rollup).
 *
 * Auth: any authenticated AM. Rates below MIN_SAMPLE are returned as null so
 * small samples don't read as signal.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days") ?? 90);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 3650 ? daysRaw : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("application_outcomes")
    .select(
      "outcome, resume_tailored, match_score, ats_type, account_manager_id, ai_answer_count"
    )
    .gte("submitted_at", since);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load outcomes." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as OutcomeRow[];
  const summary = summarizeOutcomes(rows);

  // Resolve AM names so the leaderboard is human-readable.
  const amIds = summary.by_am.map((s) => s.key);
  let byAm: (KeyedSegment & { name: string })[] = summary.by_am.map((s) => ({
    ...s,
    name: s.key,
  }));
  if (amIds.length > 0) {
    const { data: ams } = await supabaseAdmin
      .from("account_managers")
      .select("id, full_name, name, email")
      .in("id", amIds);
    const nameById = new Map(
      (ams ?? []).map((a) => [a.id, a.full_name || a.name || a.email || a.id])
    );
    byAm = summary.by_am.map((s) => ({
      ...s,
      name: nameById.get(s.key) ?? s.key,
    }));
  }

  return NextResponse.json({
    window_days: days,
    total_applications: rows.length,
    summary: { ...summary, by_am: byAm },
    generated_at: new Date().toISOString(),
  });
}
