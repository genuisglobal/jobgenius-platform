import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ current: { authenticated: true, user: { id: "b5b7d31f-a4b6-48e8-a68c-3b933bf17a41", role: "am", userType: "am" } } }));
vi.mock("@/lib/auth", () => ({
  requireAM: async () => auth.current,
  supabaseAdmin: { from: () => { throw new Error("Database must not be reached for rejected requests."); } },
}));

import { POST } from "@/app/api/am/peer-recognitions/route";
import { PATCH } from "@/app/api/am/peer-recognitions/[id]/route";

describe("peer recognition access", () => {
  it("rejects self nominations before reaching the database", async () => {
    const response = await POST(new Request("https://example.com/api/am/peer-recognitions", { method: "POST", body: JSON.stringify({ nomineeAmId: auth.current.user.id, contributionType: "teamwork", detail: "Helped unblock the team's client applications." }) }));
    expect(response.status).toBe(400);
  });

  it("does not allow an AM to approve a nomination", async () => {
    const response = await PATCH(new Request("https://example.com/api/am/peer-recognitions/id", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }), { params: { id: "b5b7d31f-a4b6-48e8-a68c-3b933bf17a41" } });
    expect(response.status).toBe(403);
  });
});
