import { describe, it, expect } from "vitest";
import { lintTailoredResume } from "@/lib/resume-safety";
import type { StructuredResume } from "@/lib/resume-templates/types";

function base(): StructuredResume {
  return {
    contact: { fullName: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedinUrl: null, portfolioUrl: null },
    summary: "Backend engineer experienced with Python and Docker.",
    workExperience: [
      { title: "Engineer", company: "Acme", location: null, startDate: "2020", endDate: "Present", bullets: ["Built APIs in Python", "Containerized services with Docker"] },
    ],
    education: [],
    skills: ["Python", "Docker"],
    certifications: [],
  };
}

describe("lintTailoredResume", () => {
  it("passes a faithful tailoring (skills within the base, identity intact)", () => {
    const tailored = { ...base(), summary: "Python/Docker backend engineer." };
    const r = lintTailoredResume(base(), tailored);
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === "block")).toHaveLength(0);
  });

  it("blocks a fabricated skill not present anywhere in the base", () => {
    const tailored = { ...base(), skills: ["Python", "Docker", "Kubernetes"] };
    const r = lintTailoredResume(base(), tailored);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "fabricated_skill")).toBe(true);
  });

  it("does NOT flag a skill that appears in the base text but not the skills list", () => {
    const b = base();
    b.workExperience[0].bullets.push("Wrote SQL queries daily");
    const tailored = { ...b, skills: ["Python", "Docker", "SQL"] };
    const r = lintTailoredResume(b, tailored);
    expect(r.issues.some((i) => i.code === "fabricated_skill")).toBe(false);
  });

  it("blocks an altered candidate name", () => {
    const tailored = { ...base(), contact: { ...base().contact, fullName: "John Smith" } };
    const r = lintTailoredResume(base(), tailored);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "contact_name_changed")).toBe(true);
  });

  it("warns on keyword stuffing", () => {
    const b = base();
    const stuffed = { ...b, summary: ("Python ".repeat(10)).trim() };
    const r = lintTailoredResume(b, stuffed);
    expect(r.issues.some((i) => i.code === "keyword_stuffing")).toBe(true);
    expect(r.ok).toBe(true); // warn, not block
  });
});
