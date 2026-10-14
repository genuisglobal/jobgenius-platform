import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

/**
 * GET /api/extension/cockpit
 *
 * The AM force-multiplier triage board. Instead of the AM stepping through
 * seekers one at a time, this returns EVERY assigned seeker ranked by how much
 * work they need right now — needs-attention runs, pending queue, and new
 * above-threshold matches not yet actioned — so the AM works a prioritized
 * list. Read-only aggregate; nothing is claimed or mutated.
 */

const DEFAULT_THRESHOLD = 50;
// Floor for the cross-seeker match pull; per-seeker thresholds are applied in
// JS afterward. Keeps the query bounded without missing anyone's matches.
const MATCH_FLOOR = 40;
const QUALIFYING_RECOMMENDATIONS = new Set(["strong_match", "good_match"]);

type SeekerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  status: string | null;
  match_threshold: number | null;
};

export async function GET(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired token." },
      { status: 401 }
    );
  }

  // Assigned seekers (+ the fields needed to rank their work).
  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select(
      `job_seeker_id,
       job_seekers ( id, full_name, email, location, status, match_threshold )`
    )
    .eq("account_manager_id", session.account_manager_id);

  if (assignmentError) {
    return NextResponse.json(
      { error: "Failed to load assigned seekers." },
      { status: 500 }
    );
  }

  const seekers = (assignments ?? [])
    .map((a) => a.job_seekers as unknown as SeekerRow)
    .filter((s): s is SeekerRow => Boolean(s?.id));

  const seekerIds = seekers.map((s) => s.id);
  if (seekerIds.length === 0) {
    return NextResponse.json({
      seekers: [],
      totals: { needs_attention: 0, pending_queue: 0, new_matches: 0 },
      seeker_count: 0,
    });
  }

  // Pull the raw work signals across all assigned seekers in parallel, then
  // aggregate per seeker in JS (per-seeker thresholds rule out a single query).
  const [{ data: matchRows }, { data: queueRows }, { data: runRows }] =
    await Promise.all([
      supabaseAdmin
        .from("job_match_scores")
        .select("job_seeker_id, job_post_id, score, recommendation")
        .in("job_seeker_id", seekerIds)
        .is("archived_at", null)
        .gte("score", MATCH_FLOOR),
      supabaseAdmin
        .from("application_queue")
        .select("job_seeker_id, job_post_id, status")
        .in("job_seeker_id", seekerIds),
      supabaseAdmin
        .from("application_runs")
        .select("job_seeker_id, job_post_id, status")
        .in("job_seeker_id", seekerIds),
    ]);

  // A (seeker, job) that already has a queue or run row has been actioned, so
  // it no longer counts as a "new match" the AM needs to look at.
  const actioned = new Set<string>();
  const key = (seekerId: string, jobId: string | null) =>
    `${seekerId}::${jobId ?? ""}`;

  const pendingBySeeker = new Map<string, number>();
  for (const row of queueRows ?? []) {
    actioned.add(key(row.job_seeker_id, row.job_post_id));
    if (String(row.status).toUpperCase() === "QUEUED") {
      pendingBySeeker.set(
        row.job_seeker_id,
        (pendingBySeeker.get(row.job_seeker_id) ?? 0) + 1
      );
    }
  }

  const attentionBySeeker = new Map<string, number>();
  for (const row of runRows ?? []) {
    actioned.add(key(row.job_seeker_id, row.job_post_id));
    if (String(row.status).toUpperCase() === "NEEDS_ATTENTION") {
      attentionBySeeker.set(
        row.job_seeker_id,
        (attentionBySeeker.get(row.job_seeker_id) ?? 0) + 1
      );
    }
  }

  const thresholdBySeeker = new Map(
    seekers.map((s) => [s.id, s.match_threshold ?? DEFAULT_THRESHOLD])
  );
  const newMatchesBySeeker = new Map<string, number>();
  for (const row of matchRows ?? []) {
    const threshold = thresholdBySeeker.get(row.job_seeker_id) ?? DEFAULT_THRESHOLD;
    if ((row.score ?? 0) < threshold) continue;
    if (!QUALIFYING_RECOMMENDATIONS.has(String(row.recommendation))) continue;
    if (actioned.has(key(row.job_seeker_id, row.job_post_id))) continue;
    newMatchesBySeeker.set(
      row.job_seeker_id,
      (newMatchesBySeeker.get(row.job_seeker_id) ?? 0) + 1
    );
  }

  const cards = seekers.map((s) => {
    const needs_attention = attentionBySeeker.get(s.id) ?? 0;
    const pending_queue = pendingBySeeker.get(s.id) ?? 0;
    const new_matches = newMatchesBySeeker.get(s.id) ?? 0;
    // Attention is most urgent, then unworked queue, then untriaged matches.
    const priority = needs_attention * 1000 + pending_queue * 10 + new_matches;
    return {
      id: s.id,
      name: s.full_name || s.email || "Seeker",
      email: s.email,
      location: s.location,
      status: s.status,
      needs_attention,
      pending_queue,
      new_matches,
      priority,
    };
  });

  cards.sort((a, b) => b.priority - a.priority);

  const totals = cards.reduce(
    (acc, c) => ({
      needs_attention: acc.needs_attention + c.needs_attention,
      pending_queue: acc.pending_queue + c.pending_queue,
      new_matches: acc.new_matches + c.new_matches,
    }),
    { needs_attention: 0, pending_queue: 0, new_matches: 0 }
  );

  return NextResponse.json({
    seekers: cards,
    totals,
    seeker_count: cards.length,
  });
}
