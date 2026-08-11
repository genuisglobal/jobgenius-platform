import { supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { createLogger } from "@/lib/logger";
import { NOTIFICATION_CATEGORIES, sendNotification } from "@/lib/notify";
import { listTeamWorkReportRows } from "@/lib/work-reports-server";

const log = createLogger("cron.work-report-reminders");

function isAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (process.env.NODE_ENV !== "production") {
    const host = new URL(request.url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  return false;
}

function getUtcDayStart(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

function formatReviewDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function getExistingDailyKeys(dayStartIso: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("user_id, category")
    .in("category", [
      NOTIFICATION_CATEGORIES.work_report_missing,
      NOTIFICATION_CATEGORIES.work_report_review_digest,
    ])
    .gte("created_at", dayStartIso);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).map((row) => `${String(row.category)}:${String(row.user_id)}`)
  );
}

function buildMissingReportBody(input: {
  reportDate: string;
  reviewState: "missing" | "draft";
}) {
  return [
    `Your daily JobGenuis work report for ${formatReviewDate(input.reportDate)} is still ${input.reviewState}.`,
    "",
    "Update your applications, follow-ups, interviews, offers, and any blockers before the day closes.",
    "",
    "Open your work report to finish it.",
  ].join("\n");
}

function buildManagerDigestBody(input: {
  reportDate: string;
  missingNames: string[];
  draftNames: string[];
  submittedCount: number;
  lockedCount: number;
}) {
  return [
    `Work report review digest for ${formatReviewDate(input.reportDate)}.`,
    "",
    `Missing reports (${input.missingNames.length}): ${
      input.missingNames.length > 0 ? input.missingNames.join(", ") : "None"
    }`,
    `Draft reports (${input.draftNames.length}): ${
      input.draftNames.length > 0 ? input.draftNames.join(", ") : "None"
    }`,
    `Submitted reports: ${input.submittedCount}`,
    `Locked reports: ${input.lockedCount}`,
    "",
    "Open the team work report board to review and lock completed reports.",
  ].join("\n");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayStartIso = getUtcDayStart();

  try {
    const [summary, existingKeys, accountManagersRes] = await Promise.all([
      listTeamWorkReportRows(dayStartIso.slice(0, 10)),
      getExistingDailyKeys(dayStartIso),
      supabaseAdmin.from("account_managers").select("id, role"),
    ]);

    if (accountManagersRes.error) {
      throw new Error(accountManagersRes.error.message);
    }

    const peopleManagers = (accountManagersRes.data ?? []).filter((row) =>
      isPeopleManagerRole(row.role)
    );

    let reminderCount = 0;
    let digestCount = 0;

    const reminderRows = summary.rows.filter(
      (row): row is (typeof summary.rows)[number] & { reviewState: "missing" | "draft" } =>
        row.reviewState === "missing" || row.reviewState === "draft"
    );

    for (const row of reminderRows) {
      const dedupeKey = `${NOTIFICATION_CATEGORIES.work_report_missing}:${row.accountManager.id}`;
      if (existingKeys.has(dedupeKey)) continue;

      const result = await sendNotification({
        userId: row.accountManager.id,
        userType: "am",
        category: NOTIFICATION_CATEGORIES.work_report_missing,
        subject: "Complete your daily work report",
        body: buildMissingReportBody({
          reportDate: summary.reportDate,
          reviewState: row.reviewState,
        }),
        linkUrl: `/dashboard/work-reports/me?date=${summary.reportDate}`,
        channel: "both",
        payload: {
          reportDate: summary.reportDate,
          reviewState: row.reviewState,
          totalWorkItems: row.metrics.grandTotal,
        },
      });

      if (result.id) {
        reminderCount += 1;
        existingKeys.add(dedupeKey);
      }
    }

    if (summary.missingCount > 0 || summary.draftCount > 0) {
      const missingNames = summary.rows
        .filter((row) => row.reviewState === "missing")
        .map((row) => row.accountManager.name);
      const draftNames = summary.rows
        .filter((row) => row.reviewState === "draft")
        .map((row) => row.accountManager.name);

      for (const manager of peopleManagers) {
        const dedupeKey = `${NOTIFICATION_CATEGORIES.work_report_review_digest}:${manager.id}`;
        if (existingKeys.has(dedupeKey)) continue;

        const result = await sendNotification({
          userId: manager.id,
          userType: "am",
          category: NOTIFICATION_CATEGORIES.work_report_review_digest,
          subject: `Work report digest: ${formatReviewDate(summary.reportDate)}`,
          body: buildManagerDigestBody({
            reportDate: summary.reportDate,
            missingNames,
            draftNames,
            submittedCount: summary.submittedCount,
            lockedCount: summary.lockedCount,
          }),
          linkUrl: `/dashboard/work-reports?date=${summary.reportDate}`,
          channel: "both",
          payload: {
            reportDate: summary.reportDate,
            missingCount: summary.missingCount,
            draftCount: summary.draftCount,
            submittedCount: summary.submittedCount,
            lockedCount: summary.lockedCount,
          },
        });

        if (result.id) {
          digestCount += 1;
          existingKeys.add(dedupeKey);
        }
      }
    }

    return Response.json({
      ok: true,
      reportDate: summary.reportDate,
      reminderCount,
      digestCount,
      missingCount: summary.missingCount,
      draftCount: summary.draftCount,
      submittedCount: summary.submittedCount,
      lockedCount: summary.lockedCount,
    });
  } catch (error) {
    log.error("work report reminder cron failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to queue work report reminders.",
      },
      { status: 500 }
    );
  }
}
