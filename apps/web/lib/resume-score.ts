import { resolveSkill, skillSimilarity } from "@/lib/matching/skill-hierarchy";

// ============================================================
// Measurable resume ↔ job skill coverage.
//
// Reuses the matching engine's skill graph so coverage is hierarchy-aware
// (React covers JavaScript, "js" covers JavaScript, sibling skills get
// partial credit) instead of naive substring matching. Drives the before/
// after numbers shown when tailoring and the "still missing" keyword list
// fed back into the tailor prompt.
// ============================================================

export interface SkillCoverage {
  /** Weighted required-skill coverage, 0–100. Falls back to preferred when no required skills. */
  coveragePct: number;
  requiredTotal: number;
  requiredCovered: string[];
  requiredPartial: string[];
  requiredMissing: string[];
  preferredCovered: string[];
  preferredMissing: string[];
}

function dedupe(list: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Whole-word (case-insensitive) presence of `term` in already-lowercased `text`. */
function wordPresent(lowerText: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`, "i").test(lowerText);
}

type Coverage = "covered" | "partial" | "missing";

function classify(jobSkill: string, lowerText: string, resumeSkills: string[]): Coverage {
  // 1. Literal mention in the resume text (skill or its canonical form).
  if (wordPresent(lowerText, jobSkill)) return "covered";
  const canonical = resolveSkill(jobSkill);
  if (canonical !== jobSkill.toLowerCase() && wordPresent(lowerText, canonical)) return "covered";

  // 2. Hierarchy-aware match against the seeker's declared skills.
  let best = 0;
  for (const rs of resumeSkills) {
    const sim = skillSimilarity(jobSkill, rs);
    if (sim > best) best = sim;
    if (best >= 1) break;
  }
  if (best >= 0.5) return "covered";
  if (best >= 0.25) return "partial";
  return "missing";
}

export function scoreResumeSkillCoverage(args: {
  resumeText: string;
  resumeSkills?: string[] | null;
  requiredSkills?: string[] | null;
  preferredSkills?: string[] | null;
}): SkillCoverage {
  const lowerText = (args.resumeText || "").toLowerCase();
  const resumeSkills = dedupe(args.resumeSkills);
  const required = dedupe(args.requiredSkills);
  const preferred = dedupe(args.preferredSkills);

  const requiredCovered: string[] = [];
  const requiredPartial: string[] = [];
  const requiredMissing: string[] = [];
  let weight = 0;

  for (const s of required) {
    const c = classify(s, lowerText, resumeSkills);
    if (c === "covered") {
      requiredCovered.push(s);
      weight += 1;
    } else if (c === "partial") {
      requiredPartial.push(s);
      weight += 0.5;
    } else {
      requiredMissing.push(s);
    }
  }

  const preferredCovered: string[] = [];
  const preferredMissing: string[] = [];
  for (const s of preferred) {
    const c = classify(s, lowerText, resumeSkills);
    if (c === "missing") preferredMissing.push(s);
    else preferredCovered.push(s);
  }

  let coveragePct: number;
  if (required.length > 0) {
    coveragePct = Math.round((100 * weight) / required.length);
  } else if (preferred.length > 0) {
    coveragePct = Math.round((100 * preferredCovered.length) / preferred.length);
  } else {
    coveragePct = 100; // nothing to match against
  }

  return {
    coveragePct,
    requiredTotal: required.length,
    requiredCovered,
    requiredPartial,
    requiredMissing,
    preferredCovered,
    preferredMissing,
  };
}
