import { describe, it, expect, vi } from "vitest";

// The resolver imports learned-fields → @/lib/auth, whose server module reads
// request state at load. The pure functions under test don't touch it, so stub
// the auth module to keep the import graph loadable in a node test env.
vi.mock("@/lib/auth", () => ({ supabaseAdmin: { from: () => ({}) } }));

import { matchScreeningAnswer, findBestOptionMatch } from "@/lib/apply/field-resolver";
import type { FieldDescriptor } from "@/lib/learned-fields";

const field = (
  label: string,
  type: string | null = null,
  options: string[] | null = null
): FieldDescriptor => ({ label, type, options });

describe("findBestOptionMatch", () => {
  it("matches exact, partial, and reverse-containment, else null", () => {
    expect(findBestOptionMatch(["Male", "Female", "Prefer not to answer"], "prefer not")).toBe(
      "Prefer not to answer"
    );
    expect(findBestOptionMatch(["Yes", "No"], "yes")).toBe("Yes");
    expect(findBestOptionMatch(["United States"], "united states of america")).toBe("United States");
    expect(findBestOptionMatch(["A", "B"], "z")).toBeNull();
  });
});

describe("matchScreeningAnswer", () => {
  it("uses the seeker's configured answer (source=screening)", () => {
    const r = matchScreeningAnswer(field("Do you require visa sponsorship?"), [
      { question_key: "sponsorship", answer_value: "Yes, I need sponsorship" },
    ]);
    expect(r).toEqual({ value: "Yes, I need sponsorship", source: "screening" });
  });

  it("coerces a screening answer onto a select option", () => {
    const r = matchScreeningAnswer(
      field("Work authorization", "select", ["US Citizen", "H1B", "Other"]),
      [{ question_key: "work_authorization", answer_value: "US Citizen" }]
    );
    expect(r).toEqual({ value: "US Citizen", source: "screening" });
  });

  it("falls back to deterministic defaults when unset (source=default)", () => {
    expect(matchScreeningAnswer(field("Are you legally authorized to work?"), [])).toEqual({
      value: "Yes",
      source: "default",
    });
    expect(matchScreeningAnswer(field("Do you require sponsorship?"), [])).toEqual({
      value: "No",
      source: "default",
    });
  });

  it("declines EEO questions with no seeker answer (source=default)", () => {
    const r = matchScreeningAnswer(
      field("Gender", "select", ["Male", "Female", "Prefer not to answer"]),
      []
    );
    expect(r).toEqual({ value: "Prefer not to answer", source: "default" });
  });

  it("returns null for an unrelated field", () => {
    expect(matchScreeningAnswer(field("Favorite color"), [])).toBeNull();
  });
});
