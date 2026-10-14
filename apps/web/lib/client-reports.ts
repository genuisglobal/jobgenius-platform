// ============================================================
// Weekly client activity reports (migration 107).
//
// The value a client can't see might as well not exist: the platform
// applies, tracks, and books interviews all week, but unless someone
// tells the seeker, they only see silence. A Friday cron drafts one
// report per active client from the week's runs/interviews/replies;
// the assigned AM adds two human sentences and sends it as a portal
// conversation message (the inbox doubles as the archive).
// ============================================================

export type WeeklyStats = {
  week_start: string; // ISO date (Monday, UTC)
  applications_submitted: number;
  companies: Array<{ company: string; title: string }>;
  in_progress: number;
  needs_attention: number;
  interviews_scheduled: number;
  interviews: Array<{ scheduled_at: string }>;
  recruiter_replies: number;
};

/** Monday 00:00 UTC of the week containing `date`. */
export function getWeekStart(date: Date = new Date()): Date {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utc.getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - sinceMonday);
  return utc;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Plain-text portal message for a weekly report. Pure — testable, and kept
 * deliberately human: numbers first, no filler when a section is empty.
 */
export function formatReportMessage(params: {
  seekerName: string;
  stats: WeeklyStats;
  amNote?: string | null;
}): string {
  const { seekerName, stats, amNote } = params;
  const first = (seekerName || "there").split(/\s+/)[0];
  const weekLabel = new Date(`${stats.week_start}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", timeZone: "UTC" }
  );

  const lines: string[] = [
    `Hi ${first},`,
    "",
    `Here's your JobGenius activity report for the week of ${weekLabel}:`,
    "",
    `• Applications submitted: ${stats.applications_submitted}`,
  ];

  if (stats.companies.length > 0) {
    const list = stats.companies
      .slice(0, 8)
      .map((c) => `  – ${c.title} @ ${c.company}`)
      .join("\n");
    lines.push(list);
    if (stats.companies.length > 8) {
      lines.push(`  – …and ${stats.companies.length - 8} more`);
    }
  }

  if (stats.in_progress > 0) {
    lines.push(`• Applications in progress: ${stats.in_progress}`);
  }
  if (stats.interviews_scheduled > 0) {
    lines.push(`• Interviews scheduled: ${stats.interviews_scheduled} 🎉`);
  }
  if (stats.recruiter_replies > 0) {
    lines.push(`• Recruiter replies received: ${stats.recruiter_replies}`);
  }

  if (amNote && amNote.trim()) {
    lines.push("", `A note from your account manager:`, amNote.trim());
  }

  lines.push(
    "",
    "You can see live application status anytime in your portal under Tracker.",
    "",
    "— Your JobGenius team"
  );

  return lines.join("\n");
}

// ─── Stat shaping (pure over pre-fetched rows) ───────────────────────────

export type WeeklyRows = {
  completedRuns: Array<{ job_post_id: string | null }>;
  jobPostsById: Map<string, { title: string | null; company: string | null }>;
  inProgressCount: number;
  needsAttentionCount: number;
  interviews: Array<{ scheduled_at: string | null }>;
  recruiterReplies: number;
};

export function shapeWeeklyStats(weekStart: Date, rows: WeeklyRows): WeeklyStats {
  const companies = rows.completedRuns
    .map((run) => {
      const post = run.job_post_id ? rows.jobPostsById.get(run.job_post_id) : null;
      return post
        ? { company: post.company ?? "Unknown", title: post.title ?? "Unknown role" }
        : null;
    })
    .filter((c): c is { company: string; title: string } => c !== null)
    .slice(0, 20);

  return {
    week_start: toIsoDate(weekStart),
    applications_submitted: rows.completedRuns.length,
    companies,
    in_progress: rows.inProgressCount,
    needs_attention: rows.needsAttentionCount,
    interviews_scheduled: rows.interviews.length,
    interviews: rows.interviews
      .filter((i) => i.scheduled_at)
      .map((i) => ({ scheduled_at: i.scheduled_at as string }))
      .slice(0, 10),
    recruiter_replies: rows.recruiterReplies,
  };
}

// ─── DB: build stats for one seeker ──────────────────────────────────────

export async function buildWeeklyStats(
  jobSeekerId: string,
  weekStart: Date
): Promise<WeeklyStats> {
  const { supabaseServer } = await import("@/lib/supabase/server");
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = new Date(
    weekStart.getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: completedRuns },
    { data: activeRuns },
    { data: attentionRuns },
    { data: interviews },
    { data: threads },
  ] = await Promise.all([
    supabaseServer
      .from("application_runs")
      .select("id, job_post_id")
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "COMPLETED")
      .gte("updated_at", weekStartIso)
      .lt("updated_at", weekEndIso),
    supabaseServer
      .from("application_runs")
      .select("id")
      .eq("job_seeker_id", jobSeekerId)
      .in("status", ["READY", "RUNNING", "RETRYING"]),
    supabaseServer
      .from("application_runs")
      .select("id")
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "NEEDS_ATTENTION"),
    supabaseServer
      .from("interviews")
      .select("id, scheduled_at")
      .eq("job_seeker_id", jobSeekerId)
      .gte("scheduled_at", weekStartIso)
      .lt("scheduled_at", weekEndIso),
    supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("job_seeker_id", jobSeekerId),
  ]);

  // Recruiter replies this week: inbound messages on the seeker's threads.
  let recruiterReplies = 0;
  const threadIds = (threads ?? []).map((t) => t.id as string);
  if (threadIds.length > 0) {
    const { data: inbound } = await supabaseServer
      .from("outreach_messages")
      .select("id")
      .in("recruiter_thread_id", threadIds)
      .eq("direction", "inbound") // outreach_messages.direction is lowercase (see reply-draft/route.ts, outreach-reply-classifier.ts) — distinct from recruiter_threads.last_message_direction, which is uppercase
      .gte("created_at", weekStartIso)
      .lt("created_at", weekEndIso);
    recruiterReplies = inbound?.length ?? 0;
  }

  // Job titles/companies for the submitted list.
  const postIds = Array.from(
    new Set(
      (completedRuns ?? [])
        .map((r) => r.job_post_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );
  const jobPostsById = new Map<string, { title: string | null; company: string | null }>();
  if (postIds.length > 0) {
    const { data: posts } = await supabaseServer
      .from("job_posts")
      .select("id, title, company")
      .in("id", postIds);
    for (const post of posts ?? []) {
      jobPostsById.set(post.id as string, {
        title: post.title as string | null,
        company: post.company as string | null,
      });
    }
  }

  return shapeWeeklyStats(weekStart, {
    completedRuns: (completedRuns ?? []).map((r) => ({
      job_post_id: (r.job_post_id as string | null) ?? null,
    })),
    jobPostsById,
    inProgressCount: activeRuns?.length ?? 0,
    needsAttentionCount: attentionRuns?.length ?? 0,
    interviews: (interviews ?? []).map((i) => ({
      scheduled_at: (i.scheduled_at as string | null) ?? null,
    })),
    recruiterReplies,
  });
}

// ─── DB: generate this week's drafts for all active clients ─────────────

export async function generateWeeklyReports(
  weekStart: Date = getWeekStart()
): Promise<{ active_clients: number; generated: number; existing: number }> {
  const { supabaseServer } = await import("@/lib/supabase/server");

  const { data: activeStates } = await supabaseServer
    .from("job_seeker_intake_states")
    .select("job_seeker_id")
    .eq("status", "active_client");
  const seekerIds = Array.from(
    new Set((activeStates ?? []).map((s) => s.job_seeker_id as string))
  );
  if (seekerIds.length === 0) {
    return { active_clients: 0, generated: 0, existing: 0 };
  }

  // Assigned AM per seeker (first assignment wins).
  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id, account_manager_id")
    .in("job_seeker_id", seekerIds);
  const amBySeeker = new Map<string, string>();
  for (const row of assignments ?? []) {
    if (!amBySeeker.has(row.job_seeker_id as string)) {
      amBySeeker.set(row.job_seeker_id as string, row.account_manager_id as string);
    }
  }

  // Skip seekers whose report for this week already exists.
  const weekStartDate = toIsoDate(weekStart);
  const { data: existingRows } = await supabaseServer
    .from("client_reports")
    .select("job_seeker_id")
    .eq("week_start", weekStartDate)
    .in("job_seeker_id", seekerIds);
  const existing = new Set((existingRows ?? []).map((r) => r.job_seeker_id as string));

  let generated = 0;
  for (const seekerId of seekerIds) {
    if (existing.has(seekerId)) continue;
    try {
      const stats = await buildWeeklyStats(seekerId, weekStart);
      const { error } = await supabaseServer.from("client_reports").insert({
        job_seeker_id: seekerId,
        account_manager_id: amBySeeker.get(seekerId) ?? null,
        week_start: weekStartDate,
        stats,
        status: "DRAFT",
      });
      if (!error) generated += 1;
    } catch (error) {
      console.warn(`client-report generation failed for ${seekerId}:`, error);
    }
  }

  return {
    active_clients: seekerIds.length,
    generated,
    existing: existing.size,
  };
}
