import { describe, it, expect } from "vitest";
import { renderResumePdf } from "@/lib/resume-templates";
import { RESUME_TEMPLATES, type StructuredResume } from "@/lib/resume-templates/types";

const sample: StructuredResume = {
  contact: {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "555-123-4567",
    location: "Austin, TX",
    linkedinUrl: "https://linkedin.com/in/janedoe",
    portfolioUrl: null,
  },
  summary: "Experienced software engineer focused on resilient backend systems.",
  workExperience: [
    {
      title: "Senior Engineer",
      company: "Acme",
      location: "Remote",
      startDate: "2020",
      endDate: "Present",
      bullets: ["Led a 4-person team", "Cut latency 40%"],
    },
  ],
  education: [
    {
      degree: "B.S.",
      institution: "UT Austin",
      field: "Computer Science",
      graduationDate: "2019",
      gpa: null,
      honors: null,
    },
  ],
  skills: ["JavaScript", "React", "Node.js", "PostgreSQL"],
  certifications: [],
};

describe("renderResumePdf", () => {
  for (const t of RESUME_TEMPLATES) {
    it(`renders a valid PDF for the ${t.id} template`, () => {
      const buf = renderResumePdf(sample, t.id);
      expect(buf.length).toBeGreaterThan(500);
      // Valid PDFs start with the %PDF- header.
      expect(Buffer.from(buf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    });
  }
});
