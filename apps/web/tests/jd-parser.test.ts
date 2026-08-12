import { describe, it, expect } from "vitest";
import { mergeJdParse, parseJobPostSmart } from "@/lib/matching/jd-parser";
import type { ParsedJobData } from "@/lib/matching";

function base(overrides: Partial<ParsedJobData> = {}): ParsedJobData {
  return {
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
    offers_visa_sponsorship: null,
    employment_type: null,
    ...overrides,
  };
}

describe("mergeJdParse", () => {
  it("null LLM → regex passthrough", () => {
    const b = base({ required_skills: ["python"], seniority_level: "mid" });
    const merged = mergeJdParse(b, null);
    expect(merged.parse_source).toBe("regex");
    expect(merged.required_skills).toEqual(["python"]);
    expect(merged.seniority_level).toBe("mid");
    expect(merged.responsibilities).toBeNull();
    expect(merged.screening_questions).toBeNull();
  });

  it("the core win: non-tech role gets skills the regex parser can't see", () => {
    // Regex COMMON_SKILLS is tech-only, so a nursing JD yields no skills.
    const b = base({ required_skills: [], preferred_skills: [] });
    const merged = mergeJdParse(b, {
      required_skills: ["Patient assessment", "IV therapy", "BLS certification"],
      preferred_skills: ["Pediatric care"],
    });
    expect(merged.parse_source).toBe("hybrid");
    expect(merged.required_skills).toContain("IV therapy");
    expect(merged.required_skills).toContain("BLS certification");
    expect(merged.preferred_skills).toContain("Pediatric care");
  });

  it("skills: LLM leads, unioned with regex, case-insensitively de-duped", () => {
    const b = base({ required_skills: ["Python", "SQL"] });
    const merged = mergeJdParse(b, { required_skills: ["Django", "python"] });
    // LLM order first, regex extras appended, no dup of python/Python.
    expect(merged.required_skills).toEqual(["Django", "python", "SQL"]);
  });

  it("numeric fields keep the precise regex value, fill gaps from LLM", () => {
    const b = base({ salary_min: 120000, salary_max: null });
    const merged = mergeJdParse(b, { salary_min: 90000, salary_max: 150000 });
    expect(merged.salary_min).toBe(120000); // regex wins when present
    expect(merged.salary_max).toBe(150000); // LLM fills the gap
  });

  it("categorical fields prefer the LLM, fall back to regex", () => {
    const b = base({ seniority_level: "mid", work_type: "on-site" });
    const merged = mergeJdParse(b, { seniority_level: "senior" });
    expect(merged.seniority_level).toBe("senior"); // LLM preferred
    expect(merged.work_type).toBe("on-site"); // regex fallback when LLM absent
  });

  it("normalizes screening questions and coerces booleans", () => {
    const merged = mergeJdParse(base(), {
      offers_visa_sponsorship: "no",
      screening_questions: [
        { question: "Are you authorized to work in the US?", type: "boolean" },
        { question: "Notice period?", type: "weird", options: ["2 weeks", "1 month"] },
        { question: "" }, // dropped — no question text
      ],
    });
    expect(merged.offers_visa_sponsorship).toBe(false);
    expect(merged.screening_questions).toHaveLength(2);
    expect(merged.screening_questions?.[1].type).toBe("text"); // unknown type coerced
    expect(merged.screening_questions?.[1].options).toEqual(["2 weeks", "1 month"]);
  });
});

describe("parseJobPostSmart", () => {
  it("falls back to regex-only (parse_source 'regex') when OpenAI is unconfigured", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await parseJobPostSmart(
        "Senior Software Engineer",
        "Acme",
        "Remote",
        "We need 5+ years with Python and React. Required: Python. Nice to have: Docker."
      );
      expect(result.parse_source).toBe("regex");
      expect(result.required_skills).toContain("python");
      expect(result.responsibilities).toBeNull();
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});
