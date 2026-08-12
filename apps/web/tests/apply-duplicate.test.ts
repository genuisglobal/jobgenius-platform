import { describe, it, expect } from "vitest";
import {
  normalizeCompanyName,
  normalizeJobTitle,
  jobIdentityKey,
  findDuplicateInRuns,
  type RunForDupCheck,
} from "@/lib/apply/duplicate-check";

describe("normalizeCompanyName", () => {
  it("merges punctuation and legal-suffix variants", () => {
    expect(normalizeCompanyName("Acme, Inc.")).toBe("acme");
    expect(normalizeCompanyName("Acme Inc")).toBe("acme");
    expect(normalizeCompanyName("ACME")).toBe("acme");
    expect(normalizeCompanyName("Acme Corporation")).toBe("acme");
    expect(normalizeCompanyName("Stripe, Ltd.")).toBe("stripe");
  });

  it("strips stacked suffixes from the end only", () => {
    expect(normalizeCompanyName("Initech Holdings Co., Ltd.")).toBe(
      "initech holdings"
    );
    // "Co" at the START is part of the name, not a suffix.
    expect(normalizeCompanyName("Co Robotics")).toBe("co robotics");
    // Never strip the whole name away.
    expect(normalizeCompanyName("Inc")).toBe("inc");
  });

  it("normalizes ampersands and keeps distinct names distinct", () => {
    expect(normalizeCompanyName("Johnson & Johnson")).toBe(
      "johnson and johnson"
    );
    expect(normalizeCompanyName("Google")).not.toBe(
      normalizeCompanyName("Googol")
    );
  });
});

describe("normalizeJobTitle", () => {
  it("merges seniority-abbreviation and remote-qualifier variants", () => {
    const a = normalizeJobTitle("Sr. Software Engineer (Remote)");
    const b = normalizeJobTitle("Senior Software Engineer");
    const c = normalizeJobTitle("Senior Software Engineer - Remote");
    expect(a).toBe("senior software engineer");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("drops requisition ids and bracketed qualifiers", () => {
    expect(normalizeJobTitle("Frontend Developer #4521")).toBe(
      "frontend developer"
    );
    expect(normalizeJobTitle("Frontend Developer [Contract] Req: AB-99")).toBe(
      "frontend developer"
    );
  });

  it("keeps level markers — Engineer II and III are different jobs", () => {
    expect(normalizeJobTitle("Software Engineer II")).not.toBe(
      normalizeJobTitle("Software Engineer III")
    );
    expect(normalizeJobTitle("Software Engineer II")).toBe(
      "software engineer ii"
    );
  });

  it("expands common role abbreviations", () => {
    expect(normalizeJobTitle("Jr Data Analyst")).toBe("junior data analyst");
  });
});

describe("jobIdentityKey", () => {
  it("returns null on partial information (never guess a duplicate)", () => {
    expect(jobIdentityKey("", "Software Engineer")).toBeNull();
    expect(jobIdentityKey("Acme", "")).toBeNull();
    expect(jobIdentityKey(null, null)).toBeNull();
    expect(jobIdentityKey("(((", "Engineer")).toBeNull(); // normalizes to empty
  });

  it("is stable across variants", () => {
    expect(jobIdentityKey("Acme, Inc.", "Sr. Software Engineer (Remote)")).toBe(
      jobIdentityKey("ACME", "Senior Software Engineer")
    );
  });
});

describe("findDuplicateInRuns", () => {
  const prior: RunForDupCheck[] = [
    {
      id: "run-1",
      job_post_id: "post-1",
      status: "COMPLETED",
      company: "Acme, Inc.",
      title: "Sr. Software Engineer (Remote)",
    },
    {
      id: "run-2",
      job_post_id: "post-2",
      status: "RUNNING",
      company: "Globex LLC",
      title: "Data Analyst",
    },
  ];

  it("flags a repost of an already-applied job under a new job_post_id", () => {
    const match = findDuplicateInRuns(
      {
        jobPostId: "post-99",
        company: "ACME",
        title: "Senior Software Engineer",
      },
      prior
    );
    expect(match?.id).toBe("run-1");
  });

  it("ignores the run's own job_post_id (exact case handled elsewhere)", () => {
    const match = findDuplicateInRuns(
      {
        jobPostId: "post-1",
        company: "Acme, Inc.",
        title: "Sr. Software Engineer (Remote)",
      },
      prior
    );
    expect(match).toBeNull();
  });

  it("does not match a different role at the same company", () => {
    const match = findDuplicateInRuns(
      { jobPostId: "post-99", company: "Acme Inc", title: "Product Manager" },
      prior
    );
    expect(match).toBeNull();
  });

  it("returns null when target identity is incomplete", () => {
    const match = findDuplicateInRuns(
      { jobPostId: "post-99", company: null, title: "Data Analyst" },
      prior
    );
    expect(match).toBeNull();
  });
});
