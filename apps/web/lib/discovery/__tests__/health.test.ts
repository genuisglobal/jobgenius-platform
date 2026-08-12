import { describe, expect, it } from "vitest";
import {
  buildDiscoveryHealthSnapshot,
  buildDiscoverySourceDrilldown,
} from "@/lib/discovery/health";

describe("discovery health", () => {
  it("flags poor source health for repeated failures and zero-yield runs", () => {
    const snapshot = buildDiscoveryHealthSnapshot(
      [
        {
          id: "run-1",
          search_id: "search-1",
          source_name: "linkedin",
          status: "FAILED",
          jobs_found: 0,
          jobs_new: 0,
          jobs_updated: 0,
          pages_scraped: 0,
          error_message: "Blocked",
          metadata: {},
          started_at: "2026-06-10T12:00:00Z",
          completed_at: "2026-06-10T12:01:00Z",
          created_at: "2026-06-10T12:00:00Z",
          search_name: "Backend Engineer",
          location: "United States",
        },
        {
          id: "run-2",
          search_id: "search-1",
          source_name: "linkedin",
          status: "COMPLETED",
          jobs_found: 0,
          jobs_new: 0,
          jobs_updated: 0,
          pages_scraped: 4,
          error_message: null,
          metadata: {
            stop_reason: "zero_yield_limit",
            description_fetch_attempted: 8,
            description_fetch_succeeded: 2,
          },
          started_at: "2026-06-11T12:00:00Z",
          completed_at: "2026-06-11T12:05:00Z",
          created_at: "2026-06-11T12:00:00Z",
          search_name: "Backend Engineer",
          location: "United States",
        },
        {
          id: "run-3",
          search_id: "search-1",
          source_name: "linkedin",
          status: "COMPLETED",
          jobs_found: 0,
          jobs_new: 0,
          jobs_updated: 0,
          pages_scraped: 5,
          error_message: null,
          metadata: {
            stop_reason: "zero_yield_limit",
            description_fetch_attempted: 10,
            description_fetch_succeeded: 3,
          },
          started_at: "2026-06-12T12:00:00Z",
          completed_at: "2026-06-12T12:05:00Z",
          created_at: "2026-06-12T12:00:00Z",
          search_name: "Backend Engineer",
          location: "United States",
        },
      ],
      [
        {
          id: "search-1",
          search_name: "Backend Engineer",
          source_name: "linkedin",
          location: "United States",
          enabled: true,
          run_frequency_hours: 24,
          last_run_at: "2026-06-12T12:05:00Z",
          last_job_count: 0,
        },
      ],
      new Date("2026-06-15T12:00:00Z")
    );

    expect(snapshot.sourceHealth[0]?.health).toBe("poor");
    expect(snapshot.sourceHealth[0]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "zero_yield_stop" }),
        expect.objectContaining({ kind: "low_description_capture" }),
      ])
    );
    expect(snapshot.sourceHealth[0]?.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "stop_reason",
          value: "Zero Yield Limit (2)",
        }),
      ])
    );
    expect(snapshot.searchAlerts.some((alert) => alert.kind === "zero_yield")).toBe(true);
    expect(snapshot.recentFailures).toHaveLength(1);
    expect(snapshot.recentFailures[0]?.diagnosticKind).toBe("blocked_or_auth");
  });

  it("flags overdue searches even without a recent run", () => {
    const snapshot = buildDiscoveryHealthSnapshot(
      [],
      [
        {
          id: "search-2",
          search_name: "Data Analyst",
          source_name: "indeed",
          location: "Remote",
          enabled: true,
          run_frequency_hours: 12,
          last_run_at: null,
          last_job_count: null,
        },
      ],
      new Date("2026-06-15T12:00:00Z")
    );

    expect(snapshot.searchAlerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          searchId: "search-2",
          kind: "overdue",
        }),
      ])
    );
  });

  it("classifies non-scraper fetch failures separately", () => {
    const snapshot = buildDiscoveryHealthSnapshot(
      [
        {
          id: "run-4",
          search_id: "search-3",
          source_name: "workday",
          status: "FAILED",
          jobs_found: 0,
          jobs_new: 0,
          jobs_updated: 0,
          pages_scraped: 0,
          error_message: "Upstream API returned 500",
          metadata: {
            source_type: "feed",
            failure_stage: "fetch",
          },
          started_at: "2026-06-14T12:00:00Z",
          completed_at: "2026-06-14T12:01:00Z",
          created_at: "2026-06-14T12:00:00Z",
          search_name: "Platform Engineer",
          location: "Remote",
        },
      ],
      [
        {
          id: "search-3",
          search_name: "Platform Engineer",
          source_name: "workday",
          location: "Remote",
          enabled: true,
          run_frequency_hours: 24,
          last_run_at: "2026-06-14T12:01:00Z",
          last_job_count: 0,
        },
      ],
      new Date("2026-06-15T12:00:00Z")
    );

    expect(snapshot.sourceHealth[0]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "adapter_fetch_failure" }),
      ])
    );
    expect(snapshot.recentFailures[0]).toEqual(
      expect.objectContaining({
        diagnosticKind: "adapter_fetch_failure",
        signalSummary: "Stage: Fetch",
      })
    );
  });

  it("builds a source drilldown with search breakdown and run evidence", () => {
    const runs = [
      {
        id: "run-10",
        search_id: "search-10",
        source_name: "linkedin",
        status: "FAILED",
        jobs_found: 0,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        error_message: "Blocked",
        metadata: {
          failure_stage: "fetch",
          source_type: "scraper",
        },
        started_at: "2026-06-14T10:00:00Z",
        completed_at: "2026-06-14T10:01:00Z",
        created_at: "2026-06-14T10:00:00Z",
        search_name: "Backend Engineer",
        location: "United States",
      },
      {
        id: "run-11",
        search_id: "search-10",
        source_name: "linkedin",
        status: "COMPLETED",
        jobs_found: 2,
        jobs_new: 1,
        jobs_updated: 1,
        pages_scraped: 3,
        error_message: null,
        metadata: {
          stop_reason: "no_more_pages",
          hidden_new_jobs: 1,
          hidden_network_payloads_seen: 4,
          hidden_network_payloads_parsed: 3,
          jobs_mirrored: 2,
        },
        started_at: "2026-06-15T10:00:00Z",
        completed_at: "2026-06-15T10:02:00Z",
        created_at: "2026-06-15T10:00:00Z",
        search_name: "Backend Engineer",
        location: "United States",
      },
    ];

    const searches = [
      {
        id: "search-10",
        search_name: "Backend Engineer",
        source_name: "linkedin",
        location: "United States",
        enabled: true,
        run_frequency_hours: 24,
        last_run_at: "2026-06-15T10:02:00Z",
        last_job_count: 2,
      },
    ];

    const drilldown = buildDiscoverySourceDrilldown("linkedin", runs, searches, {
      source_type: "scraper",
      enabled: true,
    });

    expect(drilldown.searches[0]).toEqual(
      expect.objectContaining({
        searchName: "Backend Engineer",
        totalRuns: 2,
        failedRuns: 1,
        avgJobsFound: 2,
      })
    );
    expect(drilldown.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mirror_collapse",
          value: "2",
        }),
      ])
    );
    expect(drilldown.recentRuns[0]).toEqual(
      expect.objectContaining({
        runId: "run-11",
        mirroredJobs: 2,
      })
    );
  });
});
