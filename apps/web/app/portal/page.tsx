import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { hasOpenTask } from "@/lib/conversations/tasks";
import {
  formatCapacityMonthLabel,
  getIntakeStateByJobSeekerId,
  type IntakeStateRecord,
} from "@/lib/intake";

type AccountManagerSummary = {
  name: string | null;
  email: string | null;
};

type IntakeViewModel = {
  eyebrow: string;
  title: string;
  body: string;
  tone: "amber" | "blue" | "green" | "red";
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  meta?: string;
};

async function getAssignedAccountManager(jobSeekerId: string): Promise<AccountManagerSummary | null> {
  const { data: latestAssignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id, created_at, account_managers (name, email)")
    .eq("job_seeker_id", jobSeekerId)
    .not("account_manager_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestAssignment) {
    return null;
  }

  const joinedManager = Array.isArray(latestAssignment.account_managers)
    ? latestAssignment.account_managers[0]
    : latestAssignment.account_managers;

  if (joinedManager) {
    return {
      name: joinedManager.name ?? null,
      email: joinedManager.email ?? null,
    };
  }

  // Fallback for legacy rows where relation join is not materialized as expected.
  if (latestAssignment.account_manager_id) {
    const { data: manager } = await supabaseAdmin
      .from("account_managers")
      .select("name, email")
      .eq("id", latestAssignment.account_manager_id)
      .maybeSingle();

    if (manager) {
      return {
        name: manager.name ?? null,
        email: manager.email ?? null,
      };
    }
  }

  return null;
}

function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildIntakeStatusView(intakeState: IntakeStateRecord): IntakeViewModel {
  const capacityLabel = intakeState.capacity_month
    ? formatCapacityMonthLabel(intakeState.capacity_month)
    : null;
  const previewExpiryLabel = formatShortDate(intakeState.preview_expires_at);

  switch (intakeState.status) {
    case "approved_payment_pending":
      return {
        eyebrow: "Spot Reserved",
        title: "Your onboarding spot is reserved.",
        body: "Finish your registration payment to unlock live applications, outreach, and account manager execution.",
        tone: "green",
        primaryHref: "/portal/billing",
        primaryLabel: "Finish Billing Setup",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        meta: capacityLabel ? `Reserved against ${capacityLabel} capacity.` : undefined,
      };
    case "waitlisted":
      return {
        eyebrow: "Waitlist",
        title: "You are in the next review window.",
        body: "This month's onboarding spots are currently full. We will reach back out as soon as a real account manager slot opens.",
        tone: "blue",
        primaryHref: "/portal/profile",
        primaryLabel: "Review Your Profile",
        secondaryHref: "/portal/billing",
        secondaryLabel: "View Billing",
        meta: capacityLabel ? `Current capacity window: ${capacityLabel}.` : undefined,
      };
    case "rejected":
      return {
        eyebrow: "Not Approved",
        title: "We could not approve this search yet.",
        body: "Your current profile is not approved for a managed onboarding spot. You can still update your profile and billing details while we reassess future intake.",
        tone: "red",
        primaryHref: "/portal/profile",
        primaryLabel: "Update Profile",
        secondaryHref: "/portal/billing",
        secondaryLabel: "View Billing",
      };
    case "approved_preview":
      return {
        eyebrow: "Strategy Preview",
        title: "Your strategy preview slot is approved.",
        body: "Your account manager can now prepare your resume audit, target-role plan, and kickoff notes. Live applications and outreach still wait until registration funding is confirmed.",
        tone: "green",
        primaryHref: "/portal/billing",
        primaryLabel: "View Conversion Options",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        meta: capacityLabel ? `Reserved against ${capacityLabel} preview capacity.` : undefined,
      };
    case "call_completed":
      return {
        eyebrow: "First Call Complete",
        title: "Your intro call is complete.",
        body: "We have the information needed to move your preview forward. The next step is preview approval, which still happens before any financial commitment.",
        tone: "green",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        primaryHref: "/portal/profile",
        primaryLabel: "Review Profile",
      };
    case "preview_active":
      return {
        eyebrow: "Strategy Preview",
        title: "Your strategy preview is live.",
        body: "Your account manager is in the planning window now. Convert to full service to move into live applications and outreach.",
        tone: "green",
        primaryHref: "/portal/billing",
        primaryLabel: "Convert to Full Service",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        meta: previewExpiryLabel
          ? `Preview window ends on ${previewExpiryLabel}.`
          : undefined,
      };
    case "preview_expired":
      return {
        eyebrow: "Preview Expired",
        title: "Your preview window has ended.",
        body: "Complete your registration payment to reserve a spot and move into live search execution.",
        tone: "amber",
        primaryHref: "/portal/billing",
        primaryLabel: "Convert to Full Service",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        meta: previewExpiryLabel ? `Preview ended on ${previewExpiryLabel}.` : undefined,
      };
    case "submitted":
    case "pending_review":
    default:
      return {
        eyebrow: "Pending Review",
        title: "Your onboarding is under review.",
        body: "We review fit before a spot is reserved. Your profile is saved, and the next update will come from the team once review is complete.",
        tone: "amber",
        secondaryHref: "/portal/profile",
        secondaryLabel: "Review Profile",
        primaryHref: "/portal/profile",
        primaryLabel: "Review Profile",
      };
  }
}

function toneClasses(tone: IntakeViewModel["tone"]) {
  switch (tone) {
    case "green":
      return {
        shell: "border-green-200 bg-green-50",
        eyebrow: "text-green-700",
        body: "text-green-900/85",
        button: "bg-green-600 hover:bg-green-700",
      };
    case "blue":
      return {
        shell: "border-violet-200 bg-violet-50",
        eyebrow: "text-violet-700",
        body: "text-violet-900/85",
        button: "bg-violet-600 hover:bg-violet-700",
      };
    case "red":
      return {
        shell: "border-red-200 bg-red-50",
        eyebrow: "text-red-700",
        body: "text-red-900/85",
        button: "bg-red-600 hover:bg-red-700",
      };
    case "amber":
    default:
      return {
        shell: "border-amber-200 bg-amber-50",
        eyebrow: "text-amber-700",
        body: "text-amber-900/85",
        button: "bg-amber-600 hover:bg-amber-700",
      };
  }
}

export default async function PortalPage() {
  const user = await getCurrentUser();
  // Layout already handles redirect, but guard for safety
  if (!user) return null;

  // Check if user needs onboarding
  const cookieStore = await cookies();
  const skippedOnboarding = cookieStore.get("jg_onboarding_skipped");

  // Get job seeker details
  const { data: jobSeeker } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", user.id)
    .single();

  // Redirect to onboarding if new user (hasn't completed onboarding and hasn't skipped)
  if (jobSeeker && !jobSeeker.onboarding_completed_at && !skippedOnboarding) {
    redirect("/portal/onboarding");
  }

  const intakeState = await getIntakeStateByJobSeekerId(user.id);
  const accountManager = await getAssignedAccountManager(user.id);

  if (
    intakeState &&
    [
      "submitted",
      "pending_review",
      "call_completed",
      "waitlisted",
      "rejected",
      "approved_payment_pending",
      "approved_preview",
      "preview_active",
      "preview_expired",
    ].includes(intakeState.status)
  ) {
    const view = buildIntakeStatusView(intakeState);
    const tone = toneClasses(view.tone);

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className={`rounded-3xl border p-8 shadow-sm ${tone.shell}`}>
          <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${tone.eyebrow}`}>
            {view.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">{view.title}</h1>
          <p className={`mt-4 max-w-2xl text-base leading-relaxed ${tone.body}`}>
            {view.body}
          </p>
          {view.meta && <p className={`mt-3 text-sm ${tone.body}`}>{view.meta}</p>}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={view.primaryHref}
              className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors ${tone.button}`}
            >
              {view.primaryLabel}
            </Link>
            {view.secondaryHref && view.secondaryLabel && (
              <Link
                href={view.secondaryHref}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {view.secondaryLabel}
              </Link>
            )}
          </div>
        </div>

        {accountManager && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Assigned Account Manager</h2>
            <p className="mt-3 font-medium text-gray-900">
              {accountManager.name || "Assigned account manager"}
            </p>
            {accountManager.email && (
              <p className="text-sm text-gray-600">{accountManager.email}</p>
            )}
            <p className="mt-3 text-sm text-gray-500">
              Your search owner has been attached to this onboarding slot. Live execution
              begins once your current intake status allows it.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Get application stats
  const [{ count: completedApplications }, { count: matchedJobsCount }, { data: offerInterview }] = await Promise.all([
    supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .eq("job_seeker_id", user.id)
      .eq("status", "COMPLETED"),
    supabaseAdmin
      .from("job_match_scores")
      .select("id", { count: "exact", head: true })
      .eq("job_seeker_id", user.id),
    supabaseAdmin
      .from("interviews")
      .select("id")
      .eq("job_seeker_id", user.id)
      .in("outcome", ["offer_extended", "hired"])
      .limit(1),
  ]);

  const { count: pendingApplications } = await supabaseAdmin
    .from("application_queue")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", user.id)
    .eq("status", "QUEUED");

  // Get upcoming interviews
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select("*")
    .eq("job_seeker_id", user.id)
    .eq("status", "SCHEDULED")
    .order("scheduled_at", { ascending: true })
    .limit(5);

  // Get unread conversation and task counts
  let unreadConversations = 0;
  let openTasks = 0;
  const { data: myConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("job_seeker_id", user.id);

  if (myConvos && myConvos.length > 0) {
    const convoIds = myConvos.map((c: { id: string }) => c.id);
    const [{ count }, { data: taskMessages }] = await Promise.all([
      supabaseAdmin
        .from("conversation_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .eq("sender_type", "account_manager")
        .in("conversation_id", convoIds),
      supabaseAdmin
        .from("conversation_messages")
        .select("attachments")
        .eq("sender_type", "account_manager")
        .in("conversation_id", convoIds),
    ]);
    unreadConversations = count ?? 0;
    openTasks = (taskMessages ?? []).filter((message: { attachments: unknown }) =>
      hasOpenTask(message.attachments)
    ).length;
  }

  const profileCompletion = jobSeeker?.profile_completion ?? 0;

  // Determine pipeline stage
  type PipelineStage = "profile" | "matched" | "applying" | "interviewing" | "offer" | "placed";
  function getPipelineStage(): PipelineStage {
    if (jobSeeker?.placed_at) return "placed";
    if (offerInterview && offerInterview.length > 0) return "offer";
    if (interviews && interviews.length > 0) return "interviewing";
    if ((completedApplications ?? 0) > 0 || (pendingApplications ?? 0) > 0) return "applying";
    if ((matchedJobsCount ?? 0) > 0) return "matched";
    return "profile";
  }
  const pipelineStage = getPipelineStage();
  const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
    { key: "profile", label: "Profile Setup" },
    { key: "matched", label: "Matched" },
    { key: "applying", label: "Applying" },
    { key: "interviewing", label: "Interviewing" },
    { key: "offer", label: "Offer" },
    { key: "placed", label: "Placed!" },
  ];
  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.key === pipelineStage);

  // Determine action items
  const actions: { label: string; href: string }[] = [];
  if (!jobSeeker?.phone) actions.push({ label: "Add your phone number", href: "/portal/profile" });
  if (!jobSeeker?.linkedin_url) actions.push({ label: "Add your LinkedIn profile", href: "/portal/profile" });
  if (!jobSeeker?.skills?.length) actions.push({ label: "Add your skills", href: "/portal/profile" });
  if (!jobSeeker?.work_history?.length) actions.push({ label: "Add work history", href: "/portal/profile" });
  if (!jobSeeker?.education?.length) actions.push({ label: "Add education", href: "/portal/profile" });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Profile Completion Banner */}
      {profileCompletion < 80 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-amber-800 font-medium">Complete your profile to get started</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Your account manager will begin searching and applying for jobs once your profile is sufficiently filled out (target: 80%).
            </p>
          </div>
          <Link
            href="/portal/profile"
            className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 shrink-0"
          >
            Complete Profile
          </Link>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-green-800 text-sm font-medium">
            Your profile is ready &mdash; your account manager is actively working on your behalf.
          </p>
        </div>
      )}

      {/* Welcome + Profile Completion */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome back, {jobSeeker?.full_name || user.email}!
            </h2>
            <p className="text-gray-600 mt-1">
              Your job search is being managed by JobGenius.
            </p>
          </div>
          <Link
            href="/portal/progress"
            className="flex items-center gap-3 px-4 py-2 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
          >
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.915" fill="none" stroke="#8b5cf6" strokeWidth="3"
                  strokeDasharray={`${profileCompletion} ${100 - profileCompletion}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-violet-700">
                {profileCompletion}%
              </span>
            </div>
            <span className="text-sm font-medium text-violet-700">Profile</span>
          </Link>
        </div>
      </div>

      {/* Journey Pipeline */}
      <div className="bg-white rounded-lg shadow p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Your Journey</h3>
        <div className="flex items-center gap-0">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isCompleted = idx < stageIndex;
            const isActive = idx === stageIndex;
            return (
              <div key={stage.key} className="flex-1 flex items-center">
                <div className="flex flex-col items-center w-full">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    isCompleted ? "bg-violet-600 border-violet-600 text-white" :
                    isActive ? "bg-white border-violet-600 text-violet-600" :
                    "bg-white border-gray-200 text-gray-400"
                  }`}>
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <span className={`mt-1 text-xs text-center leading-tight ${
                    isActive ? "text-violet-700 font-semibold" :
                    isCompleted ? "text-violet-600" :
                    "text-gray-400"
                  }`}>
                    {stage.label}
                  </span>
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${idx < stageIndex ? "bg-violet-600" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Applications Sent</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{completedApplications ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">In Queue</div>
          <div className="mt-1 text-3xl font-bold text-violet-600">{pendingApplications ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Upcoming Interviews</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{interviews?.length ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Unread Messages</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{unreadConversations}</div>
          <p className="text-xs text-amber-700 mt-1">{openTasks} open tasks</p>
          <Link href="/portal/conversations" className="text-xs text-purple-600 hover:text-purple-800">
            View conversations →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Manager */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Account Manager</h3>
          {accountManager ? (
            <div>
              <p className="text-gray-900 font-medium">{accountManager.name || "Assigned account manager"}</p>
              {accountManager.email && (
                <p className="text-gray-600 text-sm">{accountManager.email}</p>
              )}
              <p className="mt-3 text-sm text-gray-500">
                Your account manager is handling your job applications and outreach.
                Contact them if you have any questions.
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No account manager assigned yet.</p>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Next Steps</h3>
          {actions.length > 0 ? (
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.label}>
                  <Link
                    href={action.href}
                    className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    {action.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-green-600 font-medium">
              Your profile is looking great! Keep applying.
            </p>
          )}
        </div>
      </div>

      {/* Upcoming Interviews */}
      {interviews && interviews.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Interviews</h3>
            <Link href="/portal/interviews" className="text-sm text-violet-600 hover:text-violet-800">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {interviews.map((interview: Record<string, unknown>) => (
              <div
                key={interview.id as string}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{interview.company_name as string}</p>
                  <p className="text-sm text-gray-600">{interview.role_title as string}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(interview.scheduled_at as string).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(interview.scheduled_at as string).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {jobSeeker?.skills && jobSeeker.skills.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Your Skills</h3>
            <Link href="/portal/profile" className="text-sm text-violet-600 hover:text-violet-800">
              Edit
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobSeeker.skills.map((skill: string) => (
              <span
                key={skill}
                className="px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
