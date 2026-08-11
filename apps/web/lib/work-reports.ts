export const WORK_REPORT_STATUSES = ["draft", "submitted", "locked"] as const;
export type WorkReportStatus = (typeof WORK_REPORT_STATUSES)[number];
export const WORK_REPORT_REVIEW_STATES = [
  "missing",
  "draft",
  "submitted",
  "locked",
] as const;
export type WorkReportReviewState = (typeof WORK_REPORT_REVIEW_STATES)[number];

export const MANUAL_WORK_ACTIVITY_TYPES = [
  "application_manual",
  "follow_up_manual",
  "interview_manual",
  "offer_manual",
] as const;

export type ManualWorkActivityType = (typeof MANUAL_WORK_ACTIVITY_TYPES)[number];

export type ReportDateRange = {
  reportDate: string;
  startIso: string;
  endIso: string;
};

export type FollowUpMessageInput = {
  id: string;
  recruiterThreadId: string;
  createdAt: string;
  stepNumber: number | null;
};

export type MetricSplit = {
  system: number;
  manual: number;
  total: number;
};

export type DailyWorkMetricSummary = {
  applications: MetricSplit;
  followUps: MetricSplit;
  interviews: MetricSplit;
  offers: MetricSplit;
  systemTotal: number;
  manualTotal: number;
  grandTotal: number;
};

export function isWorkReportStatus(value: unknown): value is WorkReportStatus {
  return typeof value === "string" && WORK_REPORT_STATUSES.includes(value as WorkReportStatus);
}

export function isManualWorkActivityType(value: unknown): value is ManualWorkActivityType {
  return (
    typeof value === "string" &&
    MANUAL_WORK_ACTIVITY_TYPES.includes(value as ManualWorkActivityType)
  );
}

export function normalizeWorkReportDate(
  value?: string | null,
  now: Date = new Date()
): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWorkReportDateRange(reportDate: string): ReportDateRange {
  const normalized = normalizeWorkReportDate(reportDate);
  const start = new Date(`${normalized}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    reportDate: normalized,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function labelizeManualWorkActivityType(type: ManualWorkActivityType): string {
  switch (type) {
    case "application_manual":
      return "Manual application";
    case "follow_up_manual":
      return "Manual follow-up";
    case "interview_manual":
      return "Manual interview";
    case "offer_manual":
      return "Manual offer";
    default:
      return type;
  }
}

export function labelizeWorkReportStatus(status: WorkReportStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "locked":
      return "Locked";
    default:
      return status;
  }
}

export function deriveWorkReportReviewState(input: {
  hasReport: boolean;
  status?: WorkReportStatus | null;
}): WorkReportReviewState {
  if (!input.hasReport) return "missing";
  if (input.status === "submitted") return "submitted";
  if (input.status === "locked") return "locked";
  return "draft";
}

export function labelizeWorkReportReviewState(state: WorkReportReviewState): string {
  switch (state) {
    case "missing":
      return "No report yet";
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted";
    case "locked":
      return "Locked";
    default:
      return state;
  }
}

export function classifyFollowUpMessageIds(
  allMessagesBeforeEnd: FollowUpMessageInput[],
  dayMessages: FollowUpMessageInput[]
): Set<string> {
  const firstMessageByThread = new Map<string, string>();

  for (const message of [...allMessagesBeforeEnd].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })) {
    if (!firstMessageByThread.has(message.recruiterThreadId)) {
      firstMessageByThread.set(message.recruiterThreadId, message.id);
    }
  }

  const followUpIds = new Set<string>();

  for (const message of dayMessages) {
    if ((message.stepNumber ?? 0) > 1) {
      followUpIds.add(message.id);
      continue;
    }

    const firstMessageId = firstMessageByThread.get(message.recruiterThreadId);
    if (firstMessageId && firstMessageId !== message.id) {
      followUpIds.add(message.id);
    }
  }

  return followUpIds;
}

export function buildMetricSplit(system: number, manual: number): MetricSplit {
  return {
    system,
    manual,
    total: system + manual,
  };
}

export function buildDailyWorkMetricSummary(args: {
  automatedApplications: number;
  manualApplications: number;
  systemFollowUps: number;
  manualFollowUps: number;
  systemInterviews: number;
  manualInterviews: number;
  systemOffers: number;
  manualOffers: number;
}): DailyWorkMetricSummary {
  const applications = buildMetricSplit(args.automatedApplications, args.manualApplications);
  const followUps = buildMetricSplit(args.systemFollowUps, args.manualFollowUps);
  const interviews = buildMetricSplit(args.systemInterviews, args.manualInterviews);
  const offers = buildMetricSplit(args.systemOffers, args.manualOffers);

  const systemTotal =
    applications.system + followUps.system + interviews.system + offers.system;
  const manualTotal =
    applications.manual + followUps.manual + interviews.manual + offers.manual;

  return {
    applications,
    followUps,
    interviews,
    offers,
    systemTotal,
    manualTotal,
    grandTotal: systemTotal + manualTotal,
  };
}
