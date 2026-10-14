import { supabaseAdmin } from "@/lib/auth";
import {
  type ConsultationDecision,
  type ConsultationRecordStatus,
  type OutcomeEventType,
  type OutcomeSourceChannel,
} from "@/lib/outcomes";

type OutcomeEventRow = {
  event_type: OutcomeEventType;
  occurred_at: string;
  lead_submission_id: string | null;
  job_seeker_id: string | null;
  consultation_record_id: string | null;
  application_run_id: string | null;
  interview_id: string | null;
  accepted_offer_record_id: string | null;
  owner_account_manager_id_snapshot: string | null;
  source_channel: OutcomeSourceChannel;
};

type ConsultationLeadRelation =
  | {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string | null;
    }
  | {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string | null;
    }[]
  | null;

type ConsultationOwnerRelation =
  | {
      id: string;
      name: string | null;
      email: string | null;
    }
  | {
      id: string;
      name: string | null;
      email: string | null;
    }[]
  | null;

type ConsultationRow = {
  id: string;
  lead_submission_id: string | null;
  job_seeker_id: string | null;
  owner_account_manager_id: string | null;
  scheduled_for: string | null;
  status: ConsultationRecordStatus;
  decision: ConsultationDecision | null;
  meeting_link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lead_submission: ConsultationLeadRelation;
  owner: ConsultationOwnerRelation;
};

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  owner_account_manager_id: string | null;
  linked_job_seeker_id: string | null;
  next_call_due_at: string | null;
  created_at: string;
};

type AccountManagerRow = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  status: string | null;
};

export type OutcomeFunnelCounts = {
  leads: number;
  consultationsBooked: number;
  consultationsCompleted: number;
  paymentsConfirmed: number;
  clientsActivated: number;
  applicationsSubmitted: number;
  interviewOutcomes: number;
  offersVerified: number;
  placementsConfirmed: number;
};

export type OutcomeChannelActivityRow = {
  channel: OutcomeSourceChannel;
  totalEvents: number;
  leads: number;
  consultations: number;
  payments: number;
  applications: number;
  offers: number;
  placements: number;
};

export type OutcomeAmPerformanceRow = {
  accountManagerId: string;
  name: string;
  email: string;
  role: string | null;
  leads: number;
  consultationsCompleted: number;
  clientsActivated: number;
  applicationsSubmitted: number;
  interviewOutcomes: number;
  offersVerified: number;
  placementsConfirmed: number;
};

export type OutcomeConsultationRecord = {
  id: string;
  leadSubmissionId: string | null;
  jobSeekerId: string | null;
  ownerAccountManagerId: string | null;
  scheduledFor: string | null;
  status: ConsultationRecordStatus;
  decision: ConsultationDecision | null;
  meetingLink: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    fullName: string | null;
    email: string | null;
    status: string | null;
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

export type OutcomeLeadOption = {
  id: string;
  label: string;
  status: string;
  ownerAccountManagerId: string | null;
  linkedJobSeekerId: string | null;
  nextCallDueAt: string | null;
  createdAt: string;
};

export type OutcomeAccountManagerOption = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

export type AdminOutcomeDashboardData = {
  allTime: OutcomeFunnelCounts;
  last30Days: OutcomeFunnelCounts;
  channelActivity: OutcomeChannelActivityRow[];
  amPerformance: OutcomeAmPerformanceRow[];
  consultations: OutcomeConsultationRecord[];
  leadOptions: OutcomeLeadOption[];
  accountManagers: OutcomeAccountManagerOption[];
  selectedLeadId: string | null;
};

function toSingleton<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function defaultFunnelCounts(): OutcomeFunnelCounts {
  return {
    leads: 0,
    consultationsBooked: 0,
    consultationsCompleted: 0,
    paymentsConfirmed: 0,
    clientsActivated: 0,
    applicationsSubmitted: 0,
    interviewOutcomes: 0,
    offersVerified: 0,
    placementsConfirmed: 0,
  };
}

export function buildOutcomeFunnelCounts(
  events: OutcomeEventRow[]
): OutcomeFunnelCounts {
  const leadIds = new Set<string>();
  const consultationBookedIds = new Set<string>();
  const consultationCompletedIds = new Set<string>();
  const paymentIds = new Set<string>();
  const activationIds = new Set<string>();
  const applicationIds = new Set<string>();
  const interviewIds = new Set<string>();
  const offerIds = new Set<string>();
  const placementIds = new Set<string>();

  for (const event of events) {
    switch (event.event_type) {
      case "lead_captured":
      case "lead_imported":
        if (event.lead_submission_id) leadIds.add(event.lead_submission_id);
        break;
      case "consultation_booked":
        if (event.consultation_record_id) {
          consultationBookedIds.add(event.consultation_record_id);
        }
        break;
      case "consultation_completed":
        if (event.consultation_record_id) {
          consultationCompletedIds.add(event.consultation_record_id);
        }
        break;
      case "payment_confirmed":
        if (event.job_seeker_id) paymentIds.add(event.job_seeker_id);
        break;
      case "client_activated":
        if (event.job_seeker_id) activationIds.add(event.job_seeker_id);
        break;
      case "application_submitted":
        if (event.application_run_id) applicationIds.add(event.application_run_id);
        break;
      case "interview_outcome_recorded":
        if (event.interview_id) interviewIds.add(event.interview_id);
        break;
      case "offer_verified":
        if (event.accepted_offer_record_id) offerIds.add(event.accepted_offer_record_id);
        break;
      case "placement_confirmed":
        if (event.job_seeker_id) placementIds.add(event.job_seeker_id);
        break;
      default:
        break;
    }
  }

  return {
    leads: leadIds.size,
    consultationsBooked: consultationBookedIds.size,
    consultationsCompleted: consultationCompletedIds.size,
    paymentsConfirmed: paymentIds.size,
    clientsActivated: activationIds.size,
    applicationsSubmitted: applicationIds.size,
    interviewOutcomes: interviewIds.size,
    offersVerified: offerIds.size,
    placementsConfirmed: placementIds.size,
  };
}

export function buildOutcomeChannelActivity(
  events: OutcomeEventRow[]
): OutcomeChannelActivityRow[] {
  const rows = new Map<OutcomeSourceChannel, OutcomeChannelActivityRow>();

  for (const event of events) {
    const current =
      rows.get(event.source_channel) ??
      ({
        channel: event.source_channel,
        totalEvents: 0,
        leads: 0,
        consultations: 0,
        payments: 0,
        applications: 0,
        offers: 0,
        placements: 0,
      } satisfies OutcomeChannelActivityRow);

    current.totalEvents += 1;

    if (event.event_type === "lead_captured" || event.event_type === "lead_imported") {
      current.leads += 1;
    }
    if (
      event.event_type === "consultation_booked" ||
      event.event_type === "consultation_completed" ||
      event.event_type === "consultation_no_show" ||
      event.event_type === "consultation_cancelled"
    ) {
      current.consultations += 1;
    }
    if (event.event_type === "payment_confirmed" || event.event_type === "client_activated") {
      current.payments += 1;
    }
    if (event.event_type === "application_submitted") {
      current.applications += 1;
    }
    if (event.event_type === "offer_reported" || event.event_type === "offer_verified") {
      current.offers += 1;
    }
    if (event.event_type === "placement_confirmed") {
      current.placements += 1;
    }

    rows.set(event.source_channel, current);
  }

  return Array.from(rows.values()).sort((a, b) => b.totalEvents - a.totalEvents);
}

export function buildOutcomeAmPerformance(
  events: OutcomeEventRow[],
  accountManagers: OutcomeAccountManagerOption[]
): OutcomeAmPerformanceRow[] {
  const rows = new Map<string, OutcomeAmPerformanceRow>();
  const managers = new Map(accountManagers.map((manager) => [manager.id, manager]));

  for (const event of events) {
    const ownerId = event.owner_account_manager_id_snapshot;
    if (!ownerId) continue;

    const manager = managers.get(ownerId);
    if (!manager) continue;

    const current =
      rows.get(ownerId) ??
      ({
        accountManagerId: ownerId,
        name: manager.name,
        email: manager.email,
        role: manager.role,
        leads: 0,
        consultationsCompleted: 0,
        clientsActivated: 0,
        applicationsSubmitted: 0,
        interviewOutcomes: 0,
        offersVerified: 0,
        placementsConfirmed: 0,
      } satisfies OutcomeAmPerformanceRow);

    switch (event.event_type) {
      case "lead_captured":
      case "lead_imported":
        current.leads += 1;
        break;
      case "consultation_completed":
        current.consultationsCompleted += 1;
        break;
      case "client_activated":
        current.clientsActivated += 1;
        break;
      case "application_submitted":
        current.applicationsSubmitted += 1;
        break;
      case "interview_outcome_recorded":
        current.interviewOutcomes += 1;
        break;
      case "offer_verified":
        current.offersVerified += 1;
        break;
      case "placement_confirmed":
        current.placementsConfirmed += 1;
        break;
      default:
        break;
    }

    rows.set(ownerId, current);
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.placementsConfirmed !== a.placementsConfirmed) {
      return b.placementsConfirmed - a.placementsConfirmed;
    }
    if (b.offersVerified !== a.offersVerified) {
      return b.offersVerified - a.offersVerified;
    }
    return b.applicationsSubmitted - a.applicationsSubmitted;
  });
}

function buildLeadLabel(lead: LeadRow): string {
  const name = lead.full_name?.trim() || "Unnamed lead";
  const email = lead.email?.trim();
  return email ? `${name} (${email})` : name;
}

function mapConsultationRow(row: ConsultationRow): OutcomeConsultationRecord {
  const lead = toSingleton(row.lead_submission);
  const owner = toSingleton(row.owner);

  return {
    id: row.id,
    leadSubmissionId: row.lead_submission_id,
    jobSeekerId: row.job_seeker_id,
    ownerAccountManagerId: row.owner_account_manager_id,
    scheduledFor: row.scheduled_for,
    status: row.status,
    decision: row.decision,
    meetingLink: row.meeting_link,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lead: lead
      ? {
          id: lead.id,
          fullName: lead.full_name,
          email: lead.email,
          status: lead.status,
        }
      : null,
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        }
      : null,
  };
}

export async function loadAdminOutcomeDashboard(
  selectedLeadId?: string | null
): Promise<AdminOutcomeDashboardData> {
  const last30DaysIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    eventRes,
    accountManagersRes,
    leadOptionsRes,
    consultationsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("outcome_events")
      .select(
        "event_type, occurred_at, lead_submission_id, job_seeker_id, consultation_record_id, application_run_id, interview_id, accepted_offer_record_id, owner_account_manager_id_snapshot, source_channel"
      )
      .order("occurred_at", { ascending: false })
      .limit(10000),
    supabaseAdmin
      .from("account_managers")
      .select("id, name, email, role, status")
      .neq("status", "rejected")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("lead_intake_submissions")
      .select(
        "id, full_name, email, status, owner_account_manager_id, linked_job_seeker_id, next_call_due_at, created_at"
      )
      .in("status", ["new", "qualified", "nurture"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("consultation_records")
      .select(
        "id, lead_submission_id, job_seeker_id, owner_account_manager_id, scheduled_for, status, decision, meeting_link, notes, created_at, updated_at, lead_submission:lead_intake_submissions(id, full_name, email, status), owner:account_managers!owner_account_manager_id(id, name, email)"
      )
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  if (eventRes.error) {
    throw new Error(eventRes.error.message);
  }
  if (accountManagersRes.error) {
    throw new Error(accountManagersRes.error.message);
  }
  if (leadOptionsRes.error) {
    throw new Error(leadOptionsRes.error.message);
  }
  if (consultationsRes.error) {
    throw new Error(consultationsRes.error.message);
  }

  const events = (eventRes.data ?? []) as OutcomeEventRow[];
  const accountManagers = ((accountManagersRes.data ?? []) as AccountManagerRow[])
    .filter((row) => row.email)
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || row.email,
      email: row.email,
      role: row.role,
    }));
  const leads = (leadOptionsRes.data ?? []) as LeadRow[];
  const consultations = (consultationsRes.data ?? []) as ConsultationRow[];

  const last30DaysEvents = events.filter(
    (event) => new Date(event.occurred_at).getTime() >= new Date(last30DaysIso).getTime()
  );

  return {
    allTime: buildOutcomeFunnelCounts(events),
    last30Days: buildOutcomeFunnelCounts(last30DaysEvents),
    channelActivity: buildOutcomeChannelActivity(events),
    amPerformance: buildOutcomeAmPerformance(events, accountManagers),
    consultations: consultations.map(mapConsultationRow),
    leadOptions: leads.map((lead) => ({
      id: lead.id,
      label: buildLeadLabel(lead),
      status: lead.status,
      ownerAccountManagerId: lead.owner_account_manager_id,
      linkedJobSeekerId: lead.linked_job_seeker_id,
      nextCallDueAt: lead.next_call_due_at,
      createdAt: lead.created_at,
    })),
    accountManagers,
    selectedLeadId: selectedLeadId?.trim() || null,
  };
}
