import type { StructuredResume } from "./resume-templates/types";
import { resolveSkill } from "./matching/skill-hierarchy";

// ============================================================
// Deterministic safety checks for an AI-tailored resume before it is used in a
// real (often auto-submitted) application. The tailor is instructed never to
// fabricate, but this is the guardrail that verifies it — protecting the
// client's credibility with employers.
//
//   block → do not auto-apply with this resume; route to an AM.
//   warn  → usable, but worth a human glance.
// ============================================================

export type SafetySeverity = "block" | "warn";

export interface SafetyIssue {
  severity: SafetySeverity;
  code: string;
  message: string;
}

export interface ResumeSafetyResult {
  /** True when there are no blocking issues. */
  ok: boolean;
  issues: SafetyIssue[];
}

function flattenResumeText(r: StructuredResume): string {
  const parts: string[] = [r.summary ?? ""];
  for (const w of r.workExperience ?? []) {
    parts.push(w.title, w.company, ...(w.bullets ?? []));
  }
  for (const e of r.education ?? []) {
    parts.push(e.degree, e.field ?? "", e.institution);
  }
  parts.push(...(r.skills ?? []));
  for (const c of r.certifications ?? []) parts.push(c.name);
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function wordPresent(lowerText: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "i").test(lowerText);
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Lint a tailored resume against its base. Catches the failure modes that
 * matter for auto-apply: invented skills, altered identity, keyword stuffing,
 * and degenerate length.
 */
export function lintTailoredResume(
  base: StructuredResume,
  tailored: StructuredResume
): ResumeSafetyResult {
  const issues: SafetyIssue[] = [];

  const baseText = flattenResumeText(base);
  const baseSkillSet = new Set((base.skills ?? []).map((s) => resolveSkill(s)));

  // 1. Fabrication: a tailored skill that appears nowhere in the base (neither
  //    the skills list nor anywhere in the base text) was invented.
  for (const skill of tailored.skills ?? []) {
    const resolved = resolveSkill(skill);
    const inBaseSkills = baseSkillSet.has(resolved);
    const inBaseText = wordPresent(baseText, skill) || wordPresent(baseText, resolved);
    if (!inBaseSkills && !inBaseText) {
      issues.push({
        severity: "block",
        code: "fabricated_skill",
        message: `"${skill}" is not present anywhere in the base resume.`,
      });
    }
  }

  // 2. Identity integrity: tailoring must not change the candidate's name/email.
  if (base.contact?.fullName && norm(base.contact.fullName) !== norm(tailored.contact?.fullName)) {
    issues.push({
      severity: "block",
      code: "contact_name_changed",
      message: "The candidate name was altered during tailoring.",
    });
  }
  if (base.contact?.email && norm(base.contact.email) !== norm(tailored.contact?.email)) {
    issues.push({
      severity: "block",
      code: "contact_email_changed",
      message: "The candidate email was altered during tailoring.",
    });
  }

  // 3. Keyword stuffing: a single skill term repeated excessively reads as gaming.
  const tailoredText = flattenResumeText(tailored);
  for (const skill of tailored.skills ?? []) {
    const t = skill.trim().toLowerCase();
    if (t.length < 3) continue;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (tailoredText.match(new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "gi")) ?? []).length;
    if (count > 6) {
      issues.push({
        severity: "warn",
        code: "keyword_stuffing",
        message: `"${skill}" appears ${count} times — possible keyword stuffing.`,
      });
    }
  }

  // 4. Degenerate length.
  const len = tailoredText.length;
  if (len < 200) {
    issues.push({ severity: "warn", code: "too_short", message: "Tailored resume is unusually short." });
  } else if (len > 14000) {
    issues.push({ severity: "warn", code: "too_long", message: "Tailored resume is unusually long." });
  }

  return { ok: !issues.some((i) => i.severity === "block"), issues };
}
