import { supabaseAdmin } from "@/lib/auth";
import {
  buildDailyWorkMetricSummary,
  classifyFollowUpMessageIds,
  deriveWorkReportReviewState,
  getWorkReportDateRange,
  isManualWorkActivityType,
  ManualWorkActivityType,
  normalizeWorkReportDate,
  WorkReportReviewState,
  WorkReportStatus,
} from "@/lib/work-reports";

type AccountManagerRow = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  status: string | null;
  auth_id: string | null;
};

type DailyWorkReportRow = {
  id: string;
  account_manager_id: string;
  report_date: string;
  summary_comment: string | null;
  blockers_comment: string | null;
  focus_next_comment: string | null;
  status: WorkReportStatus;
  submitted_at: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ManualWorkActivityLogRow = {
  id: string;
  account_manager_id: string;
  report_date: string;
  activity_type: ManualWorkActivityType;
  quantity: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  job_seeker_id: string;
  account_manager_id: string;
};

type ApplicationRunRow = {
  job_seeker_id: string;
};

type InterviewRow = {
  account_manager_id: string;
};

type OfferRow = {
  reported_by_user_id: string | null;
};

type RecruiterThreadRelation =
  | { job_seeker_id: string | null }
  | { job_seeker_id: string | null }[]
  | null;

type OutboundMessageDayRow = {
  id: string;
  recruiter_thread_id: string;
  step_number: number | null;
  created_at: string;
  recruiter_threads: RecruiterThreadRelation;
};

type OutboundMessageRow = {
  id: string;
  recruiter_thread_id: string;
  step_number: number | null;
  created_at: string;
};

type SystemCounts = {
  automatedApplications: number;
  systemFollowUps: number;
  systemInterviews: number;
  systemOffers: number;
};

type ManualCounts = {
  manualApplications: number;
  manualFollowUps: number;
  manualInterviews: number;
  manualOffers: number;
};

export type DailyWorkReportRecord = {
  id: string;
  reportDate: string;
  summaryComment: string;
  blockersComment: string;
  focusNextComment: string;
  status: WorkReportStatus;
  submittedAt: string | null;
  lockedAt: string | null;
  updatedAt: string;
};

export type ManualWorkActivityRecord = {
  id: string;
  reportDate: string;
  activityType: ManualWorkActivityType;
  quantity: number;
  note: string;
  createdAt: string;
};

export type DailyWorkReportBundle = {
  reportDate: string;
  report: DailyWorkReportRecord | null;
  manualActivities: ManualWorkActivityRecord[];
  metrics: ReturnType<typeof buildDailyWorkMetricSummary>;
};

export type RecentWorkHistoryRecord = {
  reportDate: string;
  hasReport: boolean;
  status: WorkReportStatus | null;
  manualTotal: number;
};

export type MyWorkReportHistoryRecord = {
  reportDate: string;
  report: DailyWorkReportRecord | null;
  manualTotal: number;
};

export type TeamWorkReportRow = DailyWorkReportBundle & {
  accountManager: {
    id: string;
    name: string;
    email: string;
    role: string | null;
    status: string | null;
  };
  reviewState: WorkReportReviewState;
  recentHistory: RecentWorkHistoryRecord[];
};

export type TeamWorkReportSummary = {
  reportDate: string;
  rows: TeamWorkReportRow[];
  totals: ReturnType<typeof buildDailyWorkMetricSummary>;
  submittedCount: number;
  lockedCount: number;
  draftCount: number;
  missingCount: number;
};

export class WorkReportError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function emptySystemCounts(): SystemCounts {
  return {
    automatedApplications: 0,
    systemFollowUps: 0,
    systemInterviews: 0,
    systemOffers: 0,
  };
}

function emptyManualCounts(): ManualCounts {
  return {
    manualApplications: 0,
    manualFollowUps: 0,
    manualInterviews: 0,
    manualOffers: 0,
  };
}

function toReportRecord(row: DailyWorkReportRow | null): DailyWorkReportRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    reportDate: row.report_date,
    summaryComment: row.summary_comment ?? "",
    blockersComment: row.blockers_comment ?? "",
    focusNextComment: row.focus_next_comment ?? "",
    status: row.status,
    submittedAt: row.submitted_at,
    lockedAt: row.locked_at,
    updatedAt: row.updated_at,
  };
}

function toManualActivityRecord(row: ManualWorkActivityLogRow): ManualWorkActivityRecord {
  return {
    id: row.id,
    reportDate: row.report_date,
    activityType: row.activity_type,
    quantity: row.quantity,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

function getThreadJobSeekerId(relation: RecruiterThreadRelation): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    return relation[0]?.job_seeker_id ?? null;
  }
  return relation.job_seeker_id ?? null;
}

function filterReportableAccountManagers(rows: AccountManagerRow[]): AccountManagerRow[] {
  return rows.filter((row) => {
    const normalizedStatus = String(row.status ?? "").toLowerCase().trim();
    if (!row.auth_id) return false;
    if (normalizedStatus === "rejected" || normalizedStatus === "converted") return false;
    return true;
  });
}

async function listReportableAccountManagers(): Promise<AccountManagerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("id, email, name, role, status, auth_id")
    .order("name", { ascending: true });

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return filterReportableAccountManagers((data as AccountManagerRow[] | null) ?? []);
}

async function getDailyWorkReportById(reportId: string): Promise<DailyWorkReportRow | null> {
  const { data, error } = await supabaseAdmin
    .from("daily_work_reports")
    .select(
      "id, account_manager_id, report_date, summary_comment, blockers_comment, focus_next_comment, status, submitted_at, locked_at, created_at, updated_at"
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return (data as DailyWorkReportRow | null) ?? null;
}

async function getExistingDailyWorkReport(
  accountManagerId: string,
  reportDate: string
): Promise<DailyWorkReportRow | null> {
  const { data, error } = await supabaseAdmin
    .from("daily_work_reports")
    .select(
      "id, account_manager_id, report_date, summary_comment, blockers_comment, focus_next_comment, status, submitted_at, locked_at, created_at, updated_at"
    )
    .eq("account_manager_id", accountManagerId)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return (data as DailyWorkReportRow | null) ?? null;
}

async function ensureDailyWorkReportExists(
  accountManagerId: string,
  reportDate: string
) {
  const existing = await ensureEditableReport(accountManagerId, reportDate);
  if (existing) return existing;

  const { error } = await supabaseAdmin
    .from("daily_work_reports")
    .upsert(
      {
        account_manager_id: accountManagerId,
        report_date: reportDate,
        status: "draft",
      },
      { onConflict: "account_manager_id,report_date", ignoreDuplicates: true }
    );

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  const created = await getExistingDailyWorkReport(accountManagerId, reportDate);
  if (!created) {
    throw new WorkReportError(500, "Failed to create daily report.");
  }
  if (created.status === "locked") {
    throw new WorkReportError(409, "This report has been locked and cannot be edited.");
  }
  return created;
}

async function ensureEditableReport(accountManagerId: string, reportDate: string) {
  const existing = await getExistingDailyWorkReport(accountManagerId, reportDate);
  if (existing?.status === "locked") {
    throw new WorkReportError(409, "This report has been locked and cannot be edited.");
  }
  return existing;
}

async function listDailyWorkReportsForDate(
  reportDate: string,
  accountManagerIds: string[]
): Promise<DailyWorkReportRow[]> {
  if (accountManagerIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("daily_work_reports")
    .select(
      "id, account_manager_id, report_date, summary_comment, blockers_comment, focus_next_comment, status, submitted_at, locked_at, created_at, updated_at"
    )
    .eq("report_date", reportDate)
    .in("account_manager_id", accountManagerIds);

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return ((data as DailyWorkReportRow[] | null) ?? []).filter((row) => row.status);
}

async function listRecentDailyWorkReports(
  reportDate: string,
  accountManagerIds: string[]
): Promise<DailyWorkReportRow[]> {
  if (accountManagerIds.length === 0) return [];

  const historyStart = new Date(`${reportDate}T00:00:00.000Z`);
  historyStart.setUTCDate(historyStart.getUTCDate() - 60);
  const historyStartDate = historyStart.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("daily_work_reports")
    .select(
      "id, account_manager_id, report_date, summary_comment, blockers_comment, focus_next_comment, status, submitted_at, locked_at, created_at, updated_at"
    )
    .gte("report_date", historyStartDate)
    .lt("report_date", reportDate)
    .in("account_manager_id", accountManagerIds)
    .order("report_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return ((data as DailyWorkReportRow[] | null) ?? []).filter((row) => row.status);
}

async function listRecentManualWorkActivities(
  reportDate: string,
  accountManagerIds: string[]
): Promise<ManualWorkActivityLogRow[]> {
  if (accountManagerIds.length === 0) return [];

  const historyStart = new Date(`${reportDate}T00:00:00.000Z`);
  historyStart.setUTCDate(historyStart.getUTCDate() - 60);
  const historyStartDate = historyStart.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("manual_work_activity_logs")
    .select("id, account_manager_id, report_date, activity_type, quantity, note, created_at, updated_at")
    .gte("report_date", historyStartDate)
    .lt("report_date", reportDate)
    .in("account_manager_id", accountManagerIds)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return ((data as ManualWorkActivityLogRow[] | null) ?? []).filter((row) =>
    isManualWorkActivityType(row.activity_type)
  );
}

async function listManualWorkActivitiesForDate(
  reportDate: string,
  accountManagerIds: string[]
): Promise<ManualWorkActivityLogRow[]> {
  if (accountManagerIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("manual_work_activity_logs")
    .select("id, account_manager_id, report_date, activity_type, quantity, note, created_at, updated_at")
    .eq("report_date", reportDate)
    .in("account_manager_id", accountManagerIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return ((data as ManualWorkActivityLogRow[] | null) ?? []).filter((row) =>
    isManualWorkActivityType(row.activity_type)
  );
}

function buildManualCountsByAm(
  activities: ManualWorkActivityLogRow[]
): Map<string, ManualCounts> {
  const countsByAm = new Map<string, ManualCounts>();

  for (const activity of activities) {
    const existing = countsByAm.get(activity.account_manager_id) ?? emptyManualCounts();

    switch (activity.activity_type) {
      case "application_manual":
        existing.manualApplications += activity.quantity;
        break;
      case "follow_up_manual":
        existing.manualFollowUps += activity.quantity;
        break;
      case "interview_manual":
        existing.manualInterviews += activity.quantity;
        break;
      case "offer_manual":
        existing.manualOffers += activity.quantity;
        break;
    }

    countsByAm.set(activity.account_manager_id, existing);
  }

  return countsByAm;
}

async function buildSystemCountsByAm(
  reportDate: string,
  accountManagerIds: string[]
): Promise<Map<string, SystemCounts>> {
  const countsByAm = new Map<string, SystemCounts>();
  if (accountManagerIds.length === 0) return countsByAm;

  const range = getWorkReportDateRange(reportDate);

  const [{ data: assignments, error: assignmentError }, { data: interviews, error: interviewError }, { data: offers, error: offerError }, { data: applicationRuns, error: applicationError }] =
    await Promise.all([
      supabaseAdmin
        .from("job_seeker_assignments")
        .select("job_seeker_id, account_manager_id")
        .in("account_manager_id", accountManagerIds),
      supabaseAdmin
        .from("interviews")
        .select("account_manager_id")
        .in("account_manager_id", accountManagerIds)
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso),
      supabaseAdmin
        .from("job_offers")
        .select("reported_by_user_id")
        .eq("reported_by", "am")
        .in("reported_by_user_id", accountManagerIds)
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso),
      supabaseAdmin
        .from("application_runs")
        .select("job_seeker_id")
        .eq("status", "APPLIED")
        .gte("updated_at", range.startIso)
        .lt("updated_at", range.endIso),
    ]);

  if (assignmentError) {
    throw new WorkReportError(500, assignmentError.message);
  }
  if (interviewError) {
    throw new WorkReportError(500, interviewError.message);
  }
  if (offerError) {
    throw new WorkReportError(500, offerError.message);
  }
  if (applicationError) {
    throw new WorkReportError(500, applicationError.message);
  }

  const assignmentMap = new Map<string, string>();
  for (const assignment of (assignments as AssignmentRow[] | null) ?? []) {
    assignmentMap.set(assignment.job_seeker_id, assignment.account_manager_id);
  }

  for (const run of (applicationRuns as ApplicationRunRow[] | null) ?? []) {
    const amId = assignmentMap.get(run.job_seeker_id);
    if (!amId) continue;
    const counts = countsByAm.get(amId) ?? emptySystemCounts();
    counts.automatedApplications += 1;
    countsByAm.set(amId, counts);
  }

  for (const interview of (interviews as InterviewRow[] | null) ?? []) {
    const counts = countsByAm.get(interview.account_manager_id) ?? emptySystemCounts();
    counts.systemInterviews += 1;
    countsByAm.set(interview.account_manager_id, counts);
  }

  for (const offer of (offers as OfferRow[] | null) ?? []) {
    if (!offer.reported_by_user_id) continue;
    const counts = countsByAm.get(offer.reported_by_user_id) ?? emptySystemCounts();
    counts.systemOffers += 1;
    countsByAm.set(offer.reported_by_user_id, counts);
  }

  const { data: dayMessages, error: dayMessageError } = await supabaseAdmin
    .from("outreach_messages")
    .select(
      "id, recruiter_thread_id, step_number, created_at, recruiter_threads ( job_seeker_id )"
    )
    .eq("direction", "outbound")
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso);

  if (dayMessageError) {
    throw new WorkReportError(500, dayMessageError.message);
  }

  const followUpDayMessages = ((dayMessages as OutboundMessageDayRow[] | null) ?? []).filter(
    (message) => {
      const jobSeekerId = getThreadJobSeekerId(message.recruiter_threads);
      if (!jobSeekerId) return false;
      const amId = assignmentMap.get(jobSeekerId);
      return Boolean(amId);
    }
  );

  const threadIds = Array.from(
    new Set(followUpDayMessages.map((message) => message.recruiter_thread_id))
  );

  if (threadIds.length === 0) {
    return countsByAm;
  }

  const { data: allThreadMessages, error: allThreadMessageError } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, recruiter_thread_id, step_number, created_at")
    .eq("direction", "outbound")
    .in("recruiter_thread_id", threadIds)
    .lt("created_at", range.endIso);

  if (allThreadMessageError) {
    throw new WorkReportError(500, allThreadMessageError.message);
  }

  const followUpIds = classifyFollowUpMessageIds(
    ((allThreadMessages as OutboundMessageRow[] | null) ?? []).map((row) => ({
      id: row.id,
      recruiterThreadId: row.recruiter_thread_id,
      createdAt: row.created_at,
      stepNumber: row.step_number,
    })),
    followUpDayMessages.map((row) => ({
      id: row.id,
      recruiterThreadId: row.recruiter_thread_id,
      createdAt: row.created_at,
      stepNumber: row.step_number,
    }))
  );

  for (const message of followUpDayMessages) {
    if (!followUpIds.has(message.id)) continue;
    const jobSeekerId = getThreadJobSeekerId(message.recruiter_threads);
    if (!jobSeekerId) continue;
    const amId = assignmentMap.get(jobSeekerId);
    if (!amId) continue;
    const counts = countsByAm.get(amId) ?? emptySystemCounts();
    counts.systemFollowUps += 1;
    countsByAm.set(amId, counts);
  }

  return countsByAm;
}

function buildBundleForAccountManager(args: {
  reportDate: string;
  report: DailyWorkReportRow | null;
  manualActivities: ManualWorkActivityLogRow[];
  systemCounts: SystemCounts | undefined;
  manualCounts: ManualCounts | undefined;
}): DailyWorkReportBundle {
  const systemCounts = args.systemCounts ?? emptySystemCounts();
  const manualCounts = args.manualCounts ?? emptyManualCounts();

  return {
    reportDate: args.reportDate,
    report: toReportRecord(args.report),
    manualActivities: args.manualActivities.map(toManualActivityRecord),
    metrics: buildDailyWorkMetricSummary({
      automatedApplications: systemCounts.automatedApplications,
      manualApplications: manualCounts.manualApplications,
      systemFollowUps: systemCounts.systemFollowUps,
      manualFollowUps: manualCounts.manualFollowUps,
      systemInterviews: systemCounts.systemInterviews,
      manualInterviews: manualCounts.manualInterviews,
      systemOffers: systemCounts.systemOffers,
      manualOffers: manualCounts.manualOffers,
    }),
  };
}

export async function getDailyWorkReportBundle(
  accountManagerId: string,
  reportDateInput?: string | null
): Promise<DailyWorkReportBundle> {
  const reportDate = normalizeWorkReportDate(reportDateInput);
  const [report, manualActivities, systemCountsByAm] = await Promise.all([
    getExistingDailyWorkReport(accountManagerId, reportDate),
    listManualWorkActivitiesForDate(reportDate, [accountManagerId]),
    buildSystemCountsByAm(reportDate, [accountManagerId]),
  ]);

  const manualCountsByAm = buildManualCountsByAm(manualActivities);

  return buildBundleForAccountManager({
    reportDate,
    report,
    manualActivities,
    systemCounts: systemCountsByAm.get(accountManagerId),
    manualCounts: manualCountsByAm.get(accountManagerId),
  });
}

export async function listMyWorkReportHistory(
  accountManagerId: string,
  beforeDateInput?: string | null
): Promise<MyWorkReportHistoryRecord[]> {
  const beforeDate = normalizeWorkReportDate(beforeDateInput);
  const [{ data: reports, error: reportError }, { data: activities, error: activityError }] =
    await Promise.all([
      supabaseAdmin
        .from("daily_work_reports")
        .select(
          "id, account_manager_id, report_date, summary_comment, blockers_comment, focus_next_comment, status, submitted_at, locked_at, created_at, updated_at"
        )
        .eq("account_manager_id", accountManagerId)
        .lt("report_date", beforeDate)
        .order("report_date", { ascending: false }),
      supabaseAdmin
        .from("manual_work_activity_logs")
        .select("id, account_manager_id, report_date, activity_type, quantity, note, created_at, updated_at")
        .eq("account_manager_id", accountManagerId)
        .lt("report_date", beforeDate)
        .order("report_date", { ascending: false }),
    ]);

  if (reportError) throw new WorkReportError(500, reportError.message);
  if (activityError) throw new WorkReportError(500, activityError.message);

  const history = new Map<string, MyWorkReportHistoryRecord>();
  for (const report of (reports as DailyWorkReportRow[] | null) ?? []) {
    history.set(report.report_date, {
      reportDate: report.report_date,
      report: toReportRecord(report),
      manualTotal: 0,
    });
  }

  for (const activity of (activities as ManualWorkActivityLogRow[] | null) ?? []) {
    if (!isManualWorkActivityType(activity.activity_type)) continue;
    const existing = history.get(activity.report_date) ?? {
      reportDate: activity.report_date,
      report: null,
      manualTotal: 0,
    };
    existing.manualTotal += activity.quantity;
    history.set(activity.report_date, existing);
  }

  return Array.from(history.values()).sort((a, b) =>
    b.reportDate.localeCompare(a.reportDate)
  );
}

export async function listTeamWorkReportRows(
  reportDateInput?: string | null
): Promise<TeamWorkReportSummary> {
  const reportDate = normalizeWorkReportDate(reportDateInput);
  const accountManagers = await listReportableAccountManagers();
  const accountManagerIds = accountManagers.map((row) => row.id);

  const [
    reportsForDay,
    recentReports,
    recentManualActivities,
    manualActivitiesForDay,
    systemCountsForDay,
  ] =
    await Promise.all([
    listDailyWorkReportsForDate(reportDate, accountManagerIds),
    listRecentDailyWorkReports(reportDate, accountManagerIds),
    listRecentManualWorkActivities(reportDate, accountManagerIds),
    listManualWorkActivitiesForDate(reportDate, accountManagerIds),
    buildSystemCountsByAm(reportDate, accountManagerIds),
    ]);

  const reportMap = new Map(
    reportsForDay.map((report) => [report.account_manager_id, report])
  );
  const manualCountsByAm = buildManualCountsByAm(manualActivitiesForDay);
  const manualActivitiesByAm = new Map<string, ManualWorkActivityLogRow[]>();
  const recentHistoryByAm = new Map<string, Map<string, RecentWorkHistoryRecord>>();

  for (const activity of manualActivitiesForDay) {
    const existing = manualActivitiesByAm.get(activity.account_manager_id) ?? [];
    existing.push(activity);
    manualActivitiesByAm.set(activity.account_manager_id, existing);
  }

  for (const row of recentReports) {
    const byDate = recentHistoryByAm.get(row.account_manager_id) ?? new Map();
    byDate.set(row.report_date, {
      reportDate: row.report_date,
      hasReport: true,
      status: row.status,
      manualTotal: byDate.get(row.report_date)?.manualTotal ?? 0,
    });
    recentHistoryByAm.set(row.account_manager_id, byDate);
  }

  for (const activity of recentManualActivities) {
    const byDate = recentHistoryByAm.get(activity.account_manager_id) ?? new Map();
    const existing = byDate.get(activity.report_date) ?? {
      reportDate: activity.report_date,
      hasReport: false,
      status: null,
      manualTotal: 0,
    };
    existing.manualTotal += activity.quantity;
    byDate.set(activity.report_date, existing);
    recentHistoryByAm.set(activity.account_manager_id, byDate);
  }

  const rows = accountManagers
    .map<TeamWorkReportRow>((accountManager) => {
      const bundle = buildBundleForAccountManager({
        reportDate,
        report: reportMap.get(accountManager.id) ?? null,
        manualActivities: manualActivitiesByAm.get(accountManager.id) ?? [],
        systemCounts: systemCountsForDay.get(accountManager.id),
        manualCounts: manualCountsByAm.get(accountManager.id),
      });

      return {
        ...bundle,
        accountManager: {
          id: accountManager.id,
          name: accountManager.name?.trim() || accountManager.email,
          email: accountManager.email,
          role: accountManager.role,
          status: accountManager.status,
        },
        reviewState: deriveWorkReportReviewState({
          // Existing manual-only days predate automatic draft creation but are
          // still valid work reports and must not be presented as missing.
          hasReport: Boolean(bundle.report) || bundle.manualActivities.length > 0,
          status: bundle.report?.status,
        }),
        recentHistory: Array.from(
          (recentHistoryByAm.get(accountManager.id) ?? new Map()).values()
        )
          .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
          .slice(0, 6),
      };
    })
    .sort((a, b) => {
      const priority: Record<WorkReportReviewState, number> = {
        missing: 3,
        draft: 2,
        submitted: 1,
        locked: 0,
      };
      if (priority[a.reviewState] !== priority[b.reviewState]) {
        return priority[b.reviewState] - priority[a.reviewState];
      }
      if (a.metrics.grandTotal !== b.metrics.grandTotal) {
        return b.metrics.grandTotal - a.metrics.grandTotal;
      }
      return a.accountManager.name.localeCompare(b.accountManager.name);
    });

  const totals = rows.reduce(
    (acc, row) => {
      acc.automatedApplications += row.metrics.applications.system;
      acc.manualApplications += row.metrics.applications.manual;
      acc.systemFollowUps += row.metrics.followUps.system;
      acc.manualFollowUps += row.metrics.followUps.manual;
      acc.systemInterviews += row.metrics.interviews.system;
      acc.manualInterviews += row.metrics.interviews.manual;
      acc.systemOffers += row.metrics.offers.system;
      acc.manualOffers += row.metrics.offers.manual;
      return acc;
    },
    {
      automatedApplications: 0,
      manualApplications: 0,
      systemFollowUps: 0,
      manualFollowUps: 0,
      systemInterviews: 0,
      manualInterviews: 0,
      systemOffers: 0,
      manualOffers: 0,
    }
  );

  return {
    reportDate,
    rows,
    totals: buildDailyWorkMetricSummary(totals),
    submittedCount: rows.filter((row) => row.reviewState === "submitted").length,
    lockedCount: rows.filter((row) => row.reviewState === "locked").length,
    draftCount: rows.filter((row) => row.reviewState === "draft").length,
    missingCount: rows.filter((row) => row.reviewState === "missing").length,
  };
}

export async function upsertDailyWorkReport(params: {
  accountManagerId: string;
  reportDateInput?: string | null;
  summaryComment?: string | null;
  blockersComment?: string | null;
  focusNextComment?: string | null;
  submit?: boolean;
}) {
  const reportDate = normalizeWorkReportDate(params.reportDateInput);
  const existing = await ensureEditableReport(params.accountManagerId, reportDate);
  const nowIso = new Date().toISOString();

  const payload = {
    account_manager_id: params.accountManagerId,
    report_date: reportDate,
    summary_comment: params.summaryComment?.trim() || null,
    blockers_comment: params.blockersComment?.trim() || null,
    focus_next_comment: params.focusNextComment?.trim() || null,
    status: (
      params.submit
        ? "submitted"
        : existing?.status === "submitted"
        ? "submitted"
        : "draft"
    ) as WorkReportStatus,
    submitted_at:
      params.submit || existing?.status === "submitted"
        ? existing?.submitted_at ?? nowIso
        : null,
  };

  if (existing) {
    const { error } = await supabaseAdmin
      .from("daily_work_reports")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw new WorkReportError(500, error.message);
    }
  } else {
    const { error } = await supabaseAdmin.from("daily_work_reports").insert(payload);

    if (error) {
      throw new WorkReportError(500, error.message);
    }
  }

  return getDailyWorkReportBundle(params.accountManagerId, reportDate);
}

export async function addManualWorkActivity(params: {
  accountManagerId: string;
  reportDateInput?: string | null;
  activityType: ManualWorkActivityType;
  quantity: number;
  note?: string | null;
}) {
  const reportDate = normalizeWorkReportDate(params.reportDateInput);
  // Manual work is itself a daily report signal. Create the draft here so it
  // appears on the team report without requiring a second submit action.
  await ensureDailyWorkReportExists(params.accountManagerId, reportDate);

  const { error } = await supabaseAdmin.from("manual_work_activity_logs").insert({
    account_manager_id: params.accountManagerId,
    report_date: reportDate,
    activity_type: params.activityType,
    quantity: params.quantity,
    note: params.note?.trim() || null,
  });

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return getDailyWorkReportBundle(params.accountManagerId, reportDate);
}

export async function deleteManualWorkActivity(params: {
  accountManagerId: string;
  activityId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("manual_work_activity_logs")
    .select("id, account_manager_id, report_date")
    .eq("id", params.activityId)
    .maybeSingle();

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  if (!data || data.account_manager_id !== params.accountManagerId) {
    throw new WorkReportError(404, "Manual activity not found.");
  }

  await ensureEditableReport(params.accountManagerId, data.report_date);

  const { error: deleteError } = await supabaseAdmin
    .from("manual_work_activity_logs")
    .delete()
    .eq("id", params.activityId);

  if (deleteError) {
    throw new WorkReportError(500, deleteError.message);
  }

  return getDailyWorkReportBundle(params.accountManagerId, data.report_date);
}

export async function updateDailyWorkReportReviewStatus(params: {
  reportId: string;
  nextStatus: "locked" | "submitted";
  actorAccountManagerId: string;
}) {
  const report = await getDailyWorkReportById(params.reportId);
  if (!report) {
    throw new WorkReportError(404, "Work report not found.");
  }

  const patch: {
    status: WorkReportStatus;
    locked_at?: string | null;
    locked_by_account_manager_id?: string | null;
    submitted_at?: string | null;
  } = {
    status: params.nextStatus,
  };

  if (params.nextStatus === "locked") {
    patch.locked_at = new Date().toISOString();
    patch.locked_by_account_manager_id = params.actorAccountManagerId;
    patch.submitted_at = report.submitted_at ?? new Date().toISOString();
  } else {
    patch.locked_at = null;
    patch.locked_by_account_manager_id = null;
    patch.submitted_at = report.submitted_at ?? new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("daily_work_reports")
    .update(patch)
    .eq("id", report.id);

  if (error) {
    throw new WorkReportError(500, error.message);
  }

  return getDailyWorkReportBundle(report.account_manager_id, report.report_date);
}
