import { supabaseAdmin } from "@/lib/auth";
import {
  listAcceptedOfferRecords,
  listEmployeeBonusRecords,
  listPeopleEmployees,
} from "@/lib/people-server";
import BonusesClient from "./BonusesClient";

export const dynamic = "force-dynamic";

export default async function FinanceBonusesPage() {
  const [employees, offers, bonuses, seekersRes] = await Promise.all([
    listPeopleEmployees(),
    listAcceptedOfferRecords(),
    listEmployeeBonusRecords(),
    supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, email")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (seekersRes.error) {
    throw new Error(seekersRes.error.message);
  }

  return (
    <BonusesClient
      employees={employees}
      seekers={(seekersRes.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>}
      initialOffers={offers}
      initialBonuses={bonuses}
    />
  );
}
