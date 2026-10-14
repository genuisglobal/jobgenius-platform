import { supabaseAdmin } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth/types";
import { isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import type {
  AcceptedOfferRecord,
  CareerLadderLevel,
  DisciplinaryRecord,
  EmployeeOnboardingForm,
  EmployeeBonusRecord,
  EmployeePermissionPolicy,
  EmployeePermissionRequest,
  EmployeeRecord,
  LeaderOfMonthAward,
  LeadershipCourseEnrollment,
  LeadershipEligibilityRecord,
  LeadershipTrial,
  MonthlyScorecard,
  MonthlyScorecardItem,
  ProbationDecisionStatus,
  ProbationReview,
  PolicyAcknowledgement,
  PolicyDocument,
  ScorecardCategory,
  SocialLeadCandidate,
  SocialLeadElection,
  SocialLeadTerm,
  SocialLeadVote,
  SocialEvent,
  SocialFundContribution,
  SocialFundExpense,
} from "@/lib/people";
import {
  calculatePermissionAllowanceSummary,
  calculateSocialFundBalance,
  calculateWeightedScorecardTotal,
  evaluateSocialLeadEligibility,
  evaluateLeadershipEligibility,
  getElapsedMonthsSince,
  getLatestProbationCheckpointDue,
  getMonthsCompletedSince,
  isDateWithinNextHours,
  normalizeReviewMonth,
} from "@/lib/people";

export type EmployeeListRow = EmployeeRecord & {
  worker: {
    id: string;
    full_name: string;
    email: string | null;
    job_title: string | null;
    department: string | null;
    status: string;
    currency: string;
  } | null;
  account_manager: {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
  } | null;
  supervisor: {
    id: string;
    full_name: string;
  } | null;
  current_level: CareerLadderLevel | null;
};

export type OnboardingQueueRow = EmployeeOnboardingForm & {
  employee: EmployeeListRow | null;
};

export type EmployeePermissionPolicyRow = EmployeePermissionPolicy & {
  employee: EmployeeListRow | null;
  configured_by_account_manager: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type EmployeePermissionRequestRow = EmployeePermissionRequest & {
  employee: EmployeeListRow | null;
  policy: EmployeePermissionPolicy | null;
  decider: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type EmployeePermissionAllowanceSummaryRow = {
  employee: EmployeeListRow;
  activePolicy: EmployeePermissionPolicyRow | null;
  approvedDaysUsed: number;
  pendingDays: number;
  committedDays: number;
  remainingDays: number;
  overLimit: boolean;
  requests: EmployeePermissionRequestRow[];
};

export type ScorecardRecord = MonthlyScorecard & {
  employee: EmployeeListRow | null;
  reviewer: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  items: Array<
    MonthlyScorecardItem & {
      category: ScorecardCategory | null;
    }
  >;
};

export type DisciplinaryRecordRow = DisciplinaryRecord & {
  employee: EmployeeListRow | null;
  creator: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type LeadershipEligibilityRow = LeadershipEligibilityRecord & {
  employee: EmployeeListRow | null;
};

export type LeadershipCourseEnrollmentRow = LeadershipCourseEnrollment & {
  employee: EmployeeListRow | null;
  approver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type LeadershipTrialRow = LeadershipTrial & {
  employee: EmployeeListRow | null;
  reviewer: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type LeaderOfMonthAwardRow = LeaderOfMonthAward & {
  employee: EmployeeListRow | null;
  creator: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  scorecard: {
    id: string;
    review_month: string;
    final_total: number;
    status: string;
  } | null;
};

export type AcceptedOfferRecordRow = AcceptedOfferRecord & {
  employee: EmployeeListRow | null;
  job_seeker: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  assigned_account_manager: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  application_submitted_by: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  interview_managed_by: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type EmployeeBonusRecordRow = EmployeeBonusRecord & {
  employee: EmployeeListRow | null;
  accepted_offer: AcceptedOfferRecordRow | null;
  approver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type SocialFundContributionRow = SocialFundContribution & {
  employee: EmployeeListRow | null;
  accepted_offer: AcceptedOfferRecordRow | null;
};

export type SocialFundExpenseRow = SocialFundExpense & {
  requested_by_employee: EmployeeListRow | null;
  social_lead_employee: EmployeeListRow | null;
  approver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type SocialEventRow = SocialEvent & {
  coordinator: EmployeeListRow | null;
};

export type SocialLeadElectionRow = SocialLeadElection & {
  creator: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type SocialLeadCandidateRow = SocialLeadCandidate & {
  election: SocialLeadElectionRow | null;
  employee: EmployeeListRow | null;
  nominator: EmployeeListRow | null;
  approver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  vote_count: number;
};

export type SocialLeadVoteRow = SocialLeadVote & {
  election: SocialLeadElectionRow | null;
  voter: EmployeeListRow | null;
  candidate: EmployeeListRow | null;
};

export type SocialLeadTermRow = SocialLeadTerm & {
  employee: EmployeeListRow | null;
  election: SocialLeadElectionRow | null;
};

export type SocialLeadEligibilityPoolRow = {
  employee: EmployeeListRow;
  tenureMonths: number;
  averageScore: number | null;
  hasActiveDisciplinaryIssue: boolean;
  hasIntegrityBlock: boolean;
  completedTerms: number;
  activeTerm: boolean;
  eligible: boolean;
  reasons: string[];
};

export type PeopleOpsReminderSnapshot = {
  currentReviewMonth: string;
  dueScorecardEmployees: EmployeeListRow[];
  dueProbationSummaries: ProbationSummaryRow[];
  pendingOnboardingQueue: OnboardingQueueRow[];
  activeDisciplinaryRecords: DisciplinaryRecordRow[];
  electionsClosingSoon: SocialLeadElectionRow[];
};

export type ProbationSummaryRow = {
  employee: EmployeeListRow;
  reviews: ProbationReview[];
  verifiedAcceptedOffersCount: number;
  latestScorecardAverage: number | null;
  monthsCompleted: number;
  dueCheckpoint: number | null;
  earlyPermanentEligible: boolean;
  latestDecision: ProbationDecisionStatus | null;
};

export function canAccessPeopleModule(user: AuthUser | null | undefined): boolean {
  return Boolean(
    user &&
      user.userType === "am" &&
      isPeopleManagerRole(user.role)
  );
}

export function canAccessFinanceModule(user: AuthUser | null | undefined): boolean {
  return Boolean(
    user &&
      user.userType === "am" &&
      (isFinanceRole(user.role) || isPeopleManagerRole(user.role))
  );
}

function mapEmployeeRelation(
  row: Record<string, unknown> | null | undefined
): EmployeeListRow | null {
  if (!row) return null;

  const supervisorRaw = row.supervisor as
    | {
        id: string;
        worker:
          | {
              full_name: string;
            }
          | {
              full_name: string;
            }[]
          | null;
      }
    | null;
  const supervisorWorker = Array.isArray(supervisorRaw?.worker)
    ? supervisorRaw?.worker[0] ?? null
    : supervisorRaw?.worker ?? null;

  return {
    ...(row as unknown as EmployeeRecord),
    worker: Array.isArray(row.worker)
      ? ((row.worker[0] as EmployeeListRow["worker"]) ?? null)
      : ((row.worker as EmployeeListRow["worker"]) ?? null),
    account_manager: Array.isArray(row.account_manager)
      ? ((row.account_manager[0] as EmployeeListRow["account_manager"]) ?? null)
      : ((row.account_manager as EmployeeListRow["account_manager"]) ?? null),
    supervisor: supervisorRaw
      ? {
          id: supervisorRaw.id,
          full_name: supervisorWorker?.full_name ?? "Unknown supervisor",
        }
      : null,
    current_level: Array.isArray(row.current_level)
      ? ((row.current_level[0] as CareerLadderLevel) ?? null)
      : ((row.current_level as CareerLadderLevel) ?? null),
  };
}

function mapAcceptedOfferRelation(
  row: Record<string, unknown> | null | undefined
): AcceptedOfferRecordRow | null {
  if (!row) return null;

  return {
    ...(row as unknown as AcceptedOfferRecord),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    job_seeker: Array.isArray(row.job_seeker)
      ? ((row.job_seeker[0] as AcceptedOfferRecordRow["job_seeker"]) ?? null)
      : ((row.job_seeker as AcceptedOfferRecordRow["job_seeker"]) ?? null),
    assigned_account_manager: Array.isArray(row.assigned_account_manager)
      ? ((row.assigned_account_manager[0] as AcceptedOfferRecordRow["assigned_account_manager"]) ?? null)
      : ((row.assigned_account_manager as AcceptedOfferRecordRow["assigned_account_manager"]) ?? null),
    application_submitted_by: Array.isArray(row.application_submitted_by)
      ? ((row.application_submitted_by[0] as AcceptedOfferRecordRow["application_submitted_by"]) ?? null)
      : ((row.application_submitted_by as AcceptedOfferRecordRow["application_submitted_by"]) ?? null),
    interview_managed_by: Array.isArray(row.interview_managed_by)
      ? ((row.interview_managed_by[0] as AcceptedOfferRecordRow["interview_managed_by"]) ?? null)
      : ((row.interview_managed_by as AcceptedOfferRecordRow["interview_managed_by"]) ?? null),
  };
}

function mapSocialLeadElectionRelation(
  row: Record<string, unknown> | null | undefined
): SocialLeadElectionRow | null {
  if (!row) return null;

  return {
    ...(row as unknown as SocialLeadElection),
    creator: Array.isArray(row.creator)
      ? ((row.creator[0] as SocialLeadElectionRow["creator"]) ?? null)
      : ((row.creator as SocialLeadElectionRow["creator"]) ?? null),
  };
}

export async function listCareerLadderLevels(): Promise<CareerLadderLevel[]> {
  const { data, error } = await supabaseAdmin
    .from("career_ladder_levels")
    .select("*")
    .order("rank_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as CareerLadderLevel[]).map((level) => ({
    ...level,
    requirements: Array.isArray(level.requirements)
      ? level.requirements
      : [],
  }));
}

export async function listActivePolicyDocuments(): Promise<PolicyDocument[]> {
  const { data, error } = await supabaseAdmin
    .from("employee_policy_documents")
    .select(
      "id, policy_key, title, body, version_label, sort_order, is_active, requires_acknowledgement"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PolicyDocument[];
}

export async function getEmployeeByAccountManagerId(
  accountManagerId: string
): Promise<EmployeeListRow | null> {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select(
      `
      *,
      worker:payroll_workers!employees_worker_id_fkey(
        id, full_name, email, job_title, department, status, currency
      ),
      account_manager:account_managers!employees_account_manager_id_fkey(
        id, name, email, role
      ),
      supervisor:employees!supervisor_employee_id(
        id,
        worker:payroll_workers!employees_worker_id_fkey(full_name)
      ),
      current_level:career_ladder_levels!employees_current_career_level_id_fkey(
        id, slug, title, department, rank_order, summary, requirements
      )
    `
    )
    .eq("account_manager_id", accountManagerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapEmployeeRelation((data as Record<string, unknown> | null) ?? null);
}

export async function getEmployeeById(
  employeeId: string
): Promise<EmployeeListRow | null> {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select(
      `
      *,
      worker:payroll_workers!employees_worker_id_fkey(
        id, full_name, email, job_title, department, status, currency
      ),
      account_manager:account_managers!employees_account_manager_id_fkey(
        id, name, email, role
      ),
      supervisor:employees!supervisor_employee_id(
        id,
        worker:payroll_workers!employees_worker_id_fkey(full_name)
      ),
      current_level:career_ladder_levels!employees_current_career_level_id_fkey(
        id, slug, title, department, rank_order, summary, requirements
      )
    `
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapEmployeeRelation((data as Record<string, unknown> | null) ?? null);
}

export async function getEmployeeOnboardingForm(
  employeeId: string
): Promise<EmployeeOnboardingForm | null> {
  const { data, error } = await supabaseAdmin
    .from("employee_onboarding_forms")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as EmployeeOnboardingForm | null) ?? null;
}

export async function listPolicyAcknowledgementsForEmployee(
  employeeId: string
): Promise<PolicyAcknowledgement[]> {
  const { data, error } = await supabaseAdmin
    .from("employee_policy_acknowledgements")
    .select("*")
    .eq("employee_id", employeeId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PolicyAcknowledgement[];
}

export async function listEmployeePermissionPolicies(
  employeeId?: string
): Promise<EmployeePermissionPolicyRow[]> {
  let query = supabaseAdmin
    .from("employee_permission_policies")
    .select(
      `
      *,
      employee:employees!employee_permission_policies_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      configured_by_account_manager:account_managers!employee_permission_policies_configured_by_fkey(
        id, name, email
      )
    `
    )
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as EmployeePermissionPolicy),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    configured_by_account_manager: Array.isArray(row.configured_by_account_manager)
      ? ((row.configured_by_account_manager[0] as EmployeePermissionPolicyRow["configured_by_account_manager"]) ??
          null)
      : ((row.configured_by_account_manager as EmployeePermissionPolicyRow["configured_by_account_manager"]) ??
          null),
  }));
}

export async function listEmployeePermissionRequests(
  employeeId?: string
): Promise<EmployeePermissionRequestRow[]> {
  let query = supabaseAdmin
    .from("employee_permission_requests")
    .select(
      `
      *,
      employee:employees!employee_permission_requests_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      policy:employee_permission_policies!employee_permission_requests_policy_id_fkey(
        *
      ),
      decider:account_managers!employee_permission_requests_decided_by_fkey(
        id, name, email
      )
    `
    )
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as EmployeePermissionRequest),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    policy: Array.isArray(row.policy)
      ? ((row.policy[0] as EmployeePermissionPolicy | null) ?? null)
      : ((row.policy as EmployeePermissionPolicy | null) ?? null),
    decider: Array.isArray(row.decider)
      ? ((row.decider[0] as EmployeePermissionRequestRow["decider"]) ?? null)
      : ((row.decider as EmployeePermissionRequestRow["decider"]) ?? null),
  }));
}

function buildEmployeePermissionAllowanceSummary(params: {
  employee: EmployeeListRow;
  activePolicy: EmployeePermissionPolicyRow | null;
  requests: EmployeePermissionRequestRow[];
}): EmployeePermissionAllowanceSummaryRow {
  const policyRequests = params.activePolicy
    ? params.requests.filter((request) => request.policy_id === params.activePolicy?.id)
    : [];
  const allowance = params.activePolicy
    ? calculatePermissionAllowanceSummary({
        allowedDays: params.activePolicy.allowed_days,
        requests: policyRequests,
      })
    : {
        allowedDays: 0,
        approvedDaysUsed: 0,
        pendingDays: 0,
        committedDays: 0,
        remainingDays: 0,
        overLimit: false,
      };

  return {
    employee: params.employee,
    activePolicy: params.activePolicy,
    approvedDaysUsed: allowance.approvedDaysUsed,
    pendingDays: allowance.pendingDays,
    committedDays: allowance.committedDays,
    remainingDays: allowance.remainingDays,
    overLimit: allowance.overLimit,
    requests: policyRequests,
  };
}

export async function getEmployeePermissionAllowanceSummary(
  employeeId: string
): Promise<EmployeePermissionAllowanceSummaryRow | null> {
  const [employee, policies, requests] = await Promise.all([
    getEmployeeById(employeeId),
    listEmployeePermissionPolicies(employeeId),
    listEmployeePermissionRequests(employeeId),
  ]);

  if (!employee) return null;

  const activePolicy =
    policies.find((policy) => policy.active) ??
    null;

  return buildEmployeePermissionAllowanceSummary({
    employee,
    activePolicy,
    requests,
  });
}

export async function listEmployeePermissionAllowanceSummaries(): Promise<
  EmployeePermissionAllowanceSummaryRow[]
> {
  const [employees, policies, requests] = await Promise.all([
    listPeopleEmployees(),
    listEmployeePermissionPolicies(),
    listEmployeePermissionRequests(),
  ]);

  const activePolicyByEmployee = new Map<string, EmployeePermissionPolicyRow>();
  for (const policy of policies) {
    if (policy.active && !activePolicyByEmployee.has(policy.employee_id)) {
      activePolicyByEmployee.set(policy.employee_id, policy);
    }
  }

  const requestsByEmployee = new Map<string, EmployeePermissionRequestRow[]>();
  for (const request of requests) {
    const bucket = requestsByEmployee.get(request.employee_id) ?? [];
    bucket.push(request);
    requestsByEmployee.set(request.employee_id, bucket);
  }

  return employees
    .filter((employee) => employee.active && employee.employment_status !== "terminated")
    .map((employee) =>
      buildEmployeePermissionAllowanceSummary({
        employee,
        activePolicy: activePolicyByEmployee.get(employee.id) ?? null,
        requests: requestsByEmployee.get(employee.id) ?? [],
      })
    );
}

export async function listPeopleManagerAccounts(): Promise<
  Array<{ id: string; name: string | null; email: string | null; role: string | null }>
> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("id, name, email, role");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter((account) => isPeopleManagerRole(account.role));
}

export async function listPeopleEmployees(): Promise<EmployeeListRow[]> {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select(
      `
      *,
      worker:payroll_workers!employees_worker_id_fkey(
        id, full_name, email, job_title, department, status, currency
      ),
      account_manager:account_managers!employees_account_manager_id_fkey(
        id, name, email, role
      ),
      supervisor:employees!supervisor_employee_id(
        id,
        worker:payroll_workers!employees_worker_id_fkey(full_name)
      ),
      current_level:career_ladder_levels!employees_current_career_level_id_fkey(
        id, slug, title, department, rank_order, summary, requirements
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapEmployeeRelation(row) as EmployeeListRow
  );
}

export async function listPeopleOverviewStats() {
  const [
    { count: employeeCount, error: employeeCountError },
    { count: pendingOnboardingCount, error: pendingOnboardingError },
    { count: probationCount, error: probationError },
    { count: permanentCount, error: permanentError },
    { count: leadershipReadyCount, error: leadershipReadyError },
    reminderSnapshot,
  ] = await Promise.all([
    supabaseAdmin.from("employees").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("employee_onboarding_forms")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "submitted", "needs_changes"]),
    supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("employment_status", "probation"),
    supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("employment_status", "permanent"),
    supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .in("leadership_status", [
        "eligible_for_course",
        "enrolled_in_course",
        "completed_course",
        "ready_for_trial",
        "in_trial",
      ]),
    getPeopleOpsReminderSnapshot(),
  ]);

  const errors = [
    employeeCountError,
    pendingOnboardingError,
    probationError,
    permanentError,
    leadershipReadyError,
  ].filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Failed to load people stats.");
  }

  return {
    employeeCount: employeeCount ?? 0,
    pendingOnboardingCount: pendingOnboardingCount ?? 0,
    probationCount: probationCount ?? 0,
    permanentCount: permanentCount ?? 0,
    leadershipReadyCount: leadershipReadyCount ?? 0,
    dueScorecardCount: reminderSnapshot.dueScorecardEmployees.length,
    dueProbationCount: reminderSnapshot.dueProbationSummaries.length,
    activeDisciplinaryCount: reminderSnapshot.activeDisciplinaryRecords.length,
    electionClosingSoonCount: reminderSnapshot.electionsClosingSoon.length,
  };
}

export async function listOnboardingQueue(): Promise<OnboardingQueueRow[]> {
  const { data, error } = await supabaseAdmin
    .from("employee_onboarding_forms")
    .select(
      `
      *,
      employee:employees!employee_onboarding_forms_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      )
    `
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const employeeRaw = row.employee as Record<string, unknown> | null;
    if (!employeeRaw) {
      return {
        ...(row as unknown as EmployeeOnboardingForm),
        employee: null,
      };
    }

    return {
      ...(row as unknown as EmployeeOnboardingForm),
      employee: mapEmployeeRelation(employeeRaw),
    };
  });
}

export async function listScorecardCategories(): Promise<ScorecardCategory[]> {
  const { data, error } = await supabaseAdmin
    .from("scorecard_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ScorecardCategory[];
}

export async function listMonthlyScorecards(
  employeeId?: string
): Promise<ScorecardRecord[]> {
  let query = supabaseAdmin
    .from("monthly_scorecards")
    .select(
      `
      *,
      employee:employees!monthly_scorecards_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      reviewer:account_managers!monthly_scorecards_reviewer_account_manager_id_fkey(
        id, name, email
      ),
      items:monthly_scorecard_items(
        *,
        category:scorecard_categories(*)
      )
    `
    )
    .order("review_month", { ascending: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as MonthlyScorecard),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    reviewer: Array.isArray(row.reviewer)
      ? ((row.reviewer[0] as ScorecardRecord["reviewer"]) ?? null)
      : ((row.reviewer as ScorecardRecord["reviewer"]) ?? null),
    items: ((row.items ?? []) as Record<string, unknown>[]).map((item) => ({
      ...(item as unknown as MonthlyScorecardItem),
      category: Array.isArray(item.category)
        ? ((item.category[0] as ScorecardCategory) ?? null)
        : ((item.category as ScorecardCategory) ?? null),
    })),
  }));
}

export async function listLeadershipEligibilityRecords(
  employeeId?: string
): Promise<LeadershipEligibilityRow[]> {
  let query = supabaseAdmin
    .from("leadership_eligibility_records")
    .select(
      `
      *,
      employee:employees!leadership_eligibility_records_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      )
    `
    )
    .order("review_month", { ascending: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as LeadershipEligibilityRecord),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
  }));
}

export async function listProbationReviews(
  employeeId?: string
): Promise<ProbationReview[]> {
  let query = supabaseAdmin
    .from("probation_reviews")
    .select("*")
    .order("review_month_index", { ascending: true });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProbationReview[];
}

export async function listDisciplinaryRecords(
  employeeId?: string
): Promise<DisciplinaryRecordRow[]> {
  let query = supabaseAdmin
    .from("disciplinary_records")
    .select(
      `
      *,
      employee:employees!disciplinary_records_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      creator:account_managers!disciplinary_records_created_by_fkey(
        id, name, email
      )
    `
    )
    .order("opened_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as DisciplinaryRecord),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    creator: Array.isArray(row.creator)
      ? ((row.creator[0] as DisciplinaryRecordRow["creator"]) ?? null)
      : ((row.creator as DisciplinaryRecordRow["creator"]) ?? null),
  }));
}

export async function listLeadershipCourseEnrollments(
  employeeId?: string
): Promise<LeadershipCourseEnrollmentRow[]> {
  let query = supabaseAdmin
    .from("leadership_course_enrollments")
    .select(
      `
      *,
      employee:employees!leadership_course_enrollments_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      approver:account_managers!leadership_course_enrollments_approved_by_fkey(
        id, name, email
      )
    `
    )
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as LeadershipCourseEnrollment),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    approver: Array.isArray(row.approver)
      ? ((row.approver[0] as LeadershipCourseEnrollmentRow["approver"]) ?? null)
      : ((row.approver as LeadershipCourseEnrollmentRow["approver"]) ?? null),
  }));
}

export async function listLeadershipTrials(
  employeeId?: string
): Promise<LeadershipTrialRow[]> {
  let query = supabaseAdmin
    .from("leadership_trials")
    .select(
      `
      *,
      employee:employees!leadership_trials_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      reviewer:account_managers!leadership_trials_reviewed_by_fkey(
        id, name, email
      )
    `
    )
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as LeadershipTrial),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    reviewer: Array.isArray(row.reviewer)
      ? ((row.reviewer[0] as LeadershipTrialRow["reviewer"]) ?? null)
      : ((row.reviewer as LeadershipTrialRow["reviewer"]) ?? null),
  }));
}

export async function listLeaderOfMonthAwards(
  employeeId?: string
): Promise<LeaderOfMonthAwardRow[]> {
  let query = supabaseAdmin
    .from("leader_of_month_awards")
    .select(
      `
      *,
      employee:employees!leader_of_month_awards_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      creator:account_managers!leader_of_month_awards_created_by_fkey(
        id, name, email
      ),
      scorecard:monthly_scorecards!leader_of_month_awards_scorecard_id_fkey(
        id, review_month, final_total, status
      )
    `
    )
    .order("award_month", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as LeaderOfMonthAward),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    creator: Array.isArray(row.creator)
      ? ((row.creator[0] as LeaderOfMonthAwardRow["creator"]) ?? null)
      : ((row.creator as LeaderOfMonthAwardRow["creator"]) ?? null),
    scorecard: Array.isArray(row.scorecard)
      ? ((row.scorecard[0] as LeaderOfMonthAwardRow["scorecard"]) ?? null)
      : ((row.scorecard as LeaderOfMonthAwardRow["scorecard"]) ?? null),
  }));
}

export async function listAcceptedOfferRecords(
  employeeId?: string
): Promise<AcceptedOfferRecordRow[]> {
  let query = supabaseAdmin
    .from("accepted_offer_records")
    .select(
      `
      *,
      employee:employees!accepted_offer_records_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      job_seeker:job_seekers!accepted_offer_records_job_seeker_id_fkey(
        id, full_name, email
      ),
      assigned_account_manager:account_managers!assigned_account_manager_id(
        id, name, email
      ),
      application_submitted_by:account_managers!application_submitted_by_account_manager_id(
        id, name, email
      ),
      interview_managed_by:account_managers!interview_managed_by_account_manager_id(
        id, name, email
      )
    `
    )
    .order("client_start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapAcceptedOfferRelation(row) as AcceptedOfferRecordRow
  );
}

export async function listEmployeeBonusRecords(
  employeeId?: string
): Promise<EmployeeBonusRecordRow[]> {
  let query = supabaseAdmin
    .from("employee_bonus_records")
    .select(
      `
      *,
      employee:employees!employee_bonus_records_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      accepted_offer:accepted_offer_records!employee_bonus_records_accepted_offer_record_id_fkey(
        *,
        employee:employees!accepted_offer_records_employee_id_fkey(
          *,
          worker:payroll_workers!employees_worker_id_fkey(
            id, full_name, email, job_title, department, status, currency
          ),
          account_manager:account_managers!employees_account_manager_id_fkey(
            id, name, email, role
          ),
          supervisor:employees!supervisor_employee_id(
            id,
            worker:payroll_workers!employees_worker_id_fkey(full_name)
          ),
          current_level:career_ladder_levels!employees_current_career_level_id_fkey(
            id, slug, title, department, rank_order, summary, requirements
          )
        ),
        job_seeker:job_seekers!accepted_offer_records_job_seeker_id_fkey(
          id, full_name, email
        ),
        assigned_account_manager:account_managers!assigned_account_manager_id(
          id, name, email
        ),
        application_submitted_by:account_managers!application_submitted_by_account_manager_id(
          id, name, email
        ),
        interview_managed_by:account_managers!interview_managed_by_account_manager_id(
          id, name, email
        )
      ),
      approver:account_managers!employee_bonus_records_approved_by_fkey(
        id, name, email
      )
    `
    )
    .order("payment_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as EmployeeBonusRecord),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    accepted_offer: mapAcceptedOfferRelation(
      (Array.isArray(row.accepted_offer)
        ? row.accepted_offer[0]
        : row.accepted_offer) as Record<string, unknown> | null
    ),
    approver: Array.isArray(row.approver)
      ? ((row.approver[0] as EmployeeBonusRecordRow["approver"]) ?? null)
      : ((row.approver as EmployeeBonusRecordRow["approver"]) ?? null),
  }));
}

export async function listSocialFundContributions(): Promise<SocialFundContributionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("social_fund_contributions")
    .select(
      `
      *,
      employee:employees!social_fund_contributions_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      accepted_offer:accepted_offer_records!social_fund_contributions_accepted_offer_record_id_fkey(
        *,
        employee:employees!accepted_offer_records_employee_id_fkey(
          *,
          worker:payroll_workers!employees_worker_id_fkey(
            id, full_name, email, job_title, department, status, currency
          ),
          account_manager:account_managers!employees_account_manager_id_fkey(
            id, name, email, role
          ),
          supervisor:employees!supervisor_employee_id(
            id,
            worker:payroll_workers!employees_worker_id_fkey(full_name)
          ),
          current_level:career_ladder_levels!employees_current_career_level_id_fkey(
            id, slug, title, department, rank_order, summary, requirements
          )
        ),
        job_seeker:job_seekers!accepted_offer_records_job_seeker_id_fkey(
          id, full_name, email
        ),
        assigned_account_manager:account_managers!assigned_account_manager_id(
          id, name, email
        ),
        application_submitted_by:account_managers!application_submitted_by_account_manager_id(
          id, name, email
        ),
        interview_managed_by:account_managers!interview_managed_by_account_manager_id(
          id, name, email
        )
      )
    `
    )
    .order("contribution_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialFundContribution),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    accepted_offer: mapAcceptedOfferRelation(
      (Array.isArray(row.accepted_offer)
        ? row.accepted_offer[0]
        : row.accepted_offer) as Record<string, unknown> | null
    ),
  }));
}

export async function listSocialFundExpenses(): Promise<SocialFundExpenseRow[]> {
  const { data, error } = await supabaseAdmin
    .from("social_fund_expenses")
    .select(
      `
      *,
      requested_by_employee:employees!social_fund_expenses_requested_by_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      social_lead_employee:employees!social_fund_expenses_social_lead_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      approver:account_managers!social_fund_expenses_approved_by_fkey(
        id, name, email
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialFundExpense),
    requested_by_employee: mapEmployeeRelation(
      (row.requested_by_employee as Record<string, unknown> | null) ?? null
    ),
    social_lead_employee: mapEmployeeRelation(
      (row.social_lead_employee as Record<string, unknown> | null) ?? null
    ),
    approver: Array.isArray(row.approver)
      ? ((row.approver[0] as SocialFundExpenseRow["approver"]) ?? null)
      : ((row.approver as SocialFundExpenseRow["approver"]) ?? null),
  }));
}

export async function listSocialEvents(): Promise<SocialEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("social_events")
    .select(
      `
      *,
      coordinator:employees!social_events_coordinated_by_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      )
    `
    )
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialEvent),
    coordinator: mapEmployeeRelation(
      (row.coordinator as Record<string, unknown> | null) ?? null
    ),
  }));
}

export async function getSocialFundSummary() {
  const [contributions, expenses, events] = await Promise.all([
    listSocialFundContributions(),
    listSocialFundExpenses(),
    listSocialEvents(),
  ]);

  return {
    contributions,
    expenses,
    events,
    totals: calculateSocialFundBalance({
      contributions,
      expenses,
    }),
  };
}

export async function listSocialLeadElections(): Promise<SocialLeadElectionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("social_lead_elections")
    .select(
      `
      *,
      creator:account_managers!social_lead_elections_created_by_fkey(
        id, name, email
      )
    `
    )
    .order("term_start", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapSocialLeadElectionRelation(row) as SocialLeadElectionRow
  );
}

export async function listSocialLeadCandidates(
  electionId?: string
): Promise<SocialLeadCandidateRow[]> {
  let query = supabaseAdmin
    .from("social_lead_candidates")
    .select(
      `
      *,
      election:social_lead_elections!social_lead_candidates_election_id_fkey(
        *,
        creator:account_managers!social_lead_elections_created_by_fkey(
          id, name, email
        )
      ),
      employee:employees!social_lead_candidates_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      nominator:employees!social_lead_candidates_nominated_by_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      approver:account_managers!social_lead_candidates_approved_by_fkey(
        id, name, email
      )
    `
    )
    .order("created_at", { ascending: false });

  if (electionId) {
    query = query.eq("election_id", electionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialLeadCandidate),
    election: mapSocialLeadElectionRelation(
      (row.election as Record<string, unknown> | null) ?? null
    ),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    nominator: mapEmployeeRelation(
      (row.nominator as Record<string, unknown> | null) ?? null
    ),
    approver: Array.isArray(row.approver)
      ? ((row.approver[0] as SocialLeadCandidateRow["approver"]) ?? null)
      : ((row.approver as SocialLeadCandidateRow["approver"]) ?? null),
    vote_count: 0,
  })) as SocialLeadCandidateRow[];

  const electionIds = Array.from(new Set(rows.map((row) => row.election_id)));
  if (electionIds.length === 0) {
    return rows;
  }

  const { data: votes, error: votesError } = await supabaseAdmin
    .from("social_lead_votes")
    .select("election_id, candidate_employee_id")
    .in("election_id", electionIds);

  if (votesError) {
    throw new Error(votesError.message);
  }

  const voteCounts = new Map<string, number>();
  for (const vote of votes ?? []) {
    const key = `${vote.election_id}:${vote.candidate_employee_id}`;
    voteCounts.set(key, (voteCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    vote_count: voteCounts.get(`${row.election_id}:${row.employee_id}`) ?? 0,
  }));
}

export async function listSocialLeadVotes(
  electionId?: string
): Promise<SocialLeadVoteRow[]> {
  let query = supabaseAdmin
    .from("social_lead_votes")
    .select(
      `
      *,
      election:social_lead_elections!social_lead_votes_election_id_fkey(
        *,
        creator:account_managers!social_lead_elections_created_by_fkey(
          id, name, email
        )
      ),
      voter:employees!social_lead_votes_voter_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      candidate:employees!social_lead_votes_candidate_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      )
    `
    )
    .order("created_at", { ascending: false });

  if (electionId) {
    query = query.eq("election_id", electionId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialLeadVote),
    election: mapSocialLeadElectionRelation(
      (row.election as Record<string, unknown> | null) ?? null
    ),
    voter: mapEmployeeRelation(
      (row.voter as Record<string, unknown> | null) ?? null
    ),
    candidate: mapEmployeeRelation(
      (row.candidate as Record<string, unknown> | null) ?? null
    ),
  }));
}

export async function listSocialLeadTerms(
  employeeId?: string
): Promise<SocialLeadTermRow[]> {
  let query = supabaseAdmin
    .from("social_lead_terms")
    .select(
      `
      *,
      employee:employees!social_lead_terms_employee_id_fkey(
        *,
        worker:payroll_workers!employees_worker_id_fkey(
          id, full_name, email, job_title, department, status, currency
        ),
        account_manager:account_managers!employees_account_manager_id_fkey(
          id, name, email, role
        ),
        supervisor:employees!supervisor_employee_id(
          id,
          worker:payroll_workers!employees_worker_id_fkey(full_name)
        ),
        current_level:career_ladder_levels!employees_current_career_level_id_fkey(
          id, slug, title, department, rank_order, summary, requirements
        )
      ),
      election:social_lead_elections!social_lead_terms_election_id_fkey(
        *,
        creator:account_managers!social_lead_elections_created_by_fkey(
          id, name, email
        )
      )
    `
    )
    .order("term_start", { ascending: false })
    .order("created_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as SocialLeadTerm),
    employee: mapEmployeeRelation(
      (row.employee as Record<string, unknown> | null) ?? null
    ),
    election: mapSocialLeadElectionRelation(
      (row.election as Record<string, unknown> | null) ?? null
    ),
  }));
}

export async function getSocialLeadEligibilityForEmployee(
  employeeId: string
): Promise<SocialLeadEligibilityPoolRow | null> {
  const pool = await listSocialLeadEligibilityPool();
  return pool.find((entry) => entry.employee.id === employeeId) ?? null;
}

export async function listSocialLeadEligibilityPool(): Promise<SocialLeadEligibilityPoolRow[]> {
  const [employees, scorecards, disciplinaryRes, terms] = await Promise.all([
    listPeopleEmployees(),
    listMonthlyScorecards(),
    supabaseAdmin
      .from("disciplinary_records")
      .select("employee_id, category, status")
      .neq("status", "dismissed"),
    listSocialLeadTerms(),
  ]);

  if (disciplinaryRes.error) {
    throw new Error(disciplinaryRes.error.message);
  }

  const scorecardsByEmployee = new Map<string, ScorecardRecord[]>();
  for (const scorecard of scorecards) {
    if (scorecard.status !== "finalized" && scorecard.status !== "acknowledged") continue;
    const bucket = scorecardsByEmployee.get(scorecard.employee_id) ?? [];
    bucket.push(scorecard);
    scorecardsByEmployee.set(scorecard.employee_id, bucket);
  }

  const disciplinaryByEmployee = new Map<
    string,
    Array<{ category: string | null; status: string }>
  >();
  for (const record of disciplinaryRes.data ?? []) {
    const bucket = disciplinaryByEmployee.get(record.employee_id) ?? [];
    bucket.push({
      category: record.category ?? null,
      status: record.status,
    });
    disciplinaryByEmployee.set(record.employee_id, bucket);
  }

  const termsByEmployee = new Map<string, SocialLeadTermRow[]>();
  for (const term of terms) {
    const bucket = termsByEmployee.get(term.employee_id) ?? [];
    bucket.push(term);
    termsByEmployee.set(term.employee_id, bucket);
  }

  return employees
    .filter((employee) => employee.active && employee.employment_status !== "terminated")
    .map((employee) => {
      const recentScores = (scorecardsByEmployee.get(employee.id) ?? [])
        .slice()
        .sort((a, b) => b.review_month.localeCompare(a.review_month))
        .slice(0, 3)
        .map((scorecard) => Number(scorecard.final_total) || 0);

      const averageScore =
        recentScores.length > 0
          ? Math.round(
              (recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length) *
                100
            ) / 100
          : null;

      const disciplinaryRecords = disciplinaryByEmployee.get(employee.id) ?? [];
      const hasActiveDisciplinaryIssue = disciplinaryRecords.some(
        (record) => record.status === "active"
      );
      const hasIntegrityBlock = disciplinaryRecords.some((record) => {
        const category = String(record.category ?? "").toLowerCase();
        return category.includes("integrity") || category.includes("confidentiality");
      });

      const employeeTerms = termsByEmployee.get(employee.id) ?? [];
      const completedTerms = employeeTerms.length;
      const activeTerm = employeeTerms.some((term) => term.status === "active");
      const tenureMonths = getElapsedMonthsSince(
        employee.start_date || employee.probation_start_date
      );
      const eligibility = evaluateSocialLeadEligibility({
        tenureMonths,
        averageScore,
        hasActiveDisciplinaryIssue,
        hasIntegrityBlock,
        completedTerms,
      });

      return {
        employee,
        tenureMonths,
        averageScore,
        hasActiveDisciplinaryIssue,
        hasIntegrityBlock,
        completedTerms,
        activeTerm,
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (b.averageScore ?? 0) - (a.averageScore ?? 0);
    });
}

export async function listProbationSummaries(): Promise<ProbationSummaryRow[]> {
  const [employees, reviews, scorecards, acceptedOffers] = await Promise.all([
    listPeopleEmployees(),
    listProbationReviews(),
    listMonthlyScorecards(),
    supabaseAdmin
      .from("accepted_offer_records")
      .select("employee_id")
      .eq("verification_status", "verified"),
  ]);

  if (acceptedOffers.error) {
    throw new Error(acceptedOffers.error.message);
  }

  const reviewsByEmployee = new Map<string, ProbationReview[]>();
  for (const review of reviews) {
    const bucket = reviewsByEmployee.get(review.employee_id) ?? [];
    bucket.push(review);
    reviewsByEmployee.set(review.employee_id, bucket);
  }

  const scorecardsByEmployee = new Map<string, ScorecardRecord[]>();
  for (const scorecard of scorecards) {
    const bucket = scorecardsByEmployee.get(scorecard.employee_id) ?? [];
    bucket.push(scorecard);
    scorecardsByEmployee.set(scorecard.employee_id, bucket);
  }

  const acceptedOfferCountByEmployee = new Map<string, number>();
  for (const row of acceptedOffers.data ?? []) {
    if (!row.employee_id) continue;
    acceptedOfferCountByEmployee.set(
      row.employee_id,
      (acceptedOfferCountByEmployee.get(row.employee_id) ?? 0) + 1
    );
  }

  return employees.map((employee) => {
    const employeeReviews = (reviewsByEmployee.get(employee.id) ?? []).slice().sort(
      (a, b) => a.review_month_index - b.review_month_index
    );
    const employeeScorecards = (scorecardsByEmployee.get(employee.id) ?? [])
      .filter((scorecard) =>
        scorecard.status === "finalized" || scorecard.status === "acknowledged"
      )
      .slice()
      .sort((a, b) => b.review_month.localeCompare(a.review_month));
    const latestScorecardAverage =
      employeeScorecards.length > 0
        ? Math.round(
            (employeeScorecards
              .slice(0, 3)
              .reduce((sum, scorecard) => sum + (Number(scorecard.final_total) || 0), 0) /
              Math.min(employeeScorecards.length, 3)) *
              100
          ) / 100
        : null;
    const verifiedAcceptedOffersCount =
      acceptedOfferCountByEmployee.get(employee.id) ?? 0;
    const monthsCompleted = getMonthsCompletedSince(
      employee.probation_start_date || employee.start_date
    );
    const dueCheckpoint = getLatestProbationCheckpointDue(
      employee.probation_start_date || employee.start_date,
      employeeReviews.map((review) => review.review_month_index)
    );
    const latestDecision =
      employeeReviews.length > 0
        ? employeeReviews[employeeReviews.length - 1]?.final_decision ?? null
        : null;

    return {
      employee,
      reviews: employeeReviews,
      verifiedAcceptedOffersCount,
      latestScorecardAverage,
      monthsCompleted,
      dueCheckpoint,
      earlyPermanentEligible: verifiedAcceptedOffersCount >= 3,
      latestDecision,
    };
  });
}

export async function getProbationSummaryForEmployee(
  employeeId: string
): Promise<ProbationSummaryRow | null> {
  const summaries = await listProbationSummaries();
  return summaries.find((summary) => summary.employee.id === employeeId) ?? null;
}

export async function getPeopleOpsReminderSnapshot(): Promise<PeopleOpsReminderSnapshot> {
  const currentReviewMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const [
    employees,
    scorecards,
    probationSummaries,
    onboardingQueue,
    disciplinaryRecords,
    elections,
  ] = await Promise.all([
    listPeopleEmployees(),
    listMonthlyScorecards(),
    listProbationSummaries(),
    listOnboardingQueue(),
    listDisciplinaryRecords(),
    listSocialLeadElections(),
  ]);

  const completedScorecardEmployeeIds = new Set(
    scorecards
      .filter(
        (scorecard) =>
          scorecard.review_month === currentReviewMonth &&
          (scorecard.status === "finalized" || scorecard.status === "acknowledged")
      )
      .map((scorecard) => scorecard.employee_id)
  );

  const dueScorecardEmployees = employees.filter(
    (employee) =>
      employee.active &&
      employee.employment_status !== "terminated" &&
      !completedScorecardEmployeeIds.has(employee.id)
  );

  const dueProbationSummaries = probationSummaries.filter(
    (summary) =>
      ["tentative", "probation"].includes(summary.employee.employment_status) &&
      summary.dueCheckpoint !== null
  );

  const pendingOnboardingQueue = onboardingQueue.filter((form) =>
    ["pending", "submitted", "needs_changes"].includes(form.status)
  );

  const activeDisciplinaryRecords = disciplinaryRecords.filter(
    (record) => record.status === "active"
  );

  const electionsClosingSoon = elections.filter((election) => {
    if (election.status === "nominations_open") {
      return isDateWithinNextHours(election.nominations_close_at, 48);
    }
    if (election.status === "voting_open") {
      return isDateWithinNextHours(election.voting_close_at, 48);
    }
    return false;
  });

  return {
    currentReviewMonth,
    dueScorecardEmployees,
    dueProbationSummaries,
    pendingOnboardingQueue,
    activeDisciplinaryRecords,
    electionsClosingSoon,
  };
}

export async function recalculateLeadershipEligibilityForEmployee(params: {
  employeeId: string;
  reviewMonth: string;
  reviewedBy?: string | null;
}) {
  const normalizedReviewMonth = normalizeReviewMonth(params.reviewMonth);
  const [scorecardsRes, disciplinaryRes, employeeRes] = await Promise.all([
    supabaseAdmin
      .from("monthly_scorecards")
      .select("final_total, review_month, status")
      .eq("employee_id", params.employeeId)
      .in("status", ["finalized", "acknowledged"])
      .order("review_month", { ascending: false })
      .limit(3),
    supabaseAdmin
      .from("disciplinary_records")
      .select("severity, category, status")
      .eq("employee_id", params.employeeId)
      .eq("status", "active"),
    supabaseAdmin
      .from("employees")
      .select("id, leadership_status")
      .eq("id", params.employeeId)
      .maybeSingle(),
  ]);

  if (scorecardsRes.error) throw new Error(scorecardsRes.error.message);
  if (disciplinaryRes.error) throw new Error(disciplinaryRes.error.message);
  if (employeeRes.error || !employeeRes.data) {
    throw new Error(employeeRes.error?.message || "Employee not found.");
  }

  const blockingIssue = (disciplinaryRes.data ?? []).some((record) => {
    const normalizedCategory = String(record.category ?? "").toLowerCase();
    return (
      record.severity === "serious" ||
      ["integrity", "confidentiality", "discipline", "conduct"].some((term) =>
        normalizedCategory.includes(term)
      )
    );
  });

  const evaluation = evaluateLeadershipEligibility({
    recentTotals: (scorecardsRes.data ?? []).map(
      (row) => Number(row.final_total) || 0
    ),
    hasBlockingIssue: blockingIssue,
  });

  const payload = {
    employee_id: params.employeeId,
    review_month: normalizedReviewMonth,
    average_score: evaluation.averageScore,
    meets_three_month_eighty: evaluation.meetsThreeMonthEighty,
    meets_two_of_three_eighty_five: evaluation.meetsTwoOfThreeEightyFive,
    has_blocking_issue: blockingIssue,
    auto_flagged: evaluation.autoFlagged,
    status: evaluation.recommendedStatus,
    reviewed_by: params.reviewedBy ?? null,
    notes: evaluation.autoFlagged
      ? "Auto-flagged from finalized monthly scorecards."
      : blockingIssue
      ? "Leadership auto-flag withheld due to active disciplinary blocker."
      : "Under observation from current scorecard history.",
  };

  const { data: record, error: upsertError } = await supabaseAdmin
    .from("leadership_eligibility_records")
    .upsert(payload, { onConflict: "employee_id,review_month" })
    .select("*")
    .single();

  if (upsertError || !record) {
    throw new Error(upsertError?.message || "Failed to update leadership eligibility.");
  }

  const currentEmployeeStatus = employeeRes.data.leadership_status;
  const autoManagedStatuses = [
    "not_eligible",
    "under_observation",
    "eligible_for_course",
  ];
  if (autoManagedStatuses.includes(currentEmployeeStatus)) {
    await supabaseAdmin
      .from("employees")
      .update({ leadership_status: evaluation.recommendedStatus })
      .eq("id", params.employeeId);
  }

  return record as LeadershipEligibilityRecord;
}
