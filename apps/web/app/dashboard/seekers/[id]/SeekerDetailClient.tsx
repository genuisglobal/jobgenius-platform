"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DeliveryCommandPanel from "./DeliveryCommandPanel";
import {
  formatTaskStatusLabel,
  getTaskAttachmentFromAttachments,
} from "@/lib/conversations/tasks";
import {
  DEFAULT_JOBGENIUS_REPORT_SETTINGS,
  buildJobGeniusReportMessage,
  type JobGeniusReport,
} from "@/lib/jobgenius/report";
import { RESUME_TEMPLATES, type ResumeTemplateId } from "@/lib/resume-templates/types";
import { PRICING_PLANS } from "@/app/components/homepage/marketingContent";
import type { ClientDeliveryCaseBundle } from "@/lib/client-delivery";
import { buildMatchExplanation } from "@/lib/matching/explanations";

interface ScoringWeights {
  skills: number;
  title: number;
  experience: number;
  salary: number;
  location: number;
  company_fit: number;
  max_penalty: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  skills: 35,
  title: 20,
  experience: 10,
  salary: 10,
  location: 15,
  company_fit: 10,
  max_penalty: 15,
};

interface WorkHistoryEntry {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  degree: string;
  school: string;
  field: string;
  graduation_year: string;
}

interface LocationPreference {
  work_type: string;
  locations: string[];
}

interface SeekerData {
  id: string;
  full_name: string | null;
  email: string;
  collaboration_agreement_requested_at?: string | null;
  collaboration_agreement_signed_at?: string | null;
  campaign_tier?: "essentials" | "premium" | null;
  setup_fee_usd?: number | null;
  setup_fee_paid_at?: string | null;
  resume_template_id?: ResumeTemplateId | null;
  phone: string | null;
  location: string | null;
  seniority: string | null;
  work_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  target_titles: string[] | null;
  skills: string[] | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  profile_completion: number | null;
  match_threshold: number | null;
  match_weights: ScoringWeights | null;
  education: EducationEntry[] | null;
  work_history: WorkHistoryEntry[] | null;
  bio: string | null;
  years_experience: number | null;
  preferred_locations: string[] | null;
  preferred_industries: string[] | null;
  preferred_company_sizes: string[] | null;
  location_preferences: LocationPreference[] | null;
  work_type_preferences: string[] | null;
  employment_type_preferences: string[] | null;
  open_to_relocation: boolean | null;
  // Address
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_country: string | null;
  // Work authorization
  authorized_to_work: boolean | null;
  requires_visa_sponsorship: boolean | null;
  visa_status: string | null;
  citizenship_status: string | null;
  requires_h1b_transfer: boolean | null;
  needs_employer_sponsorship: boolean | null;
  // Availability
  start_date: string | null;
  notice_period: string | null;
  available_for_relocation: boolean | null;
  available_for_travel: boolean | null;
  willing_to_work_overtime: boolean | null;
  willing_to_work_weekends: boolean | null;
  preferred_shift: string | null;
  open_to_contract: boolean | null;
  minimum_salary: number | null;
  // EEO (voluntary self-identification)
  eeo_gender: string | null;
  eeo_race: string | null;
  eeo_veteran_status: string | null;
  eeo_disability_status: string | null;
  // Background & legal
  felony_conviction: boolean | null;
  non_compete_subject: boolean | null;
  consent_background_check: boolean | null;
  consent_drug_screening: boolean | null;
  // Assets & timeline
  resume_url: string | null;
  profile_photo_url: string | null;
  onboarding_completed_at: string | null;
  created_at: string | null;
}

interface SavedAnswer {
  id: string;
  question_key: string;
  question_text: string;
  answer: string;
  updated_at: string | null;
}

interface MatchedJob {
  id: string;
  score: number;
  reasons: unknown;
  job: { id: string; title: string; company: string; location: string; url: string } | null;
  routingDecision: string | null;
  routingNote: string | null;
}

interface QueueItem {
  id: string;
  status: string;
  category: string;
  created_at: string;
  job_posts: { id: string; title: string; company: string; location: string; url: string } | null;
}

interface RunItem {
  id: string;
  status: string;
  current_step: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  job_posts: { id: string; title: string; company: string; location: string; url: string } | null;
}

interface OutreachDraft {
  id: string;
  subject: string | null;
  body: string | null;
  status: string;
  sent_at: string | null;
  job_posts: { id: string; title: string; company: string } | null;
  outreach_contacts: { id: string; full_name: string | null; email: string | null; title: string | null } | null;
}

interface RecruiterThread {
  id: string;
  thread_status: string;
  last_reply_at: string | null;
  next_follow_up_at: string | null;
  recruiters: { id: string; name: string | null; title: string | null; company: string | null; email: string | null } | null;
}

interface Interview {
  id: string;
  scheduled_at: string;
  duration_min: number;
  interview_type: string;
  meeting_link: string | null;
  status: string;
  notes_for_candidate: string | null;
  notes_internal: string | null;
  job_posts: { id: string; title: string; company: string } | null;
  outcome?: string | null;
  offer_amount?: number | null;
  hire_date?: string | null;
  rejection_reason?: string | null;
  outcome_notes?: string | null;
  outcome_recorded_at?: string | null;
}

interface InterviewPrep {
  id: string;
  content: unknown;
  created_at: string;
  job_posts: { id: string; title: string; company: string } | null;
}

interface Reference {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  relationship: string;
}

interface Document {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

interface InboundEmail {
  id: string;
  from_email: string;
  from_name: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  classification: string;
  classification_confidence: number;
  matched_application_id: string | null;
}

interface GmailConnectionInfo {
  email: string;
  connectedAt: string;
}

interface ProfileAuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

interface ProfileAuditLog {
  id: string;
  actor_account_manager_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  changed_fields: ProfileAuditChange[] | null;
  created_at: string;
}

interface FinancialContract {
  id: string;
  plan_type: string | null;
  registration_fee: number | null;
  commission_rate: number | null;
  agreed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface RegistrationPayment {
  id: string;
  total_amount: number | null;
  amount_paid: number | null;
  status: string;
  payment_deadline: string | null;
  work_started: boolean;
  created_at: string;
  updated_at: string | null;
}

interface PaymentInstallment {
  id: string;
  registration_payment_id: string;
  installment_number: number;
  amount: number | null;
  proposed_date: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface PaymentRequest {
  id: string;
  installment_id: string | null;
  offer_id: string | null;
  method: string;
  status: string;
  details_sent_at: string | null;
  note: string | null;
  created_at: string;
}

interface PaymentScreenshot {
  id: string;
  payment_request_id: string | null;
  installment_id: string | null;
  offer_id: string | null;
  file_url: string;
  uploaded_at: string;
  acknowledged_at: string | null;
  note: string | null;
}

interface FinancialOffer {
  id: string;
  company: string;
  role: string;
  base_salary: number | null;
  status: string;
  commission_status: string;
  commission_amount: number | null;
  commission_due_date: string | null;
  reported_by: string;
  seeker_confirmed_at: string | null;
  am_confirmed_at: string | null;
  created_at: string;
}

interface CommissionPayment {
  id: string;
  offer_id: string;
  amount: number | null;
  paid_at: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
}

interface FinancialEscalation {
  id: string;
  reason: string;
  context_notes: string | null;
  decision: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  created_at: string;
}

interface FinancialData {
  contracts: FinancialContract[];
  registrationPayments: RegistrationPayment[];
  installments: PaymentInstallment[];
  paymentRequests: PaymentRequest[];
  screenshots: PaymentScreenshot[];
  offers: FinancialOffer[];
  commissionPayments: CommissionPayment[];
  escalations: FinancialEscalation[];
}

const EMPTY_FINANCIAL_DATA: FinancialData = {
  contracts: [],
  registrationPayments: [],
  installments: [],
  paymentRequests: [],
  screenshots: [],
  offers: [],
  commissionPayments: [],
  escalations: [],
};

interface SeekerConversation {
  id: string;
  subject: string;
  conversation_type: "general" | "application_question" | "task";
  status: string;
  updated_at: string;
  unread_count: number;
  open_task_count: number;
  account_manager: {
    name: string | null;
    email: string | null;
  } | null;
  last_message: {
    id: string;
    content: string;
    sender_type: string;
    created_at: string;
  } | null;
}

interface SeekerConversationMessage {
  id: string;
  sender_type: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  attachments?: unknown;
}

interface ScreeningAnswer {
  id: string;
  question_key: string;
  question_text: string;
  answer_value: string;
  answer_type: string;
  created_at: string;
  updated_at: string;
}

interface FailureScreenshot {
  id: string;
  run_id: string;
  step: string;
  reason: string;
  url: string;
  screenshot_path: string;
  created_at: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "reports", label: "Reports" },
  { id: "financial", label: "Financial" },
  { id: "jobs", label: "Jobs" },
  { id: "applications", label: "Applications" },
  { id: "screening", label: "Screening" },
  { id: "facts", label: "Facts" },
  { id: "debug", label: "Debug" },
  { id: "activity", label: "Activity" },
  { id: "feedback", label: "Feedback" },
  { id: "messages", label: "Messages" },
  { id: "outreach", label: "Outreach" },
  { id: "interviews", label: "Interviews" },
  { id: "prep", label: "Prep" },
  { id: "inbox", label: "Inbox" },
];

export default function SeekerDetailClient({
  backHref = "/dashboard/seekers",
  seeker,
  matchedJobs,
  queueItems,
  runs,
  outreachDrafts,
  recruiterThreads,
  interviews,
  interviewPrep,
  references,
  documents,
  deliveryBundle,
  gmailConnection,
  inboundEmails,
  auditLogs = [],
  financial = EMPTY_FINANCIAL_DATA,
  screeningAnswers: initialScreeningAnswers = [],
  savedAnswers = [],
  failureScreenshots = [],
  canReviewDeliveryCases = false,
}: {
  backHref?: string;
  seeker: SeekerData;
  matchedJobs: MatchedJob[];
  queueItems: QueueItem[];
  runs: RunItem[];
  outreachDrafts: OutreachDraft[];
  recruiterThreads: RecruiterThread[];
  interviews: Interview[];
  interviewPrep: InterviewPrep[];
  references: Reference[];
  documents: Document[];
  deliveryBundle?: ClientDeliveryCaseBundle | null;
  gmailConnection: GmailConnectionInfo | null;
  inboundEmails: InboundEmail[];
  auditLogs?: ProfileAuditLog[];
  financial?: FinancialData;
  screeningAnswers?: ScreeningAnswer[];
  savedAnswers?: SavedAnswer[];
  failureScreenshots?: FailureScreenshot[];
  canReviewDeliveryCases?: boolean;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const threshold = seeker.match_threshold ?? 60;
  const aboveThreshold = matchedJobs.filter((m) => m.score >= threshold && m.routingDecision !== "OVERRIDDEN_OUT");
  const needsAttention = runs.filter((r) => r.status === "NEEDS_ATTENTION").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <Link
              href={backHref}
              className="text-sm text-violet-600 hover:text-violet-800 mb-2 inline-block"
            >
              {"<-"} Back to Job Seekers
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {seeker.full_name || "Unnamed Seeker"}
            </h1>
            <p className="text-gray-600">{seeker.email}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {seeker.location && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                  {seeker.location}
                </span>
              )}
              {seeker.seniority && (
                <span className="px-2 py-1 bg-violet-100 text-violet-700 text-sm rounded capitalize">
                  {seeker.seniority}
                </span>
              )}
              {seeker.work_type && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded capitalize">
                  {seeker.work_type}
                </span>
              )}
              {gmailConnection ? (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Gmail: {gmailConnection.email}
                </span>
              ) : (
                <span className="px-2 py-1 bg-red-50 text-red-400 text-sm rounded">
                  Gmail not connected
                </span>
              )}
              {seeker.salary_min && seeker.salary_max && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm rounded">
                  ${seeker.salary_min.toLocaleString()} - ${seeker.salary_max.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-center">
            <StatBox label="Matched Jobs" value={aboveThreshold.length} />
            <StatBox label="In Queue" value={queueItems.filter((q) => q.status === "QUEUED").length} color="blue" />
            <StatBox label="Applied" value={runs.filter((r) => ["APPLIED", "COMPLETED"].includes(r.status)).length} color="green" />
            {needsAttention > 0 && (
              <StatBox label="Needs Attention" value={needsAttention} color="orange" />
            )}
            <StatBox label="Interviews" value={interviews.filter((i) => i.status === "confirmed").length} color="purple" />
            <StatBox label="Inbox" value={inboundEmails.length} />
          </div>
        </div>
      </div>

      <DeliveryCommandPanel
        seekerId={seeker.id}
        seekerName={seeker.full_name || "Unnamed Seeker"}
        deliveryBundle={
          deliveryBundle ?? {
            snapshot: null,
            caseRecord: null,
            blockers: [],
            escalations: [],
          }
        }
        canReviewCases={canReviewDeliveryCases}
      />

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b overflow-x-auto">
          <nav className="flex -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
                {tab.id === "applications" && needsAttention > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                    {needsAttention}
                  </span>
                )}
                {tab.id === "inbox" && inboundEmails.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-violet-100 text-violet-800 text-xs rounded-full">
                    {inboundEmails.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "overview" && (
            <OverviewTab
              seeker={seeker}
              references={references}
              documents={documents}
            />
          )}
          {(activeTab === "profile" || activeTab === "reports") && (
            <ProfileTab
              seeker={seeker}
              auditLogs={auditLogs}
              savedAnswers={savedAnswers}
            />
          )}
          {activeTab === "financial" && (
            <FinancialTab financial={financial} />
          )}
          {activeTab === "jobs" && (
            <JobsTab
              matchedJobs={matchedJobs}
              threshold={threshold}
              seekerId={seeker.id}
              initialWeights={seeker.match_weights}
            />
          )}
          {activeTab === "applications" && (
            <ApplicationsTab queueItems={queueItems} runs={runs} />
          )}
          {activeTab === "screening" && (
            <ScreeningAnswersTab seekerId={seeker.id} initialAnswers={initialScreeningAnswers} />
          )}
          {activeTab === "facts" && (
            <ClientFactsTab seekerId={seeker.id} />
          )}
          {activeTab === "debug" && (
            <DebugScreenshotsTab screenshots={failureScreenshots} runs={runs} />
          )}
          {activeTab === "activity" && (
            <ActivityFeedTab seekerId={seeker.id} />
          )}
          {activeTab === "feedback" && (
            <FeedbackTab seekerId={seeker.id} />
          )}
          {activeTab === "messages" && (
            <MessagesTab seekerId={seeker.id} />
          )}
          {activeTab === "outreach" && (
            <OutreachTab drafts={outreachDrafts} threads={recruiterThreads} />
          )}
          {activeTab === "interviews" && (
            <InterviewsTab interviews={interviews} seekerId={seeker.id} />
          )}
          {activeTab === "prep" && (
            <PrepTab prep={interviewPrep} seekerId={seeker.id} />
          )}
          {activeTab === "inbox" && (
            <InboxTab emails={inboundEmails} gmailConnection={gmailConnection} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "blue" | "green" | "orange" | "purple";
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-violet-600",
    green: "text-green-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };
  const colorClass = color ? colorClasses[color] : "text-gray-900";

  return (
    <div className="px-4 py-2 bg-gray-50 rounded-lg">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function EditableChips({
  items,
  onUpdate,
  color,
  placeholder,
}: {
  items: string[];
  onUpdate: (items: string[]) => void;
  color: "blue" | "green";
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const colorStyles = {
    blue: "bg-violet-100 text-violet-800",
    green: "bg-green-100 text-green-800",
  };

  const addItem = () => {
    const value = input.trim();
    if (value && !items.includes(value)) {
      onUpdate([...items, value]);
    }
    setInput("");
  };

  const removeItem = (item: string) => {
    onUpdate(items.filter((i) => i !== item));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className={`inline-flex items-center gap-1 px-3 py-1 ${colorStyles[color]} text-sm rounded-full`}
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="ml-0.5 hover:opacity-70 font-bold text-xs"
              title={`Remove "${item}"`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!input.trim()}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ResumeTemplateCard({ seeker }: { seeker: SeekerData }) {
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(
    seeker.resume_template_id ?? "classic"
  );
  const [saving, setSaving] = useState<ResumeTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Render the client's base resume in the selected template for a live preview.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);
    fetch("/api/am/resume-template/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_seeker_id: seeker.id, template_id: templateId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Preview unavailable.");
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPreviewUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(e instanceof Error ? e.message : "Preview unavailable.");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [templateId, seeker.id]);

  const choose = async (next: ResumeTemplateId) => {
    if (next === templateId) return;
    setError(null);
    setSaving(next);
    const prev = templateId;
    setTemplateId(next);
    try {
      const res = await fetch("/api/am/resume-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seeker.id, template_id: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTemplateId(prev);
        setError(data.error || "Failed to update template.");
      }
    } catch {
      setTemplateId(prev);
      setError("Failed to update template.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section title="Resume Template">
      <p className="mb-3 text-xs text-gray-500">
        Every resume JobGenius tailors for this client uses this template. Change it anytime.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {RESUME_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => choose(t.id)}
            disabled={saving !== null}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
              templateId === t.id
                ? "border-violet-500 bg-violet-50 text-violet-700 font-medium"
                : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <span className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              {saving === t.id ? (
                <span className="text-[10px] text-gray-400">Saving…</span>
              ) : templateId === t.id ? (
                <span className="text-[10px] text-violet-500">Selected</span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs text-gray-400">{t.description}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">Preview</span>
          {previewLoading && <span className="text-[10px] text-gray-400">Rendering…</span>}
        </div>
        {previewError ? (
          <p className="mt-1 text-xs text-amber-600">{previewError}</p>
        ) : (
          <iframe
            title="Resume template preview"
            src={previewUrl ? `${previewUrl}#toolbar=0&navpanes=0&view=FitH` : undefined}
            className="mt-1 h-80 w-full rounded-lg border border-gray-200 bg-gray-50"
          />
        )}
      </div>
    </Section>
  );
}

function CampaignTierCard({
  seeker,
  tier,
  onTierChange,
}: {
  seeker: SeekerData;
  tier: "essentials" | "premium" | null;
  onTierChange: (tier: "essentials" | "premium", setupFeeUsd: number) => void;
}) {
  const [setupFeeUsd, setSetupFeeUsd] = useState<number | null>(seeker.setup_fee_usd ?? null);
  const [paidAt, setPaidAt] = useState<string | null>(seeker.setup_fee_paid_at ?? null);
  const [saving, setSaving] = useState<"tier" | "paid" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectTier = async (value: "essentials" | "premium") => {
    setError(null);
    setSaving("tier");
    try {
      const res = await fetch("/api/am/campaign-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seeker.id, tier: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to set the campaign tier.");
        return;
      }
      setSetupFeeUsd(data.setup_fee_usd);
      setPaidAt(null);
      onTierChange(data.campaign_tier, data.setup_fee_usd);
    } catch {
      setError("Failed to set the campaign tier.");
    } finally {
      setSaving(null);
    }
  };

  const markPaid = async () => {
    setError(null);
    setSaving("paid");
    try {
      const res = await fetch("/api/am/campaign-tier", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seeker.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to mark the setup fee as paid.");
        return;
      }
      setPaidAt(data.setup_fee_paid_at);
    } catch {
      setError("Failed to mark the setup fee as paid.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section title="Campaign Plan & Setup Fee">
      <div className="flex gap-2">
        {PRICING_PLANS.map((plan) => {
          const value = plan.name.toLowerCase() as "essentials" | "premium";
          const isActive = tier === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => selectTier(value)}
              disabled={saving === "tier"}
              className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                isActive
                  ? "border-violet-400 bg-violet-50 text-violet-800"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">{plan.name}</span>
              <span className="block text-xs text-gray-400">
                ${plan.setupFeeUsd.toLocaleString()} setup fee
              </span>
            </button>
          );
        })}
      </div>

      {tier && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
          <div className="text-sm text-gray-600">
            Setup fee:{" "}
            <span className="font-medium text-gray-900">${setupFeeUsd?.toLocaleString()}</span>
            {paidAt ? (
              <span className="ml-2 text-xs text-green-600">
                Paid {new Date(paidAt).toLocaleDateString()}
              </span>
            ) : (
              <span className="ml-2 text-xs text-amber-600">Not yet paid</span>
            )}
          </div>
          {!paidAt && (
            <button
              type="button"
              onClick={markPaid}
              disabled={saving === "paid"}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50"
            >
              {saving === "paid" ? "Saving…" : "Mark fee as paid"}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Section>
  );
}

function AgreementPushCard({ seeker }: { seeker: SeekerData }) {
  const [requestedAt, setRequestedAt] = useState<string | null>(
    seeker.collaboration_agreement_requested_at ?? null
  );
  const [tier, setTier] = useState<"essentials" | "premium" | null>(seeker.campaign_tier ?? null);
  const signedAt = seeker.collaboration_agreement_signed_at ?? null;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/am/agreement/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seeker.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to send the agreement.");
        return;
      }
      setRequestedAt(data.requested_at);
    } catch {
      setError("Failed to send the agreement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <CampaignTierCard seeker={seeker} tier={tier} onTierChange={(t) => setTier(t)} />

      <Section title="Service Agreement">
        {signedAt ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Signed by client on {new Date(signedAt).toLocaleDateString()}.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {!tier
                ? "Select a campaign plan above before sending the agreement."
                : requestedAt
                  ? `Sent ${new Date(requestedAt).toLocaleDateString()} — awaiting the client's signature.`
                  : "The client can preview the agreement in their portal, but can only sign once you send it."}
            </p>
            <button
              type="button"
              onClick={send}
              disabled={sending || !tier}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {sending ? "Sending…" : requestedAt ? "Resend agreement" : "Send agreement to client"}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </Section>
    </div>
  );
}

function OverviewTab({
  seeker,
  references,
  documents,
  onSeekerUpdate,
}: {
  seeker: SeekerData;
  references: Reference[];
  documents: Document[];
  onSeekerUpdate?: (fields: Partial<SeekerData>) => void;
}) {
  const [targetTitles, setTargetTitles] = useState<string[]>(seeker.target_titles ?? []);
  const [skills, setSkills] = useState<string[]>(seeker.skills ?? []);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ field: string; type: "success" | "error"; text: string } | null>(null);

  const saveField = async (field: "target_titles" | "skills", value: string[]) => {
    setSaving(field);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/am/seekers/${seeker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveMsg({ field, type: "error", text: data.error || "Failed to save." });
        return;
      }
      setSaveMsg({ field, type: "success", text: "Saved!" });
      if (onSeekerUpdate) onSeekerUpdate({ [field]: value });
      setTimeout(() => setSaveMsg((prev) => (prev?.field === field ? null : prev)), 2000);
    } catch {
      setSaveMsg({ field, type: "error", text: "Network error." });
    } finally {
      setSaving(null);
    }
  };

  const updateTargetTitles = (newTitles: string[]) => {
    setTargetTitles(newTitles);
    saveField("target_titles", newTitles);
  };

  const updateSkills = (newSkills: string[]) => {
    setSkills(newSkills);
    saveField("skills", newSkills);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Profile Info */}
      <div className="space-y-6">
        <Section title="Contact Information">
          <dl className="space-y-2">
            <InfoRow label="Email" value={seeker.email} />
            <InfoRow label="Phone" value={seeker.phone || "Not provided"} />
            <InfoRow label="LinkedIn" value={seeker.linkedin_url} link />
            <InfoRow label="Portfolio" value={seeker.portfolio_url} link />
          </dl>
        </Section>

        <ResumeTemplateCard seeker={seeker} />

        <AgreementPushCard seeker={seeker} />

        <Section title={<span className="flex items-center gap-2">Target Titles {saving === "target_titles" && <span className="text-xs text-gray-400">Saving...</span>}{saveMsg?.field === "target_titles" && <span className={`text-xs ${saveMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>{saveMsg.text}</span>}</span>}>
          <EditableChips
            items={targetTitles}
            onUpdate={updateTargetTitles}
            color="blue"
            placeholder="Add a target title... (e.g. Database Administrator)"
          />
        </Section>

        <Section title={<span className="flex items-center gap-2">Skills {saving === "skills" && <span className="text-xs text-gray-400">Saving...</span>}{saveMsg?.field === "skills" && <span className={`text-xs ${saveMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>{saveMsg.text}</span>}</span>}>
          <EditableChips
            items={skills}
            onUpdate={updateSkills}
            color="green"
            placeholder="Add a skill..."
          />
        </Section>
      </div>

      {/* Documents & References */}
      <div className="space-y-6">
        <Section title="Documents">
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{doc.file_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{doc.doc_type}</p>
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-600 hover:text-violet-800"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No documents uploaded</p>
          )}
        </Section>

        <Section title="References">
          {references.length > 0 ? (
            <div className="space-y-3">
              {references.map((ref) => (
                <div key={ref.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{ref.name}</p>
                  {ref.title && (
                    <p className="text-sm text-gray-600">
                      {ref.title}
                      {ref.company && ` at ${ref.company}`}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 capitalize mt-1">{ref.relationship}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No references added</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function ProfileTab({
  seeker,
  auditLogs,
  savedAnswers = [],
}: {
  seeker: SeekerData;
  auditLogs: ProfileAuditLog[];
  savedAnswers?: SavedAnswer[];
}) {
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis] = useState<{ analysis: string; rating: string } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisSending, setAnalysisSending] = useState(false);
  const [analysisSendMessage, setAnalysisSendMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [reportGoal, setReportGoal] = useState(
    DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal
  );
  const [reportAdminInput, setReportAdminInput] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [jobGeniusReport, setJobGeniusReport] = useState<JobGeniusReport | null>(null);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [reportSendMessage, setReportSendMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [reportAttachTask, setReportAttachTask] = useState(false);
  const [reportTaskTitle, setReportTaskTitle] = useState(
    "Complete your JobGenius report action steps"
  );
  const [reportTaskDescription, setReportTaskDescription] = useState("");
  const [reportTaskPriority, setReportTaskPriority] = useState<"low" | "medium" | "high">(
    "medium"
  );
  const [reportTaskDueDate, setReportTaskDueDate] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [editor, setEditor] = useState({
    full_name: seeker.full_name ?? "",
    phone: seeker.phone ?? "",
    location: seeker.location ?? "",
    linkedin_url: seeker.linkedin_url ?? "",
    portfolio_url: seeker.portfolio_url ?? "",
    seniority: seeker.seniority ?? "",
    work_type: seeker.work_type ?? "",
    salary_min: seeker.salary_min != null ? String(seeker.salary_min) : "",
    salary_max: seeker.salary_max != null ? String(seeker.salary_max) : "",
    years_experience:
      seeker.years_experience != null ? String(seeker.years_experience) : "",
    bio: seeker.bio ?? "",
    target_titles: (seeker.target_titles ?? []).join(", "),
    skills: (seeker.skills ?? []).join(", "),
    preferred_industries: (seeker.preferred_industries ?? []).join(", "),
    preferred_company_sizes: (seeker.preferred_company_sizes ?? []).join(", "),
    preferred_locations: (seeker.preferred_locations ?? []).join(", "),
    open_to_relocation:
      seeker.open_to_relocation == null ? "null" : String(seeker.open_to_relocation),
    requires_visa_sponsorship:
      seeker.requires_visa_sponsorship == null
        ? "null"
        : String(seeker.requires_visa_sponsorship),
  });

  const updateEditor = (field: keyof typeof editor, value: string) => {
    setEditor((prev) => ({ ...prev, [field]: value }));
  };

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const toNullableNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseBooleanField = (value: string): boolean | null => {
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  };

  const runAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisSendMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seeker.id}/profile-analysis`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setAnalysisError(data.error || "Failed to analyze profile.");
        return;
      }
      const data = await res.json();
      setAnalysis(data);
    } catch {
      setAnalysisError("Network error.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const sendAnalysisToSeeker = async () => {
    if (!analysis) {
      return;
    }

    setAnalysisSending(true);
    setAnalysisSendMessage(null);

    const name = seeker.full_name?.trim() || "there";
    const messageBody = [
      `Hi ${name},`,
      "",
      "I reviewed your profile and here is your analysis report with suggestions.",
      `Overall rating: ${analysis.rating}`,
      "",
      analysis.analysis,
      "",
      "Please review this and reply with any updates or questions so we can improve your results quickly.",
    ].join("\n");

    try {
      const response = await fetch(`/api/am/seekers/${seeker.id}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Profile Analysis Report & Suggestions",
          conversation_type: "general",
          initial_message: {
            content: messageBody,
          },
          notify_seeker: true,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAnalysisSendMessage({
          type: "error",
          text: data.error || "Failed to send analysis to seeker.",
        });
        return;
      }

      setAnalysisSendMessage({
        type: "success",
        text: "Analysis report and suggestions sent to seeker successfully.",
      });
    } catch {
      setAnalysisSendMessage({
        type: "error",
        text: "Network error while sending analysis report.",
      });
    } finally {
      setAnalysisSending(false);
    }
  };

  const generateJobGeniusReport = async () => {
    setReportLoading(true);
    setReportError(null);
    setReportSendMessage(null);
    try {
      const response = await fetch(`/api/am/seekers/${seeker.id}/jobgenius-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: reportGoal,
          admin_input: reportAdminInput,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReportError(data.error || "Failed to generate JobGenius report.");
        return;
      }

      setJobGeniusReport(data.report ?? null);
      setReportGeneratedAt(
        typeof data.generated_at === "string" ? data.generated_at : new Date().toISOString()
      );
      if (typeof data.goal === "string" && data.goal.trim()) {
        setReportGoal(data.goal);
      }
    } catch {
      setReportError("Network error while generating report.");
    } finally {
      setReportLoading(false);
    }
  };

  const downloadJobGeniusReportPdf = async () => {
    if (!jobGeniusReport) {
      setReportError("Generate the JobGenius report first.");
      return;
    }

    setReportDownloading(true);
    setReportError(null);

    try {
      const response = await fetch(`/api/am/seekers/${seeker.id}/jobgenius-report/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: jobGeniusReport,
          goal: reportGoal,
          admin_input: reportAdminInput,
          generated_at: reportGeneratedAt,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setReportError(data.error || "Failed to generate PDF.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const dateLabel = (reportGeneratedAt || new Date().toISOString()).slice(0, 10);
      const safeName = (seeker.full_name || "seeker")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      anchor.href = url;
      anchor.download = `jobgenius-report-${safeName || "seeker"}-${dateLabel}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setReportError("Network error while downloading PDF.");
    } finally {
      setReportDownloading(false);
    }
  };

  const sendJobGeniusReportToSeeker = async () => {
    if (!jobGeniusReport) {
      setReportSendMessage({
        type: "error",
        text: "Generate the JobGenius report first.",
      });
      return;
    }

    const goalToSend = reportGoal.trim() || DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal;
    const seekerName = seeker.full_name?.trim() || "there";
    const messageBody = buildJobGeniusReportMessage({
      seekerName,
      goal: goalToSend,
      report: jobGeniusReport,
    });

    if (reportAttachTask && !reportTaskTitle.trim()) {
      setReportSendMessage({
        type: "error",
        text: "Task title is required when attaching a task.",
      });
      return;
    }

    setReportSending(true);
    setReportSendMessage(null);

    try {
      const initialMessage: {
        content: string;
        task?: {
          title: string;
          description?: string | null;
          due_date?: string | null;
          priority?: "low" | "medium" | "high";
        };
      } = {
        content: messageBody,
      };

      if (reportAttachTask) {
        initialMessage.task = {
          title: reportTaskTitle.trim(),
          description: reportTaskDescription.trim() || null,
          due_date: reportTaskDueDate || null,
          priority: reportTaskPriority,
        };
      }

      const response = await fetch(`/api/am/seekers/${seeker.id}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "JobGenius Career Report & Action Plan",
          conversation_type: reportAttachTask ? "task" : "general",
          initial_message: initialMessage,
          notify_seeker: true,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReportSendMessage({
          type: "error",
          text: data.error || "Failed to send JobGenius report.",
        });
        return;
      }

      setReportSendMessage({
        type: "success",
        text: reportAttachTask
          ? "JobGenius report and task sent to seeker."
          : "JobGenius report sent to seeker.",
      });
    } catch {
      setReportSendMessage({
        type: "error",
        text: "Network error while sending JobGenius report.",
      });
    } finally {
      setReportSending(false);
    }
  };

  const saveProfileChanges = async () => {
    setEditorSaving(true);
    setEditorMessage(null);
    try {
      const payload = {
        full_name: editor.full_name.trim() || null,
        phone: editor.phone.trim() || null,
        location: editor.location.trim() || null,
        linkedin_url: editor.linkedin_url.trim() || null,
        portfolio_url: editor.portfolio_url.trim() || null,
        seniority: editor.seniority.trim() || null,
        work_type: editor.work_type.trim() || null,
        salary_min: toNullableNumber(editor.salary_min),
        salary_max: toNullableNumber(editor.salary_max),
        years_experience: toNullableNumber(editor.years_experience),
        bio: editor.bio.trim() || null,
        target_titles: parseList(editor.target_titles),
        skills: parseList(editor.skills),
        preferred_industries: parseList(editor.preferred_industries),
        preferred_company_sizes: parseList(editor.preferred_company_sizes),
        preferred_locations: parseList(editor.preferred_locations),
        open_to_relocation: parseBooleanField(editor.open_to_relocation),
        requires_visa_sponsorship: parseBooleanField(
          editor.requires_visa_sponsorship
        ),
      };

      const response = await fetch(`/api/am/seekers/${seeker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setEditorMessage({
          type: "error",
          text: data.error || "Failed to save profile changes.",
        });
        return;
      }

      setEditorMessage({
        type: "success",
        text: "Profile updated successfully. Reload the page to see all derived stats.",
      });
    } catch {
      setEditorMessage({ type: "error", text: "Network error." });
    } finally {
      setEditorSaving(false);
    }
  };

  const completion = seeker.profile_completion ?? 0;

  const boolLabel = (val: boolean | null) =>
    val === true ? "Yes" : val === false ? "No" : "—";

  const formatAuditValue = (value: unknown) => {
    if (value === null || value === undefined) return "null";
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Completion */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Profile Completion</h3>
          <span className="text-lg font-bold text-violet-600">{completion}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${completion >= 80 ? "bg-green-500" : completion >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      {/* AI Analysis */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">AI Profile Analysis</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={sendAnalysisToSeeker}
              disabled={analysisSending || !analysis}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {analysisSending ? "Sending..." : "Send To Seeker"}
            </button>
            <button
              onClick={runAnalysis}
              disabled={analysisLoading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {analysisLoading ? "Analyzing..." : "Analyze Profile"}
            </button>
          </div>
        </div>
        {analysisError && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{analysisError}</p>
        )}
        {analysisSendMessage && (
          <p
            className={`text-sm p-3 rounded ${
              analysisSendMessage.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {analysisSendMessage.text}
          </p>
        )}
        {analysis && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Rating:</span>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                analysis.rating === "Ready" ? "bg-green-100 text-green-800" :
                analysis.rating === "Needs Work" ? "bg-yellow-100 text-yellow-800" :
                "bg-red-100 text-red-800"
              }`}>
                {analysis.rating}
              </span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-4 rounded-lg border">
              {analysis.analysis}
            </div>
          </div>
        )}
      </div>

      {/* JobGenius Report */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              JobGenius Report (Analysis, Actions, Suggestions)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Generate a tailored report, download PDF, and send it to the seeker with an optional task.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={sendJobGeniusReportToSeeker}
              disabled={reportSending || !jobGeniusReport}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {reportSending ? "Sending..." : "Send To Seeker"}
            </button>
            <button
              onClick={downloadJobGeniusReportPdf}
              disabled={reportDownloading || !jobGeniusReport}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {reportDownloading ? "Preparing PDF..." : "Download PDF"}
            </button>
            <button
              onClick={generateJobGeniusReport}
              disabled={reportLoading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {reportLoading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Report Goal
            </label>
            <input
              value={reportGoal}
              onChange={(event) => setReportGoal(event.target.value)}
              placeholder="Goal for this seeker report"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Admin Inputs / Context
            </label>
            <textarea
              rows={3}
              value={reportAdminInput}
              onChange={(event) => setReportAdminInput(event.target.value)}
              placeholder="Add context, constraints, or focus areas for the report..."
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={reportAttachTask}
              onChange={(event) => setReportAttachTask(event.target.checked)}
            />
            Attach a task when sending this report
          </label>

          {reportAttachTask && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={reportTaskTitle}
                onChange={(event) => setReportTaskTitle(event.target.value)}
                placeholder="Task title"
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="date"
                value={reportTaskDueDate}
                onChange={(event) => setReportTaskDueDate(event.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <select
                value={reportTaskPriority}
                onChange={(event) =>
                  setReportTaskPriority(event.target.value as "low" | "medium" | "high")
                }
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="low">Priority: Low</option>
                <option value="medium">Priority: Medium</option>
                <option value="high">Priority: High</option>
              </select>
              <input
                value={reportTaskDescription}
                onChange={(event) => setReportTaskDescription(event.target.value)}
                placeholder="Task description (optional)"
                className="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        {reportError && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{reportError}</p>
        )}

        {reportSendMessage && (
          <p
            className={`text-sm p-3 rounded ${
              reportSendMessage.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {reportSendMessage.text}
          </p>
        )}

        {jobGeniusReport && (
          <div className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-gray-900">{jobGeniusReport.title}</h4>
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                {jobGeniusReport.profile_readiness}
              </span>
            </div>
            {reportGeneratedAt && (
              <p className="text-xs text-gray-500">
                Generated: {new Date(reportGeneratedAt).toLocaleString()}
              </p>
            )}
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {jobGeniusReport.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="text-sm font-semibold text-gray-900 mb-2">Analysis</h5>
                {jobGeniusReport.analysis.length === 0 ? (
                  <p className="text-sm text-gray-500">No analysis points generated.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {jobGeniusReport.analysis.map((item, index) => (
                      <li key={`analysis-${index}`}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h5 className="text-sm font-semibold text-gray-900 mb-2">Suggestions</h5>
                {jobGeniusReport.suggestions.length === 0 ? (
                  <p className="text-sm text-gray-500">No suggestions generated.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                    {jobGeniusReport.suggestions.map((item, index) => (
                      <li key={`suggestion-${index}`}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h5 className="text-sm font-semibold text-gray-900 mb-2">Action Steps</h5>
              {jobGeniusReport.action_steps.length === 0 ? (
                <p className="text-sm text-gray-500">No action steps generated.</p>
              ) : (
                <div className="space-y-2">
                  {jobGeniusReport.action_steps.map((step, index) => (
                    <div key={`action-${index}`} className="border rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-900">
                        {index + 1}. {step.step}
                      </p>
                      {step.why && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Why:</span> {step.why}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {step.timeline ? `Timeline: ${step.timeline}` : "Timeline: Not set"} |{" "}
                        {step.priority ? `Priority: ${step.priority}` : "Priority: medium"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h5 className="text-sm font-semibold text-gray-900 mb-2">Next Steps</h5>
              {jobGeniusReport.next_steps.length === 0 ? (
                <p className="text-sm text-gray-500">No next steps generated.</p>
              ) : (
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {jobGeniusReport.next_steps.map((item, index) => (
                    <li key={`next-step-${index}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile Editor */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Manage Profile (Admin/AM)</h3>
            <p className="text-xs text-gray-500">
              Update this job seeker profile on their behalf.
            </p>
          </div>
          <button
            onClick={saveProfileChanges}
            disabled={editorSaving}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {editorSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {editorMessage && (
          <p
            className={`text-sm p-3 rounded ${
              editorMessage.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {editorMessage.text}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={editor.full_name}
            onChange={(event) => updateEditor("full_name", event.target.value)}
            placeholder="Full name"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.phone}
            onChange={(event) => updateEditor("phone", event.target.value)}
            placeholder="Phone"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.location}
            onChange={(event) => updateEditor("location", event.target.value)}
            placeholder="Location"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.seniority}
            onChange={(event) => updateEditor("seniority", event.target.value)}
            placeholder="Seniority"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.work_type}
            onChange={(event) => updateEditor("work_type", event.target.value)}
            placeholder="Work type"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.years_experience}
            onChange={(event) => updateEditor("years_experience", event.target.value)}
            placeholder="Years experience"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.salary_min}
            onChange={(event) => updateEditor("salary_min", event.target.value)}
            placeholder="Salary min"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.salary_max}
            onChange={(event) => updateEditor("salary_max", event.target.value)}
            placeholder="Salary max"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.linkedin_url}
            onChange={(event) => updateEditor("linkedin_url", event.target.value)}
            placeholder="LinkedIn URL"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            value={editor.portfolio_url}
            onChange={(event) => updateEditor("portfolio_url", event.target.value)}
            placeholder="Portfolio URL"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <select
            value={editor.open_to_relocation}
            onChange={(event) => updateEditor("open_to_relocation", event.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="null">Open to relocation: Unknown</option>
            <option value="true">Open to relocation: Yes</option>
            <option value="false">Open to relocation: No</option>
          </select>
          <select
            value={editor.requires_visa_sponsorship}
            onChange={(event) =>
              updateEditor("requires_visa_sponsorship", event.target.value)
            }
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="null">Visa sponsorship: Unknown</option>
            <option value="true">Visa sponsorship: Yes</option>
            <option value="false">Visa sponsorship: No</option>
          </select>
        </div>

        <textarea
          value={editor.bio}
          onChange={(event) => updateEditor("bio", event.target.value)}
          placeholder="Bio"
          rows={3}
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          value={editor.target_titles}
          onChange={(event) => updateEditor("target_titles", event.target.value)}
          placeholder="Target titles (comma separated)"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          value={editor.skills}
          onChange={(event) => updateEditor("skills", event.target.value)}
          placeholder="Skills (comma separated)"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          value={editor.preferred_industries}
          onChange={(event) => updateEditor("preferred_industries", event.target.value)}
          placeholder="Preferred industries (comma separated)"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          value={editor.preferred_company_sizes}
          onChange={(event) =>
            updateEditor("preferred_company_sizes", event.target.value)
          }
          placeholder="Preferred company sizes (comma separated)"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <input
          value={editor.preferred_locations}
          onChange={(event) => updateEditor("preferred_locations", event.target.value)}
          placeholder="Preferred locations (comma separated)"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-900">Recent Profile Change Log</h3>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No profile changes logged yet.</p>
        ) : (
          <div className="space-y-3">
            {auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="bg-white border rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {log.actor_email} ({log.actor_role})
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  {(log.changed_fields || []).length === 0 ? (
                    <p className="text-xs text-gray-500">No field diff captured.</p>
                  ) : (
                    (log.changed_fields || []).map((change, index) => (
                      <p key={`${log.id}-${index}`} className="text-xs text-gray-700 break-words">
                        <span className="font-medium">{change.field}</span>:{" "}
                        <span className="text-gray-500">{formatAuditValue(change.from)}</span>{" "}
                        {"->"}{" "}
                        <span>{formatAuditValue(change.to)}</span>
                      </p>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Section title="Personal Information">
          <dl className="space-y-2">
            <InfoRow label="Name" value={seeker.full_name} />
            <InfoRow label="Email" value={seeker.email} />
            <InfoRow label="Phone" value={seeker.phone || "—"} />
            <InfoRow label="Location" value={seeker.location || "—"} />
            <InfoRow label="LinkedIn" value={seeker.linkedin_url} link />
            <InfoRow label="Portfolio" value={seeker.portfolio_url} link />
          </dl>
          {(seeker.address_line1 || seeker.address_city) && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-gray-500 mb-1">Address</p>
              <p className="text-sm text-gray-700">
                {[seeker.address_line1, seeker.address_city, seeker.address_state, seeker.address_zip, seeker.address_country].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
          <div className="mt-3 pt-3 border-t">
            <dl className="space-y-2">
              <InfoRow label="Resume on file" value={seeker.resume_url} link />
              <InfoRow label="Signed Up" value={dateLabel(seeker.created_at)} />
              <InfoRow
                label="Onboarding Completed"
                value={
                  seeker.onboarding_completed_at
                    ? dateLabel(seeker.onboarding_completed_at)
                    : "Not completed"
                }
              />
            </dl>
          </div>
        </Section>

        {/* Bio */}
        <Section title="Bio">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {seeker.bio || "No bio provided."}
          </p>
        </Section>

        {/* Job Preferences */}
        <Section title="Job Preferences">
          <dl className="space-y-2">
            <InfoRow label="Seniority" value={seeker.seniority || "—"} />
            <InfoRow label="Years of Experience" value={seeker.years_experience != null ? String(seeker.years_experience) : "—"} />
            <InfoRow label="Salary Range" value={
              seeker.salary_min || seeker.salary_max
                ? `$${(seeker.salary_min ?? 0).toLocaleString()} – $${(seeker.salary_max ?? 0).toLocaleString()}`
                : "—"
            } />
            <InfoRow
              label="Minimum Salary"
              value={
                seeker.minimum_salary != null
                  ? `$${seeker.minimum_salary.toLocaleString()}`
                  : "—"
              }
            />
            <InfoRow label="Open to Relocation" value={boolLabel(seeker.open_to_relocation)} />
          </dl>
          {seeker.target_titles && seeker.target_titles.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Target Titles</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.target_titles.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-violet-100 text-violet-800 text-xs rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.work_type_preferences && seeker.work_type_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Work Types</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.work_type_preferences.map((w) => (
                  <span key={w} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full capitalize">{w}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.employment_type_preferences && seeker.employment_type_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Employment Types</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.employment_type_preferences.map((e) => (
                  <span key={e} className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full capitalize">{e}</span>
                ))}
              </div>
            </div>
          )}
          {seeker.location_preferences && seeker.location_preferences.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Location Preferences</p>
              <div className="space-y-1">
                {seeker.location_preferences.map((lp, i) => (
                  <p key={i} className="text-sm text-gray-700">
                    <span className="font-medium capitalize">{lp.work_type}:</span> {lp.locations.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          )}
          {seeker.preferred_locations && seeker.preferred_locations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Preferred Locations</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.preferred_locations.map((loc) => (
                  <span key={loc} className="px-2 py-0.5 bg-sky-100 text-sky-800 text-xs rounded-full">{loc}</span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Skills */}
        <Section title="Skills">
          {seeker.skills && seeker.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {seeker.skills.map((s) => (
                <span key={s} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">{s}</span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No skills listed</p>
          )}
        </Section>

        {/* Work History */}
        <Section title="Work History">
          {seeker.work_history && seeker.work_history.length > 0 ? (
            <div className="space-y-3">
              {seeker.work_history.map((entry, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border">
                  <p className="font-medium text-gray-900">{entry.title}</p>
                  <p className="text-sm text-gray-600">{entry.company}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.start_date} – {entry.current ? "Present" : entry.end_date}
                  </p>
                  {entry.description && (
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{entry.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No work history</p>
          )}
        </Section>

        {/* Education */}
        <Section title="Education">
          {seeker.education && seeker.education.length > 0 ? (
            <div className="space-y-3">
              {seeker.education.map((entry, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border">
                  <p className="font-medium text-gray-900">{entry.degree}</p>
                  <p className="text-sm text-gray-600">{entry.school}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.field}{entry.graduation_year ? ` (${entry.graduation_year})` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No education listed</p>
          )}
        </Section>

        {/* Industries & Company Sizes */}
        <Section title="Industries & Company Sizes">
          {seeker.preferred_industries && seeker.preferred_industries.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Preferred Industries</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.preferred_industries.map((ind) => (
                  <span key={ind} className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">{ind}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mb-2">No preferred industries</p>
          )}
          {seeker.preferred_company_sizes && seeker.preferred_company_sizes.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Preferred Company Sizes</p>
              <div className="flex flex-wrap gap-1.5">
                {seeker.preferred_company_sizes.map((sz) => (
                  <span key={sz} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded-full">{sz}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No preferred company sizes</p>
          )}
        </Section>

        {/* Work Authorization */}
        <Section title="Work Authorization">
          <dl className="space-y-2">
            <InfoRow label="Authorized to Work" value={boolLabel(seeker.authorized_to_work)} />
            <InfoRow label="Requires Visa Sponsorship" value={boolLabel(seeker.requires_visa_sponsorship)} />
            <InfoRow label="Visa Status" value={seeker.visa_status || "—"} />
            <InfoRow label="Citizenship Status" value={seeker.citizenship_status || "—"} />
            <InfoRow label="Requires H1B Transfer" value={boolLabel(seeker.requires_h1b_transfer)} />
            <InfoRow label="Needs Employer Sponsorship" value={boolLabel(seeker.needs_employer_sponsorship)} />
          </dl>
        </Section>

        {/* Availability */}
        <Section title="Availability">
          <dl className="space-y-2">
            <InfoRow label="Start Date" value={seeker.start_date || "—"} />
            <InfoRow label="Notice Period" value={seeker.notice_period || "—"} />
            <InfoRow label="Available for Relocation" value={boolLabel(seeker.available_for_relocation)} />
            <InfoRow label="Available for Travel" value={boolLabel(seeker.available_for_travel)} />
            <InfoRow label="Willing to Work Overtime" value={boolLabel(seeker.willing_to_work_overtime)} />
            <InfoRow label="Willing to Work Weekends" value={boolLabel(seeker.willing_to_work_weekends)} />
            <InfoRow label="Preferred Shift" value={seeker.preferred_shift || "—"} />
            <InfoRow label="Open to Contract" value={boolLabel(seeker.open_to_contract)} />
          </dl>
        </Section>

        {/* Background & Legal */}
        <Section title="Background & Legal">
          <dl className="space-y-2">
            <InfoRow label="Felony Conviction" value={boolLabel(seeker.felony_conviction)} />
            <InfoRow label="Subject to Non-Compete" value={boolLabel(seeker.non_compete_subject)} />
            <InfoRow label="Consents to Background Check" value={boolLabel(seeker.consent_background_check)} />
            <InfoRow label="Consents to Drug Screening" value={boolLabel(seeker.consent_drug_screening)} />
          </dl>
        </Section>

        {/* EEO — voluntary self-identification */}
        <Section title="EEO / Voluntary Self-Identification">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
            Voluntary disclosures used only to auto-fill employer EEO forms. Do not
            use these answers when deciding which roles to submit this seeker to.
          </p>
          <dl className="space-y-2">
            <InfoRow label="Gender" value={seeker.eeo_gender || "Not disclosed"} />
            <InfoRow label="Race / Ethnicity" value={seeker.eeo_race || "Not disclosed"} />
            <InfoRow label="Veteran Status" value={seeker.eeo_veteran_status || "Not disclosed"} />
            <InfoRow label="Disability Status" value={seeker.eeo_disability_status || "Not disclosed"} />
          </dl>
        </Section>

        {/* Saved application answers the seeker wrote in their portal */}
        <div className="lg:col-span-2">
          <Section title={`Saved Application Answers (${savedAnswers.length})`}>
            {savedAnswers.length > 0 ? (
              <div className="space-y-3">
                {savedAnswers.map((answer) => (
                  <div key={answer.id} className="p-3 bg-white rounded-lg border">
                    <p className="text-sm font-medium text-gray-900">
                      {answer.question_text}
                    </p>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                      {answer.answer.trim() || "— not answered —"}
                    </p>
                    {answer.updated_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Updated {dateLabel(answer.updated_at)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                Seeker has not saved any application answers yet.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function FinancialTab({ financial }: { financial: FinancialData }) {
  const totalRegistrationRemaining = financial.registrationPayments.reduce((sum, payment) => {
    const total = Number(payment.total_amount ?? 0);
    const paid = Number(payment.amount_paid ?? 0);
    return sum + Math.max(total - paid, 0);
  }, 0);
  const pendingRequests = financial.paymentRequests.filter((request) => request.status !== "acknowledged").length;
  const openEscalations = financial.escalations.filter((escalation) => !escalation.decision).length;

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Financial Overview</h3>
            <p className="text-sm text-gray-500">Full billing timeline for this job seeker.</p>
          </div>
          <Link
            href="/dashboard/billing"
            className="px-3 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
          >
            Open Billing Admin
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 border rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Contracts</p>
          <p className="text-xl font-bold text-gray-900">{financial.contracts.length}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Outstanding Reg Fee</p>
          <p className="text-xl font-bold text-orange-600">${totalRegistrationRemaining.toLocaleString()}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Pending Requests</p>
          <p className="text-xl font-bold text-indigo-600">{pendingRequests}</p>
        </div>
        <div className="bg-gray-50 border rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Open Escalations</p>
          <p className="text-xl font-bold text-red-600">{openEscalations}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Contracts">
          {financial.contracts.length === 0 ? (
            <p className="text-sm text-gray-500">No contracts.</p>
          ) : (
            <div className="space-y-2">
              {financial.contracts.map((contract) => (
                <div key={contract.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {contract.plan_type ?? "Unknown plan"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Registration Fee: ${Number(contract.registration_fee ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    Signed: {contract.agreed_at ? new Date(contract.agreed_at).toLocaleString() : "Not signed"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Registration Payments">
          {financial.registrationPayments.length === 0 ? (
            <p className="text-sm text-gray-500">No registration payments.</p>
          ) : (
            <div className="space-y-2">
              {financial.registrationPayments.map((payment) => {
                const remaining = Math.max(
                  Number(payment.total_amount ?? 0) - Number(payment.amount_paid ?? 0),
                  0
                );
                return (
                  <div key={payment.id} className="p-3 border rounded-lg bg-white">
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {payment.status.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm text-gray-600">
                      Paid ${Number(payment.amount_paid ?? 0).toLocaleString()} / ${Number(payment.total_amount ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-orange-700">Remaining: ${remaining.toLocaleString()}</p>
                    {payment.payment_deadline && (
                      <p className="text-xs text-gray-500">
                        Deadline: {new Date(payment.payment_deadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Installments">
          {financial.installments.length === 0 ? (
            <p className="text-sm text-gray-500">No installment records.</p>
          ) : (
            <div className="space-y-2">
              {financial.installments.map((installment) => (
                <div key={installment.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900">
                    Installment #{installment.installment_number}
                  </p>
                  <p className="text-sm text-gray-600">
                    Amount: ${Number(installment.amount ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    Status: {installment.status.replace(/_/g, " ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Payment Requests & Proof">
          {financial.paymentRequests.length === 0 && financial.screenshots.length === 0 ? (
            <p className="text-sm text-gray-500">No payment requests or screenshots.</p>
          ) : (
            <div className="space-y-3">
              {financial.paymentRequests.map((request) => (
                <div key={request.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {request.method} - {request.status.replace(/_/g, " ")}
                  </p>
                  {request.note && <p className="text-xs text-gray-500 mt-1">{request.note}</p>}
                </div>
              ))}
              {financial.screenshots.map((screenshot) => (
                <div key={screenshot.id} className="p-3 border rounded-lg bg-white flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Screenshot Uploaded</p>
                    <p className="text-xs text-gray-500">
                      {new Date(screenshot.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={screenshot.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-violet-600 hover:text-violet-800"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Offers & Commission">
          {financial.offers.length === 0 ? (
            <p className="text-sm text-gray-500">No offers reported.</p>
          ) : (
            <div className="space-y-2">
              {financial.offers.map((offer) => (
                <div key={offer.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900">
                    {offer.role} at {offer.company}
                  </p>
                  <p className="text-sm text-gray-600">
                    Base Salary: ${Number(offer.base_salary ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    Offer: {offer.status} | Commission: {offer.commission_status}
                  </p>
                </div>
              ))}
              {financial.commissionPayments.map((payment) => (
                <div key={payment.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900">
                    Commission Payment ${Number(payment.amount ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {payment.paid_at ? `Paid ${new Date(payment.paid_at).toLocaleDateString()}` : "Not marked as paid"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Escalations">
          {financial.escalations.length === 0 ? (
            <p className="text-sm text-gray-500">No escalations.</p>
          ) : (
            <div className="space-y-2">
              {financial.escalations.map((escalation) => (
                <div key={escalation.id} className="p-3 border rounded-lg bg-white">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {escalation.reason.replace(/_/g, " ")}
                  </p>
                  {escalation.context_notes && (
                    <p className="text-sm text-gray-600 mt-1">{escalation.context_notes}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Decision: {escalation.decision ? escalation.decision.replace(/_/g, " ") : "Pending"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function MatchExplanationPanel({
  reasons,
  score,
  routingDecision,
}: {
  reasons: unknown;
  score: number;
  routingDecision: string | null;
}) {
  if (!reasons) return null;
  const explanation = buildMatchExplanation(reasons, {
    score,
    recommendation: routingDecision ?? undefined,
  });
  const hasContent =
    explanation.highlights.length > 0 ||
    explanation.cautions.length > 0 ||
    explanation.blockers.length > 0;
  if (!hasContent) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
      {explanation.highlights.map((h, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-green-700">
          <span className="mt-0.5 text-green-500">✓</span>
          <span>{h}</span>
        </div>
      ))}
      {explanation.cautions.map((c, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-700">
          <span className="mt-0.5">⚠</span>
          <span>{c}</span>
        </div>
      ))}
      {explanation.blockers.map((b, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-red-700">
          <span className="mt-0.5">✗</span>
          <span>{b}</span>
        </div>
      ))}
    </div>
  );
}

function JobsTab({
  matchedJobs,
  threshold,
  seekerId,
  initialWeights,
}: {
  matchedJobs: MatchedJob[];
  threshold: number;
  seekerId: string;
  initialWeights: ScoringWeights | null;
}) {
  const [filter, setFilter] = useState<"all" | "above" | "below">("above");
  const [currentThreshold, setCurrentThreshold] = useState(threshold);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights] = useState<ScoringWeights>(initialWeights ?? DEFAULT_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = matchedJobs.filter((m) => {
    if (filter === "above") return m.score >= currentThreshold && m.routingDecision !== "OVERRIDDEN_OUT";
    if (filter === "below") return m.score < currentThreshold || m.routingDecision === "OVERRIDDEN_OUT";
    return true;
  });

  const saveThreshold = async () => {
    setSavingThreshold(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_threshold: currentThreshold }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Threshold saved!" });
      } else {
        setMessage({ type: "error", text: "Failed to save threshold." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setSavingThreshold(false);
  };

  const saveWeights = async () => {
    setSavingWeights(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_weights: weights }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Scoring weights saved! Run Match Now to recalculate." });
      } else {
        setMessage({ type: "error", text: "Failed to save weights." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setSavingWeights(false);
  };

  const resetWeights = () => {
    setWeights({ ...DEFAULT_WEIGHTS });
  };

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const totalWeight = weights.skills + weights.title + weights.experience + weights.salary + weights.location + weights.company_fit;

  const runMatchNow = async () => {
    setRunningMatch(true);
    setMessage(null);
    try {
      const res = await fetch("/api/match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: "success", text: `Matching complete! Scored ${data.matched} jobs. Refresh to see results.` });
      } else {
        setMessage({ type: "error", text: "Failed to run matching." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
    setRunningMatch(false);
  };

  const addToQueue = async (jobPostId: string) => {
    try {
      await fetch("/api/am/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, job_post_id: jobPostId }),
      });
      setMessage({ type: "success", text: "Added to application queue!" });
    } catch {
      setMessage({ type: "error", text: "Failed to add to queue." });
    }
  };

  const weightLabels: Record<keyof ScoringWeights, { label: string; description: string; color: string }> = {
    skills: { label: "Skills Match", description: "How well seeker's skills match job requirements", color: "blue" },
    title: { label: "Title Match", description: "Alignment between target titles and job title", color: "indigo" },
    experience: { label: "Experience", description: "Years of experience fit", color: "green" },
    salary: { label: "Salary Fit", description: "Salary range overlap", color: "emerald" },
    location: { label: "Location", description: "Location and remote/hybrid preferences", color: "purple" },
    company_fit: { label: "Company Fit", description: "Industry and company size preferences", color: "orange" },
    max_penalty: { label: "Max Penalty", description: "Max deduction for exclude keywords and visa mismatch", color: "red" },
  };

  return (
    <div className="space-y-4">
      {/* Threshold Controls */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-purple-800">Match Threshold:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={currentThreshold}
              onChange={(e) => setCurrentThreshold(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-lg font-bold text-purple-700 w-12">{currentThreshold}%</span>
          </div>
          <button
            onClick={saveThreshold}
            disabled={savingThreshold || currentThreshold === threshold}
            className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {savingThreshold ? "Saving..." : "Save"}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowWeights(!showWeights)}
            className="px-3 py-1 text-sm border border-purple-300 text-purple-700 rounded hover:bg-purple-100"
          >
            {showWeights ? "Hide Weights" : "Adjust Weights"}
          </button>
          <button
            onClick={runMatchNow}
            disabled={runningMatch}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {runningMatch ? "Running..." : "Run Match Now"}
          </button>
        </div>
        <p className="text-xs text-purple-600 mt-2">
          Jobs scoring above this threshold will be available in the extension for applying.
        </p>
      </div>

      {/* Scoring Weight Controls */}
      {showWeights && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-gray-900">Scoring Weights</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Adjust how much each factor contributes to the match score. Total positive weights: {totalWeight}/100.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetWeights}
                className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
              >
                Reset to Defaults
              </button>
              <button
                onClick={saveWeights}
                disabled={savingWeights}
                className="px-3 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
              >
                {savingWeights ? "Saving..." : "Save Weights"}
              </button>
            </div>
          </div>

          {totalWeight !== 100 && (
            <div className={`p-2 rounded text-xs ${totalWeight > 100 ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>
              Positive weights sum to {totalWeight}. For balanced scoring, aim for a total of 100.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.entries(weightLabels) as [keyof ScoringWeights, typeof weightLabels[keyof ScoringWeights]][]).map(
              ([key, { label, description, color }]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <span className={`text-sm font-bold ${key === "max_penalty" ? "text-red-600" : "text-gray-900"}`}>
                      {key === "max_penalty" ? `-${weights[key]}` : weights[key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={key === "max_penalty" ? 30 : 50}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-400">{description}</p>
                </div>
              )
            )}
          </div>

          {/* Visual weight distribution */}
          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-1">Weight Distribution</p>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              {totalWeight > 0 && (
                <>
                  <div style={{ width: `${(weights.skills / totalWeight) * 100}%` }} className="bg-violet-500" title={`Skills: ${weights.skills}`} />
                  <div style={{ width: `${(weights.title / totalWeight) * 100}%` }} className="bg-indigo-500" title={`Title: ${weights.title}`} />
                  <div style={{ width: `${(weights.experience / totalWeight) * 100}%` }} className="bg-green-500" title={`Experience: ${weights.experience}`} />
                  <div style={{ width: `${(weights.salary / totalWeight) * 100}%` }} className="bg-emerald-500" title={`Salary: ${weights.salary}`} />
                  <div style={{ width: `${(weights.location / totalWeight) * 100}%` }} className="bg-purple-500" title={`Location: ${weights.location}`} />
                  <div style={{ width: `${(weights.company_fit / totalWeight) * 100}%` }} className="bg-orange-500" title={`Company Fit: ${weights.company_fit}`} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Skills</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Title</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Experience</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Salary</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Location</span>
              <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Company</span>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("above")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "above" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Above Threshold ({matchedJobs.filter((m) => m.score >= currentThreshold).length})
          </button>
          <button
            onClick={() => setFilter("below")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "below" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Below Threshold
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-sm rounded-lg ${
              filter === "all" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            All ({matchedJobs.length})
          </button>
        </div>
        <span className="text-sm text-gray-500">{filtered.length} jobs</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No jobs match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`p-4 border rounded-lg ${
                m.score >= currentThreshold ? "border-green-200 bg-green-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{m.job?.title || "Unknown Job"}</h4>
                  <p className="text-sm text-gray-600">{m.job?.company} - {m.job?.location}</p>
                  {m.job?.url && (
                    <a
                      href={m.job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-violet-600 hover:text-violet-800 mt-1 inline-block"
                    >
                      View Posting →
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${m.score >= currentThreshold ? "text-green-600" : "text-gray-400"}`}>
                      {m.score}
                    </div>
                    <div className="text-xs text-gray-500">match</div>
                  </div>
                  {m.score >= currentThreshold && m.routingDecision !== "OVERRIDDEN_OUT" && m.job && (
                    <button
                      onClick={() => addToQueue(m.job!.id)}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Queue
                    </button>
                  )}
                </div>
              </div>
              {/* Match explanation */}
              <MatchExplanationPanel reasons={m.reasons} score={m.score} routingDecision={m.routingDecision} />
              {m.routingDecision && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                    {m.routingDecision.replace(/_/g, " ")}
                  </span>
                  {m.routingNote && <span className="text-xs text-gray-500">{m.routingNote}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationsTab({
  queueItems,
  runs,
}: {
  queueItems: QueueItem[];
  runs: RunItem[];
}) {
  const [filter, setFilter] = useState<"all" | "queued" | "running" | "applied" | "attention" | "failed">("all");

  // Combine and sort
  const allItems = [
    ...queueItems.filter((q) => q.status === "QUEUED").map((q) => ({
      id: q.id,
      type: "queue" as const,
      status: q.status,
      job: q.job_posts,
      date: q.created_at,
      error: null,
    })),
    ...runs.map((r) => ({
      id: r.id,
      type: "run" as const,
      status: r.status,
      job: r.job_posts,
      date: r.updated_at,
      error: r.last_error,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = allItems.filter((item) => {
    if (filter === "queued") return item.status === "QUEUED";
    if (filter === "running") return ["RUNNING", "PAUSED", "READY", "RETRYING"].includes(item.status);
    if (filter === "applied") return ["APPLIED", "COMPLETED"].includes(item.status);
    if (filter === "attention") return item.status === "NEEDS_ATTENTION";
    if (filter === "failed") return item.status === "FAILED";
    return true;
  });

  const counts = {
    queued: allItems.filter((i) => i.status === "QUEUED").length,
    running: allItems.filter((i) => ["RUNNING", "PAUSED", "READY", "RETRYING"].includes(i.status)).length,
    applied: allItems.filter((i) => ["APPLIED", "COMPLETED"].includes(i.status)).length,
    attention: allItems.filter((i) => i.status === "NEEDS_ATTENTION").length,
    failed: allItems.filter((i) => i.status === "FAILED").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          All ({allItems.length})
        </FilterButton>
        <FilterButton active={filter === "queued"} onClick={() => setFilter("queued")}>
          Queued ({counts.queued})
        </FilterButton>
        <FilterButton active={filter === "running"} onClick={() => setFilter("running")}>
          In Progress ({counts.running})
        </FilterButton>
        <FilterButton active={filter === "applied"} onClick={() => setFilter("applied")}>
          Applied ({counts.applied})
        </FilterButton>
        {counts.attention > 0 && (
          <FilterButton active={filter === "attention"} onClick={() => setFilter("attention")} highlight>
            Needs Attention ({counts.attention})
          </FilterButton>
        )}
        <FilterButton active={filter === "failed"} onClick={() => setFilter("failed")}>
          Failed ({counts.failed})
        </FilterButton>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No applications match this filter</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={`${item.type}-${item.id}`} className="p-4 border rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{item.job?.title || "Unknown"}</h4>
                  <p className="text-sm text-gray-600">{item.job?.company}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.date).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.error && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  {item.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessagesTab({ seekerId }: { seekerId: string }) {
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversations, setConversations] = useState<SeekerConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SeekerConversationMessage[]>([]);
  const [composeMode, setComposeMode] = useState<"reply" | "new">("reply");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [sendAsTask, setSendAsTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [notifySeeker, setNotifySeeker] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );

  async function fetchConversations(preferredConversationId?: string) {
    setLoadingConversations(true);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/conversations`, {
        cache: "no-store",
      });
      const data = await res.json();
      const list = (data.conversations ?? []) as SeekerConversation[];
      setConversations(list);

      if (preferredConversationId) {
        setSelectedConversationId(preferredConversationId);
        return;
      }

      if (selectedConversationId) {
        const stillExists = list.some(
          (conversation) => conversation.id === selectedConversationId
        );
        if (!stillExists) {
          setSelectedConversationId(list[0]?.id ?? null);
        }
        return;
      }

      if (list.length > 0) {
        setSelectedConversationId(list[0].id);
      }
    } catch {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function fetchMessages(conversationId: string) {
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/am/seekers/${seekerId}/conversations/${conversationId}/messages`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setMessages((data.messages ?? []) as SeekerConversationMessage[]);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekerId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, seekerId]);

  // Poll for new messages every 15s when a conversation is open; pause when tab hidden
  useEffect(() => {
    if (!selectedConversationId) return;

    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(
          `/api/am/seekers/${seekerId}/conversations/${selectedConversationId}/messages`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const serverMessages = (data.messages ?? []) as SeekerConversationMessage[];
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m: SeekerConversationMessage) => m.id));
          const incoming = serverMessages.filter((m) => !existingIds.has(m.id));
          if (incoming.length === 0) return prev;
          return [...prev, ...incoming].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      } catch {
        // Ignore transient failures.
      }
    };

    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, seekerId]);

  function resetTaskFields() {
    setSendAsTask(false);
    setTaskTitle("");
    setTaskDescription("");
    setTaskPriority("medium");
    setTaskDueDate("");
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;

    const trimmedSubject = subject.trim();
    const trimmedContent = content.trim();
    const trimmedTaskTitle = taskTitle.trim();

    if (composeMode === "new" && !trimmedSubject) {
      setFeedback({ type: "error", text: "Subject is required for new conversations." });
      return;
    }

    if (sendAsTask && !trimmedTaskTitle) {
      setFeedback({ type: "error", text: "Task title is required." });
      return;
    }

    if (!sendAsTask && !trimmedContent) {
      setFeedback({ type: "error", text: "Message content is required." });
      return;
    }

    setSending(true);
    setFeedback(null);

    try {
      if (composeMode === "new" || !selectedConversationId) {
        const res = await fetch(`/api/am/seekers/${seekerId}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: trimmedSubject,
            conversation_type: sendAsTask ? "task" : "general",
            initial_message: {
              content: trimmedContent,
              task: sendAsTask
                ? {
                    title: trimmedTaskTitle,
                    description: taskDescription.trim() || undefined,
                    priority: taskPriority,
                    due_date: taskDueDate || undefined,
                  }
                : undefined,
            },
            notify_seeker: notifySeeker,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setFeedback({ type: "error", text: data.error || "Failed to create conversation." });
          return;
        }

        const createdConversation = data.conversation as SeekerConversation | undefined;
        const createdMessage = data.message as SeekerConversationMessage | undefined;
        const newConversationId = createdConversation?.id;

        if (newConversationId) {
          await fetchConversations(newConversationId);
          setComposeMode("reply");
          setMessages(createdMessage ? [createdMessage] : []);
        }

        setSubject("");
        setContent("");
        resetTaskFields();
        setFeedback({
          type: "success",
          text: sendAsTask ? "Task sent successfully." : "Conversation started successfully.",
        });
        return;
      }

      const res = await fetch(
        `/api/am/seekers/${seekerId}/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmedContent,
            task: sendAsTask
              ? {
                  title: trimmedTaskTitle,
                  description: taskDescription.trim() || undefined,
                  priority: taskPriority,
                  due_date: taskDueDate || undefined,
                }
              : undefined,
            notify_seeker: notifySeeker,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Failed to send message." });
        return;
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message as SeekerConversationMessage]);
      }
      setContent("");
      resetTaskFields();
      await fetchConversations(selectedConversationId);
      setFeedback({
        type: "success",
        text: sendAsTask ? "Task sent successfully." : "Message sent successfully.",
      });
    } catch {
      setFeedback({ type: "error", text: "Failed to send message." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-[320px] border rounded-lg bg-white">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Conversations</h3>
            <button
              onClick={() => {
                setComposeMode("new");
                setSelectedConversationId(null);
                setMessages([]);
                setSubject("");
                setContent("");
                resetTaskFields();
                setFeedback(null);
              }}
              className="px-2 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700"
            >
              New
            </button>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y">
            {loadingConversations ? (
              <p className="p-4 text-sm text-gray-500">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                No conversations yet. Start one to message this seeker.
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    setComposeMode("reply");
                    setSelectedConversationId(conversation.id);
                    setFeedback(null);
                  }}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedConversationId === conversation.id
                      ? "bg-violet-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {conversation.subject}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        conversation.conversation_type === "application_question"
                          ? "bg-purple-100 text-purple-700"
                          : conversation.conversation_type === "task"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {conversation.conversation_type === "application_question"
                        ? "Question"
                        : conversation.conversation_type === "task"
                        ? "Task"
                        : "General"}
                    </span>
                    {conversation.open_task_count > 0 && (
                      <span className="text-[10px] text-amber-700">
                        {conversation.open_task_count} open
                      </span>
                    )}
                  </div>
                  {conversation.last_message && (
                    <p className="mt-1 text-xs text-gray-500 truncate">
                      {conversation.last_message.sender_type === "job_seeker"
                        ? "Seeker"
                        : "AM"}
                      : {conversation.last_message.content}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 border rounded-lg bg-white p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900">
                {composeMode === "new"
                  ? "New conversation"
                  : selectedConversation?.subject || "Select a conversation"}
              </h3>
              {selectedConversation && (
                <p className="text-xs text-gray-500">
                  Updated {new Date(selectedConversation.updated_at).toLocaleString()}
                </p>
              )}
            </div>
            {selectedConversation && composeMode === "reply" && (
              <button
                onClick={() => {
                  setComposeMode("new");
                  setSelectedConversationId(null);
                  setMessages([]);
                  setSubject("");
                  setContent("");
                  resetTaskFields();
                  setFeedback(null);
                }}
                className="text-xs text-violet-600 hover:text-violet-800"
              >
                Start new thread
              </button>
            )}
          </div>

          <div className="border rounded-lg p-3 bg-gray-50 min-h-[260px] max-h-[380px] overflow-y-auto space-y-3">
            {composeMode === "new" ? (
              <p className="text-sm text-gray-500">
                New thread mode. Add subject and send your first message or task.
              </p>
            ) : !selectedConversationId ? (
              <p className="text-sm text-gray-500">Choose a conversation to view messages.</p>
            ) : loadingMessages ? (
              <p className="text-sm text-gray-500">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-500">No messages yet.</p>
            ) : (
              messages.map((message) => {
                const isSeeker = message.sender_type === "job_seeker";
                const task = getTaskAttachmentFromAttachments(message.attachments);
                return (
                  <div
                    key={message.id}
                    className={`flex ${isSeeker ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        isSeeker
                          ? "bg-white border border-gray-200 text-gray-900"
                          : "bg-violet-600 text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs mb-1 opacity-80">
                        <span>{isSeeker ? "Seeker" : "AM/Admin"}</span>
                        <span>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {task && (
                        <div
                          className={`mt-2 rounded border p-2 text-xs ${
                            isSeeker
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : "border-violet-300 bg-violet-500 text-violet-50"
                          }`}
                        >
                          <p className="font-semibold">{task.title}</p>
                          {task.description && (
                            <p className="mt-1 whitespace-pre-wrap">{task.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-2">
                            <span>{formatTaskStatusLabel(task.status)}</span>
                            <span className="capitalize">{task.priority} priority</span>
                            {task.due_date && (
                              <span>
                                Due {new Date(task.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSend} className="space-y-3">
            {composeMode === "new" && (
              <div>
                <label className="text-xs font-medium text-gray-700">Subject</label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="e.g. Week 1 goals and updates"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sendAsTask}
                  onChange={(event) => setSendAsTask(event.target.checked)}
                  className="rounded border-gray-300"
                />
                Send as task
              </label>

              {sendAsTask && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border rounded-lg bg-amber-50">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-700">Task title</label>
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="e.g. Update LinkedIn with recent projects"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-gray-700">Task details (optional)</label>
                    <textarea
                      value={taskDescription}
                      onChange={(event) => setTaskDescription(event.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Priority</label>
                    <select
                      value={taskPriority}
                      onChange={(event) =>
                        setTaskPriority(event.target.value as "low" | "medium" | "high")
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Due date (optional)</label>
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700">
                Message {sendAsTask ? "(optional)" : ""}
              </label>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                placeholder={
                  sendAsTask
                    ? "Optional context for the assigned task..."
                    : "Type your message..."
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={notifySeeker}
                onChange={(event) => setNotifySeeker(event.target.checked)}
                className="rounded border-gray-300"
              />
              Email notify seeker
            </label>

            {feedback && (
              <div
                className={`p-2 rounded text-sm ${
                  feedback.type === "success"
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {feedback.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded hover:bg-violet-700 disabled:opacity-50"
              >
                {sending
                  ? "Sending..."
                  : composeMode === "new"
                  ? sendAsTask
                    ? "Create thread + send task"
                    : "Create thread + send message"
                  : sendAsTask
                  ? "Send task"
                  : "Send message"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function OutreachTab({
  drafts,
  threads,
}: {
  drafts: OutreachDraft[];
  threads: RecruiterThread[];
}) {
  const [view, setView] = useState<"drafts" | "threads">("drafts");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setView("drafts")}
          className={`px-4 py-2 text-sm rounded-lg ${
            view === "drafts" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Drafts ({drafts.length})
        </button>
        <button
          onClick={() => setView("threads")}
          className={`px-4 py-2 text-sm rounded-lg ${
            view === "threads" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Recruiter Threads ({threads.length})
        </button>
      </div>

      {view === "drafts" && (
        drafts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No outreach drafts</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {draft.outreach_contacts?.full_name || "Unknown Contact"}
                    </p>
                    <p className="text-sm text-gray-600">{draft.outreach_contacts?.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {draft.job_posts?.company} - {draft.job_posts?.title}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    draft.status === "SENT" ? "bg-green-100 text-green-800" :
                    draft.status === "DRAFT" ? "bg-gray-100 text-gray-600" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {draft.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === "threads" && (
        threads.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No recruiter threads</p>
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/dashboard/outreach/threads/${thread.id}`}
                className="block p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{thread.recruiters?.name || "Unknown"}</p>
                    <p className="text-sm text-gray-600">
                      {thread.recruiters?.title} at {thread.recruiters?.company}
                    </p>
                    {thread.next_follow_up_at && (
                      <p className="text-xs text-orange-600 mt-1">
                        Follow-up: {new Date(thread.next_follow_up_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    thread.thread_status === "ACTIVE" ? "bg-green-100 text-green-800" :
                    thread.thread_status === "FOLLOW_UP_DUE" ? "bg-orange-100 text-orange-800" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {thread.thread_status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-600" },
  offer_extended: { label: "Offer Extended", color: "bg-yellow-100 text-yellow-800" },
  hired: { label: "Hired!", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
  ghosted: { label: "Ghosted", color: "bg-orange-100 text-orange-800" },
  declined: { label: "Declined", color: "bg-purple-100 text-purple-800" },
};

function InterviewsTab({ interviews, seekerId }: { interviews: Interview[]; seekerId: string }) {
  const [localInterviews, setLocalInterviews] = useState<Interview[]>(interviews);
  const now = new Date();
  const upcoming = localInterviews.filter((i) => new Date(i.scheduled_at) >= now && i.status === "confirmed");
  const past = localInterviews.filter((i) => new Date(i.scheduled_at) < now || i.status !== "confirmed");

  function handleOutcomeRecorded(interviewId: string, updates: Partial<Interview>) {
    setLocalInterviews((prev) =>
      prev.map((iv) => (iv.id === interviewId ? { ...iv, ...updates } : iv))
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Upcoming Interviews</h3>
          <div className="space-y-2">
            {upcoming.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} seekerId={seekerId} onOutcomeRecorded={handleOutcomeRecorded} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Past Interviews</h3>
          <div className="space-y-2">
            {past.map((interview) => (
              <InterviewCard key={interview.id} interview={interview} seekerId={seekerId} onOutcomeRecorded={handleOutcomeRecorded} />
            ))}
          </div>
        </div>
      )}

      {localInterviews.length === 0 && (
        <p className="text-gray-500 text-center py-8">No interviews scheduled</p>
      )}
    </div>
  );
}

function InterviewCard({
  interview,
  seekerId,
  onOutcomeRecorded,
}: {
  interview: Interview;
  seekerId: string;
  onOutcomeRecorded: (id: string, updates: Partial<Interview>) => void;
}) {
  const date = new Date(interview.scheduled_at);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    outcome: interview.outcome || "pending",
    offer_amount: interview.offer_amount?.toString() || "",
    hire_date: interview.hire_date || "",
    rejection_reason: interview.rejection_reason || "",
    outcome_notes: interview.outcome_notes || "",
  });
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  async function submitOutcome() {
    setSavingOutcome(true);
    setOutcomeError(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/interviews/${interview.id}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: outcomeForm.outcome,
          offer_amount: outcomeForm.offer_amount ? parseFloat(outcomeForm.offer_amount) : null,
          hire_date: outcomeForm.hire_date || null,
          rejection_reason: outcomeForm.rejection_reason || null,
          outcome_notes: outcomeForm.outcome_notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOutcomeError(data.error ?? "Failed to record outcome");
        return;
      }
      onOutcomeRecorded(interview.id, {
        outcome: outcomeForm.outcome,
        offer_amount: outcomeForm.offer_amount ? parseFloat(outcomeForm.offer_amount) : null,
        hire_date: outcomeForm.hire_date || null,
        rejection_reason: outcomeForm.rejection_reason || null,
        outcome_notes: outcomeForm.outcome_notes || null,
        outcome_recorded_at: data.interview?.outcome_recorded_at,
      });
      setOutcomeOpen(false);
    } catch {
      setOutcomeError("Network error");
    } finally {
      setSavingOutcome(false);
    }
  }

  const currentOutcome = interview.outcome || "pending";
  const outcomeLabel = OUTCOME_LABELS[currentOutcome];

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{interview.job_posts?.company}</h4>
          <p className="text-sm text-gray-600">{interview.job_posts?.title}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded capitalize">
              {interview.interview_type}
            </span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {interview.duration_min} min
            </span>
            {currentOutcome !== "pending" && outcomeLabel && (
              <span className={`px-2 py-0.5 text-xs rounded font-medium ${outcomeLabel.color}`}>
                {outcomeLabel.label}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-medium text-gray-900">{date.toLocaleDateString()}</p>
          <p className="text-sm text-gray-600">
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full ${
            interview.status === "confirmed" ? "bg-green-100 text-green-800" :
            interview.status === "completed" ? "bg-violet-100 text-violet-800" :
            interview.status === "cancelled" ? "bg-red-100 text-red-800" :
            "bg-gray-100 text-gray-600"
          }`}>
            {interview.status}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        {interview.meeting_link && (
          <a
            href={interview.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            Join Meeting →
          </a>
        )}
        <button
          onClick={() => setOutcomeOpen(true)}
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-0.5 rounded"
        >
          {currentOutcome === "pending" ? "Record Outcome" : "Edit Outcome"}
        </button>
      </div>

      {/* Outcome Modal */}
      {outcomeOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Record Interview Outcome</h3>
            <p className="text-sm text-gray-500">
              {interview.job_posts?.company} — {interview.job_posts?.title}
            </p>

            {outcomeError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{outcomeError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outcome</label>
              <select
                value={outcomeForm.outcome}
                onChange={(e) => setOutcomeForm((f) => ({ ...f, outcome: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {Object.entries(OUTCOME_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {(outcomeForm.outcome === "offer_extended" || outcomeForm.outcome === "hired") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Offer Amount (£)</label>
                <input
                  type="number"
                  value={outcomeForm.offer_amount}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, offer_amount: e.target.value }))}
                  placeholder="e.g. 55000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            {outcomeForm.outcome === "hired" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={outcomeForm.hire_date}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, hire_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            {outcomeForm.outcome === "rejected" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
                <input
                  type="text"
                  value={outcomeForm.rejection_reason}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, rejection_reason: e.target.value }))}
                  placeholder="e.g. Overqualified, salary mismatch..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={outcomeForm.outcome_notes}
                onChange={(e) => setOutcomeForm((f) => ({ ...f, outcome_notes: e.target.value }))}
                rows={3}
                placeholder="Internal notes about this outcome..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setOutcomeOpen(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitOutcome}
                disabled={savingOutcome}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
              >
                {savingOutcome ? "Saving…" : "Save Outcome"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrepTab({
  prep,
  seekerId,
}: {
  prep: InterviewPrep[];
  seekerId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Interview Prep Materials</h3>
        <Link
          href={`/dashboard/interview-prep?seeker=${seekerId}`}
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          Generate New →
        </Link>
      </div>

      {prep.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No prep materials generated yet</p>
      ) : (
        <div className="space-y-2">
          {prep.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/interview-prep/${p.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{p.job_posts?.company}</h4>
                  <p className="text-sm text-gray-600">{p.job_posts?.title}</p>
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const CLASSIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  rejection: { label: "Rejection", color: "bg-red-100 text-red-800" },
  interview_invite: { label: "Interview Invite", color: "bg-green-100 text-green-800" },
  offer: { label: "Offer", color: "bg-emerald-100 text-emerald-800" },
  follow_up: { label: "Follow-up", color: "bg-violet-100 text-violet-800" },
  verification: { label: "Verification", color: "bg-yellow-100 text-yellow-800" },
  application_confirmation: { label: "Confirmation", color: "bg-indigo-100 text-indigo-800" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

function InboxTab({
  emails,
  gmailConnection,
}: {
  emails: InboundEmail[];
  gmailConnection: GmailConnectionInfo | null;
}) {
  const [filter, setFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyResult, setReplyResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplying(true);
    setReplyResult(null);
    try {
      const res = await fetch("/api/am/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: selectedEmail.id,
          body: replyBody,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyResult({ type: "success", text: "Reply sent successfully!" });
        setReplyBody("");
      } else {
        setReplyResult({
          type: "error",
          text: data.error || "Failed to send reply.",
        });
      }
    } catch {
      setReplyResult({ type: "error", text: "Failed to send reply." });
    } finally {
      setReplying(false);
    }
  };

  if (!gmailConnection) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Gmail is not connected for this seeker.</p>
        <p className="text-sm text-gray-400 mt-1">
          Ask them to connect Gmail in their Portal profile to enable inbox scanning.
        </p>
      </div>
    );
  }

  // Count by classification
  const counts: Record<string, number> = {};
  for (const e of emails) {
    counts[e.classification] = (counts[e.classification] ?? 0) + 1;
  }

  const filtered =
    filter === "all" ? emails : emails.filter((e) => e.classification === filter);

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "interview_invite", label: "Interview Invites" },
    { value: "offer", label: "Offers" },
    { value: "rejection", label: "Rejections" },
    { value: "follow_up", label: "Follow-ups" },
    { value: "application_confirmation", label: "Confirmations" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Connected: <span className="font-medium text-gray-900">{gmailConnection.email}</span>
          </p>
          <p className="text-xs text-gray-400">
            Since {new Date(gmailConnection.connectedAt).toLocaleDateString()}
          </p>
        </div>
        <span className="text-sm text-gray-500">{emails.length} emails scanned</span>
      </div>

      {/* Classification summary */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => {
          const count = opt.value === "all" ? emails.length : counts[opt.value] ?? 0;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No emails match this filter</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Email list */}
          <div className="space-y-2">
            {filtered.map((email) => {
              const cls =
                CLASSIFICATION_LABELS[email.classification] ??
                CLASSIFICATION_LABELS.other;
              const isSelected = selectedEmail?.id === email.id;
              return (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelectedEmail(email);
                    setReplyBody("");
                    setReplyResult(null);
                  }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {email.from_name || email.from_email}
                      </p>
                      <p className="text-sm text-gray-700 truncate">
                        {email.subject || "(no subject)"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {email.body_snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls.color}`}
                      >
                        {cls.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(email.received_at).toLocaleDateString()}
                      </span>
                      {email.classification_confidence > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {Math.round(email.classification_confidence * 100)}% conf
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail + Reply panel */}
          {selectedEmail && (
            <div className="bg-white rounded-lg border p-5 sticky top-4">
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedEmail.subject || "(no subject)"}
                  </p>
                  <p className="text-sm text-gray-600">
                    From: {selectedEmail.from_name}{" "}
                    <span className="text-gray-400">
                      &lt;{selectedEmail.from_email}&gt;
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(selectedEmail.received_at).toLocaleString()}
                  </p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedEmail.body_snippet}
                  </p>
                </div>

                {/* Reply section */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    Reply (as seeker via Gmail)
                  </h4>

                  {replyResult && (
                    <div
                      className={`p-2 rounded text-sm mb-2 ${
                        replyResult.type === "success"
                          ? "bg-green-50 text-green-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {replyResult.text}
                    </div>
                  )}

                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type a reply on behalf of the seeker..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none"
                  />
                  <button
                    onClick={handleReply}
                    disabled={replying || !replyBody.trim()}
                    className="mt-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {replying ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity Feed Tab ──────────────────────────────────────────────
function ActivityFeedTab({ seekerId }: { seekerId: string }) {
  const [events, setEvents] = useState<{
    id: string; event_type: string; title: string; description: string | null;
    meta: Record<string, unknown>; created_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const url = `/api/am/seekers/${seekerId}/activity?limit=100${filter ? `&event_type=${filter}` : ""}`;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [seekerId, filter]);

  const EVENT_ICONS: Record<string, { color: string; label: string }> = {
    application_applied: { color: "bg-green-400", label: "Applied" },
    application_failed: { color: "bg-red-400", label: "Failed" },
    application_retry: { color: "bg-orange-400", label: "Retry" },
    feedback_recorded: { color: "bg-purple-400", label: "Feedback" },
    interview_scheduled: { color: "bg-violet-400", label: "Interview" },
    outreach_sent: { color: "bg-indigo-400", label: "Outreach" },
    match_created: { color: "bg-cyan-400", label: "Match" },
    profile_updated: { color: "bg-gray-400", label: "Profile" },
  };

  const eventTypes = Array.from(new Set(events.map((e) => e.event_type)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Activity Feed</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
          <option value="">All events</option>
          {eventTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-gray-100 rounded" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No activity recorded yet. Events appear here as applications, interviews, and other actions occur.
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />

          <div className="space-y-0">
            {events.map((e) => {
              const icon = EVENT_ICONS[e.event_type] ?? { color: "bg-gray-400", label: e.event_type };
              return (
                <div key={e.id} className="relative flex gap-4 py-3">
                  <div className={`w-6 h-6 rounded-full ${icon.color} shrink-0 z-10 flex items-center justify-center`}>
                    <span className="w-2 h-2 bg-white rounded-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{e.title}</p>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {new Date(e.created_at).toLocaleDateString()}{" "}
                        {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {e.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{e.description}</p>
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

// ─── Feedback Tab ───────────────────────────────────────────────────
const REJECTION_CATEGORIES = [
  { value: "experience_mismatch", label: "Experience Mismatch" },
  { value: "skills_gap", label: "Skills Gap" },
  { value: "overqualified", label: "Overqualified" },
  { value: "underqualified", label: "Underqualified" },
  { value: "salary_mismatch", label: "Salary Mismatch" },
  { value: "location_mismatch", label: "Location Mismatch" },
  { value: "culture_fit", label: "Culture Fit" },
  { value: "visa_sponsorship", label: "Visa/Sponsorship" },
  { value: "internal_candidate", label: "Internal Candidate" },
  { value: "position_filled", label: "Position Filled" },
  { value: "company_freeze", label: "Company Hiring Freeze" },
  { value: "no_response", label: "No Response/Ghosted" },
  { value: "other", label: "Other" },
];

const FEEDBACK_TYPES = [
  { value: "application_rejected", label: "Application Rejected" },
  { value: "interview_rejected", label: "Interview Rejected" },
  { value: "ghosted", label: "Ghosted" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "ats_failure", label: "ATS Failure" },
];

function FeedbackTab({ seekerId }: { seekerId: string }) {
  const [feedbackList, setFeedbackList] = useState<{
    id: string; feedback_type: string; rejection_category: string | null;
    company: string | null; role_title: string | null; notes: string | null;
    created_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [analysis, setAnalysis] = useState<{
    hasEnoughData: boolean; totalFeedback?: number;
    categoryCounts?: Record<string, number>;
    suggestions?: { weight: string; direction: string; reason: string }[];
  } | null>(null);

  // Form state
  const [formType, setFormType] = useState("application_rejected");
  const [formCategory, setFormCategory] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function loadFeedback() {
    setLoading(true);
    fetch(`/api/am/feedback?job_seeker_id=${seekerId}`)
      .then((r) => r.json())
      .then((d) => setFeedbackList(d.feedback ?? []))
      .finally(() => setLoading(false));
  }

  function loadAnalysis() {
    fetch(`/api/am/feedback?job_seeker_id=${seekerId}&action=analyze`)
      .then((r) => r.json())
      .then(setAnalysis);
  }

  useEffect(() => {
    loadFeedback();
    loadAnalysis();
  }, [seekerId]);

  async function submitFeedback() {
    setSaving(true);
    try {
      const res = await fetch("/api/am/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: seekerId,
          feedback_type: formType,
          rejection_category: formCategory || null,
          company: formCompany || null,
          role_title: formRole || null,
          notes: formNotes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowForm(false);
      setFormType("application_rejected");
      setFormCategory("");
      setFormCompany("");
      setFormRole("");
      setFormNotes("");
      loadFeedback();
      loadAnalysis();
    } catch {
      alert("Failed to record feedback");
    } finally {
      setSaving(false);
    }
  }

  async function applyWeightAdjustment() {
    if (!confirm("Apply AI-suggested weight adjustments based on rejection patterns?")) return;
    const res = await fetch("/api/am/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_seeker_id: seekerId, action: "apply_weight_adjustment" }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Weights updated! Changes: ${JSON.stringify(data.suggestions?.map((s: { weight: string; direction: string }) => `${s.weight} ${s.direction}`) ?? [])}`);
      loadAnalysis();
    } else {
      alert(data.error ?? "Failed to apply adjustment");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Rejection Feedback</h3>
        <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">
          + Record Feedback
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Track rejection reasons to improve matching accuracy. The system analyzes patterns and suggests weight adjustments.
      </p>

      {/* Analysis card */}
      {analysis && analysis.hasEnoughData && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-purple-900">Pattern Analysis ({analysis.totalFeedback} feedback entries)</h4>
            {analysis.suggestions && analysis.suggestions.length > 0 && (
              <button onClick={applyWeightAdjustment} className="px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700">
                Apply Suggested Adjustments
              </button>
            )}
          </div>

          {analysis.categoryCounts && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(analysis.categoryCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([cat, count]) => (
                  <span key={cat} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                    {cat.replace(/_/g, " ")}: {count}
                  </span>
                ))}
            </div>
          )}

          {analysis.suggestions && analysis.suggestions.length > 0 && (
            <div className="space-y-1 mt-2">
              {analysis.suggestions.map((s, i) => (
                <p key={i} className="text-xs text-purple-700">
                  → {s.direction === "increase" ? "Increase" : "Decrease"} <strong>{s.weight}</strong> weight — {s.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Record Feedback</h4>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Feedback Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                {FEEDBACK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rejection Category</label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">Select...</option>
                {REJECTION_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
              <input value={formCompany} onChange={(e) => setFormCompany(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Company name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <input value={formRole} onChange={(e) => setFormRole(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Role title" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Additional context..." />
          </div>

          <button onClick={submitFeedback} disabled={saving} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Feedback"}
          </button>
        </div>
      )}

      {/* Feedback list */}
      {loading ? (
        <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded" />)}</div>
      ) : feedbackList.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No feedback recorded. Record rejection reasons to improve this seeker&apos;s matching accuracy.
        </div>
      ) : (
        <div className="divide-y border rounded-lg bg-white">
          {feedbackList.map((f) => (
            <div key={f.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    f.feedback_type.includes("rejected") ? "bg-red-100 text-red-700" :
                    f.feedback_type === "ghosted" ? "bg-gray-100 text-gray-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {f.feedback_type.replace(/_/g, " ")}
                  </span>
                  {f.rejection_category && (
                    <span className="text-xs text-gray-500">{f.rejection_category.replace(/_/g, " ")}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
              {(f.company || f.role_title) && (
                <p className="text-sm text-gray-700 mt-1">{f.company}{f.role_title ? ` — ${f.role_title}` : ""}</p>
              )}
              {f.notes && <p className="text-xs text-gray-500 mt-0.5">{f.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Facts Tab (Confirmed-Fact Ledger) ───────────────────────
type FactRow = {
  fact_key: string;
  label: string;
  category: string;
  sensitivity: string;
  value_type: string;
  value: string | null;
  provenance: string | null;
  confirmed_at: string | null;
  expires_at: string | null;
  resolution: { status: string; reason?: string };
};

function ClientFactsTab({ seekerId }: { seekerId: string }) {
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/am/seekers/${seekerId}/facts`)
      .then((r) => (r.ok ? r.json() : { facts: [] }))
      .then((d) => setFacts(d.facts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [seekerId]);

  async function save(factKey: string) {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_key: factKey, value: editValue.trim() }),
      });
      if (!res.ok) throw new Error();
      const { fact, resolution } = await res.json();
      setFacts((prev) =>
        prev.map((f) =>
          f.fact_key === factKey
            ? {
                ...f,
                value: fact.fact_value,
                provenance: fact.provenance,
                confirmed_at: fact.confirmed_at,
                expires_at: fact.expires_at,
                resolution,
              }
            : f
        )
      );
      setEditingKey(null);
    } catch {
      alert("Failed to save fact");
    } finally {
      setSaving(false);
    }
  }

  function badge(r: FactRow["resolution"]): [string, string] {
    if (r.status === "confirmed") return ["bg-green-100 text-green-700", "Confirmed"];
    if (r.status === "escalate") return ["bg-red-100 text-red-700", "Escalate"];
    const label =
      r.reason === "stale" ? "Stale" : r.reason === "missing" ? "Missing" : "Needs confirmation";
    return ["bg-amber-100 text-amber-700", label];
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading client facts…</div>;
  }

  const categories = Array.from(new Set(facts.map((f) => f.category)));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Client Facts</h3>
        <p className="text-sm text-gray-500 mt-1">
          The confirmed-fact ledger. Automation may only assert <strong>Confirmed</strong> facts;
          sensitive items need fresh client confirmation, and legal/EEO items always escalate.
          <span className="text-gray-400"> (Shadow mode — not yet enforced on the runner.)</span>
        </p>
      </div>

      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{cat}</h4>
          <div className="divide-y border rounded-lg bg-white">
            {facts
              .filter((f) => f.category === cat)
              .map((f) => {
                const [cls, label] = badge(f.resolution);
                const isLegal = f.sensitivity === "legal";
                return (
                  <div key={f.fact_key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{f.label}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>
                          {f.sensitivity !== "standard" && (
                            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                              {f.sensitivity}
                            </span>
                          )}
                        </div>
                        {editingKey === f.fact_key ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder="Confirmed value"
                              className="flex-1 px-3 py-1.5 border rounded text-sm"
                            />
                            <button
                              onClick={() => save(f.fact_key)}
                              disabled={saving}
                              className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded hover:bg-violet-700 disabled:opacity-50"
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="px-3 py-1.5 text-gray-500 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600 mt-0.5">
                            {f.value ? f.value : <span className="text-gray-400">— not set —</span>}
                            {f.provenance ? (
                              <span className="text-xs text-gray-400"> · {f.provenance}</span>
                            ) : null}
                          </p>
                        )}
                        {isLegal && (
                          <p className="text-xs text-red-500 mt-1">
                            Legal/EEO — automation never answers this; route to client / escalation.
                          </p>
                        )}
                      </div>
                      {editingKey !== f.fact_key && !isLegal && (
                        <button
                          onClick={() => {
                            setEditingKey(f.fact_key);
                            setEditValue(f.value ?? "");
                          }}
                          className="text-sm text-violet-600 hover:text-violet-800 flex-shrink-0"
                        >
                          {f.value ? "Update" : "Confirm"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Screening Answers Tab ──────────────────────────────────────────
const PRESET_QUESTIONS: { key: string; text: string; type: string }[] = [
  { key: "work_authorization", text: "Are you authorized to work in the US?", type: "select" },
  { key: "sponsorship", text: "Will you now or in the future require sponsorship?", type: "select" },
  { key: "salary_expectations", text: "What are your salary expectations?", type: "text" },
  { key: "years_experience", text: "How many years of relevant experience do you have?", type: "text" },
  { key: "willing_to_relocate", text: "Are you willing to relocate?", type: "select" },
  { key: "start_date", text: "When can you start?", type: "text" },
  { key: "notice_period", text: "What is your notice period?", type: "text" },
  { key: "highest_education", text: "What is your highest level of education?", type: "text" },
  { key: "how_did_you_hear", text: "How did you hear about this position?", type: "text" },
  { key: "gender", text: "Gender (EEO)", type: "select" },
  { key: "race_ethnicity", text: "Race/Ethnicity (EEO)", type: "select" },
  { key: "veteran_status", text: "Veteran status (EEO)", type: "select" },
  { key: "disability_status", text: "Disability status (EEO)", type: "select" },
];

function ScreeningAnswersTab({
  seekerId,
  initialAnswers,
}: {
  seekerId: string;
  initialAnswers: ScreeningAnswer[];
}) {
  const [answers, setAnswers] = useState<ScreeningAnswer[]>(initialAnswers);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editText, setEditText] = useState("");
  const [editType, setEditType] = useState("text");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newText, setNewText] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState("text");

  const answerMap = new Map(answers.map((a) => [a.question_key, a]));

  async function saveAnswer(questionKey: string, questionText: string, answerValue: string, answerType: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/screening-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_key: questionKey,
          question_text: questionText,
          answer_value: answerValue,
          answer_type: answerType,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const { answer } = await res.json();
      setAnswers((prev) => {
        const idx = prev.findIndex((a) => a.question_key === questionKey);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = answer;
          return copy;
        }
        return [...prev, answer];
      });
      setEditingKey(null);
    } catch {
      alert("Failed to save answer");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnswer(answerId: string) {
    if (!confirm("Delete this screening answer?")) return;
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/screening-answers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer_id: answerId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setAnswers((prev) => prev.filter((a) => a.id !== answerId));
    } catch {
      alert("Failed to delete answer");
    }
  }

  function startEdit(a: ScreeningAnswer) {
    setEditingKey(a.question_key);
    setEditValue(a.answer_value);
    setEditText(a.question_text);
    setEditType(a.answer_type);
  }

  // Question keys not yet answered
  const unusedPresets = PRESET_QUESTIONS.filter((p) => !answerMap.has(p.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Screening Answers</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
        >
          + Add Answer
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Pre-configured answers the runner uses to fill common screening questions on job applications.
      </p>

      {/* Add form */}
      {showAdd && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Add Screening Answer</h4>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
          </div>

          {unusedPresets.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Quick-add preset</label>
              <select
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value=""
                onChange={(e) => {
                  const p = PRESET_QUESTIONS.find((q) => q.key === e.target.value);
                  if (p) {
                    setNewKey(p.key);
                    setNewText(p.text);
                    setNewType(p.type);
                  }
                }}
              >
                <option value="">Select a common question...</option>
                {unusedPresets.map((p) => (
                  <option key={p.key} value={p.key}>{p.text}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Question Key</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. work_authorization"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="text">Text</option>
                <option value="select">Select</option>
                <option value="radio">Radio</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Question Text</label>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Full question text"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Answer Value</label>
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="The answer to fill in"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <button
            onClick={() => {
              if (!newKey.trim() || !newValue.trim()) return;
              saveAnswer(newKey.trim(), newText.trim(), newValue.trim(), newType);
              setNewKey("");
              setNewText("");
              setNewValue("");
              setNewType("text");
              setShowAdd(false);
            }}
            disabled={saving || !newKey.trim() || !newValue.trim()}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Answer"}
          </button>
        </div>
      )}

      {/* Answers list */}
      {answers.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No screening answers configured. Add answers so the runner can fill common application fields automatically.
        </div>
      ) : (
        <div className="divide-y border rounded-lg bg-white">
          {answers.map((a) => (
            <div key={a.id} className="px-4 py-3">
              {editingKey === a.question_key ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">{a.question_key}</div>
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Question text"
                    className="w-full px-3 py-1.5 border rounded text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Answer value"
                      className="flex-1 px-3 py-1.5 border rounded text-sm"
                    />
                    <select value={editType} onChange={(e) => setEditType(e.target.value)} className="px-2 py-1.5 border rounded text-sm">
                      <option value="text">Text</option>
                      <option value="select">Select</option>
                      <option value="radio">Radio</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveAnswer(a.question_key, editText, editValue, editType)}
                      disabled={saving}
                      className="px-3 py-1 bg-violet-600 text-white text-xs rounded hover:bg-violet-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setEditingKey(null)} className="px-3 py-1 text-gray-500 text-xs hover:text-gray-700">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{a.question_key}</span>
                      <span className="text-xs text-gray-400">{a.answer_type}</span>
                    </div>
                    {a.question_text && (
                      <p className="text-sm text-gray-500 mt-0.5">{a.question_text}</p>
                    )}
                    <p className="text-sm font-medium text-gray-900 mt-1">{a.answer_value}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(a)} className="px-2 py-1 text-xs text-violet-600 hover:bg-violet-50 rounded">
                      Edit
                    </button>
                    <button onClick={() => deleteAnswer(a.id)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Debug Screenshots Tab ──────────────────────────────────────────
function DebugScreenshotsTab({
  screenshots,
  runs,
}: {
  screenshots: FailureScreenshot[];
  runs: RunItem[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runMap = new Map(runs.map((r) => [r.id, r]));

  const reasonColors: Record<string, string> = {
    captcha: "bg-yellow-100 text-yellow-800",
    required_fields: "bg-orange-100 text-orange-800",
    timeout: "bg-red-100 text-red-800",
    error: "bg-red-100 text-red-800",
    navigation: "bg-purple-100 text-purple-800",
  };

  function getReasonBadgeClass(reason: string) {
    const lower = reason.toLowerCase();
    for (const [key, cls] of Object.entries(reasonColors)) {
      if (lower.includes(key)) return cls;
    }
    return "bg-gray-100 text-gray-800";
  }

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg mb-1">No failure screenshots</p>
        <p className="text-sm">Screenshots are captured when the runner encounters errors during applications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Failure Screenshots</h3>
        <span className="text-sm text-gray-500">{screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-3">
        {screenshots.map((s) => {
          const run = runMap.get(s.run_id);
          const isExpanded = expandedId === s.id;

          return (
            <div key={s.id} className="border rounded-lg bg-white overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getReasonBadgeClass(s.reason)}`}>
                    {s.reason || "unknown"}
                  </span>
                  <span className="text-sm text-gray-700 truncate">
                    {s.step && <span className="font-medium">Step: {s.step}</span>}
                    {run?.job_posts && (
                      <span className="text-gray-500 ml-2">
                        — {run.job_posts.company}: {run.job_posts.title}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400">
                    {new Date(s.created_at).toLocaleDateString()}{" "}
                    {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-4 space-y-3">
                  {/* Run context */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <span className="text-gray-500">Run ID:</span>{" "}
                      <span className="font-mono text-xs text-gray-700">{s.run_id.slice(0, 8)}...</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>{" "}
                      <span className="text-gray-700">{run?.status || "—"}</span>
                    </div>
                    {s.url && (
                      <div className="col-span-2">
                        <span className="text-gray-500">URL:</span>{" "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-800 text-xs break-all">
                          {s.url}
                        </a>
                      </div>
                    )}
                    {run?.last_error && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Error:</span>{" "}
                        <span className="text-red-600 text-xs">{run.last_error}</span>
                      </div>
                    )}
                  </div>

                  {/* Screenshot image */}
                  <div className="bg-gray-100 rounded-lg p-2">
                    <img
                      src={`/api/apply/screenshot/view?path=${encodeURIComponent(s.screenshot_path)}`}
                      alt={`Failure screenshot: ${s.reason}`}
                      className="w-full rounded border border-gray-200"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).insertAdjacentHTML(
                          "afterend",
                          '<p class="text-sm text-gray-400 py-4 text-center">Screenshot not available</p>'
                        );
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Utility components
function dateLabel(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500 text-sm">{label}</dt>
      <dd className="text-gray-900 text-sm">
        {link && value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-800">
            {value.replace(/^https?:\/\//, "").slice(0, 30)}...
          </a>
        ) : (
          value || "-"
        )}
      </dd>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  highlight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded-lg ${
        active
          ? highlight
            ? "bg-orange-600 text-white"
            : "bg-violet-600 text-white"
          : highlight
          ? "bg-orange-100 text-orange-800"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-violet-100 text-violet-800",
    PAUSED: "bg-gray-100 text-gray-800",
    READY: "bg-violet-100 text-violet-800",
    RETRYING: "bg-violet-100 text-violet-800",
    APPLIED: "bg-green-100 text-green-800",
    COMPLETED: "bg-green-100 text-green-800",
    NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
