import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import { getCapacitySnapshot } from "@/lib/intake";
import IntakeQueueClient from "./IntakeQueueClient";

type IntakeStateRow = {
  id: string;
  job_seeker_id: string;
  selected_plan: string | null;
  offer_path: string | null;
  submitted_code: string | null;
  base_registration_fee: number | string | null;
  discount_amount: number | string | null;
  final_registration_fee: number | string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  capacity_month: string | null;
  preview_agreed_at: string | null;
  preview_started_at: string | null;
  preview_expires_at: string | null;
  preview_converted_at: string | null;
  call_completed_at: string | null;
  assigned_account_manager_id: string | null;
};

type SeekerRow = {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  seniority: string | null;
  onboarding_completed_at: string | null;
  profile_completion: number | null;
};

type AccountManagerRow = {
  id: string;
  name: string | null;
  email: string;
};

export default async function IntakePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const [{ data: intakeRows }, { data: accountManagers }, initialCapacity] =
    await Promise.all([
      supabaseAdmin
        .from("job_seeker_intake_states")
        .select(
          "id, job_seeker_id, selected_plan, offer_path, submitted_code, base_registration_fee, discount_amount, final_registration_fee, status, submitted_at, approved_at, capacity_month, preview_agreed_at, preview_started_at, preview_expires_at, preview_converted_at, call_completed_at, assigned_account_manager_id"
        )
        .order("submitted_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("account_managers")
        .select("id, name, email")
        .eq("status", "approved")
        .eq("role", "am")
        .order("name", { ascending: true }),
      getCapacitySnapshot(),
    ]);

  const intakeStates = (intakeRows ?? []) as IntakeStateRow[];
  const seekerIds = Array.from(new Set(intakeStates.map((row) => row.job_seeker_id)));

  const { data: seekers } = seekerIds.length
    ? await supabaseAdmin
        .from("job_seekers")
        .select(
          "id, full_name, email, location, seniority, onboarding_completed_at, profile_completion"
        )
        .in("id", seekerIds)
    : { data: [] as SeekerRow[] };

  const seekerMap = new Map(
    ((seekers ?? []) as SeekerRow[]).map((seeker) => [seeker.id, seeker])
  );
  const managerMap = new Map(
    ((accountManagers ?? []) as AccountManagerRow[]).map((manager) => [
      manager.id,
      manager,
    ])
  );

  const hydratedStates = intakeStates.map((row) => ({
    ...row,
    jobSeeker: seekerMap.get(row.job_seeker_id) ?? null,
    assignedAccountManager: row.assigned_account_manager_id
      ? managerMap.get(row.assigned_account_manager_id) ?? null
      : null,
  }));

  return (
    <IntakeQueueClient
      initialIntakeStates={hydratedStates}
      accountManagers={(accountManagers ?? []) as AccountManagerRow[]}
      initialCapacity={initialCapacity}
      isSuperAdmin={normalizeAMRole(user.role) === "superadmin"}
    />
  );
}
