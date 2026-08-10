import { notFound } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole } from "@/lib/auth/roles";
import { getClientDeliveryCaseBundleForSeeker } from "@/lib/client-delivery-server";
import SeekerDetailClient from "./SeekerDetailClient";

interface PageProps {
  params: { id: string };
}

export default async function SeekerDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = params;
  const isAdmin = user.userType === "am" && isAdminRole(user.role);
  const canViewAnySeeker =
    user.userType === "am" && isPeopleManagerRole(user.role);
  const canReviewDeliveryCases =
    user.userType === "am" &&
    (isPeopleManagerRole(user.role) || isAdminRole(user.role));

  if (!canViewAnySeeker) {
    // Verify assignment for non-privileged AM users
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", user.id)
      .eq("job_seeker_id", id)
      .maybeSingle();

    if (!assignment) {
      notFound();
    }
  }

  // Load job seeker
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (!seeker) {
    notFound();
  }

  // Load matched jobs with scores
  const { data: matchScores } = await supabaseAdmin
    .from("job_match_scores")
    .select(`
      id, score, reasons, created_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("score", { ascending: false })
    .limit(100);

  // Load routing decisions
  const { data: routingDecisions } = await supabaseAdmin
    .from("job_routing_decisions")
    .select("job_post_id, decision, note")
    .eq("job_seeker_id", id);

  const decisionMap = new Map(
    (routingDecisions || []).map((d) => [d.job_post_id, d])
  );

  // Load application queue
  const { data: queueItems } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: false });

  // Load application runs
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, current_step, last_error, created_at, updated_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", id)
    .order("updated_at", { ascending: false });

  // Load outreach contacts and drafts
  const { data: outreachDrafts } = await supabaseAdmin
    .from("outreach_drafts")
    .select(`
      id, subject, body, status, created_at, sent_at,
      job_posts (id, title, company),
      outreach_contacts (id, full_name, email, title, company_name)
    `)
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: false });

  // Load recruiter threads
  const { data: recruiterThreads } = await supabaseAdmin
    .from("recruiter_threads")
    .select(`
      id, thread_status, last_reply_at, next_follow_up_at,
      recruiters (id, name, title, company, email)
    `)
    .eq("job_seeker_id", id)
    .order("last_reply_at", { ascending: false });

  // Load interviews
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select(`
      id, scheduled_at, duration_min, interview_type, meeting_link,
      status, notes_for_candidate, notes_internal,
      job_posts (id, title, company)
    `)
    .eq("job_seeker_id", id)
    .order("scheduled_at", { ascending: false });

  // Load interview prep
  const { data: interviewPrep } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      id, content, created_at,
      job_posts (id, title, company)
    `)
    .eq("job_seeker_id", id);

  // Load references
  const { data: references } = await supabaseAdmin
    .from("job_seeker_references")
    .select("*")
    .eq("job_seeker_id", id);

  // Load documents
  const { data: documents } = await supabaseAdmin
    .from("job_seeker_documents")
    .select("*")
    .eq("job_seeker_id", id);

  // Load Gmail connection
  const { data: gmailConnection } = await supabaseAdmin
    .from("seeker_email_connections")
    .select("id, gmail_email, is_active, created_at")
    .eq("job_seeker_id", id)
    .eq("is_active", true)
    .maybeSingle();

  // Load inbound emails
  const { data: inboundEmails } = await supabaseAdmin
    .from("inbound_emails")
    .select(
      "id, from_email, from_name, subject, body_snippet, received_at, classification, classification_confidence, matched_application_id"
    )
    .eq("job_seeker_id", id)
    .order("received_at", { ascending: false })
    .limit(50);

  const { data: auditLogs } = await supabaseAdmin
    .from("job_seeker_profile_audit_logs")
    .select("id, actor_account_manager_id, actor_email, actor_role, action, changed_fields, created_at")
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Load the seeker's own saved application answers (portal "Saved Answers")
  const { data: savedAnswers } = await supabaseAdmin
    .from("job_seeker_answers")
    .select("id, question_key, question_text, answer, updated_at")
    .eq("job_seeker_id", id)
    .order("question_key");

  // Load screening answers
  const { data: screeningAnswers } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .select("id, question_key, question_text, answer_value, answer_type, created_at, updated_at")
    .eq("job_seeker_id", id)
    .order("question_key");

  // Load failure screenshots (most recent 50)
  const runIds = (runs || []).map((r) => r.id);
  let failureScreenshots: { id: string; run_id: string; step: string; reason: string; url: string; screenshot_path: string; created_at: string }[] = [];
  if (runIds.length > 0) {
    const { data: screenshots } = await supabaseAdmin
      .from("apply_run_screenshots")
      .select("id, run_id, step, reason, url, screenshot_path, created_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: false })
      .limit(50);
    failureScreenshots = (screenshots || []) as typeof failureScreenshots;
  }

  const [
    contractsRes,
    registrationPaymentsRes,
    installmentsRes,
    paymentRequestsRes,
    screenshotsRes,
    offersRes,
    commissionPaymentsRes,
    escalationsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("job_seeker_contracts")
      .select("id, plan_type, registration_fee, commission_rate, agreed_at, created_at, updated_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("registration_payments")
      .select("id, total_amount, amount_paid, status, payment_deadline, work_started, created_at, updated_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("payment_installments")
      .select("id, registration_payment_id, installment_number, amount, proposed_date, status, paid_at, created_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("payment_requests")
      .select("id, installment_id, offer_id, method, status, details_sent_at, note, created_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("payment_screenshots")
      .select("id, payment_request_id, installment_id, offer_id, file_url, uploaded_at, acknowledged_at, note")
      .eq("job_seeker_id", id)
      .order("uploaded_at", { ascending: false }),
    supabaseAdmin
      .from("job_offers")
      .select("id, company, role, base_salary, status, commission_status, commission_amount, commission_due_date, reported_by, seeker_confirmed_at, am_confirmed_at, created_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("commission_payments")
      .select("id, offer_id, amount, paid_at, method, notes, created_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("termination_escalations")
      .select("id, reason, context_notes, decision, decision_at, decision_notes, created_at")
      .eq("job_seeker_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Process matches with routing decisions
  const matchedJobs = (matchScores || []).map((m) => {
    const job = m.job_posts as unknown as { id: string; title: string; company: string; location: string; url: string } | null;
    const decision = job ? decisionMap.get(job.id) : null;
    return {
      ...m,
      job: job,
      routingDecision: decision?.decision || null,
      routingNote: decision?.note || null,
    };
  });

  type FinancialProp = NonNullable<Parameters<typeof SeekerDetailClient>[0]["financial"]>;
  const deliveryBundle =
    user.userType === "am"
      ? await getClientDeliveryCaseBundleForSeeker(
          { accountManagerId: user.id, role: user.role },
          id
        )
      : null;

  return (
    <SeekerDetailClient
      backHref={isAdmin ? "/dashboard/admin/job-seekers" : canViewAnySeeker ? "/dashboard/delivery" : "/dashboard/seekers"}
      seeker={seeker}
      deliveryBundle={deliveryBundle}
      matchedJobs={matchedJobs as unknown as Parameters<typeof SeekerDetailClient>[0]["matchedJobs"]}
      queueItems={(queueItems || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["queueItems"]}
      runs={(runs || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["runs"]}
      outreachDrafts={(outreachDrafts || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["outreachDrafts"]}
      recruiterThreads={(recruiterThreads || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["recruiterThreads"]}
      interviews={(interviews || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["interviews"]}
      interviewPrep={(interviewPrep || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["interviewPrep"]}
      references={(references || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["references"]}
      documents={(documents || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["documents"]}
      gmailConnection={gmailConnection ? { email: gmailConnection.gmail_email, connectedAt: gmailConnection.created_at } : null}
      inboundEmails={(inboundEmails || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["inboundEmails"]}
      auditLogs={(auditLogs || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["auditLogs"]}
      screeningAnswers={(screeningAnswers || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["screeningAnswers"]}
      savedAnswers={(savedAnswers || []) as unknown as Parameters<typeof SeekerDetailClient>[0]["savedAnswers"]}
      failureScreenshots={failureScreenshots as unknown as Parameters<typeof SeekerDetailClient>[0]["failureScreenshots"]}
      canReviewDeliveryCases={canReviewDeliveryCases}
      financial={{
        contracts: (contractsRes.data || []) as unknown as FinancialProp["contracts"],
        registrationPayments: (registrationPaymentsRes.data || []) as unknown as FinancialProp["registrationPayments"],
        installments: (installmentsRes.data || []) as unknown as FinancialProp["installments"],
        paymentRequests: (paymentRequestsRes.data || []) as unknown as FinancialProp["paymentRequests"],
        screenshots: (screenshotsRes.data || []) as unknown as FinancialProp["screenshots"],
        offers: (offersRes.data || []) as unknown as FinancialProp["offers"],
        commissionPayments: (commissionPaymentsRes.data || []) as unknown as FinancialProp["commissionPayments"],
        escalations: (escalationsRes.data || []) as unknown as FinancialProp["escalations"],
      }}
    />
  );
}
