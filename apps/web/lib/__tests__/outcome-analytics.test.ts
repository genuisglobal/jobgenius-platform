import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({
  supabaseAdmin: {},
}));
import {
  buildOutcomeAmPerformance,
  buildOutcomeChannelActivity,
  buildOutcomeFunnelCounts,
  type OutcomeAccountManagerOption,
} from "../outcome-analytics-server";
import type { OutcomeEventType, OutcomeSourceChannel } from "../outcomes";

type OutcomeEventFixture = {
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

const FIXTURE_EVENTS: OutcomeEventFixture[] = [
  {
    event_type: "lead_captured",
    occurred_at: "2026-06-01T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: null,
    consultation_record_id: null,
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "signup_intake",
  },
  {
    event_type: "consultation_booked",
    occurred_at: "2026-06-02T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: null,
    consultation_record_id: "consult-1",
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "am_portal",
  },
  {
    event_type: "consultation_completed",
    occurred_at: "2026-06-03T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: null,
    consultation_record_id: "consult-1",
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "am_portal",
  },
  {
    event_type: "client_activated",
    occurred_at: "2026-06-04T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: "seeker-1",
    consultation_record_id: null,
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "billing",
  },
  {
    event_type: "application_submitted",
    occurred_at: "2026-06-05T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: "seeker-1",
    consultation_record_id: null,
    application_run_id: "run-1",
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "application_runner",
  },
  {
    event_type: "offer_verified",
    occurred_at: "2026-06-06T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: "seeker-1",
    consultation_record_id: null,
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: "offer-1",
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "finance",
  },
  {
    event_type: "placement_confirmed",
    occurred_at: "2026-06-07T10:00:00.000Z",
    lead_submission_id: "lead-1",
    job_seeker_id: "seeker-1",
    consultation_record_id: null,
    application_run_id: null,
    interview_id: null,
    accepted_offer_record_id: null,
    owner_account_manager_id_snapshot: "am-1",
    source_channel: "finance",
  },
];

describe("outcome analytics helpers", () => {
  it("builds funnel counts from distinct outcome anchors", () => {
    expect(buildOutcomeFunnelCounts(FIXTURE_EVENTS)).toEqual({
      leads: 1,
      consultationsBooked: 1,
      consultationsCompleted: 1,
      paymentsConfirmed: 0,
      clientsActivated: 1,
      applicationsSubmitted: 1,
      interviewOutcomes: 0,
      offersVerified: 1,
      placementsConfirmed: 1,
    });
  });

  it("groups channel activity by source channel", () => {
    const rows = buildOutcomeChannelActivity(FIXTURE_EVENTS);
    expect(rows.find((row) => row.channel === "am_portal")).toMatchObject({
      totalEvents: 2,
      consultations: 2,
    });
    expect(rows.find((row) => row.channel === "finance")).toMatchObject({
      totalEvents: 2,
      offers: 1,
      placements: 1,
    });
  });

  it("rolls AM performance from immutable owner snapshots", () => {
    const managers: OutcomeAccountManagerOption[] = [
      {
        id: "am-1",
        name: "Alex Morgan",
        email: "alex@example.com",
        role: "am",
      },
    ];

    expect(buildOutcomeAmPerformance(FIXTURE_EVENTS, managers)).toEqual([
      {
        accountManagerId: "am-1",
        name: "Alex Morgan",
        email: "alex@example.com",
        role: "am",
        leads: 1,
        consultationsCompleted: 1,
        clientsActivated: 1,
        applicationsSubmitted: 1,
        interviewOutcomes: 0,
        offersVerified: 1,
        placementsConfirmed: 1,
      },
    ]);
  });
});
