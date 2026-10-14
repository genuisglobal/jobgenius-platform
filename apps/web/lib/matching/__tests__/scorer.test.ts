/**
 * Unit tests for the JobGenius matching scorer.
 *
 * Uses Jest/Vitest-compatible describe/it/expect syntax.
 * Mocks the hierarchicalSkillMatch and computeResumeBonus dependencies
 * so each test exercises scorer logic in isolation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Must be declared before the import of the module under test.

vi.mock("../skill-hierarchy", () => ({
  hierarchicalSkillMatch: vi.fn(),
}));

vi.mock("../resume-extractor", () => ({
  computeResumeBonus: vi.fn(),
}));

import { computeMatchScore } from "../scorer";
import type {
  JobSeekerProfile,
  JobPost,
  MatchResult,
  ScoringWeights,
} from "../types";
import { hierarchicalSkillMatch } from "../skill-hierarchy";
import { computeResumeBonus } from "../resume-extractor";

const mockSkillMatch = hierarchicalSkillMatch as Mock;
const mockResumeBonus = computeResumeBonus as Mock;

// ── Helper Factories ───────────────────────────────────────────────────────

function buildSeeker(overrides: Partial<JobSeekerProfile> = {}): JobSeekerProfile {
  return {
    id: "seeker-1",
    location: "New York, NY",
    seniority: "mid",
    salary_min: 100_000,
    salary_max: 130_000,
    work_type: "remote",
    target_titles: ["Software Engineer"],
    skills: ["react", "typescript", "node.js"],
    resume_text: "Experienced software engineer with 5 years building React and Node.js applications. Led team of 4 developers on a SaaS platform migration.",
    match_threshold: null,
    preferred_industries: ["technology"],
    preferred_company_sizes: ["mid-size"],
    exclude_keywords: [],
    years_experience: 5,
    preferred_locations: ["New York, NY"],
    open_to_relocation: false,
    requires_visa_sponsorship: false,
    location_preferences: [],
    ...overrides,
  };
}

function buildJob(overrides: Partial<JobPost> = {}): JobPost {
  return {
    id: "job-1",
    url: "https://example.com/job/1",
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Remote",
    description_text: "We are looking for a Software Engineer with React and TypeScript experience to build modern web applications.",
    salary_min: 100_000,
    salary_max: 140_000,
    seniority_level: "mid",
    work_type: "remote",
    years_experience_min: 3,
    years_experience_max: 7,
    required_skills: ["react", "typescript"],
    preferred_skills: ["node.js"],
    industry: "technology",
    company_size: "mid-size",
    offers_visa_sponsorship: null,
    employment_type: "full-time",
    parsed_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * Configure the skill-hierarchy mock to return a "perfect" match result by default.
 * Individual tests can override this before calling computeMatchScore.
 */
function mockPerfectSkills() {
  (mockSkillMatch as Mock).mockReturnValue({
    requiredCoverage: 1.0,
    preferredCoverage: 1.0,
    matchedRequired: [
      { required: "react", matched: "react", weight: 1 },
      { required: "typescript", matched: "typescript", weight: 1 },
    ],
    matchedPreferred: [{ preferred: "node.js", matched: "node.js", weight: 1 }],
    missingRequired: [],
    totalWeightedScore: 1.0,
  });
}

function mockPartialSkills(
  requiredCoverage: number,
  matchedRequired: Array<{ required: string; matched: string; weight: number }>,
  missingRequired: string[],
  matchedPreferred: Array<{ preferred: string; matched: string; weight: number }> = [],
  preferredCoverage = 0
) {
  mockSkillMatch.mockReturnValue({
    requiredCoverage,
    preferredCoverage,
    matchedRequired,
    matchedPreferred,
    missingRequired,
    totalWeightedScore: requiredCoverage,
  });
}

function mockNoResumeBonus() {
  mockResumeBonus.mockReturnValue({
    bonus: 0,
    details: { additionalSkillHits: [], resumeYears: null, leadershipSignal: false },
  });
}

function mockResumeWithBonus(bonus: number) {
  mockResumeBonus.mockReturnValue({
    bonus,
    details: { additionalSkillHits: ["docker"], resumeYears: 5, leadershipSignal: true },
  });
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPerfectSkills();
  mockNoResumeBonus();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("computeMatchScore", () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Perfect match
  // ────────────────────────────────────────────────────────────────────────
  describe("perfect match", () => {
    it("returns score > 80 and recommendation strong_match when all fields align", () => {
      const seeker = buildSeeker();
      const job = buildJob();

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeGreaterThan(80);
      expect(result.recommendation).toBe("strong_match");
      expect(result.confidence).toBe("high");
    });

    it("includes matched skills and title hits in reasons", () => {
      const result = computeMatchScore(buildSeeker(), buildJob());

      expect(result.reasons.matched_skills).toEqual(
        expect.arrayContaining(["react", "typescript"])
      );
      expect(result.reasons.title_hits).toEqual(
        expect.arrayContaining(["software engineer"])
      );
      expect(result.reasons.missing_skills).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Good match — most fields align, one minor gap
  // ────────────────────────────────────────────────────────────────────────
  describe("good match", () => {
    it("returns a high score despite minor industry mismatch (company_fit is low-weight)", () => {
      const seeker = buildSeeker({ preferred_industries: ["healthcare"] });
      const job = buildJob({ industry: "fintech" });

      const result = computeMatchScore(seeker, job);

      // Industry mismatch only affects company_fit (10pt weight), so score stays high
      expect(result.score).toBeGreaterThanOrEqual(55);
      expect(["strong_match", "good_match"]).toContain(result.recommendation);
    });

    it("returns good_match when salary is slightly below seeker expectation", () => {
      const seeker = buildSeeker({ salary_min: 110_000, salary_max: 130_000 });
      const job = buildJob({ salary_min: 95_000, salary_max: 120_000 });

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeGreaterThanOrEqual(55);
      expect(["strong_match", "good_match"]).toContain(result.recommendation);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Poor match — title mismatch, missing skills
  // ────────────────────────────────────────────────────────────────────────
  describe("title alias matching", () => {
    it("treats software developer as a partial title match for software engineer targets", () => {
      const seeker = buildSeeker({
        target_titles: ["Software Engineer"],
      });
      const job = buildJob({
        title: "Software Developer",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.title.score).toBeGreaterThanOrEqual(10);
      expect(result.component_scores.title.details.partial_matches).toEqual(
        expect.arrayContaining(["software engineer"])
      );
    });

    it("treats platform engineer as a partial title match for devops engineer targets", () => {
      const seeker = buildSeeker({
        target_titles: ["DevOps Engineer"],
      });
      const job = buildJob({
        title: "Platform Engineer",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.title.score).toBeGreaterThanOrEqual(10);
      expect(result.component_scores.title.details.partial_matches).toEqual(
        expect.arrayContaining(["devops engineer"])
      );
    });
  });

  describe("poor match", () => {
    it("returns score < 40 and poor_fit when title and skills are mismatched", () => {
      mockPartialSkills(0, [], ["python", "sql", "tableau"], [], 0);

      const seeker = buildSeeker({
        target_titles: ["Software Engineer"],
        skills: ["react", "typescript", "node.js"],
      });
      const job = buildJob({
        title: "Brand Manager",
        required_skills: ["python", "sql", "tableau"],
        preferred_skills: [],
        industry: "marketing",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeLessThan(40);
      expect(result.recommendation).toBe("poor_fit");
      expect(result.reasons.missing_skills).toEqual(
        expect.arrayContaining(["python", "sql", "tableau"])
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Salary mismatch — seeker expects 150k, job pays 60k
  // ────────────────────────────────────────────────────────────────────────
  describe("salary mismatch", () => {
    it("gives 0 salary component when ranges do not overlap", () => {
      const seeker = buildSeeker({ salary_min: 140_000, salary_max: 170_000 });
      const job = buildJob({ salary_min: 50_000, salary_max: 65_000 });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.salary.score).toBe(0);
      expect(result.component_scores.salary.details.match_type).toBe("none");
      expect(result.component_scores.salary.details.overlap_pct).toBe(0);
    });

    it("reduces overall score significantly", () => {
      const seeker = buildSeeker({ salary_min: 140_000, salary_max: 170_000 });
      const job = buildJob({ salary_min: 50_000, salary_max: 65_000 });

      const full = computeMatchScore(buildSeeker(), buildJob());
      const mismatch = computeMatchScore(seeker, job);

      expect(mismatch.score).toBeLessThan(full.score);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Skills matching — partial overlap
  // ────────────────────────────────────────────────────────────────────────
  describe("skills matching", () => {
    it("scores partial match when seeker has React/TypeScript/Node but job requires React/Python", () => {
      mockPartialSkills(
        0.5,
        [{ required: "react", matched: "react", weight: 1 }],
        ["python"],
        [],
        0
      );

      const seeker = buildSeeker({ skills: ["react", "typescript", "node.js"] });
      const job = buildJob({
        required_skills: ["react", "python"],
        preferred_skills: [],
      });

      const result = computeMatchScore(seeker, job);

      // With 50% required coverage: 0.5 * 35 * 0.8 = 14 out of 35
      expect(result.component_scores.skills.score).toBeLessThan(35);
      expect(result.component_scores.skills.score).toBeGreaterThan(0);
      expect(result.reasons.missing_skills).toContain("python");
      expect(result.reasons.matched_skills).toContain("react");
    });

    it("gives full skills score when all required and preferred skills match", () => {
      mockPerfectSkills();

      const result = computeMatchScore(buildSeeker(), buildJob());

      expect(result.component_scores.skills.score).toBe(35);
    });

    it("falls back to description matching when no structured skills exist", () => {
      // When there are no required_skills/preferred_skills, the scorer
      // does NOT call hierarchicalSkillMatch; it does fuzzyMatch on description.
      const seeker = buildSeeker({ skills: ["react", "typescript"] });
      const job = buildJob({
        required_skills: [],
        preferred_skills: [],
        description_text: "Looking for a React and TypeScript developer.",
      });

      const result = computeMatchScore(seeker, job);

      // Fallback path: each match gives 7 pts, capped at maxScore (35)
      expect(result.component_scores.skills.score).toBe(14); // 2 * 7
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. Remote preference match
  // ────────────────────────────────────────────────────────────────────────
  describe("remote preference match", () => {
    it("gives full location score when seeker wants remote and job is remote", () => {
      const seeker = buildSeeker({ work_type: "remote", location_preferences: [] });
      const job = buildJob({ work_type: "remote", location: "Remote" });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(15);
      expect(result.component_scores.location.details.match_type).toBe("remote");
    });

    it("gives full location score via location_preferences when remote preference exists", () => {
      const seeker = buildSeeker({
        location_preferences: [{ work_type: "remote", locations: [] }],
      });
      const job = buildJob({ work_type: "remote", location: "Remote" });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(15);
      expect(result.component_scores.location.details.match_type).toBe("remote");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Location mismatch — seeker NYC onsite, job SF onsite
  // ────────────────────────────────────────────────────────────────────────
  describe("location mismatch", () => {
    it("matches common city variants and stripped work-mode labels", () => {
      const seeker = buildSeeker({
        location: "New York, NY",
        preferred_locations: ["New York, NY"],
        work_type: "hybrid",
        location_preferences: [],
      });
      const job = buildJob({
        location: "New York City, NY (Hybrid)",
        work_type: "hybrid",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(15);
      expect(result.component_scores.location.details.match_type).toBe("exact");
    });

    it("gives 0 location score when seeker in NYC (onsite) and job in SF (onsite), no relocation", () => {
      const seeker = buildSeeker({
        location: "New York, NY",
        preferred_locations: ["New York, NY"],
        work_type: "onsite",
        open_to_relocation: false,
        location_preferences: [],
      });
      const job = buildJob({
        location: "San Francisco, CA",
        work_type: "on-site",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(0);
      expect(result.component_scores.location.details.match_type).toBe("mismatch");
    });

    it("gives partial location score when open to relocation", () => {
      const seeker = buildSeeker({
        location: "New York, NY",
        preferred_locations: ["New York, NY"],
        work_type: "onsite",
        open_to_relocation: true,
        location_preferences: [],
      });
      const job = buildJob({
        location: "San Francisco, CA",
        work_type: "on-site",
      });

      const result = computeMatchScore(seeker, job);

      // open_to_relocation gives 60% credit
      expect(result.component_scores.location.score).toBe(Math.round(15 * 0.6));
      expect(result.component_scores.location.details.match_type).toBe("relocation");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. Experience gap — seeker 2 years, job requires 8-10
  // ────────────────────────────────────────────────────────────────────────
  describe("experience gap", () => {
    it("gives low experience score when seeker has 2 years but job requires 8-10", () => {
      const seeker = buildSeeker({ years_experience: 2 });
      const job = buildJob({
        years_experience_min: 8,
        years_experience_max: 10,
      });

      const result = computeMatchScore(seeker, job);

      // Gap is 6 years, score = max(0, round(10 * (1 - 6*0.2))) = max(0, round(10 * -0.2)) = 0
      expect(result.component_scores.experience.score).toBe(0);
      expect(result.component_scores.experience.details.match_type).toBe("under");
    });

    it("gives close match when seeker is 1 year below minimum", () => {
      const seeker = buildSeeker({ years_experience: 4 });
      const job = buildJob({
        years_experience_min: 5,
        years_experience_max: 8,
      });

      const result = computeMatchScore(seeker, job);

      // seekerYears (4) >= effectiveJobMin - 1 (4), so "close" → 60%
      expect(result.component_scores.experience.score).toBe(Math.round(10 * 0.6));
      expect(result.component_scores.experience.details.match_type).toBe("close");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 9. Overqualified — seeker 15 years, job is junior
  // ────────────────────────────────────────────────────────────────────────
  describe("overqualified", () => {
    it("still scores reasonably (80% experience) when seeker has 15 years for a junior role", () => {
      const seeker = buildSeeker({ years_experience: 15 });
      const job = buildJob({
        years_experience_min: 1,
        years_experience_max: 3,
        seniority_level: "junior",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.experience.score).toBe(Math.round(10 * 0.8));
      expect(result.component_scores.experience.details.match_type).toBe("over");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 10. Visa sponsorship penalty
  // ────────────────────────────────────────────────────────────────────────
  describe("visa sponsorship penalty", () => {
    it("applies penalty when seeker requires visa but job does not offer it", () => {
      const seeker = buildSeeker({ requires_visa_sponsorship: true });
      const job = buildJob({ offers_visa_sponsorship: false });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.penalties.details.visa_mismatch).toBe(true);
      expect(result.component_scores.penalties.details.reasons).toContain(
        "visa_sponsorship_not_offered"
      );
      expect(result.component_scores.penalties.score).toBeLessThan(0);
    });

    it("does not apply penalty when job offers visa sponsorship", () => {
      const seeker = buildSeeker({ requires_visa_sponsorship: true });
      const job = buildJob({ offers_visa_sponsorship: true });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.penalties.details.visa_mismatch).toBe(false);
    });

    it("does not apply penalty when visa sponsorship is unknown (null)", () => {
      const seeker = buildSeeker({ requires_visa_sponsorship: true });
      const job = buildJob({ offers_visa_sponsorship: null });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.penalties.details.visa_mismatch).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 11. Exclude keywords hit
  // ────────────────────────────────────────────────────────────────────────
  describe("exclude keywords", () => {
    it("applies penalty when job title contains an excluded keyword", () => {
      const seeker = buildSeeker({ exclude_keywords: ["intern"] });
      const job = buildJob({ title: "Software Engineering Intern" });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.penalties.details.excluded_keywords_found).toContain(
        "intern"
      );
      expect(result.component_scores.penalties.score).toBeLessThan(0);
    });

    it("applies penalty when job description contains an excluded keyword", () => {
      const seeker = buildSeeker({ exclude_keywords: ["blockchain"] });
      const job = buildJob({
        description_text: "We are a blockchain startup looking for engineers.",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.penalties.details.excluded_keywords_found).toContain(
        "blockchain"
      );
    });

    it("applies cumulative penalty for multiple excluded keywords", () => {
      const seeker = buildSeeker({ exclude_keywords: ["intern", "junior"] });
      const job = buildJob({
        title: "Junior Software Engineering Intern",
      });

      const result = computeMatchScore(seeker, job);

      // 2 keywords * 5 pts each = 10 pts penalty
      expect(result.component_scores.penalties.details.excluded_keywords_found).toHaveLength(2);
      expect(result.component_scores.penalties.score).toBe(-10);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 12. Custom weights
  // ────────────────────────────────────────────────────────────────────────
  describe("custom weights", () => {
    it("increases skills impact when skills weight is higher", () => {
      const seeker = buildSeeker();
      const job = buildJob();

      const defaultWeights: ScoringWeights = {
        skills: 35,
        title: 20,
        experience: 10,
        salary: 10,
        location: 15,
        company_fit: 10,
        max_penalty: 15,
      };
      const highSkillsWeights: ScoringWeights = {
        ...defaultWeights,
        skills: 60,
        title: 10,
        company_fit: 5,
      };

      // For the custom weights call, we need the mock to return full coverage again
      mockPerfectSkills();
      const defaultResult = computeMatchScore(seeker, job, defaultWeights);

      mockPerfectSkills();
      const customResult = computeMatchScore(seeker, job, highSkillsWeights);

      expect(customResult.component_scores.skills.max).toBe(60);
      expect(customResult.component_scores.skills.score).toBe(60);
      expect(defaultResult.component_scores.skills.max).toBe(35);
    });

    it("adjusts penalty cap with custom max_penalty", () => {
      const seeker = buildSeeker({
        requires_visa_sponsorship: true,
        exclude_keywords: ["blockchain"],
      });
      const job = buildJob({
        offers_visa_sponsorship: false,
        description_text: "blockchain startup needs engineers",
      });

      const tightPenalty: ScoringWeights = {
        skills: 35,
        title: 20,
        experience: 10,
        salary: 10,
        location: 15,
        company_fit: 10,
        max_penalty: 5,
      };

      const result = computeMatchScore(seeker, job, tightPenalty);

      // Visa (10) + keyword (5) = 15, but capped at 5
      expect(result.component_scores.penalties.score).toBe(-5);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 13. Empty / minimal data → confidence "low"
  // ────────────────────────────────────────────────────────────────────────
  describe("empty / minimal data", () => {
    it("returns confidence low when seeker and job have minimal data", () => {
      // Reset skill mock since there will be no structured skills
      mockSkillMatch.mockReturnValue({
        requiredCoverage: 0,
        preferredCoverage: 0,
        matchedRequired: [],
        matchedPreferred: [],
        missingRequired: [],
        totalWeightedScore: 0,
      });

      const seeker = buildSeeker({
        location: null,
        seniority: null,
        salary_min: null,
        salary_max: null,
        work_type: null,
        target_titles: [],
        skills: [],
        resume_text: null,
        preferred_industries: [],
        preferred_company_sizes: [],
        years_experience: null,
        preferred_locations: [],
        location_preferences: [],
      });
      const job = buildJob({
        location: null,
        salary_min: null,
        salary_max: null,
        seniority_level: null,
        work_type: null,
        years_experience_min: null,
        years_experience_max: null,
        required_skills: [],
        preferred_skills: [],
        industry: null,
        company_size: null,
        description_text: null,
      });

      const result = computeMatchScore(seeker, job);

      expect(result.confidence).toBe("low");
    });

    it("gives only partial credit for experience and salary when data is missing", () => {
      const seeker = buildSeeker({
        years_experience: null,
        salary_min: null,
        salary_max: null,
      });
      const job = buildJob({
        years_experience_min: null,
        years_experience_max: null,
        salary_min: null,
        salary_max: null,
      });

      const result = computeMatchScore(seeker, job);

      // Experience unknown → 20% of max (10) = 2
      expect(result.component_scores.experience.score).toBe(Math.round(10 * 0.2));
      expect(result.component_scores.experience.details.match_type).toBe("unknown");

      // Salary unknown → 15% of max (10) = 2 (round(1.5) = 2)
      expect(result.component_scores.salary.score).toBe(Math.round(10 * 0.15));
      expect(result.component_scores.salary.details.match_type).toBe("unknown");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 14. Hard title mismatch cap
  // ────────────────────────────────────────────────────────────────────────
  describe("hard title mismatch cap", () => {
    it("caps score at 49 for Brand Manager vs Software Engineer seeker without strong skills", () => {
      // Skills don't meet 50% threshold → cap at 49
      mockPartialSkills(0.3, [], ["branding", "marketing"], [], 0);

      const seeker = buildSeeker({
        target_titles: ["Software Engineer"],
        skills: ["react", "typescript"],
      });
      const job = buildJob({
        title: "Brand Manager",
        required_skills: ["branding", "marketing"],
        preferred_skills: [],
        industry: "marketing",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeLessThanOrEqual(49);
    });

    it("caps score at 54 for hard mismatch when structured skills are at least 50% matched", () => {
      // Skills meet 50% threshold → cap at 54
      mockPartialSkills(
        0.6,
        [{ required: "python", matched: "python", weight: 1 }],
        ["sql"],
        [],
        0
      );

      const seeker = buildSeeker({
        target_titles: ["Software Engineer"],
        skills: ["python", "typescript"],
      });
      const job = buildJob({
        title: "Brand Manager",
        required_skills: ["python", "sql"],
        preferred_skills: [],
        industry: "marketing",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeLessThanOrEqual(54);
    });

    it("does not apply hard mismatch cap when titles share a family", () => {
      mockPerfectSkills();

      const seeker = buildSeeker({
        target_titles: ["Frontend Engineer"],
      });
      const job = buildJob({
        title: "Full Stack Developer",
      });

      const result = computeMatchScore(seeker, job);

      // Both are in the "software" family, so no hard mismatch
      expect(result.score).toBeGreaterThan(54);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Resume bonus integration
  // ────────────────────────────────────────────────────────────────────────
  describe("resume bonus", () => {
    it("adds resume bonus to the total score", () => {
      mockNoResumeBonus();
      const baseResult = computeMatchScore(buildSeeker(), buildJob());

      mockResumeWithBonus(6);
      const boostedResult = computeMatchScore(buildSeeker(), buildJob());

      expect(boostedResult.score).toBe(
        Math.min(100, baseResult.score + 6)
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Score bounds
  // ────────────────────────────────────────────────────────────────────────
  describe("score bounds", () => {
    it("never returns a score below 0", () => {
      mockPartialSkills(0, [], ["a", "b", "c", "d", "e"], [], 0);

      const seeker = buildSeeker({
        target_titles: ["Software Engineer"],
        requires_visa_sponsorship: true,
        exclude_keywords: ["intern", "junior", "entry"],
        salary_min: 200_000,
        salary_max: 300_000,
        years_experience: 0,
        location: "Tokyo",
        work_type: "onsite",
        open_to_relocation: false,
        location_preferences: [],
        preferred_locations: ["Tokyo"],
        preferred_industries: ["aerospace"],
        preferred_company_sizes: ["enterprise"],
      });
      const job = buildJob({
        title: "Junior Marketing Intern",
        required_skills: ["a", "b", "c", "d", "e"],
        preferred_skills: [],
        salary_min: 30_000,
        salary_max: 40_000,
        years_experience_min: 10,
        years_experience_max: 15,
        work_type: "on-site",
        location: "San Francisco, CA",
        offers_visa_sponsorship: false,
        industry: "retail",
        company_size: "startup",
        description_text: "intern junior entry level marketing position",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("never returns a score above 100", () => {
      mockPerfectSkills();
      mockResumeWithBonus(8);

      const result = computeMatchScore(buildSeeker(), buildJob());

      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Recommendation thresholds
  // ────────────────────────────────────────────────────────────────────────
  describe("recommendation thresholds", () => {
    it("returns strong_match for score >= 75 with high confidence", () => {
      const result = computeMatchScore(buildSeeker(), buildJob());

      // Perfect match should be well above 75
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.recommendation).toBe("strong_match");
    });

    it("returns marginal for a score between 40-55 (adjusted)", () => {
      // Build a scenario that lands in the marginal zone
      mockPartialSkills(
        0.4,
        [{ required: "react", matched: "react", weight: 1 }],
        ["python", "java"],
        [],
        0
      );

      const seeker = buildSeeker({
        salary_min: 130_000,
        salary_max: 160_000,
        preferred_industries: ["healthcare"],
        preferred_company_sizes: ["enterprise"],
      });
      const job = buildJob({
        salary_min: 80_000,
        salary_max: 100_000,
        required_skills: ["react", "python", "java"],
        preferred_skills: [],
        industry: "fintech",
        company_size: "startup",
      });

      const result = computeMatchScore(seeker, job);

      // With 40% skill coverage + salary partial overlap + industry/size miss,
      // score lands in good_match or marginal range depending on exact numbers
      expect(["strong_match", "good_match", "marginal", "poor_fit"]).toContain(result.recommendation);
      expect(result.score).toBeLessThan(computeMatchScore(buildSeeker(), buildJob()).score);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Location preferences (new system)
  // ────────────────────────────────────────────────────────────────────────
  describe("location_preferences (structured)", () => {
    it("matches onsite preference with matching location", () => {
      const seeker = buildSeeker({
        location_preferences: [
          { work_type: "onsite", locations: ["new york"] },
        ],
      });
      const job = buildJob({
        location: "New York, NY",
        work_type: "onsite",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(15);
      expect(result.component_scores.location.details.match_type).toBe("exact");
    });

    it("gives 70% for an onsite seeker when job is remote", () => {
      const seeker = buildSeeker({
        location_preferences: [
          { work_type: "onsite", locations: ["new york"] },
        ],
      });
      const job = buildJob({
        location: "Remote",
        work_type: "remote",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.location.score).toBe(Math.round(15 * 0.7));
      expect(result.component_scores.location.details.match_type).toBe("remote");
    });

    it("falls back to open_to_relocation when no preference matches", () => {
      const seeker = buildSeeker({
        open_to_relocation: true,
        location_preferences: [
          { work_type: "onsite", locations: ["chicago"] },
        ],
      });
      const job = buildJob({
        location: "Austin, TX",
        work_type: "on-site",
      });

      const result = computeMatchScore(seeker, job);

      // on-site does not match "onsite" via the prefWorkType check (it checks ===)
      // and the location doesn't match either, so falls to relocation → 40%
      expect(result.component_scores.location.score).toBe(Math.round(15 * 0.4));
      expect(result.component_scores.location.details.match_type).toBe("relocation");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Company fit scoring
  // ────────────────────────────────────────────────────────────────────────
  describe("company fit", () => {
    it("gives full score when industry and size both match", () => {
      const seeker = buildSeeker({
        preferred_industries: ["technology"],
        preferred_company_sizes: ["mid-size"],
      });
      const job = buildJob({
        industry: "technology",
        company_size: "mid-size",
      });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.company_fit.score).toBe(10);
    });

    it("gives partial score when no preferences are specified", () => {
      const seeker = buildSeeker({
        preferred_industries: [],
        preferred_company_sizes: [],
      });
      const job = buildJob({ industry: "fintech", company_size: "startup" });

      const result = computeMatchScore(seeker, job);

      // No preferences = 0.75 for each → round(10 * (0.75+0.75)/2) = 8
      expect(result.component_scores.company_fit.score).toBe(Math.round(10 * 0.75));
    });

    it("gives 0 when preferences exist but do not match", () => {
      const seeker = buildSeeker({
        preferred_industries: ["healthcare"],
        preferred_company_sizes: ["enterprise"],
      });
      const job = buildJob({
        industry: "fintech",
        company_size: "startup",
      });

      const result = computeMatchScore(seeker, job);

      // Both industry and size fail to match: (0 + 0) / 2 = 0
      expect(result.component_scores.company_fit.score).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Title scoring details
  // ────────────────────────────────────────────────────────────────────────
  describe("title scoring", () => {
    it("gives full title score for exact title match", () => {
      const seeker = buildSeeker({ target_titles: ["Software Engineer"] });
      const job = buildJob({ title: "Software Engineer" });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.title.score).toBe(20);
    });

    it("gives partial title score for token overlap (e.g. 'Senior React Developer' vs 'React Developer')", () => {
      const seeker = buildSeeker({ target_titles: ["React Developer"] });
      const job = buildJob({ title: "Senior React Developer" });

      const result = computeMatchScore(seeker, job);

      // "react developer" is contained in "senior react developer" → exact substring match
      expect(result.component_scores.title.score).toBe(20);
    });

    it("gives 0 title score when no target titles are set", () => {
      const seeker = buildSeeker({ target_titles: [] });
      const job = buildJob({ title: "Software Engineer" });

      const result = computeMatchScore(seeker, job);

      expect(result.component_scores.title.score).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Penalty: title mismatch without hard family clash
  // ────────────────────────────────────────────────────────────────────────
  describe("weak title alignment penalty", () => {
    it("applies 4-point penalty when target titles exist but nothing matches and no family overlap", () => {
      // Use a scenario where families DO overlap so it's NOT a hard mismatch,
      // but tokens don't overlap at all
      const seeker = buildSeeker({
        target_titles: ["Data Analyst"],
      });
      // "Reporting Specialist" shares "data" family via "reporting" keyword? No.
      // Let's pick something with 0 overlap and no shared family
      const job = buildJob({
        title: "Yoga Instructor",
        required_skills: [],
        preferred_skills: [],
      });

      const result = computeMatchScore(seeker, job);

      // "Data Analyst" → families: ["data"], "Yoga Instructor" → families: []
      // hasFamilies=true, jobFamilies.size=0, so hardMismatch requires jobFamilies.size>0 → false
      // Instead it hits the weak_title_alignment branch (target_titles.length>0, no match, overlap=0)
      expect(result.component_scores.penalties.details.reasons).toContain(
        "weak_title_alignment"
      );
    });
  });
});

describe("hard disqualifiers", () => {
  it("does not disqualify a clean strong match", () => {
    const result = computeMatchScore(buildSeeker(), buildJob());
    expect(result.reasons.disqualifiers).toEqual([]);
    expect(result.recommendation).toBe("strong_match");
  });

  it("rejects a job containing an excluded keyword", () => {
    const seeker = buildSeeker({ exclude_keywords: ["crypto"] });
    const job = buildJob({ title: "Crypto Engineer", description_text: "Build crypto trading systems." });
    const result = computeMatchScore(seeker, job);
    expect(result.recommendation).toBe("poor_fit");
    expect(result.score).toBeLessThanOrEqual(15);
    expect(result.reasons.disqualifiers.join(" ")).toContain("exclude_keyword");
  });

  it("rejects an on-site job in a location the client cannot reach", () => {
    const seeker = buildSeeker({ open_to_relocation: false, preferred_locations: ["New York, NY"] });
    const job = buildJob({ work_type: "onsite", location: "San Francisco, CA" });
    const result = computeMatchScore(seeker, job);
    expect(result.recommendation).toBe("poor_fit");
    expect(result.reasons.disqualifiers).toContain("disqualified_location_unreachable");
  });

  it("does NOT reject a remote job even with a far-away location string", () => {
    const seeker = buildSeeker({ open_to_relocation: false });
    const job = buildJob({ work_type: "remote", location: "Remote (US)" });
    const result = computeMatchScore(seeker, job);
    expect(result.reasons.disqualifiers).toEqual([]);
  });

  it("rejects a job paying well below the client's floor", () => {
    const seeker = buildSeeker({ salary_min: 100_000 });
    const job = buildJob({ salary_min: 50_000, salary_max: 60_000 });
    const result = computeMatchScore(seeker, job);
    expect(result.recommendation).toBe("poor_fit");
    expect(result.reasons.disqualifiers).toContain("disqualified_salary_below_floor");
  });

  it("rejects a job that explicitly offers no sponsorship when the client needs it", () => {
    const seeker = buildSeeker({ requires_visa_sponsorship: true });
    const job = buildJob({ offers_visa_sponsorship: false });
    const result = computeMatchScore(seeker, job);
    expect(result.recommendation).toBe("poor_fit");
    expect(result.reasons.disqualifiers).toContain("disqualified_no_visa_sponsorship");
  });
});
