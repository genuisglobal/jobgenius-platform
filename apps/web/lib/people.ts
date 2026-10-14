export const EMPLOYEE_EMPLOYMENT_STATUSES = [
  "tentative",
  "probation",
  "permanent",
  "terminated",
] as const;

export const EMPLOYEE_ONBOARDING_STATUSES = [
  "pending",
  "submitted",
  "approved",
  "needs_changes",
  "archived",
] as const;

export const EMPLOYEE_PERMISSION_PERIOD_KINDS = [
  "six_months",
  "one_year",
  "two_years",
] as const;

export const EMPLOYEE_PERMISSION_REQUEST_TYPES = [
  "permission",
  "authorization",
] as const;

export const EMPLOYEE_PERMISSION_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const LEADERSHIP_PIPELINE_STATUSES = [
  "not_eligible",
  "under_observation",
  "eligible_for_course",
  "enrolled_in_course",
  "completed_course",
  "ready_for_trial",
  "in_trial",
  "promoted",
  "removed",
] as const;

export const LEADERSHIP_COURSE_STATUSES = [
  "approved",
  "enrolled",
  "completed",
  "removed",
] as const;

export const LEADERSHIP_TRIAL_STATUSES = [
  "planned",
  "active",
  "completed",
  "passed",
  "failed",
] as const;

export const ACCEPTED_OFFER_VERIFICATION_STATUSES = [
  "pending_verification",
  "verified",
  "rejected",
] as const;

export const BONUS_RECORD_STATUSES = [
  "pending_verification",
  "eligible",
  "approved",
  "rejected",
  "disputed",
] as const;

export const BONUS_PAYMENT_STATUSES = [
  "pending",
  "scheduled",
  "paid",
  "cancelled",
] as const;

export const SOCIAL_FUND_EXPENSE_STATUSES = [
  "proposed",
  "approved",
  "rejected",
  "paid",
] as const;

export const SOCIAL_EVENT_STATUSES = [
  "planned",
  "completed",
  "cancelled",
] as const;

export const SOCIAL_ELECTION_STATUSES = [
  "draft",
  "nominations_open",
  "voting_open",
  "closed",
  "certified",
  "cancelled",
] as const;

export const SOCIAL_CANDIDATE_STATUSES = [
  "nominated",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export const SOCIAL_LEAD_TERM_STATUSES = [
  "active",
  "completed",
  "removed",
] as const;

export const SCORECARD_STATUSES = [
  "draft",
  "submitted",
  "finalized",
  "acknowledged",
] as const;

export const PROBATION_REVIEW_STATUSES = [
  "draft",
  "scheduled",
  "completed",
] as const;

export const DISCIPLINARY_RECORD_STATUSES = [
  "active",
  "resolved",
  "dismissed",
] as const;

export const DISCIPLINARY_RECORD_SEVERITIES = [
  "coaching",
  "warning",
  "serious",
] as const;

export const PROBATION_DECISION_STATUSES = [
  "pending",
  "permanent_approved",
  "probation_failed",
  "management_review",
  "role_change_recommended",
] as const;

export type EmployeeEmploymentStatus =
  (typeof EMPLOYEE_EMPLOYMENT_STATUSES)[number];
export type EmployeeOnboardingStatus =
  (typeof EMPLOYEE_ONBOARDING_STATUSES)[number];
export type EmployeePermissionPeriodKind =
  (typeof EMPLOYEE_PERMISSION_PERIOD_KINDS)[number];
export type EmployeePermissionRequestType =
  (typeof EMPLOYEE_PERMISSION_REQUEST_TYPES)[number];
export type EmployeePermissionRequestStatus =
  (typeof EMPLOYEE_PERMISSION_REQUEST_STATUSES)[number];
export type LeadershipPipelineStatus =
  (typeof LEADERSHIP_PIPELINE_STATUSES)[number];
export type LeadershipCourseStatus =
  (typeof LEADERSHIP_COURSE_STATUSES)[number];
export type LeadershipTrialStatus =
  (typeof LEADERSHIP_TRIAL_STATUSES)[number];
export type AcceptedOfferVerificationStatus =
  (typeof ACCEPTED_OFFER_VERIFICATION_STATUSES)[number];
export type BonusRecordStatus = (typeof BONUS_RECORD_STATUSES)[number];
export type BonusPaymentStatus = (typeof BONUS_PAYMENT_STATUSES)[number];
export type SocialFundExpenseStatus =
  (typeof SOCIAL_FUND_EXPENSE_STATUSES)[number];
export type SocialEventStatus = (typeof SOCIAL_EVENT_STATUSES)[number];
export type SocialElectionStatus = (typeof SOCIAL_ELECTION_STATUSES)[number];
export type SocialCandidateStatus = (typeof SOCIAL_CANDIDATE_STATUSES)[number];
export type SocialLeadTermStatus = (typeof SOCIAL_LEAD_TERM_STATUSES)[number];
export type ScorecardStatus = (typeof SCORECARD_STATUSES)[number];
export type ProbationReviewStatus =
  (typeof PROBATION_REVIEW_STATUSES)[number];
export type DisciplinaryRecordStatus =
  (typeof DISCIPLINARY_RECORD_STATUSES)[number];
export type DisciplinaryRecordSeverity =
  (typeof DISCIPLINARY_RECORD_SEVERITIES)[number];
export type ProbationDecisionStatus =
  (typeof PROBATION_DECISION_STATUSES)[number];

export const SCORECARD_REVIEW_MONTHS = [1, 2, 3, 4, 5, 6] as const;

export const REQUIRED_ONBOARDING_ACK_KEYS = [
  "acknowledge_role_expectations",
  "acknowledge_tentative_offer",
  "acknowledge_probation_policy",
  "acknowledge_bonus_policy",
  "acknowledge_social_fund_policy",
  "acknowledge_social_lead_policy",
  "acknowledge_leadership_growth",
] as const;

export type OnboardingAcknowledgementKey =
  (typeof REQUIRED_ONBOARDING_ACK_KEYS)[number];

export interface CareerLadderLevel {
  id: string;
  slug: string;
  title: string;
  department: string;
  rank_order: number;
  summary: string | null;
  requirements: string[];
}

export interface EmployeeRecord {
  id: string;
  worker_id: string;
  account_manager_id: string | null;
  supervisor_employee_id: string | null;
  employee_code: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  address_location: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  role_title: string | null;
  start_date: string | null;
  probation_start_date: string | null;
  probation_end_date: string | null;
  employment_status: EmployeeEmploymentStatus;
  onboarding_status: EmployeeOnboardingStatus;
  current_career_level_id: string | null;
  leadership_status: LeadershipPipelineStatus;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeOnboardingForm {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  whatsapp_number: string | null;
  address_location: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  role_title: string | null;
  start_date: string | null;
  supervisor_employee_id: string | null;
  employment_status: EmployeeEmploymentStatus;
  acknowledge_role_expectations: boolean;
  acknowledge_tentative_offer: boolean;
  acknowledge_probation_policy: boolean;
  acknowledge_bonus_policy: boolean;
  acknowledge_social_fund_policy: boolean;
  acknowledge_social_lead_policy: boolean;
  acknowledge_leadership_growth: boolean;
  signature_name: string | null;
  signature_at: string | null;
  status: EmployeeOnboardingStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  manager_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyDocument {
  id: string;
  policy_key: string;
  title: string;
  body: string;
  version_label: string;
  sort_order: number;
  is_active: boolean;
  requires_acknowledgement: boolean;
}

export interface PolicyAcknowledgement {
  id: string;
  employee_id: string;
  policy_document_id: string;
  acknowledged: boolean;
  signature_name: string | null;
  signature_at: string;
  signature_ip: string | null;
}

export interface EmployeePermissionPolicy {
  id: string;
  employee_id: string;
  period_kind: EmployeePermissionPeriodKind;
  period_start_date: string;
  period_end_date: string;
  allowed_days: number;
  active: boolean;
  notes: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePermissionRequest {
  id: string;
  employee_id: string;
  policy_id: string | null;
  request_type: EmployeePermissionRequestType;
  title: string;
  reason: string | null;
  requested_start_date: string;
  requested_end_date: string;
  requested_days: number;
  approved_days: number | null;
  status: EmployeePermissionRequestStatus;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  manager_comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScorecardCategory {
  id: string;
  slug: string;
  label: string;
  weight: number;
  sort_order: number;
}

export interface MonthlyScorecard {
  id: string;
  employee_id: string;
  review_month: string;
  status: ScorecardStatus;
  final_total: number;
  reviewer_account_manager_id: string | null;
  overall_comments: string | null;
  reviewed_at: string | null;
  acknowledged_at: string | null;
  acknowledged_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyScorecardItem {
  id: string;
  scorecard_id: string;
  category_id: string;
  numeric_score: number;
  manager_comments: string | null;
  evidence_notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProbationReview {
  id: string;
  employee_id: string;
  review_month_index: number;
  checkpoint_label: string;
  review_date: string | null;
  status: ProbationReviewStatus;
  successful_accepted_offers_count: number;
  monthly_average_score: number | null;
  manager_notes: string | null;
  warnings_summary: string | null;
  early_permanent_eligible: boolean;
  final_decision: ProbationDecisionStatus;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisciplinaryRecord {
  id: string;
  employee_id: string;
  severity: DisciplinaryRecordSeverity;
  category: string | null;
  title: string;
  description: string | null;
  status: DisciplinaryRecordStatus;
  opened_at: string;
  resolved_at: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadershipEligibilityRecord {
  id: string;
  employee_id: string;
  review_month: string;
  average_score: number | null;
  meets_three_month_eighty: boolean;
  meets_two_of_three_eighty_five: boolean;
  has_blocking_issue: boolean;
  auto_flagged: boolean;
  status: LeadershipPipelineStatus;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadershipCourseEnrollment {
  id: string;
  employee_id: string;
  approved_by: string | null;
  status: LeadershipCourseStatus;
  approved_at: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadershipTrial {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: LeadershipTrialStatus;
  reviewed_by: string | null;
  outcome_notes: string | null;
  final_decision: LeadershipPipelineStatus | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderOfMonthAward {
  id: string;
  award_month: string;
  employee_id: string;
  scorecard_id: string | null;
  award_title: string;
  reason: string;
  award_description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcceptedOfferRecord {
  id: string;
  employee_id: string | null;
  job_seeker_id: string | null;
  offer_title: string;
  company_name: string;
  offer_accepted_date: string | null;
  background_check_completed_date: string | null;
  client_start_date: string | null;
  start_month: string | null;
  assigned_account_manager_id: string | null;
  application_submitted_by_account_manager_id: string | null;
  interview_managed_by_account_manager_id: string | null;
  verification_status: AcceptedOfferVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  evidence_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeBonusRecord {
  id: string;
  employee_id: string;
  accepted_offer_record_id: string;
  bonus_eligibility_status: BonusRecordStatus;
  bonus_amount: number;
  payment_month: string | null;
  payment_status: BonusPaymentStatus;
  approval_status: BonusRecordStatus;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialFundContribution {
  id: string;
  accepted_offer_record_id: string;
  employee_id: string | null;
  amount: number;
  contribution_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialFundExpense {
  id: string;
  expense_title: string;
  amount: number;
  purpose: string | null;
  requested_by_employee_id: string | null;
  social_lead_employee_id: string | null;
  approved_by: string | null;
  status: SocialFundExpenseStatus;
  receipt_url: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  status: SocialEventStatus;
  coordinated_by_employee_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialLeadElection {
  id: string;
  title: string;
  term_start: string;
  term_end: string;
  nominations_open_at: string | null;
  nominations_close_at: string | null;
  voting_open_at: string | null;
  voting_close_at: string | null;
  status: SocialElectionStatus;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialLeadCandidate {
  id: string;
  election_id: string;
  employee_id: string;
  status: SocialCandidateStatus;
  nominated_by_employee_id: string | null;
  approved_by: string | null;
  eligibility_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SocialLeadVote {
  id: string;
  election_id: string;
  voter_employee_id: string;
  candidate_employee_id: string;
  created_at: string;
}

export interface SocialLeadTerm {
  id: string;
  employee_id: string;
  election_id: string | null;
  term_number: number;
  term_start: string;
  term_end: string;
  status: SocialLeadTermStatus;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function normalizeDateOnly(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }
  const normalized = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  return normalized.toISOString().slice(0, 10);
}

export function calculatePermissionPolicyEndDate(
  periodStartDate: string | Date,
  periodKind: EmployeePermissionPeriodKind
): string {
  const normalizedStart = normalizeDateOnly(periodStartDate);
  const start = new Date(`${normalizedStart}T00:00:00.000Z`);
  const end = new Date(start);

  switch (periodKind) {
    case "six_months":
      end.setUTCMonth(end.getUTCMonth() + 6);
      break;
    case "two_years":
      end.setUTCFullYear(end.getUTCFullYear() + 2);
      break;
    case "one_year":
    default:
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
  }

  end.setUTCDate(end.getUTCDate() - 1);
  return normalizeDateOnly(end);
}

export function calculatePermissionRequestDays(
  requestedStartDate: string | Date,
  requestedEndDate: string | Date
): number {
  const start = new Date(`${normalizeDateOnly(requestedStartDate)}T00:00:00.000Z`);
  const end = new Date(`${normalizeDateOnly(requestedEndDate)}T00:00:00.000Z`);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    throw new Error("End date must be on or after start date.");
  }
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export function calculatePermissionAllowanceSummary(input: {
  allowedDays: number;
  requests: Array<
    Pick<
      EmployeePermissionRequest,
      "status" | "requested_days" | "approved_days"
    >
  >;
}) {
  const allowedDays = Math.max(0, Math.round(Number(input.allowedDays) || 0));
  const approvedDaysUsed = input.requests.reduce((sum, request) => {
    if (request.status !== "approved") return sum;
    return sum + Math.max(0, Number(request.approved_days ?? request.requested_days) || 0);
  }, 0);
  const pendingDays = input.requests.reduce((sum, request) => {
    if (request.status !== "pending") return sum;
    return sum + Math.max(0, Number(request.requested_days) || 0);
  }, 0);
  const committedDays = approvedDaysUsed + pendingDays;
  const remainingDays = allowedDays - committedDays;

  return {
    allowedDays,
    approvedDaysUsed,
    pendingDays,
    committedDays,
    remainingDays,
    overLimit: remainingDays < 0,
  };
}

export function labelizePeopleValue(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getNextCareerLevel(
  levels: CareerLadderLevel[],
  currentLevelId: string | null | undefined
): CareerLadderLevel | null {
  if (!levels.length) return null;
  if (!currentLevelId) {
    return levels.slice().sort((a, b) => a.rank_order - b.rank_order)[0] ?? null;
  }

  const ordered = levels.slice().sort((a, b) => a.rank_order - b.rank_order);
  const currentIndex = ordered.findIndex((level) => level.id === currentLevelId);
  if (currentIndex < 0) {
    return ordered[0] ?? null;
  }
  return ordered[currentIndex + 1] ?? null;
}

export function countCompletedOnboardingChecks(
  form: Pick<EmployeeOnboardingForm, OnboardingAcknowledgementKey> | null | undefined
): number {
  if (!form) return 0;
  return REQUIRED_ONBOARDING_ACK_KEYS.reduce(
    (count, key) => count + (form[key] ? 1 : 0),
    0
  );
}

export function calculateOnboardingCompletion(
  form: Pick<EmployeeOnboardingForm, OnboardingAcknowledgementKey> | null | undefined,
  policyAcknowledgementCount: number,
  totalPolicies: number
): number {
  const checkboxTotal = REQUIRED_ONBOARDING_ACK_KEYS.length;
  const completed = countCompletedOnboardingChecks(form) + policyAcknowledgementCount;
  const total = checkboxTotal + totalPolicies;
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function isLeadershipCourseReady(status: LeadershipPipelineStatus): boolean {
  return (
    status === "eligible_for_course" ||
    status === "enrolled_in_course" ||
    status === "completed_course" ||
    status === "ready_for_trial" ||
    status === "in_trial" ||
    status === "promoted"
  );
}

export function mapCourseStatusToLeadershipStatus(
  status: LeadershipCourseStatus
): LeadershipPipelineStatus {
  switch (status) {
    case "enrolled":
      return "enrolled_in_course";
    case "completed":
      return "completed_course";
    case "removed":
      return "removed";
    case "approved":
    default:
      return "eligible_for_course";
  }
}

export function mapTrialStatusToLeadershipStatus(input: {
  status: LeadershipTrialStatus;
  finalDecision?: LeadershipPipelineStatus | null;
}): LeadershipPipelineStatus {
  if (input.finalDecision) {
    return input.finalDecision;
  }

  switch (input.status) {
    case "active":
      return "in_trial";
    case "planned":
      return "ready_for_trial";
    case "completed":
      return "ready_for_trial";
    case "passed":
      return "promoted";
    case "failed":
    default:
      return "removed";
  }
}

export function resolveOfferStartMonth(input: {
  startMonth?: string | null;
  clientStartDate?: string | null;
}): string | null {
  if (input.startMonth) {
    return normalizeReviewMonth(input.startMonth);
  }
  if (input.clientStartDate) {
    return normalizeReviewMonth(input.clientStartDate);
  }
  return null;
}

export function isAcceptedOfferReadyForBonus(input: {
  verificationStatus: AcceptedOfferVerificationStatus;
  backgroundCheckCompletedDate?: string | null;
  clientStartDate?: string | null;
  startMonth?: string | null;
}): boolean {
  return (
    input.verificationStatus === "verified" &&
    Boolean(input.backgroundCheckCompletedDate) &&
    Boolean(resolveOfferStartMonth(input))
  );
}

export function calculateSocialFundBalance(input: {
  contributions: Array<Pick<SocialFundContribution, "amount">>;
  expenses: Array<Pick<SocialFundExpense, "amount" | "status">>;
}): {
  contributed: number;
  spent: number;
  approvedReserved: number;
  balance: number;
} {
  const contributed = Math.round(
    input.contributions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100
  ) / 100;
  const spent = Math.round(
    input.expenses
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100
  ) / 100;
  const approvedReserved = Math.round(
    input.expenses
      .filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100
  ) / 100;

  return {
    contributed,
    spent,
    approvedReserved,
    balance: Math.round((contributed - spent - approvedReserved) * 100) / 100,
  };
}

export function evaluateSocialLeadEligibility(input: {
  tenureMonths: number;
  averageScore: number | null;
  hasActiveDisciplinaryIssue: boolean;
  hasIntegrityBlock: boolean;
  completedTerms: number;
}): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (input.tenureMonths < 3) {
    reasons.push("Minimum 3 months with the company required.");
  }
  if (input.averageScore === null || input.averageScore < 70) {
    reasons.push("Average performance score must be at least 70%.");
  }
  if (input.hasActiveDisciplinaryIssue) {
    reasons.push("Employee has an active disciplinary issue.");
  }
  if (input.hasIntegrityBlock) {
    reasons.push("Integrity or confidentiality blocker on record.");
  }
  if (input.completedTerms >= 2) {
    reasons.push("Maximum of 2 Social Lead terms already reached.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export function calculateWeightedScorecardTotal(
  items: Array<Pick<MonthlyScorecardItem, "category_id" | "numeric_score">>,
  categories: ScorecardCategory[]
): number {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const total = items.reduce((sum, item) => {
    const category = categoryMap.get(item.category_id);
    if (!category) return sum;
    return sum + clampScore(item.numeric_score) * (Number(category.weight) || 0) / 100;
  }, 0);

  return Math.round(total * 100) / 100;
}

export function normalizeReviewMonth(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid review month.");
  }
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return normalized.toISOString().slice(0, 10);
}

export function getProbationCheckpointLabel(reviewMonthIndex: number): string {
  switch (reviewMonthIndex) {
    case 1:
      return "Month 1: onboarding and discipline review";
    case 2:
      return "Month 2: productivity and learning review";
    case 3:
      return "Month 3: mid-probation review";
    case 4:
      return "Month 4: improvement and leadership potential review";
    case 5:
      return "Month 5: final preparation review";
    case 6:
      return "Month 6: permanent contract decision";
    default:
      return `Month ${reviewMonthIndex} review`;
  }
}

export function getMonthsCompletedSince(startDate: string | null | undefined): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth()) +
    1;
  if (months < 0) months = 0;
  return Math.min(months, 6);
}

export function getElapsedMonthsSince(startDate: string | null | undefined): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth()) +
    1;
  if (months < 0) months = 0;
  return months;
}

export function isDateWithinNextHours(
  value: string | null | undefined,
  hours: number,
  now = new Date()
): boolean {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= hours * 60 * 60 * 1000;
}

export function getLatestProbationCheckpointDue(
  startDate: string | null | undefined,
  completedReviewIndexes: number[]
): number | null {
  const monthsCompleted = getMonthsCompletedSince(startDate);
  for (let monthIndex = 1; monthIndex <= monthsCompleted; monthIndex += 1) {
    if (!completedReviewIndexes.includes(monthIndex)) {
      return monthIndex;
    }
  }
  return null;
}

export function evaluateLeadershipEligibility(input: {
  recentTotals: number[];
  hasBlockingIssue: boolean;
}): {
  averageScore: number | null;
  meetsThreeMonthEighty: boolean;
  meetsTwoOfThreeEightyFive: boolean;
  autoFlagged: boolean;
  recommendedStatus: LeadershipPipelineStatus;
} {
  const recentTotals = input.recentTotals.slice(0, 3).map(clampScore);
  const averageScore =
    recentTotals.length > 0
      ? Math.round(
          (recentTotals.reduce((sum, value) => sum + value, 0) / recentTotals.length) * 100
        ) / 100
      : null;
  const meetsThreeMonthEighty =
    recentTotals.length === 3 && recentTotals.every((score) => score >= 80);
  const meetsTwoOfThreeEightyFive =
    recentTotals.length === 3 &&
    recentTotals.filter((score) => score >= 85).length >= 2;
  const autoFlagged =
    !input.hasBlockingIssue &&
    (meetsThreeMonthEighty || meetsTwoOfThreeEightyFive);

  let recommendedStatus: LeadershipPipelineStatus = "not_eligible";
  if (autoFlagged) {
    recommendedStatus = "eligible_for_course";
  } else if (!input.hasBlockingIssue && recentTotals.length > 0) {
    recommendedStatus = "under_observation";
  }

  return {
    averageScore,
    meetsThreeMonthEighty,
    meetsTwoOfThreeEightyFive,
    autoFlagged,
    recommendedStatus,
  };
}
