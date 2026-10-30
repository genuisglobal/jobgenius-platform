export type RosterSeeker = { id: string; name: string; email: string; accountStatus: string | null };
export type RosterAssignment = { jobSeekerId: string; accountManagerId: string; assignedAt: string | null };
export type RosterIntake = { jobSeekerId: string; status: string };
export type RosterManager = { id: string; name: string; status: string | null };
export type RosterFinding = "active_client" | "reserved" | "review_assignment" | "inactive_assigned" | "unassigned_client" | "inactive_owner";
export type RosterAuditRow = {
  seeker: RosterSeeker;
  intakeStatus: string | null;
  manager: RosterManager | null;
  assignedAt: string | null;
  finding: RosterFinding;
};

export function buildClientRosterAudit(seekers: RosterSeeker[], assignments: RosterAssignment[], intakeStates: RosterIntake[], managers: RosterManager[]): RosterAuditRow[] {
  const assignmentBySeeker = new Map(assignments.map((row) => [row.jobSeekerId, row]));
  const intakeBySeeker = new Map(intakeStates.map((row) => [row.jobSeekerId, row.status]));
  const managerById = new Map(managers.map((row) => [row.id, row]));
  return seekers.flatMap((seeker) => {
    const assignment = assignmentBySeeker.get(seeker.id);
    const intakeStatus = intakeBySeeker.get(seeker.id) ?? null;
    if (!assignment && intakeStatus !== "active_client") return [];
    const manager = assignment ? managerById.get(assignment.accountManagerId) ?? null : null;
    let finding: RosterFinding;
    if (assignment && seeker.accountStatus !== "active") finding = "inactive_assigned";
    else if (!assignment) finding = "unassigned_client";
    else if (!manager || manager.status !== "approved") finding = "inactive_owner";
    else if (intakeStatus === "active_client") finding = "active_client";
    else if (intakeStatus === "approved_payment_pending") finding = "reserved";
    else finding = "review_assignment";
    return [{ seeker, intakeStatus, manager, assignedAt: assignment?.assignedAt ?? null, finding }];
  }).sort((a, b) => {
    const priority: Record<RosterFinding, number> = { inactive_assigned: 0, unassigned_client: 0, inactive_owner: 0, review_assignment: 1, reserved: 2, active_client: 3 };
    return priority[a.finding] - priority[b.finding] || a.seeker.name.localeCompare(b.seeker.name);
  });
}
