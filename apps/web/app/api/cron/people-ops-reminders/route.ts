import { supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { createLogger } from "@/lib/logger";
import { NOTIFICATION_CATEGORIES, sendNotification } from "@/lib/notify";
import { getPeopleOpsReminderSnapshot, listPeopleEmployees } from "@/lib/people-server";

const log = createLogger("cron.people-ops-reminders");

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

function summarizeList(values: string[], limit = 5): string {
  if (values.length === 0) return "None";
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")}, and ${values.length - limit} more`;
}

function getEmployeeDisplayName(input: {
  worker?: { full_name?: string | null; job_title?: string | null } | null;
  role_title?: string | null;
  account_manager?: { name?: string | null; email?: string | null } | null;
  id?: string | null;
}): string {
  return (
    input.worker?.full_name ||
    input.account_manager?.name ||
    input.role_title ||
    input.worker?.job_title ||
    input.account_manager?.email ||
    input.id ||
    "Unknown employee"
  );
}

async function getExistingDailyKeys(dayStartIso: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("user_id, category")
    .in("category", [
      NOTIFICATION_CATEGORIES.people_ops_review_digest,
      NOTIFICATION_CATEGORIES.social_lead_election_closing,
      NOTIFICATION_CATEGORIES.employee_bonus_payable_this_month,
    ])
    .gte("created_at", dayStartIso);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).map((row) => `${String(row.category)}:${String(row.user_id)}`)
  );
}

function buildManagerDigestBody(snapshot: Awaited<ReturnType<typeof getPeopleOpsReminderSnapshot>>) {
  const scorecardNames = snapshot.dueScorecardEmployees.map((employee) =>
    getEmployeeDisplayName(employee)
  );
  const probationNames = snapshot.dueProbationSummaries.map((summary) =>
    `${getEmployeeDisplayName(summary.employee)} (Month ${summary.dueCheckpoint})`
  );
  const onboardingNames = snapshot.pendingOnboardingQueue.map((form) => form.full_name);
  const disciplinaryNames = snapshot.activeDisciplinaryRecords.map((record) =>
    `${getEmployeeDisplayName(record.employee ?? { id: record.employee_id })} - ${record.title}`
  );
  const electionNames = snapshot.electionsClosingSoon.map((election) => {
    const closingAt =
      election.status === "nominations_open"
        ? election.nominations_close_at
        : election.voting_close_at;
    return `${election.title} (${formatDateTime(closingAt)})`;
  });

  return [
    `People Ops review digest for ${snapshot.currentReviewMonth}.`,
    "",
    `Scorecards due (${snapshot.dueScorecardEmployees.length}): ${summarizeList(scorecardNames)}`,
    `Probation checkpoints due (${snapshot.dueProbationSummaries.length}): ${summarizeList(probationNames)}`,
    `Onboarding follow-up (${snapshot.pendingOnboardingQueue.length}): ${summarizeList(onboardingNames)}`,
    `Active disciplinary records (${snapshot.activeDisciplinaryRecords.length}): ${summarizeList(disciplinaryNames)}`,
    `Elections closing soon (${snapshot.electionsClosingSoon.length}): ${summarizeList(electionNames, 3)}`,
    "",
    "Open the People Ops dashboard to review and action these items.",
  ].join("\n");
}

function buildElectionReminderBody(snapshot: Awaited<ReturnType<typeof getPeopleOpsReminderSnapshot>>) {
  const lines = [
    "A Social Lead election window is closing soon.",
    "",
  ];

  for (const election of snapshot.electionsClosingSoon) {
    const isNominationPhase = election.status === "nominations_open";
    const closesAt = isNominationPhase
      ? election.nominations_close_at
      : election.voting_close_at;
    lines.push(
      `${election.title}: ${
        isNominationPhase ? "nominations" : "voting"
      } closes ${formatDateTime(closesAt)}.`
    );
  }

  lines.push("");
  lines.push("Open your Social Fund dashboard to nominate or vote before the window closes.");
  return lines.join("\n");
}

function buildBonusReminderBody(input: {
  reviewMonth: string;
  offers: Array<{ offerTitle: string | null; companyName: string | null }>;
}) {
  const lines = [
    `Your JobGenuis bonus is payable in ${input.reviewMonth}.`,
    "",
  ];

  for (const offer of input.offers.slice(0, 5)) {
    lines.push(
      `- ${offer.offerTitle || "Accepted offer"}${offer.companyName ? ` at ${offer.companyName}` : ""}`
    );
  }

  if (input.offers.length > 5) {
    lines.push(`- and ${input.offers.length - 5} more bonus-linked offer(s)`);
  }

  lines.push("");
  lines.push("Open your bonus dashboard to review payout timing and status.");
  return lines.join("\n");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayStartIso = getUtcDayStart();

  try {
    const [snapshot, employees, existingKeys, accountManagersRes, payableBonusesRes] = await Promise.all([
      getPeopleOpsReminderSnapshot(),
      listPeopleEmployees(),
      getExistingDailyKeys(dayStartIso),
      supabaseAdmin.from("account_managers").select("id, name, email, role"),
      supabaseAdmin
        .from("employee_bonus_records")
        .select(
          `
          id,
          payment_month,
          employee:employees!employee_bonus_records_employee_id_fkey(
            id,
            account_manager_id
          ),
          accepted_offer:accepted_offer_records!employee_bonus_records_accepted_offer_record_id_fkey(
            offer_title,
            company_name
          )
        `
        )
        .eq("payment_month", new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
        ).toISOString().slice(0, 10))
        .eq("approval_status", "approved")
        .in("payment_status", ["pending", "scheduled"]),
    ]);

    if (accountManagersRes.error) {
      throw new Error(accountManagersRes.error.message);
    }
    if (payableBonusesRes.error) {
      throw new Error(payableBonusesRes.error.message);
    }

    const managerDigestNeeded =
      snapshot.dueScorecardEmployees.length > 0 ||
      snapshot.dueProbationSummaries.length > 0 ||
      snapshot.pendingOnboardingQueue.length > 0 ||
      snapshot.activeDisciplinaryRecords.length > 0 ||
      snapshot.electionsClosingSoon.length > 0;

    const managers = (accountManagersRes.data ?? []).filter((manager) =>
      isPeopleManagerRole(manager.role)
    );

    let managerNotificationsQueued = 0;
    let electionNotificationsQueued = 0;
    let bonusNotificationsQueued = 0;

    if (managerDigestNeeded) {
      const digestBody = buildManagerDigestBody(snapshot);
      for (const manager of managers) {
        const dedupeKey = `${NOTIFICATION_CATEGORIES.people_ops_review_digest}:${manager.id}`;
        if (existingKeys.has(dedupeKey)) continue;

        const result = await sendNotification({
          userId: manager.id,
          userType: "am",
          category: NOTIFICATION_CATEGORIES.people_ops_review_digest,
          subject: `People Ops review digest: ${snapshot.currentReviewMonth}`,
          body: digestBody,
          linkUrl: "/dashboard/people",
          channel: "both",
          payload: {
            reminderDate: dayStartIso.slice(0, 10),
            reviewMonth: snapshot.currentReviewMonth,
            dueScorecardCount: snapshot.dueScorecardEmployees.length,
            dueProbationCount: snapshot.dueProbationSummaries.length,
            pendingOnboardingCount: snapshot.pendingOnboardingQueue.length,
            activeDisciplinaryCount: snapshot.activeDisciplinaryRecords.length,
            electionClosingSoonCount: snapshot.electionsClosingSoon.length,
          },
        });

        if (result.id) {
          managerNotificationsQueued += 1;
          existingKeys.add(dedupeKey);
        }
      }
    }

    if (snapshot.electionsClosingSoon.length > 0) {
      const electionBody = buildElectionReminderBody(snapshot);
      const electionRecipients = employees.filter(
        (employee) =>
          employee.active &&
          employee.employment_status !== "terminated" &&
          Boolean(employee.account_manager?.id)
      );

      for (const employee of electionRecipients) {
        const accountManagerId = employee.account_manager?.id;
        if (!accountManagerId) continue;
        const dedupeKey = `${NOTIFICATION_CATEGORIES.social_lead_election_closing}:${accountManagerId}`;
        if (existingKeys.has(dedupeKey)) continue;

        const result = await sendNotification({
          userId: accountManagerId,
          userType: "am",
          category: NOTIFICATION_CATEGORIES.social_lead_election_closing,
          subject: "Social Lead election closing soon",
          body: electionBody,
          linkUrl: "/dashboard/me/social",
          channel: "both",
          payload: {
            reminderDate: dayStartIso.slice(0, 10),
            electionIds: snapshot.electionsClosingSoon.map((election) => election.id),
          },
        });

        if (result.id) {
          electionNotificationsQueued += 1;
          existingKeys.add(dedupeKey);
        }
      }
    }

    if ((payableBonusesRes.data ?? []).length > 0) {
      const bonusesByRecipient = new Map<
        string,
        Array<{ offerTitle: string | null; companyName: string | null }>
      >();

      for (const row of payableBonusesRes.data ?? []) {
        const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
        const accountManagerId =
          employee && typeof employee.account_manager_id === "string"
            ? employee.account_manager_id
            : null;
        if (!accountManagerId) continue;

        const offer = Array.isArray(row.accepted_offer)
          ? row.accepted_offer[0]
          : row.accepted_offer;
        const bucket = bonusesByRecipient.get(accountManagerId) ?? [];
        bucket.push({
          offerTitle:
            offer && typeof offer.offer_title === "string" ? offer.offer_title : null,
          companyName:
            offer && typeof offer.company_name === "string" ? offer.company_name : null,
        });
        bonusesByRecipient.set(accountManagerId, bucket);
      }

      for (const [accountManagerId, offers] of Array.from(
        bonusesByRecipient.entries()
      )) {
        const dedupeKey = `${NOTIFICATION_CATEGORIES.employee_bonus_payable_this_month}:${accountManagerId}`;
        if (existingKeys.has(dedupeKey)) continue;

        const result = await sendNotification({
          userId: accountManagerId,
          userType: "am",
          category: NOTIFICATION_CATEGORIES.employee_bonus_payable_this_month,
          subject: "Your JobGenuis bonus is payable this month",
          body: buildBonusReminderBody({
            reviewMonth: snapshot.currentReviewMonth,
            offers,
          }),
          linkUrl: "/dashboard/me/bonuses",
          channel: "both",
          payload: {
            reminderDate: dayStartIso.slice(0, 10),
            paymentMonth: snapshot.currentReviewMonth,
            bonusCount: offers.length,
          },
        });

        if (result.id) {
          bonusNotificationsQueued += 1;
          existingKeys.add(dedupeKey);
        }
      }
    }

    return Response.json({
      ok: true,
      reviewMonth: snapshot.currentReviewMonth,
      managerDigestNeeded,
      managerRecipients: managers.length,
      managerNotificationsQueued,
      electionNotificationsQueued,
      bonusNotificationsQueued,
      dueScorecardCount: snapshot.dueScorecardEmployees.length,
      dueProbationCount: snapshot.dueProbationSummaries.length,
      pendingOnboardingCount: snapshot.pendingOnboardingQueue.length,
      activeDisciplinaryCount: snapshot.activeDisciplinaryRecords.length,
      electionClosingSoonCount: snapshot.electionsClosingSoon.length,
    });
  } catch (error) {
    log.error("people ops reminder cron failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to queue people ops reminders.",
      },
      { status: 500 }
    );
  }
}
