import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import { RunMatchingButton, TopOppQueueButton } from "./DashboardActions";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const isAdmin = isAdminRole(user.role);

  if (user.userType === "am" && !isAdmin) {
    if (isPeopleManagerRole(user.role)) {
      redirect("/dashboard/people");
    }
    if (isFinanceRole(user.role)) {
      redirect("/dashboard/finance");
    }
  }

  // Get assigned job seekers
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  const seekerIds = (assignments || []).map((a) => a.job_seeker_id);

  // Get stats
  const { count: totalSeekers } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id", { count: "exact", head: true })
    .eq("account_manager_id", user.id);

  let needsAttention = 0;
  let queuedCount = 0;
  let followUpsDue = 0;
  let interviewsCount = 0;
  let appliedThisWeek = 0;

  // Full data for priorities
  type InterviewRow = {
    id: string;
    scheduled_at: string;
    interview_type: string | null;
    job_seekers: { full_name: string } | null;
    job_posts: { title: string; company: string | null } | null;
  };
  type AttentionRow = {
    id: string;
    status: string;
    needs_attention_reason: string | null;
    job_seeker_id: string;
    job_post_id: string;
    job_seekers: { full_name: string | null } | null;
    job_posts: { title: string; company: string | null } | null;
  };
  type TopOppRow = {
    id: string;
    score: number;
    recommendation: string | null;
    job_seeker_id: string;
    job_posts: { id: string; title: string; company: string | null; location: string | null } | null;
    job_seekers: { full_name: string | null } | null;
  };
  type ResumeHardeningAlertRow = {
    id: string;
    job_seeker_id: string;
    sample_title: string;
    tailored_count: number;
    status: string;
    last_triggered_at: string;
  };

  let weekInterviews: InterviewRow[] = [];
  let attentionItems: AttentionRow[] = [];
  let followUpThreads: { id: string; job_seeker_id: string; next_follow_up_at: string }[] = [];
  let topOpportunities: TopOppRow[] = [];
  let hardeningAlerts: Array<ResumeHardeningAlertRow & { seeker_name: string | null }> = [];
  let alreadyQueuedSet = new Set<string>();
  let responseRate = 0;

  if (seekerIds.length > 0) {
    // Needs attention count
    const { count: attentionCount } = await supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("status", "NEEDS_ATTENTION");
    needsAttention = attentionCount ?? 0;

    // Queued count
    const { count: qCount } = await supabaseAdmin
      .from("application_queue")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("status", "QUEUED");
    queuedCount = qCount ?? 0;

    // Follow-ups due
    const { data: followUps, count: fCount } = await supabaseAdmin
      .from("recruiter_threads")
      .select("id, job_seeker_id, next_follow_up_at", { count: "exact" })
      .in("job_seeker_id", seekerIds)
      .eq("thread_status", "WAITING_REPLY")
      .lte("next_follow_up_at", new Date().toISOString());
    followUpsDue = fCount ?? 0;
    followUpThreads = (followUps ?? []) as typeof followUpThreads;

    // Interviews this week
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: interviews, count: iCount } = await supabaseAdmin
      .from("interviews")
      .select(`
        id, scheduled_at, interview_type,
        job_seekers!inner(full_name),
        job_posts!inner(title, company)
      `, { count: "exact" })
      .in("job_seeker_id", seekerIds)
      .eq("status", "confirmed")
      .gte("scheduled_at", new Date().toISOString())
      .lte("scheduled_at", weekFromNow)
      .order("scheduled_at", { ascending: true });
    interviewsCount = iCount ?? 0;
    weekInterviews = (interviews ?? []) as unknown as InterviewRow[];

    // Applied this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: aCount } = await supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .in("status", ["APPLIED", "COMPLETED"])
      .gte("updated_at", weekAgo);
    appliedThisWeek = aCount ?? 0;

    // Attention items (full data)
    const { data: attentionData } = await supabaseAdmin
      .from("application_runs")
      .select(`
        id, status, needs_attention_reason, job_seeker_id, job_post_id
      `)
      .in("job_seeker_id", seekerIds)
      .eq("status", "NEEDS_ATTENTION")
      .limit(10);
    const attentionRows = (attentionData ?? []) as Array<{
      id: string;
      status: string;
      needs_attention_reason: string | null;
      job_seeker_id: string;
      job_post_id: string;
    }>;

    const attentionSeekerIds = Array.from(
      new Set(attentionRows.map((row) => row.job_seeker_id).filter(Boolean))
    );
    const attentionJobPostIds = Array.from(
      new Set(attentionRows.map((row) => row.job_post_id).filter(Boolean))
    );

    const seekerLookup = new Map<string, { full_name: string | null }>();
    if (attentionSeekerIds.length > 0) {
      const { data: attentionSeekers } = await supabaseAdmin
        .from("job_seekers")
        .select("id, full_name")
        .in("id", attentionSeekerIds);
      for (const seeker of attentionSeekers ?? []) {
        seekerLookup.set(seeker.id, { full_name: seeker.full_name ?? null });
      }
    }

    const jobLookup = new Map<string, { title: string; company: string | null }>();
    if (attentionJobPostIds.length > 0) {
      const { data: attentionJobs } = await supabaseAdmin
        .from("job_posts")
        .select("id, title, company")
        .in("id", attentionJobPostIds);
      for (const job of attentionJobs ?? []) {
        jobLookup.set(job.id, { title: job.title, company: job.company ?? null });
      }
    }

    attentionItems = attentionRows.map((row) => ({
      ...row,
      job_seekers: seekerLookup.get(row.job_seeker_id) ?? null,
      job_posts: jobLookup.get(row.job_post_id) ?? null,
    }));

    // Top opportunities
    const { data: topMatches } = await supabaseAdmin
      .from("job_match_scores")
      .select(`
        id, score, recommendation, job_seeker_id,
        job_posts!inner(id, title, company, location),
        job_seekers!inner(full_name)
      `)
      .in("job_seeker_id", seekerIds)
      .gte("score", 70)
      .order("score", { ascending: false })
      .limit(10);
    topOpportunities = (topMatches ?? []) as unknown as TopOppRow[];

    // Check which top opportunities are already queued
    if (topOpportunities.length > 0) {
      const topJobPostIds = topOpportunities
        .map((o) => o.job_posts?.id)
        .filter(Boolean) as string[];
      if (topJobPostIds.length > 0) {
        const { data: alreadyQueued } = await supabaseAdmin
          .from("application_queue")
          .select("job_seeker_id, job_post_id")
          .in("job_seeker_id", seekerIds)
          .in("job_post_id", topJobPostIds);
        (alreadyQueued ?? []).forEach((q) => {
          alreadyQueuedSet.add(`${q.job_seeker_id}:${q.job_post_id}`);
        });
      }
    }

    // Response rate
    const { count: totalOutreach } = await supabaseAdmin
      .from("recruiter_threads")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds);
    const { count: repliedCount } = await supabaseAdmin
      .from("recruiter_threads")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("thread_status", "REPLIED");
    if ((totalOutreach ?? 0) > 0) {
      responseRate = Math.round(((repliedCount ?? 0) / (totalOutreach ?? 1)) * 100);
    }
  }

  const hardeningQuery = supabaseAdmin
    .from("resume_hardening_alerts")
    .select("id, job_seeker_id, sample_title, tailored_count, status, last_triggered_at")
    .eq("status", "pending")
    .order("last_triggered_at", { ascending: false })
    .limit(10);

  const { data: rawHardeningAlerts } = isAdmin
    ? await hardeningQuery
    : seekerIds.length > 0
    ? await hardeningQuery.in("job_seeker_id", seekerIds)
    : { data: [] as ResumeHardeningAlertRow[] };

  const hardeningSeekerIds = Array.from(
    new Set((rawHardeningAlerts ?? []).map((row) => row.job_seeker_id).filter(Boolean))
  );
  const hardeningSeekerMap = new Map<string, string | null>();
  if (hardeningSeekerIds.length > 0) {
    const { data: hardeningSeekers } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", hardeningSeekerIds);
    for (const row of hardeningSeekers ?? []) {
      hardeningSeekerMap.set(row.id, row.full_name ?? null);
    }
  }
  hardeningAlerts = (rawHardeningAlerts ?? []).map((row) => ({
    ...row,
    seeker_name: hardeningSeekerMap.get(row.job_seeker_id) ?? null,
  }));

  // Build priority list
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 2);
  tomorrow.setHours(0, 0, 0, 0);

  type PriorityItem = {
    level: "CRITICAL" | "HIGH" | "MEDIUM" | "NORMAL";
    label: string;
    detail: string;
    href: string;
  };

  const priorities: PriorityItem[] = [];

  // CRITICAL: Interviews today/tomorrow
  weekInterviews
    .filter((i) => new Date(i.scheduled_at) < tomorrow)
    .forEach((i) => {
      const seeker = i.job_seekers as { full_name: string } | null;
      const job = i.job_posts as { title: string; company: string } | null;
      const date = new Date(i.scheduled_at);
      priorities.push({
        level: "CRITICAL",
        label: `Interview: ${seeker?.full_name || "Unknown"}`,
        detail: `${job?.company} - ${job?.title} at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        href: "/dashboard/interviews",
      });
    });

  // HIGH: Needs attention
  attentionItems.forEach((a) => {
    const seeker = a.job_seekers as { full_name: string } | null;
    const job = a.job_posts as { title: string; company: string } | null;
    priorities.push({
      level: "HIGH",
      label: `Attention: ${seeker?.full_name || "Unknown"}`,
      detail: `${job?.company} - ${job?.title}${a.needs_attention_reason ? ` (${a.needs_attention_reason})` : ""}`,
      href: "/dashboard/attention",
    });
  });

  // HIGH: Resume hardening approvals
  hardeningAlerts.forEach((alert) => {
    priorities.push({
      level: "HIGH",
      label: `Resume Hardening: ${alert.seeker_name || "Unknown Seeker"}`,
      detail: `${alert.sample_title} tailored ${alert.tailored_count} times. Approve a reusable version.`,
      href: `/dashboard/pipeline?tab=resumes&seeker=${alert.job_seeker_id}`,
    });
  });

  // MEDIUM: Follow-ups due
  followUpThreads.slice(0, 5).forEach(() => {
    priorities.push({
      level: "MEDIUM",
      label: "Follow-up due",
      detail: "Recruiter thread waiting for reply past follow-up date",
      href: "/dashboard/pipeline?tab=followup",
    });
  });

  // NORMAL: Queued ready to start
  if (queuedCount > 0) {
    priorities.push({
      level: "NORMAL",
      label: `${queuedCount} queued application${queuedCount !== 1 ? "s" : ""} ready`,
      detail: "Go to Pipeline to start batch",
      href: "/dashboard/pipeline?tab=queue",
    });
  }

  const levelColors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800",
    HIGH: "bg-orange-100 text-orange-800",
    MEDIUM: "bg-purple-100 text-purple-800",
    NORMAL: "bg-violet-100 text-violet-800",
  };

  const actionCardBorders: Record<string, string> = {
    blue: "border-l-violet-500",
    orange: "border-l-orange-500",
    purple: "border-l-purple-500",
    green: "border-l-green-500",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.name || user.email}</p>
        </div>

        {user.amCode && (
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-purple-200">Your Extension Code</p>
                <p className="text-xl font-bold font-mono tracking-wider">{user.amCode}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-purple-900">Admin access is active for this account.</p>
            <p className="text-sm text-purple-700">
              To view and manage every job seeker profile, use <span className="font-medium">Administration &gt; All Job Seekers</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin/job-seekers"
              className="px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              View &amp; Manage All Job Seekers
            </Link>
            <Link
              href="/dashboard/admin"
              className="px-3 py-2 text-sm font-medium bg-white text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-100 transition-colors"
            >
              Open Admin Overview
            </Link>
          </div>
        </div>
      )}

      {/* Action Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/dashboard/pipeline?tab=queue"
          className={`bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow border-l-4 ${actionCardBorders.blue}`}
        >
          <div className="text-sm font-medium text-gray-500">Applications Ready</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{queuedCount}</div>
          <div className="mt-1 text-xs text-gray-400">Click to action &rarr;</div>
        </Link>
        <Link
          href="/dashboard/pipeline?tab=followup"
          className={`bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow border-l-4 ${actionCardBorders.purple}`}
        >
          <div className="text-sm font-medium text-gray-500">Follow-ups Due</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{followUpsDue}</div>
          <div className="mt-1 text-xs text-gray-400">Click to action &rarr;</div>
        </Link>
        <Link
          href="/dashboard/attention"
          className={`bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow border-l-4 ${actionCardBorders.orange}`}
        >
          <div className="text-sm font-medium text-gray-500">Need Attention</div>
          <div className="mt-1 text-3xl font-bold text-orange-600">{needsAttention}</div>
          <div className="mt-1 text-xs text-gray-400">Click to action &rarr;</div>
        </Link>
        <Link
          href="/dashboard/interviews"
          className={`bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow border-l-4 ${actionCardBorders.green}`}
        >
          <div className="text-sm font-medium text-gray-500">Interviews This Week</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{interviewsCount}</div>
          <div className="mt-1 text-xs text-gray-400">Click to action &rarr;</div>
        </Link>
      </div>

      {/* Today's Priorities */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Today&apos;s Priorities</h2>
          <RunMatchingButton />
        </div>
        <div className="divide-y">
          {priorities.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-gray-400 text-sm">All clear! No urgent items today.</p>
            </div>
          ) : (
            priorities.map((p, i) => (
              <Link
                key={i}
                href={p.href}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${levelColors[p.level]}`}>
                  {p.level}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.label}</p>
                  <p className="text-xs text-gray-500 truncate">{p.detail}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Total Seekers</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{totalSeekers ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Applied This Week</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{appliedThisWeek}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Interviews Scheduled</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{interviewsCount}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Response Rate</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{responseRate}%</div>
        </div>
      </div>

      {/* Top Opportunities */}
      {topOpportunities.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Top Opportunities</h2>
            <p className="text-xs text-gray-400 mt-1">Best matches across all seekers (score 70+)</p>
          </div>
          <div className="divide-y">
            {topOpportunities.map((opp) => {
              const job = opp.job_posts as { id: string; title: string; company: string | null; location: string | null } | null;
              const seeker = opp.job_seekers as { full_name: string | null } | null;
              const key = `${opp.job_seeker_id}:${job?.id}`;
              const isQueued = alreadyQueuedSet.has(key);

              return (
                <div key={opp.id} className="px-5 py-3 flex items-center gap-4">
                  <ScoreBadge score={opp.score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {job?.title || "Unknown Job"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {job?.company || "Unknown Company"}
                      {job?.location && ` \u2022 ${job.location}`}
                      {" \u2022 "}
                      {seeker?.full_name || "Unknown Seeker"}
                    </p>
                  </div>
                  {opp.recommendation && (
                    <span className="text-xs text-gray-500 capitalize shrink-0">{opp.recommendation}</span>
                  )}
                  <div className="shrink-0">
                    {job && (
                      <TopOppQueueButton
                        jobSeekerId={opp.job_seeker_id}
                        jobPostId={job.id}
                        alreadyQueued={isQueued}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800"
      : score >= 60
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full shrink-0 ${color}`}>
      {score}
    </span>
  );
}
