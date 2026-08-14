import { describe, expect, it } from "vitest";
import { isMissingAuthUserError } from "../auth/admin-errors";

describe("isMissingAuthUserError", () => {
  it("recognizes Supabase missing-user errors", () => {
    expect(isMissingAuthUserError({ status: 404, message: "Not found" })).toBe(true);
    expect(isMissingAuthUserError({ code: "user_not_found" })).toBe(true);
    expect(isMissingAuthUserError({ message: "User not found" })).toBe(true);
  });

  it("does not hide unrelated auth failures", () => {
    expect(isMissingAuthUserError({ status: 500, message: "Database unavailable" })).toBe(false);
    expect(isMissingAuthUserError(null)).toBe(false);
  });
});
