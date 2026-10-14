export type MatchLearningReasons = {
  missing_skills?: string[] | null;
  matched_skills?: string[] | null;
};

export type LearningTarget = {
  skill: string;
  skill_slug: string;
  priority: number;
  source: "match";
  reason: "missing_skill";
};

const SKILL_SLUG_NORMALIZATIONS: Record<string, string> = {
  "c#": "c-sharp",
  "c sharp": "c-sharp",
  "c++": "cpp",
  "f#": "f-sharp",
  ".net": "dotnet",
  "node.js": "node-js",
  nodejs: "node-js",
  "node js": "node-js",
  "react.js": "react-js",
  reactjs: "react-js",
  "react js": "react-js",
  "next.js": "next-js",
  nextjs: "next-js",
  "next js": "next-js",
  "vue.js": "vue-js",
  vuejs: "vue-js",
  "vue js": "vue-js",
};

function cleanSkillLabel(skill: string): string {
  return skill.trim().replace(/\s+/g, " ");
}

export function toSkillSlug(skill: string): string {
  const cleaned = cleanSkillLabel(skill).toLowerCase();
  const normalized = SKILL_SLUG_NORMALIZATIONS[cleaned] ?? cleaned;

  return normalized
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.\s/-]/g, " ")
    .replace(/[#]/g, " sharp ")
    .replace(/[./]+/g, " ")
    .replace(/\+/g, " plus ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-")
    .replace(/-+/g, "-");
}

export function normalizeLearningSkills(
  skills: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of skills) {
    if (typeof raw !== "string") {
      continue;
    }

    const skill = cleanSkillLabel(raw);
    if (!skill) {
      continue;
    }

    const slug = toSkillSlug(skill);
    if (!slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    normalized.push(skill);
  }

  return normalized;
}

export function buildLearningTargetsFromMatch(
  reasons: MatchLearningReasons | null | undefined
): LearningTarget[] {
  const missingSkills = normalizeLearningSkills(reasons?.missing_skills ?? []);

  return missingSkills.map((skill, index) => ({
    skill,
    skill_slug: toSkillSlug(skill),
    priority: Math.max(10, 100 - index * 10),
    source: "match" as const,
    reason: "missing_skill" as const,
  }));
}
