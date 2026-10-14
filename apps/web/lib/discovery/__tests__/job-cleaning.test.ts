import { describe, expect, it } from "vitest";
import {
  areLikelyMirroredDiscoveredJobs,
  buildDiscoveredJobFingerprintKey,
  cleanDiscoveredJobRecord,
  cleanDiscoveryDescriptionText,
  cleanDiscoveryLocation,
  cleanDiscoverySalary,
  cleanDiscoveryTitle,
} from "@/lib/discovery/job-cleaning";
import { computeDiscoveredJobContentHash } from "@/lib/discovery/content-hash";

describe("job-cleaning", () => {
  it("cleans labels and whitespace from titles", () => {
    expect(cleanDiscoveryTitle("  Job Title: Senior Backend Engineer  ")).toBe(
      "Senior Backend Engineer"
    );
  });

  it("canonicalizes common remote locations", () => {
    expect(cleanDiscoveryLocation("remote - united states")).toBe(
      "Remote, United States"
    );
    expect(cleanDiscoveryLocation("wfh")).toBe("Remote");
  });

  it("cleans salary labels without losing the amount", () => {
    expect(cleanDiscoverySalary("Salary: USD 120k - 150k per annum")).toBe(
      "USD 120k - 150k annual"
    );
  });

  it("removes low-signal boilerplate from descriptions", () => {
    const cleaned = cleanDiscoveryDescriptionText(`
      Build APIs for our platform.
      Apply now
      All qualified applicants will receive consideration for employment.
      Work closely with product and design.
      Build APIs for our platform.
    `);

    expect(cleaned).toContain("Build APIs for our platform.");
    expect(cleaned).toContain("Work closely with product and design.");
    expect(cleaned).not.toContain("Apply now");
    expect(cleaned).not.toContain("qualified applicants");
  });

  it("builds a stable fallback fingerprint key", () => {
    const keyA = buildDiscoveredJobFingerprintKey({
      title: "Job Title: Backend Engineer",
      company: "Acme, Inc.",
      location: "remote - united states",
    });
    const keyB = buildDiscoveredJobFingerprintKey({
      title: "Backend Engineer",
      company: "Acme, Inc.",
      location: "Remote, United States",
    });

    expect(keyA).toBe(keyB);
  });

  it("produces stable content hashes despite low-signal footer changes", () => {
    const hashA = computeDiscoveredJobContentHash({
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote, United States",
      description_text: `
        Build APIs and internal services.
        Apply now
        Equal Opportunity Employer
      `,
    });

    const hashB = computeDiscoveredJobContentHash({
      title: "Job Title: Backend Engineer",
      company: "Acme",
      location: "remote - united states",
      description_text: `
        Build APIs and internal services.
        Share this job
        All qualified applicants will receive consideration for employment.
      `,
    });

    expect(hashA).toBe(hashB);
  });

  it("produces stable content hashes across salary formatting variants", () => {
    const hashA = computeDiscoveredJobContentHash({
      title: "Backend Engineer",
      company: "Acme",
      location: "Remote, United States",
      salary: "Salary: USD 120k - 150k per annum",
      description_text: "Build APIs and internal services.",
    });

    const hashB = computeDiscoveredJobContentHash({
      title: "Backend Engineer",
      company: "Acme",
      location: "remote - united states",
      salary: "USD 120k - 150k annual",
      description_text: "Build APIs and internal services.",
    });

    expect(hashA).toBe(hashB);
  });

  it("cleans discovered job records consistently", () => {
    const cleaned = cleanDiscoveredJobRecord({
      external_id: "  abc-123  ",
      source_name: "linkedin",
      url: " https://example.com/jobs/123 ",
      title: "Position: Data Engineer",
      company: "  Example Corp  ",
      location: " remote ",
      salary: " $120k ",
      posted_at: " 2026-06-01 ",
      description_text: "Build pipelines.\nApply now",
      description_html: " <p>Build pipelines.</p> ",
    });

    expect(cleaned.external_id).toBe("abc-123");
    expect(cleaned.title).toBe("Data Engineer");
    expect(cleaned.location).toBe("Remote");
    expect(cleaned.description_text).toBe("Build pipelines.");
  });

  it("detects mirrored duplicates when descriptions are nearly the same", () => {
    expect(
      areLikelyMirroredDiscoveredJobs(
        {
          title: "Senior Backend Engineer",
          company: "Acme",
          location: "remote - united states",
          posted_at: "2026-06-01",
          description_text: `
            Build APIs and internal services with Node.js and PostgreSQL.
            Work closely with product, data, and platform teams.
            Apply now.
          `,
        },
        {
          title: "Job Title: Senior Backend Engineer",
          company: "Acme",
          location: "Remote, United States",
          posted_at: "2026-06-01",
          description_text: `
            Build APIs and internal services with Node.js and PostgreSQL.
            Work closely with product, data, and platform teams.
            Equal Opportunity Employer.
          `,
        }
      )
    ).toBe(true);
  });

  it("does not merge distinct openings with the same title and location", () => {
    expect(
      areLikelyMirroredDiscoveredJobs(
        {
          title: "Backend Engineer",
          company: "Acme",
          location: "Remote",
          posted_at: "2026-06-01",
          description_text: "Own billing systems, invoice pipelines, and payment reconciliation.",
        },
        {
          title: "Backend Engineer",
          company: "Acme",
          location: "Remote",
          posted_at: "2026-06-01",
          description_text: "Build recruiting automation, matching systems, and resume processing APIs.",
        }
      )
    ).toBe(false);
  });
});
