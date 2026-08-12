import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { NOTIFICATION_CATEGORIES, sendNotification } from "@/lib/notify";

const log = createLogger("cron.delivery-reminders");

type DeliverySnapshotRow = {
  case_id: string | null;
  job_seeker_id: string;
  account_manager_id: string | null;
  full_name: string | null;
  effective_stage: string;
  risk_level: string;
  next_action_title: string | null;
  next_action_due_at: string | null;
  last_touch_at: string;
  days_since_last_touch: number | null;
  last_manual_review_at: string | null;
  paused: boolean | null;
  has_placed_offer: boolean | null;
  overdue_next_action: boolean | null;
};

type BlockerRow = {
  id: string;
  case_id: string;
  title: string;
  due_at: string | null;
  escalated: boolean | null;
  blocker_type: string;
};

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Date pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date pending";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

async function getExistingDailyKeys(dayStartIso: string): Promise<Set<string>> {
  const categories = [
    NOTIFICATION_CATEGORIES.delivery_next_action_overdue,
    NOTIFICATION_CATEGORIES.delivery_blocker_due,
    NOTIFICATION_CATEGORIES.delivery_case_stale,
    NOTIFICATION_CATEGORIES.delivery_risk_review_due,
  ];

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("user_id, category, payload")
    .in("category", categories)
    .gte("created_at", dayStartIso);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).map((row) => {
      const payload =
        row.payload && typeof row.payload === "object"
          ? (row.payload as Record<string, unknown>)
          : {};
      const dedupeKey =
        typeof payload.dedupeKey === "string" ? payload.dedupeKey : "";
      return `${String(row.category)}:${String(row.user_id)}:${dedupeKey}`;
    })
  );
}

function buildOverdueBody(row: DeliverySnapshotRow): string {
  return [
    `${row.full_name || "A client"} has an overdue delivery next action.`,
    "",
    `Current stage: ${String(row.effective_stage).replace(/_/g, " ")}`,
    `Current action: ${row.next_action_title || "Review delivery case"}`,
    `Due: ${formatDateTime(row.next_action_due_at)}`,
    "",
    "Open the seeker command panel and update the next step.",
  ].join("\n");
}

function buildBlockerBody(row: DeliverySnapshotRow, blocker: BlockerRow): string {
  return [
    `${row.full_name || "A client"} has a delivery blocker due soon.`,
    "",
    `Blocker: ${blocker.title}`,
    `Type: ${blocker.blocker_type.replace(/_/g, " ")}`,
    `Due: ${formatDateTime(blocker.due_at)}`,
    blocker.escalated ? "Status: escalated" : "Status: active",
    "",
    "Open the seeker command panel and resolve or escalate the blocker.",
  ].join("\n");
}

function buildStaleBody(row: DeliverySnapshotRow): string {
  return [
    `${row.full_name || "A client"} has gone stale in delivery.`,
    "",
    `Current stage: ${String(row.effective_stage).replace(/_/g, " ")}`,
    `Last touch: ${formatDateTime(row.last_touch_at)}`,
    `Days since touch: ${row.days_since_last_touch ?? 0}`,
    "",
    "Open the seeker command panel and set the next recovery action.",
  ].join("\n");
}

function buildRiskReviewBody(row: DeliverySnapshotRow): string {
  return [
    `${row.full_name || "A client"} is high-risk and has not had a manual review in the last 48 hours.`,
    "",
    `Risk level: ${String(row.risk_level).replace(/_/g, " ")}`,
    `Last manual review: ${formatDateTime(row.last_manual_review_at)}`,
    "",
    "Open the seeker command panel to review blockers, risk, and the next action.",
  ].join("\n");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const dayStartIso = getUtcDayStart(now);
  const next24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const [existingKeys, snapshotsRes, blockersRes] = await Promise.all([
      getExistingDailyKeys(dayStartIso),
      supabaseAdmin
        .from("v_client_delivery_snapshot")
        .select(
          "case_id, job_seeker_id, account_manager_id, full_name, effective_stage, risk_level, next_action_title, next_action_due_at, last_touch_at, days_since_last_touch, last_manual_review_at, paused, has_placed_offer, overdue_next_action"
        )
        .not("account_manager_id", "is", null)
        .eq("paused", false)
        .eq("has_placed_offer", false),
      supabaseAdmin
        .from("client_delivery_blockers")
        .select("id, case_id, title, due_at, escalated, blocker_type")
        .eq("status", "active")
        .not("due_at", "is", null)
        .gte("due_at", nowIso)
        .lte("due_at", next24hIso),
    ]);

    if (snapshotsRes.error) {
      throw new Error(snapshotsRes.error.message);
    }
    if (blockersRes.error) {
      throw new Error(blockersRes.error.message);
    }

    const snapshots = (snapshotsRes.data ?? []) as DeliverySnapshotRow[];
    const blockers = (blockersRes.data ?? []) as BlockerRow[];
    const snapshotByCaseId = new Map(
      snapshots
        .filter((row) => row.case_id)
        .map((row) => [row.case_id as string, row])
    );

    let overdueQueued = 0;
    let blockerQueued = 0;
    let staleQueued = 0;
    let riskQueued = 0;

    for (const row of snapshots) {
      if (!row.account_manager_id) continue;

      if (row.overdue_next_action) {
        const dedupeKey = `delivery-next-action:${row.case_id ?? row.job_seeker_id}`;
        const key = `${NOTIFICATION_CATEGORIES.delivery_next_action_overdue}:${row.account_manager_id}:${dedupeKey}`;
        if (!existingKeys.has(key)) {
          const result = await sendNotification({
            userId: row.account_manager_id,
            userType: "am",
            category: NOTIFICATION_CATEGORIES.delivery_next_action_overdue,
            subject: `Delivery next action overdue: ${row.full_name || "client"}`,
            body: buildOverdueBody(row),
            linkUrl: `/dashboard/seekers/${row.job_seeker_id}`,
            channel: "both",
            payload: {
              dedupeKey,
              caseId: row.case_id,
              jobSeekerId: row.job_seeker_id,
              riskLevel: row.risk_level,
            },
          });
          if (result.id) {
            overdueQueued += 1;
            existingKeys.add(key);
          }
        }
      }

      if ((row.days_since_last_touch ?? 0) >= 5) {
        const dedupeKey = `delivery-stale:${row.case_id ?? row.job_seeker_id}`;
        const key = `${NOTIFICATION_CATEGORIES.delivery_case_stale}:${row.account_manager_id}:${dedupeKey}`;
        if (!existingKeys.has(key)) {
          const result = await sendNotification({
            userId: row.account_manager_id,
            userType: "am",
            category: NOTIFICATION_CATEGORIES.delivery_case_stale,
            subject: `Stale delivery case: ${row.full_name || "client"}`,
            body: buildStaleBody(row),
            linkUrl: `/dashboard/seekers/${row.job_seeker_id}`,
            channel: "both",
            payload: {
              dedupeKey,
              caseId: row.case_id,
              jobSeekerId: row.job_seeker_id,
              daysSinceLastTouch: row.days_since_last_touch,
            },
          });
          if (result.id) {
            staleQueued += 1;
            existingKeys.add(key);
          }
        }
      }

      const lastManualReviewAt = row.last_manual_review_at
        ? Date.parse(row.last_manual_review_at)
        : Number.NaN;
      const needsRiskReview =
        (row.risk_level === "high" || row.risk_level === "critical") &&
        (!Number.isFinite(lastManualReviewAt) ||
          lastManualReviewAt < now.getTime() - 48 * 60 * 60 * 1000);

      if (needsRiskReview) {
        const dedupeKey = `delivery-risk-review:${row.case_id ?? row.job_seeker_id}`;
        const key = `${NOTIFICATION_CATEGORIES.delivery_risk_review_due}:${row.account_manager_id}:${dedupeKey}`;
        if (!existingKeys.has(key)) {
          const result = await sendNotification({
            userId: row.account_manager_id,
            userType: "am",
            category: NOTIFICATION_CATEGORIES.delivery_risk_review_due,
            subject: `High-risk delivery review due: ${row.full_name || "client"}`,
            body: buildRiskReviewBody(row),
            linkUrl: `/dashboard/seekers/${row.job_seeker_id}`,
            channel: "both",
            payload: {
              dedupeKey,
              caseId: row.case_id,
              jobSeekerId: row.job_seeker_id,
              riskLevel: row.risk_level,
            },
          });
          if (result.id) {
            riskQueued += 1;
            existingKeys.add(key);
          }
        }
      }
    }

    for (const blocker of blockers) {
      const snapshot = snapshotByCaseId.get(blocker.case_id);
      if (!snapshot?.account_manager_id) continue;

      const dedupeKey = `delivery-blocker:${blocker.id}`;
      const key = `${NOTIFICATION_CATEGORIES.delivery_blocker_due}:${snapshot.account_manager_id}:${dedupeKey}`;
      if (existingKeys.has(key)) continue;

      const result = await sendNotification({
        userId: snapshot.account_manager_id,
        userType: "am",
        category: NOTIFICATION_CATEGORIES.delivery_blocker_due,
        subject: `Delivery blocker due: ${snapshot.full_name || "client"}`,
        body: buildBlockerBody(snapshot, blocker),
        linkUrl: `/dashboard/seekers/${snapshot.job_seeker_id}`,
        channel: "both",
        payload: {
          dedupeKey,
          blockerId: blocker.id,
          caseId: snapshot.case_id,
          jobSeekerId: snapshot.job_seeker_id,
        },
      });

      if (result.id) {
        blockerQueued += 1;
        existingKeys.add(key);
      }
    }

    return Response.json({
      ok: true,
      snapshots: snapshots.length,
      blockers: blockers.length,
      overdueQueued,
      blockerQueued,
      staleQueued,
      riskQueued,
    });
  } catch (error) {
    log.error("delivery reminder cron failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to queue delivery reminders.",
      },
      { status: 500 }
    );
  }
}
