import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import {
  ACCEPTED_OFFER_VERIFICATION_STATUSES,
  resolveOfferStartMonth,
  isAcceptedOfferReadyForBonus,
  type AcceptedOfferVerificationStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";
import { writeOutcomeEvents } from "@/lib/outcomes-server";
import type { OutcomeEventWriteInput } from "@/lib/outcomes";

function canAccess(role: string | null | undefined): boolean {
  return isFinanceRole(role) || isPeopleManagerRole(role);
}

function unauthorized() {
  return NextResponse.json(
    { error: "Finance or people manager access required." },
    { status: 403 }
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccess(auth.user.role)) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const offerId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";
  const offerTitle =
    typeof body.offer_title === "string" && body.offer_title.trim()
      ? body.offer_title.trim()
      : "";
  const companyName =
    typeof body.company_name === "string" && body.company_name.trim()
      ? body.company_name.trim()
      : "";

  if (!employeeId || !offerTitle || !companyName) {
    return NextResponse.json(
      { error: "Employee, offer title, and company are required." },
      { status: 400 }
    );
  }

  const verificationStatus: AcceptedOfferVerificationStatus =
    typeof body.verification_status === "string" &&
    ACCEPTED_OFFER_VERIFICATION_STATUSES.includes(
      body.verification_status as AcceptedOfferVerificationStatus
    )
      ? (body.verification_status as AcceptedOfferVerificationStatus)
      : "pending_verification";

  const [employeeRes, existingOfferRes] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id, account_manager_id")
      .eq("id", employeeId)
      .maybeSingle(),
    offerId
      ? supabaseAdmin
          .from("accepted_offer_records")
          .select(
            "id, verification_status, background_check_completed_date, client_start_date, start_month"
          )
          .eq("id", offerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const employee = employeeRes.data;
  const employeeError = employeeRes.error;

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  if (existingOfferRes.error) {
    return NextResponse.json(
      { error: existingOfferRes.error.message || "Failed to load existing accepted offer." },
      { status: 500 }
    );
  }

  const previousReadyForBonus = existingOfferRes.data
    ? isAcceptedOfferReadyForBonus({
        verificationStatus: existingOfferRes.data.verification_status,
        backgroundCheckCompletedDate:
          existingOfferRes.data.background_check_completed_date,
        clientStartDate: existingOfferRes.data.client_start_date,
        startMonth: existingOfferRes.data.start_month,
      })
    : false;
  const existingOffer = existingOfferRes.data;

  const assignedAccountManagerId =
    typeof body.assigned_account_manager_id === "string" && body.assigned_account_manager_id.trim()
      ? body.assigned_account_manager_id.trim()
      : employee.account_manager_id;
  const applicationSubmittedById =
    typeof body.application_submitted_by_account_manager_id === "string" &&
    body.application_submitted_by_account_manager_id.trim()
      ? body.application_submitted_by_account_manager_id.trim()
      : employee.account_manager_id;
  const interviewManagedById =
    typeof body.interview_managed_by_account_manager_id === "string" &&
    body.interview_managed_by_account_manager_id.trim()
      ? body.interview_managed_by_account_manager_id.trim()
      : employee.account_manager_id;

  const payload = {
    employee_id: employeeId,
    job_seeker_id:
      typeof body.job_seeker_id === "string" && body.job_seeker_id.trim()
        ? body.job_seeker_id.trim()
        : null,
    offer_title: offerTitle,
    company_name: companyName,
    offer_accepted_date:
      typeof body.offer_accepted_date === "string" && body.offer_accepted_date.trim()
        ? body.offer_accepted_date.trim()
        : null,
    background_check_completed_date:
      typeof body.background_check_completed_date === "string" &&
      body.background_check_completed_date.trim()
        ? body.background_check_completed_date.trim()
        : null,
    client_start_date:
      typeof body.client_start_date === "string" && body.client_start_date.trim()
        ? body.client_start_date.trim()
        : null,
    start_month:
      typeof body.start_month === "string" && body.start_month.trim()
        ? body.start_month.trim()
        : null,
    assigned_account_manager_id: assignedAccountManagerId || null,
    application_submitted_by_account_manager_id: applicationSubmittedById || null,
    interview_managed_by_account_manager_id: interviewManagedById || null,
    verification_status: verificationStatus,
    verified_by: verificationStatus === "verified" ? auth.user.id : null,
    verified_at: verificationStatus === "verified" ? new Date().toISOString() : null,
    evidence_notes:
      typeof body.evidence_notes === "string" ? body.evidence_notes.trim() || null : null,
  };

  const query = supabaseAdmin.from("accepted_offer_records");
  const result = offerId
    ? await query.update(payload).eq("id", offerId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save accepted offer record." },
      { status: 500 }
    );
  }

  const offer = result.data;
  const startMonth = resolveOfferStartMonth({
    startMonth: offer.start_month,
    clientStartDate: offer.client_start_date,
  });
  const readyForBonus = isAcceptedOfferReadyForBonus({
    verificationStatus: offer.verification_status,
    backgroundCheckCompletedDate: offer.background_check_completed_date,
    clientStartDate: offer.client_start_date,
    startMonth: offer.start_month,
  });

  const { data: existingBonus } = await supabaseAdmin
    .from("employee_bonus_records")
    .select("*")
    .eq("accepted_offer_record_id", offer.id)
    .maybeSingle();

  let bonusRecordId: string | null = existingBonus?.id ?? null;

  if (readyForBonus) {
    const { data: upsertedBonus, error: upsertBonusError } = await supabaseAdmin
      .from("employee_bonus_records")
      .upsert(
      {
        employee_id: employeeId,
        accepted_offer_record_id: offer.id,
        bonus_eligibility_status:
          existingBonus?.bonus_eligibility_status &&
          ["approved", "rejected", "disputed"].includes(
            existingBonus.bonus_eligibility_status
          )
            ? existingBonus.bonus_eligibility_status
            : "eligible",
        bonus_amount: 30000,
        payment_month: startMonth,
        payment_status:
          existingBonus?.payment_status && existingBonus.payment_status !== "cancelled"
            ? existingBonus.payment_status
            : "pending",
        approval_status:
          existingBonus?.approval_status &&
          ["approved", "rejected", "disputed"].includes(existingBonus.approval_status)
            ? existingBonus.approval_status
            : "pending_verification",
        approved_by: existingBonus?.approved_by ?? null,
        approved_at: existingBonus?.approved_at ?? null,
        paid_at: existingBonus?.paid_at ?? null,
        notes: existingBonus?.notes ?? null,
      },
      { onConflict: "accepted_offer_record_id" }
      )
      .select("id, approval_status, payment_month")
      .single();

    if (upsertBonusError || !upsertedBonus) {
      return NextResponse.json(
        { error: upsertBonusError?.message || "Failed to create bonus workflow record." },
        { status: 500 }
      );
    }

    bonusRecordId = upsertedBonus.id;

    const { error: contributionError } = await supabaseAdmin
      .from("social_fund_contributions")
      .upsert(
      {
        accepted_offer_record_id: offer.id,
        employee_id: employeeId,
        amount: 20000,
        contribution_date: startMonth || todayIsoDate(),
        notes: "Auto-created from verified accepted offer.",
      },
      { onConflict: "accepted_offer_record_id" }
      );

    if (contributionError) {
      return NextResponse.json(
        { error: contributionError.message || "Failed to create social fund contribution." },
        { status: 500 }
      );
    }
  } else {
    if (existingBonus) {
      await supabaseAdmin
        .from("employee_bonus_records")
        .update({
          bonus_eligibility_status:
            verificationStatus === "rejected" ? "rejected" : "pending_verification",
          approval_status:
            verificationStatus === "rejected" ? "rejected" : "pending_verification",
          payment_status: verificationStatus === "rejected" ? "cancelled" : "pending",
          payment_month: startMonth,
        })
        .eq("id", existingBonus.id);
    }

    await supabaseAdmin
      .from("social_fund_contributions")
      .delete()
      .eq("accepted_offer_record_id", offer.id);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.accepted_offer_update",
    targetType: "accepted_offer_record",
    targetId: offer.id,
    details: {
      employee_id: employeeId,
      verification_status: verificationStatus,
      ready_for_bonus: readyForBonus,
      payment_month: startMonth,
    },
  }).catch(() => {});

  if (employee.account_manager_id && verificationStatus === "verified") {
    sendNotification({
      userId: employee.account_manager_id,
      userType: "am",
      category: "employee_offer_verified",
      subject: "A successful accepted offer was verified",
      body: `${offerTitle} at ${companyName} was verified and moved into the bonus workflow.`,
      linkUrl: "/dashboard/me/bonuses",
      channel: "in_app",
      payload: {
        accepted_offer_record_id: offer.id,
      },
    }).catch(() => {});
  }

  if (readyForBonus && !previousReadyForBonus) {
    const { data: approvers, error: approversError } = await supabaseAdmin
      .from("account_managers")
      .select("id, role");

    if (!approversError) {
      await Promise.allSettled(
        (approvers ?? [])
          .filter((manager) => canAccess(manager.role))
          .map((manager) =>
            sendNotification({
              userId: manager.id,
              userType: "am",
              category: "people_bonus_pending_approval",
              subject: "Bonus approval required",
              body: `${offerTitle} at ${companyName} is verified and ready for bonus approval for the assigned employee.`,
              linkUrl: "/dashboard/finance/bonuses",
              channel: "both",
              payload: {
                accepted_offer_record_id: offer.id,
                employee_id: employeeId,
                bonus_record_id: bonusRecordId,
                payment_month: startMonth,
              },
            })
          )
      );
    }

    if (employee.account_manager_id) {
      sendNotification({
        userId: employee.account_manager_id,
        userType: "am",
        category: "employee_social_fund_contribution_added",
        subject: "A social fund contribution was added from your accepted offer",
        body: `Your verified accepted offer for ${offerTitle} at ${companyName} added 20,000 FCFA to the employee social fund and moved your bonus into the approval workflow.`,
        linkUrl: "/dashboard/me/social",
        channel: "in_app",
        payload: {
          accepted_offer_record_id: offer.id,
          bonus_record_id: bonusRecordId,
          payment_month: startMonth,
        },
      }).catch(() => {});
    }
  }

  const outcomeWrites: OutcomeEventWriteInput[] = [
    {
      eventType: "offer_reported",
      occurredAt: offer.created_at,
      jobSeekerId: offer.job_seeker_id,
      acceptedOfferRecordId: offer.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot:
        offer.assigned_account_manager_id ??
        offer.application_submitted_by_account_manager_id ??
        offer.interview_managed_by_account_manager_id ??
        null,
      sourceChannel: "finance",
      sourceRecordType: "accepted_offer_record",
      sourceRecordId: offer.id,
      metadata: {
        employee_id: employeeId,
        company_name: companyName,
        offer_title: offerTitle,
        was_existing_record: Boolean(existingOffer),
      },
    },
  ];

  if (verificationStatus === "verified") {
    outcomeWrites.push({
      eventType: "offer_verified",
      occurredAt: offer.verified_at || new Date().toISOString(),
      jobSeekerId: offer.job_seeker_id,
      acceptedOfferRecordId: offer.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot:
        offer.assigned_account_manager_id ??
        offer.application_submitted_by_account_manager_id ??
        offer.interview_managed_by_account_manager_id ??
        null,
      sourceChannel: "finance",
      sourceRecordType: "accepted_offer_verified",
      sourceRecordId: offer.id,
      metadata: {
        employee_id: employeeId,
        company_name: companyName,
        offer_title: offerTitle,
        ready_for_bonus: readyForBonus,
        payment_month: startMonth,
      },
    });
  }

  try {
    await writeOutcomeEvents(outcomeWrites);
  } catch (error) {
    console.error("[outcomes] finance offer shadow writes failed:", error);
  }

  return NextResponse.json({
    offer,
    ready_for_bonus: readyForBonus,
    payment_month: startMonth,
  });
}
