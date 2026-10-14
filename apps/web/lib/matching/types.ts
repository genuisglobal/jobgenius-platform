/**
 * Types for the intelligent job matching system
 */

export interface LocationPreference {
  work_type: "remote" | "hybrid" | "onsite";
  locations: string[];
}

export interface JobSeekerProfile {
  id: string;
  // Basic info
  location: string | null;
  seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  work_type: string | null; // remote, hybrid, on-site
  target_titles: string[];
  skills: string[];
  resume_text: string | null;
  match_threshold: number | null;

  // Enhanced preferences (from migration 023)
  preferred_industries: string[];
  preferred_company_sizes: string[]; // startup, mid-size, enterprise
  exclude_keywords: string[];
  years_experience: number | null;
  preferred_locations: string[];
  open_to_relocation: boolean;
  requires_visa_sponsorship: boolean;
  location_preferences: LocationPreference[];
}

export interface JobPost {
  id: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  description_text: string | null;

  // Structured data (from migration 023)
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  work_type: string | null;
  years_experience_min: number | null;
  years_experience_max: number | null;
  required_skills: string[];
  preferred_skills: string[];
  industry: string | null;
  company_size: string | null;
  offers_visa_sponsorship: boolean | null;
  employment_type: string | null;
  parsed_at: string | null;
}

export interface ComponentScore {
  score: number;
  max: number;
  details: Record<string, unknown>;
}

export interface MatchScoreBreakdown {
  skills: ComponentScore & {
    details: {
      matched_required: string[];
      matched_preferred: string[];
      missing_required: string[];
      coverage_pct: number;
    };
  };
  title: ComponentScore & {
    details: {
      matched_titles: string[];
      partial_matches: string[];
    };
  };
  experience: ComponentScore & {
    details: {
      seeker_years: number | null;
      job_min: number | null;
      job_max: number | null;
      match_type: "exact" | "close" | "over" | "under" | "unknown";
    };
  };
  salary: ComponentScore & {
    details: {
      seeker_min: number | null;
      seeker_max: number | null;
      job_min: number | null;
      job_max: number | null;
      overlap_pct: number;
      match_type: "full" | "partial" | "none" | "unknown";
    };
  };
  location: ComponentScore & {
    details: {
      seeker_location: string | null;
      seeker_work_type: string | null;
      job_location: string | null;
      job_work_type: string | null;
      match_type: "exact" | "region" | "remote" | "relocation" | "mismatch";
    };
  };
  company_fit: ComponentScore & {
    details: {
      industry_match: boolean;
      size_match: boolean;
      seeker_industries: string[];
      job_industry: string | null;
    };
  };
  penalties: ComponentScore & {
    details: {
      reasons: string[];
      excluded_keywords_found: string[];
      visa_mismatch: boolean;
    };
  };
}

export type MatchConfidence = "high" | "medium" | "low";
export type MatchRecommendation =
  | "strong_match"
  | "good_match"
  | "marginal"
  | "poor_fit";

export interface MatchResult {
  score: number;
  confidence: MatchConfidence;
  recommendation: MatchRecommendation;
  component_scores: MatchScoreBreakdown;
  // Legacy compatibility
  reasons: {
    matched_skills: string[];
    missing_skills: string[];
    title_hits: string[];
    /** Hard-disqualifier reasons; empty when the job is not disqualified. */
    disqualifiers: string[];
  };
}

export interface ScoringWeights {
  skills: number;
  title: number;
  experience: number;
  salary: number;
  location: number;
  company_fit: number;
  max_penalty: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  skills: 35,
  title: 20,
  experience: 10,
  salary: 10,
  location: 15,
  company_fit: 10,
  max_penalty: 15,
};
