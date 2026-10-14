// ============================================================
// Day-3/7 follow-up drafts (migration 109).
//
// Applications that get no response within a few days benefit from a
// short, polite bump — but auto-sending outreach is exactly the kind
// of relationship risk the roadmap forbids. So the system DRAFTS: a
// daily cron finds runs submitted 3 or 7 days ago with no interview
// for that (seeker, job) and queues a ready-to-copy message for the
// AM, who sends it through whatever channel fits and marks it handled.
// ============================================================

export const FOLLOW_UP_DAYS = [3, 7] as const;

/**
 * Short, human follow-up copy. Day 3 is a light check-in; day 7 adds a
 * value hook. Written to be sent AS the seeker (LinkedIn/email), so no
 * JobGenius branding.
 */
export function buildFollowUpDraft(params: {
  seekerName: string;
  jobTitle: string;
  company: string;
  followUpDay: number;
}): string {
  const { seekerName, jobTitle, company, followUpDay } = params;
  const first = (seekerName || "").trim().split(/\s+/)[0] || "";

  if (followUpDay <= 3) {
    return [
      `Hi — I recently applied for the ${jobTitle} position at ${company} and wanted to follow up briefly.`,
      `I'm genuinely excited about the role and believe my background is a strong match. I'd welcome the chance to talk about how I could contribute.`,
      `Thanks for your time and consideration!`,
      first ? `Best regards,\n${first}` : `Best regards`,
    ].join("\n\n");
  }

  return [
    `Hi — following up on my application for the ${jobTitle} role at ${company} from last week.`,
    `I understand hiring timelines get busy; I remain very interested and happy to share anything that would help the review — work samples, references, or a quick call.`,
    `If the role has moved forward with other candidates, I'd appreciate knowing so I can focus my search. Thanks again!`,
    first ? `Best regards,\n${first}` : `Best regards`,
  ].join("\n\n");
}

/**
 * The [start, end) window of run completion timestamps that are exactly
 * `day` days old as of `now` (1-day-wide, so a daily cron catches each run
 * exactly once per checkpoint; unique(run_id, day) absorbs reruns).
 */
export function completionWindowForDay(
  day: number,
  now: Date = new Date()
): { start: string; end: string } {
  const end = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function generateFollowUpDrafts(
  now: Date = new Date()
): Promise<{ scanned: number; drafted: number; suppressed_interviews: number }> {
  const { supabaseServer } = await import("@/lib/supabase/server");

  let scanned = 0;
  let drafted = 0;
  let suppressedInterviews = 0;

  for (const day of FOLLOW_UP_DAYS) {
    const window = completionWindowForDay(day, now);
    const { data: runs } = await supabaseServer
      .from("application_runs")
      .select("id, job_seeker_id, job_post_id")
      .eq("status", "COMPLETED")
      .gte("updated_at", window.start)
      .lt("updated_at", window.end)
      .limit(500);
    if (!runs || runs.length === 0) continue;
    scanned += runs.length;

    const seekerIds = Array.from(new Set(runs.map((r) => r.job_seeker_id as string)));
    const postIds = Array.from(
      new Set(runs.map((r) => r.job_post_id as string).filter(Boolean))
    );

    // Suppress where an interview already exists for that (seeker, job) —
    // the conversation is alive; a templated bump would look tone-deaf.
    const { data: interviewRows } = postIds.length
      ? await supabaseServer
          .from("interviews")
          .select("job_seeker_id, job_post_id")
          .in("job_seeker_id", seekerIds)
          .in("job_post_id", postIds)
      : { data: [] as never[] };
    const interviewed = new Set(
      (interviewRows ?? []).map((i) => `${i.job_seeker_id}::${i.job_post_id}`)
    );

    const [{ data: seekers }, { data: posts }, { data: assignments }] =
      await Promise.all([
        supabaseServer.from("job_seekers").select("id, full_name").in("id", seekerIds),
        postIds.length
          ? supabaseServer.from("job_posts").select("id, title, company").in("id", postIds)
          : Promise.resolve({ data: [] as never[] }),
        supabaseServer
          .from("job_seeker_assignments")
          .select("job_seeker_id, account_manager_id")
          .in("job_seeker_id", seekerIds),
      ]);

    const seekerById = new Map((seekers ?? []).map((s) => [s.id as string, s]));
    const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));
    const amBySeeker = new Map<string, string>();
    for (const row of assignments ?? []) {
      if (!amBySeeker.has(row.job_seeker_id as string)) {
        amBySeeker.set(row.job_seeker_id as string, row.account_manager_id as string);
      }
    }

    const inserts = [];
    for (const run of runs) {
      const key = `${run.job_seeker_id}::${run.job_post_id}`;
      if (interviewed.has(key)) {
        suppressedInterviews += 1;
        continue;
      }
      const post = postById.get(run.job_post_id as string);
      const seeker = seekerById.get(run.job_seeker_id as string);
      inserts.push({
        run_id: run.id,
        job_seeker_id: run.job_seeker_id,
        account_manager_id: amBySeeker.get(run.job_seeker_id as string) ?? null,
        follow_up_day: day,
        draft_text: buildFollowUpDraft({
          seekerName: (seeker?.full_name as string) ?? "",
          jobTitle: (post?.title as string) ?? "the role",
          company: (post?.company as string) ?? "the company",
          followUpDay: day,
        }),
        status: "PENDING",
      });
    }

    if (inserts.length > 0) {
      const { data: created } = await supabaseServer
        .from("follow_up_drafts")
        .upsert(inserts, { onConflict: "run_id,follow_up_day", ignoreDuplicates: true })
        .select("id");
      drafted += created?.length ?? 0;
    }
  }

  return { scanned, drafted, suppressed_interviews: suppressedInterviews };
}
