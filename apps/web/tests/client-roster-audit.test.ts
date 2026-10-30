import { describe, expect, it } from "vitest";
import { buildClientRosterAudit, type RosterSeeker } from "@/lib/client-roster-audit";

const seeker = (id: string, accountStatus = "active"): RosterSeeker => ({ id, name: id, email: `${id}@example.com`, accountStatus });
const owner = [{ id: "am", name: "AM", status: "approved" }];

describe("client roster audit", () => {
  it("distinguishes active clients, reserved spots, and assignments needing review", () => {
    const rows = buildClientRosterAudit([seeker("active"), seeker("reserved"), seeker("pending")],
      ["active", "reserved", "pending"].map((id) => ({ jobSeekerId: id, accountManagerId: "am", assignedAt: null })),
      [{ jobSeekerId: "active", status: "active_client" }, { jobSeekerId: "reserved", status: "approved_payment_pending" }, { jobSeekerId: "pending", status: "pending_review" }], owner);
    expect(Object.fromEntries(rows.map((row) => [row.seeker.id, row.finding]))).toEqual({ active: "active_client", reserved: "reserved", pending: "review_assignment" });
  });

  it("flags inactive assigned seekers and active clients without a current owner", () => {
    const rows = buildClientRosterAudit([seeker("closed", "inactive"), seeker("orphan")],
      [{ jobSeekerId: "closed", accountManagerId: "am", assignedAt: null }],
      [{ jobSeekerId: "closed", status: "rejected" }, { jobSeekerId: "orphan", status: "active_client" }], owner);
    expect(rows.map((row) => row.finding)).toEqual(["inactive_assigned", "unassigned_client"]);
  });
});
