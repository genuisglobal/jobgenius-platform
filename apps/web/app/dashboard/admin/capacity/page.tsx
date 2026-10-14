import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCapacityMonthStart, getCapacitySnapshot } from "@/lib/intake";
import CapacityClient from "./CapacityClient";

function normalizeCapacityMonth(input?: string | null) {
  if (!input) return getCapacityMonthStart();
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : getCapacityMonthStart();
}

export default async function CapacityPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const capacityMonth = normalizeCapacityMonth(searchParams?.month);
  const snapshot = await getCapacitySnapshot(capacityMonth);

  return <CapacityClient initialSnapshot={snapshot} />;
}
