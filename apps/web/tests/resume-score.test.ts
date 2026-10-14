import { describe, it, expect } from "vitest";
import { scoreResumeSkillCoverage } from "@/lib/resume-score";

describe("scoreResumeSkillCoverage", () => {
  it("credits literal mentions, hierarchy matches, and flags real gaps", () => {
    const r = scoreResumeSkillCoverage({
      resumeText: "Built web apps with React and Node. Wrote SQL queries daily.",
      resumeSkills: ["React", "Node.js", "SQL"],
      requiredSkills: ["JavaScript", "React", "Kafka", "SQL"],
      preferredSkills: ["TypeScript", "Terraform"],
    });

    expect(r.requiredCovered).toContain("React"); // literal
    expect(r.requiredCovered).toContain("SQL"); // literal
    // React implies JavaScript via the skill graph → covered without a literal mention.
    expect(r.requiredCovered).toContain("JavaScript");
    expect(r.requiredMissing).toContain("Kafka"); // genuinely absent
    expect(r.coveragePct).toBe(75); // 3 of 4 required
    expect(r.preferredMissing).toContain("Terraform");
  });

  it("returns 100% when there is nothing to match against", () => {
    const r = scoreResumeSkillCoverage({ resumeText: "anything", requiredSkills: [], preferredSkills: [] });
    expect(r.coveragePct).toBe(100);
  });

  it("shows the before→after lift that tailoring should produce", () => {
    const before = scoreResumeSkillCoverage({
      resumeText: "Worked on backend services for a logistics company.",
      resumeSkills: [],
      requiredSkills: ["Python", "Docker"],
    });
    const after = scoreResumeSkillCoverage({
      resumeText: "Built backend services in Python, containerized with Docker.",
      resumeSkills: ["Python", "Docker"],
      requiredSkills: ["Python", "Docker"],
    });
    expect(before.coveragePct).toBeLessThan(after.coveragePct);
    expect(after.coveragePct).toBe(100);
  });
});
