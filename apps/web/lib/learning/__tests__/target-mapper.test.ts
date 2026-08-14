import { describe, expect, it } from "vitest";

import {
  buildLearningTargetsFromMatch,
  normalizeLearningSkills,
  toSkillSlug,
} from "../target-mapper";

describe("target-mapper", () => {
  it("normalizes common skill aliases into stable slugs", () => {
    expect(toSkillSlug("Node.js")).toBe("node-js");
    expect(toSkillSlug("C#")).toBe("c-sharp");
    expect(toSkillSlug("Machine Learning")).toBe("machine-learning");
  });

  it("deduplicates focus skills by normalized slug while preserving first label", () => {
    expect(
      normalizeLearningSkills([
        " React ",
        "react",
        "Node.js",
        "nodejs",
        "",
        null,
      ])
    ).toEqual(["React", "Node.js"]);
  });

  it("builds prioritized learning targets from missing match skills", () => {
    expect(
      buildLearningTargetsFromMatch({
        missing_skills: ["Node.js", "React", "nodejs"],
        matched_skills: ["TypeScript"],
      })
    ).toEqual([
      {
        skill: "Node.js",
        skill_slug: "node-js",
        priority: 100,
        source: "match",
        reason: "missing_skill",
      },
      {
        skill: "React",
        skill_slug: "react",
        priority: 90,
        source: "match",
        reason: "missing_skill",
      },
    ]);
  });
});
